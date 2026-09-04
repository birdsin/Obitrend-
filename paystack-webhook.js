/*
===========================================================
OBITREND — PAYSTACK WEBHOOK
===========================================================

WEEKLY:
NGN 15,000
20 generations
7 days

MONTHLY:
NGN 45,000
80 generations
30 days

The webhook:

1. Verifies Paystack signature
2. Accepts charge.success
3. Identifies the Paystack customer
4. Reads OBITREND user ID from customer metadata
5. Verifies the plan
6. Verifies the amount
7. Activates the correct OBITREND plan
8. Relies on credits.js reference protection
   against duplicate processing

===========================================================
*/

import crypto from "crypto";

import {
  getRedisConfig,
  activatePro
} from "./credits.js";

export const config = {
  api: {
    bodyParser: false
  }
};

const PAYSTACK_API =
  "https://api.paystack.co";

const PAYSTACK_SECRET_KEY =
  process.env.PAYSTACK_SECRET_KEY ||
  "";

const WEEKLY_PLAN_CODE =
  process.env.PAYSTACK_WEEKLY_PLAN_CODE ||
  "";

const MONTHLY_PLAN_CODE =
  process.env.PAYSTACK_MONTHLY_PLAN_CODE ||
  "";

const WEEKLY_AMOUNT =
  1500000;

const MONTHLY_AMOUNT =
  4500000;

const CURRENCY =
  "NGN";

/* =========================================================
HELPERS
========================================================= */

function clean(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return clean(value).toLowerCase();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function getHeader(
  req,
  name
) {
  const value =
    req.headers?.[name] ??
    req.headers?.[
      name.toLowerCase()
    ] ??
    req.headers?.[
      name.toUpperCase()
    ];

  if (
    Array.isArray(value)
  ) {
    return clean(
      value[0]
    );
  }

  return clean(value);
}

async function readRawBody(
  req
) {
  const chunks = [];

  for await (
    const chunk of req
  ) {
    chunks.push(
      Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk)
    );
  }

  return Buffer.concat(
    chunks
  );
}

function safeEqual(
  leftValue,
  rightValue
) {
  const left =
    Buffer.from(
      clean(leftValue),
      "utf8"
    );

  const right =
    Buffer.from(
      clean(rightValue),
      "utf8"
    );

  if (
    left.length !==
    right.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    left,
    right
  );
}

function verifySignature(
  rawBody,
  signature
) {
  if (
    !PAYSTACK_SECRET_KEY ||
    !signature
  ) {
    return false;
  }

  const expected =
    crypto
      .createHmac(
        "sha512",
        PAYSTACK_SECRET_KEY
      )
      .update(rawBody)
      .digest("hex");

  return safeEqual(
    expected,
    signature
  );
}

/* =========================================================
PAYSTACK REQUEST
========================================================= */

async function paystack(
  path,
  options = {}
) {
  const request = {
    method:
      options.method ||
      "GET",

    headers: {
      Authorization:
        `Bearer ${PAYSTACK_SECRET_KEY}`,

      "Content-Type":
        "application/json",

      Accept:
        "application/json"
    }
  };

  if (
    options.body !==
    undefined
  ) {
    request.body =
      JSON.stringify(
        options.body
      );
  }

  const response =
    await fetch(
      `${PAYSTACK_API}${path}`,
      request
    );

  let data = null;

  try {
    data =
      await response.json();
  } catch {
    data = null;
  }

  return {
    ok:
      response.ok,

    status:
      response.status,

    data
  };
}

/* =========================================================
METADATA
========================================================= */

function metadataObject(
  value
) {
  if (
    value &&
    typeof value ===
      "object"
  ) {
    return value;
  }

  if (
    typeof value ===
    "string"
  ) {
    try {
      const parsed =
        JSON.parse(
          value
        );

      if (
        parsed &&
        typeof parsed ===
          "object"
      ) {
        return parsed;
      }
    } catch {
      return {};
    }
  }

  return {};
}

/* =========================================================
GET USER ID FROM TRANSACTION METADATA
========================================================= */

function getUserIdFromMetadata(
  data
) {
  const metadata =
    metadataObject(
      data?.metadata
    );

  return clean(
    metadata.obitrend_user_id ||
    metadata.userId ||
    metadata.user_id ||
    ""
  );
}

/* =========================================================
GET CUSTOMER CODE
========================================================= */

function getCustomerCode(
  data
) {
  return clean(
    data?.customer?.customer_code ||
    data?.customer?.customerCode ||
    data?.customer_code ||
    data?.customerCode ||
    ""
  );
}

/* =========================================================
GET PLAN
========================================================= */

function getPlan(
  data
) {
  const planCode =
    clean(
      data?.plan?.plan_code ||
      data?.plan?.planCode ||
      data?.plan ||
      data?.plan_object?.plan_code ||
      data?.plan_object?.planCode ||
      data?.plan_object?.code ||
      ""
    );

  if (
    planCode &&
    planCode ===
      MONTHLY_PLAN_CODE
  ) {
    return {
      type: "monthly",
      planCode,
      amount:
        MONTHLY_AMOUNT,
      credits: 80
    };
  }

  if (
    planCode &&
    planCode ===
      WEEKLY_PLAN_CODE
  ) {
    return {
      type: "weekly",
      planCode,
      amount:
        WEEKLY_AMOUNT,
      credits: 20
    };
  }

  /*
  Fallback to gross charge amount
  if Paystack did not include a
  usable plan code.
  */

  const amount =
    Number(data?.amount);

  if (
    amount ===
    MONTHLY_AMOUNT
  ) {
    return {
      type: "monthly",
      planCode:
        MONTHLY_PLAN_CODE,
      amount:
        MONTHLY_AMOUNT,
      credits: 80
    };
  }

  if (
    amount ===
    WEEKLY_AMOUNT
  ) {
    return {
      type: "weekly",
      planCode:
        WEEKLY_PLAN_CODE,
      amount:
        WEEKLY_AMOUNT,
      credits: 20
    };
  }

  return null;
}

/* =========================================================
FETCH PAYSTACK CUSTOMER
========================================================= */

async function fetchCustomer(
  customerCode
) {
  const code =
    clean(customerCode);

  if (!code) {
    return null;
  }

  const result =
    await paystack(
      `/customer/${encodeURIComponent(
        code
      )}`
    );

  if (
    !result.ok ||
    !result.data?.status
  ) {
    return null;
  }

  return (
    result.data.data ||
    null
  );
}

/* =========================================================
GET OBITREND USER FROM PAYSTACK CUSTOMER
========================================================= */

async function getUserFromCustomer(
  data
) {
  /*
  First try the metadata that came
  directly with this transaction.
  */

  const directUserId =
    getUserIdFromMetadata(
      data
    );

  if (directUserId) {
    return {
      userId:
        directUserId,

      customer:
        data?.customer ||
        null
    };
  }

  /*
  Recurring charges may not carry
  the original transaction metadata.

  Fetch the Paystack customer and
  read our permanent mapping.
  */

  const customerCode =
    getCustomerCode(
      data
    );

  if (!customerCode) {
    return null;
  }

  const customer =
    await fetchCustomer(
      customerCode
    );

  if (!customer) {
    return null;
  }

  const metadata =
    metadataObject(
      customer.metadata
    );

  const userId =
    clean(
      metadata.obitrend_user_id ||
      metadata.userId ||
      metadata.user_id ||
      ""
    );

  if (!userId) {
    return null;
  }

  return {
    userId,
    customer
  };
}

/* =========================================================
PROCESS SUCCESSFUL CHARGE
========================================================= */

async function processChargeSuccess(
  data,
  redis
) {
  if (
    lower(data?.status) !==
    "success"
  ) {
    return {
      processed: false,
      reason:
        "charge_not_successful"
    };
  }

  const reference =
    clean(
      data?.reference
    );

  if (!reference) {
    throw new Error(
      "Paystack charge has no reference."
    );
  }

  const currency =
    upper(
      data?.currency
    );

  if (
    currency !==
    CURRENCY
  ) {
    throw new Error(
      "Unexpected Paystack currency."
    );
  }

  const plan =
    getPlan(
      data
    );

  if (!plan) {
    throw new Error(
      "Unable to determine OBITREND plan."
    );
  }

  const amount =
    Number(
      data?.amount
    );

  if (
    amount !==
    plan.amount
  ) {
    throw new Error(
      "Paystack charge amount does not match OBITREND plan."
    );
  }

  const account =
    await getUserFromCustomer(
      data
    );

  if (!account?.userId) {
    throw new Error(
      "Unable to identify the OBITREND account for this Paystack customer."
    );
  }

  const email =
    clean(
      data?.customer?.email ||
      data?.email ||
      account.customer?.email ||
      ""
    );

  const activated =
    await activatePro(
      account.userId,
      email,
      reference,
      redis,
      plan.type
    );

  return {
    processed: true,

    reference,

    userId:
      account.userId,

    email,

    plan:
      plan.type,

    amount,

    activated
  };
}

/* =========================================================
HANDLER
========================================================= */

export default async function handler(
  req,
  res
) {
  if (
    req.method !==
    "POST"
  ) {
    res.setHeader(
      "Allow",
      "POST"
    );

    return res
      .status(405)
      .json({
        success: false
      });
  }

  try {
    if (
      !PAYSTACK_SECRET_KEY
    ) {
      console.error(
        "OBITREND PAYSTACK WEBHOOK: secret key missing."
      );

      return res
        .status(500)
        .json({
          success: false
        });
    }

    if (
      !WEEKLY_PLAN_CODE ||
      !MONTHLY_PLAN_CODE
    ) {
      console.error(
        "OBITREND PAYSTACK WEBHOOK: plan codes missing."
      );

      return res
        .status(500)
        .json({
          success: false
        });
    }

    const rawBody =
      await readRawBody(
        req
      );

    const signature =
      getHeader(
        req,
        "x-paystack-signature"
      );

    if (
      !verifySignature(
        rawBody,
        signature
      )
    ) {
      console.error(
        "OBITREND PAYSTACK WEBHOOK: invalid signature."
      );

      return res
        .status(401)
        .json({
          success: false
        });
    }

    let event;

    try {
      event =
        JSON.parse(
          rawBody.toString(
            "utf8"
          )
        );
    } catch {
      return res
        .status(400)
        .json({
          success: false
        });
    }

    /*
    We only grant OBITREND credits
    for successful charges.
    */

    if (
      event?.event !==
      "charge.success"
    ) {
      return res
        .status(200)
        .json({
          success: true,
          ignored: true
        });
    }

    const redis =
      getRedisConfig();

    if (
      !redis.url ||
      !redis.token
    ) {
      console.error(
        "OBITREND PAYSTACK WEBHOOK: Redis configuration missing."
      );

      return res
        .status(500)
        .json({
          success: false
        });
    }

    const result =
      await processChargeSuccess(
        event.data,
        redis
      );

    console.log(
      "OBITREND PAYSTACK WEBHOOK PROCESSED:",
      {
        reference:
          result.reference,

        userId:
          result.userId,

        plan:
          result.plan
      }
    );

    return res
      .status(200)
      .json({
        success: true,
        processed: true
      });
  } catch (error) {
    /*
    Do NOT expose technical errors.
    Returning 500 causes Paystack to retry
    the webhook delivery.
    */

    console.error(
      "OBITREND PAYSTACK WEBHOOK ERROR:",
      error
    );

    return res
      .status(500)
      .json({
        success: false
      });
  }
}
