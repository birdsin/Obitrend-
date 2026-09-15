/*
===========================================================
OBITREND — PAYSTACK WEBHOOK
===========================================================

OBITREND PRO PACKAGES

₦10,000
4 days
5 credits
STANDARD

₦20,000
8 days
10 credits
STANDARD

₦30,000
14 days
15 credits
STANDARD

₦60,000
30 days
30 credits
FULL

The webhook:

1. Verifies Paystack signature
2. Accepts charge.success
3. Identifies the OBITREND customer
4. Reads OBITREND user ID from metadata
5. Verifies the package
6. Verifies the exact amount
7. Activates the correct OBITREND plan
8. Keeps Paystack verification server-side

===========================================================
*/

import crypto from "crypto";

import {
  getRedisConfig,
  activatePro
} from "./lib/credits.js";

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

/* =========================================================
PAYSTACK PLAN CODES
========================================================= */

const WEEKLY_PLAN_CODE =
  process.env.PAYSTACK_WEEKLY_PLAN_CODE ||
  "";

const MONTHLY_PLAN_CODE =
  process.env.PAYSTACK_MONTHLY_PLAN_CODE ||
  "";

/*
===========================================================
OBITREND PACKAGE AMOUNTS
===========================================================
Paystack amounts are stored in kobo.
===========================================================
*/

const PRO_4_DAY_AMOUNT =
  1000000;

const PRO_8_DAY_AMOUNT =
  2000000;

const PRO_14_DAY_AMOUNT =
  3000000;

const PRO_MONTHLY_AMOUNT =
  6000000;

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

function getHeader(req, name) {
  const value =
    req.headers?.[name] ??
    req.headers?.[name.toLowerCase()] ??
    req.headers?.[name.toUpperCase()];

  if (Array.isArray(value)) {
    return clean(value[0]);
  }

  return clean(value);
}

async function readRawBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(
      Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk)
    );
  }

  return Buffer.concat(chunks);
}

function safeEqual(leftValue, rightValue) {
  const left =
    Buffer.from(clean(leftValue), "utf8");

  const right =
    Buffer.from(clean(rightValue), "utf8");

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    left,
    right
  );
}

function verifySignature(rawBody, signature) {
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
      options.method || "GET",

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

function metadataObject(value) {
  if (
    value &&
    typeof value === "object"
  ) {
    return value;
  }

  if (
    typeof value === "string"
  ) {
    try {
      const parsed =
        JSON.parse(value);

      if (
        parsed &&
        typeof parsed === "object"
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

function getUserIdFromMetadata(data) {
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

function getCustomerCode(data) {
  return clean(
    data?.customer?.customer_code ||
    data?.customer?.customerCode ||
    data?.customer_code ||
    data?.customerCode ||
    ""
  );
}

/* =========================================================
GET PACKAGE FROM AMOUNT / PLAN
========================================================= */

function getPlan(data) {
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

  const amount =
    Number(data?.amount);

  /*
  =========================================================
  MONTHLY — ₦60,000
  =========================================================
  */

  if (
    planCode &&
    planCode ===
      MONTHLY_PLAN_CODE
  ) {
    return {
      type:
        "PRO_MONTHLY",

      planCode,

      amount:
        PRO_MONTHLY_AMOUNT,

      credits:
        30,

      durationDays:
        30,

      tier:
        "full"
    };
  }

  /*
  =========================================================
  WEEKLY — ₦15,000
  =========================================================
  Legacy/recurring weekly plan support.
  =========================================================
  */

  if (
    planCode &&
    planCode ===
      WEEKLY_PLAN_CODE
  ) {
    /*
    Only allow this Paystack plan code
    to represent the configured ₦15,000
    weekly package.
    */

    if (
      amount ===
      1500000
    ) {
      return {
        type:
          "PRO_WEEKLY",

        planCode,

        amount:
          1500000,

        credits:
          20,

        durationDays:
          7,

        tier:
          "standard"
      };
    }
  }

  /*
  =========================================================
  AMOUNT-BASED PACKAGE DETECTION
  =========================================================
  */

  if (
    amount ===
    PRO_4_DAY_AMOUNT
  ) {
    return {
      type:
        "PRO_4_DAY",

      planCode:
        "",

      amount:
        PRO_4_DAY_AMOUNT,

      credits:
        5,

      durationDays:
        4,

      tier:
        "standard"
    };
  }

  if (
    amount ===
    PRO_8_DAY_AMOUNT
  ) {
    return {
      type:
        "PRO_8_DAY",

      planCode:
        "",

      amount:
        PRO_8_DAY_AMOUNT,

      credits:
        10,

      durationDays:
        8,

      tier:
        "standard"
    };
  }

  /*
  =========================================================
  IMPORTANT:
  ₦30,000 = 14-DAY STANDARD PRO
  =========================================================
  */

  if (
    amount ===
    PRO_14_DAY_AMOUNT
  ) {
    return {
      type:
        "PRO_14_DAY",

      planCode:
        "",

      amount:
        PRO_14_DAY_AMOUNT,

      credits:
        15,

      durationDays:
        14,

      tier:
        "standard"
    };
  }

  if (
    amount ===
    PRO_MONTHLY_AMOUNT
  ) {
    return {
      type:
        "PRO_MONTHLY",

      planCode:
        planCode ||
        MONTHLY_PLAN_CODE,

      amount:
        PRO_MONTHLY_AMOUNT,

      credits:
        30,

      durationDays:
        30,

      tier:
        "full"
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

async function getUserFromCustomer(data) {
  /*
  First use transaction metadata.
  */

  const directUserId =
    getUserIdFromMetadata(data);

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
  Fallback to the permanent
  Paystack customer mapping.
  */

  const customerCode =
    getCustomerCode(data);

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
      processed:
        false,

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

  /*
  =========================================================
  VERIFY CURRENCY
  =========================================================
  */

  const currency =
    upper(data?.currency);

  if (
    currency !==
    CURRENCY
  ) {
    throw new Error(
      "Unexpected Paystack currency."
    );
  }

  /*
  =========================================================
  DETERMINE OBITREND PACKAGE
  =========================================================
  */

  const plan =
    getPlan(data);

  if (!plan) {
    throw new Error(
      "Unable to determine OBITREND plan."
    );
  }

  /*
  =========================================================
  VERIFY EXACT PAYMENT AMOUNT
  =========================================================
  */

  const amount =
    Number(data?.amount);

  if (
    amount !==
    plan.amount
  ) {
    throw new Error(
      "Paystack charge amount does not match OBITREND plan."
    );
  }

  /*
  =========================================================
  IDENTIFY USER
  =========================================================
  */

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

  /*
  =========================================================
  ACTIVATE OBITREND PRO
  =========================================================
  */

  const activated =
    await activatePro(
      account.userId,
      email,
      reference,
      redis,
      plan.type
    );

  return {
    processed:
      true,

    reference,

    userId:
      account.userId,

    email,

    plan:
      plan.type,

    amount,

    credits:
      plan.credits,

    durationDays:
      plan.durationDays,

    tier:
      plan.tier,

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
        success:
          false
      });
  }

  try {
    /*
    =======================================================
    SECRET KEY
    =======================================================
    */

    if (
      !PAYSTACK_SECRET_KEY
    ) {
      console.error(
        "OBITREND PAYSTACK WEBHOOK: secret key missing."
      );

      return res
        .status(500)
        .json({
          success:
            false
        });
    }

    const rawBody =
      await readRawBody(req);

    const signature =
      getHeader(
        req,
        "x-paystack-signature"
      );

    /*
    =======================================================
    VERIFY PAYSTACK SIGNATURE
    =======================================================
    */

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
          success:
            false
        });
    }

    /*
    =======================================================
    PARSE EVENT
    =======================================================
    */

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
          success:
            false
        });
    }

    /*
    =======================================================
    ONLY PROCESS charge.success
    =======================================================
    */

    if (
      event?.event !==
      "charge.success"
    ) {
      return res
        .status(200)
        .json({
          success:
            true,

          ignored:
            true
        });
    }

    /*
    =======================================================
    REDIS
    =======================================================
    */

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
          success:
            false
        });
    }

    /*
    =======================================================
    PROCESS PAYMENT
    =======================================================
    */

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
          result.plan,

        amount:
          result.amount,

        credits:
          result.credits,

        durationDays:
          result.durationDays,

        tier:
          result.tier
      }
    );

    return res
      .status(200)
      .json({
        success:
          true,

        processed:
          true
      });

  } catch (error) {
    /*
    =======================================================
    IMPORTANT
    =======================================================
    Return 500 so Paystack can retry a payment that
    could not be processed.
    =======================================================
    */

    console.error(
      "OBITREND PAYSTACK WEBHOOK ERROR:",
      error
    );

    return res
      .status(500)
      .json({
        success:
          false
      });
  }
}
