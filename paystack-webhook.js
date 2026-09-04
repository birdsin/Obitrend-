import crypto from "crypto";

import {
  getRedisConfig,
  activatePro,
} from "./credits.js";

/* =========================================================
   OBITREND PAYSTACK WEBHOOK
   =========================================================
   WEEKLY  = ₦15,000 → 20 generations → 7 days
   MONTHLY = ₦45,000 → 80 generations → 30 days

   This webhook handles:
   - Initial successful Paystack payments
   - Automatic weekly renewals
   - Automatic monthly renewals
   - Duplicate webhook protection through credits.js
   - Secure Paystack signature verification

   IMPORTANT:
   Never put PAYSTACK_SECRET_KEY in frontend code.
========================================================= */

export const config = {
  api: {
    bodyParser: false,
  },
};

const PAYSTACK_SECRET_KEY =
  process.env.PAYSTACK_SECRET_KEY || "";

const WEEKLY_PLAN_CODE =
  process.env.PAYSTACK_WEEKLY_PLAN_CODE || "";

const MONTHLY_PLAN_CODE =
  process.env.PAYSTACK_MONTHLY_PLAN_CODE || "";

const CURRENCY = "NGN";

const WEEKLY_AMOUNT = 1500000;
const MONTHLY_AMOUNT = 4500000;

/* =========================================================
   HELPERS
========================================================= */

function clean(value) {
  return String(value ?? "").trim();
}

function normalize(value) {
  return clean(value).toLowerCase();
}

function getHeader(req, name) {
  const value =
    req.headers?.[name] ??
    req.headers?.[name.toLowerCase()] ??
    req.headers?.[name.toUpperCase()];

  if (Array.isArray(value)) {
    return value[0] || "";
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

function safeEqual(a, b) {
  const left = Buffer.from(clean(a), "utf8");
  const right = Buffer.from(clean(b), "utf8");

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function verifySignature(rawBody, signature) {
  if (!PAYSTACK_SECRET_KEY || !signature) {
    return false;
  }

  const expected = crypto
    .createHmac(
      "sha512",
      PAYSTACK_SECRET_KEY
    )
    .update(rawBody)
    .digest("hex");

  return safeEqual(expected, signature);
}

function getMetadataObject(metadata) {
  if (!metadata) {
    return {};
  }

  if (typeof metadata === "object") {
    return metadata;
  }

  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata);

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

function getCustomField(
  metadata,
  variableName
) {
  const meta = getMetadataObject(metadata);

  const fields = Array.isArray(
    meta.custom_fields
  )
    ? meta.custom_fields
    : [];

  const wanted = normalize(variableName);

  const field = fields.find(
    (item) =>
      normalize(item?.variable_name) ===
      wanted
  );

  return clean(field?.value);
}

function detectPlan(data) {
  const metadata =
    getMetadataObject(data?.metadata);

  const planObject =
    data?.plan &&
    typeof data.plan === "object"
      ? data.plan
      : null;

  const planCode = clean(
    planObject?.plan_code ||
      planObject?.code ||
      data?.plan_code ||
      data?.subscription?.plan_code ||
      ""
  );

  const metadataPlan = normalize(
    metadata.planType ||
      metadata.plan_type ||
      getCustomField(
        metadata,
        "planType"
      ) ||
      getCustomField(
        metadata,
        "plan_type"
      )
  );

  if (
    WEEKLY_PLAN_CODE &&
    planCode === WEEKLY_PLAN_CODE
  ) {
    return {
      type: "weekly",
      planCode,
      amount: WEEKLY_AMOUNT,
    };
  }

  if (
    MONTHLY_PLAN_CODE &&
    planCode === MONTHLY_PLAN_CODE
  ) {
    return {
      type: "monthly",
      planCode,
      amount: MONTHLY_AMOUNT,
    };
  }

  if (
    metadataPlan === "weekly"
  ) {
    return {
      type: "weekly",
      planCode,
      amount: WEEKLY_AMOUNT,
    };
  }

  if (
    metadataPlan === "monthly"
  ) {
    return {
      type: "monthly",
      planCode,
      amount: MONTHLY_AMOUNT,
    };
  }

  const amount = Number(
    data?.amount || 0
  );

  if (amount === WEEKLY_AMOUNT) {
    return {
      type: "weekly",
      planCode,
      amount: WEEKLY_AMOUNT,
    };
  }

  if (amount === MONTHLY_AMOUNT) {
    return {
      type: "monthly",
      planCode,
      amount: MONTHLY_AMOUNT,
    };
  }

  return null;
}

function getUserId(data) {
  const metadata =
    getMetadataObject(data?.metadata);

  return clean(
    metadata.userId ||
      metadata.user_id ||
      metadata.uid ||
      getCustomField(
        metadata,
        "userId"
      ) ||
      getCustomField(
        metadata,
        "user_id"
      )
  );
}

function getCustomerEmail(data) {
  return clean(
    data?.customer?.email ||
      data?.email ||
      ""
  );
}

function getReference(data) {
  return clean(
    data?.reference ||
      data?.transaction?.reference ||
      ""
  );
}

/* =========================================================
   EVENT PROCESSING
========================================================= */

async function processChargeSuccess(
  event,
  redis
) {
  const data = event?.data || {};

  if (
    normalize(data?.status) !==
    "success"
  ) {
    return {
      processed: false,
      reason: "charge_not_successful",
    };
  }

  const reference =
    getReference(data);

  if (!reference) {
    throw new Error(
      "Paystack webhook has no transaction reference."
    );
  }

  const plan =
    detectPlan(data);

  if (!plan) {
    throw new Error(
      "Unable to determine OBITREND plan from Paystack webhook."
    );
  }

  const currency =
    clean(data?.currency || CURRENCY);

  if (
    normalize(currency) !==
    normalize(CURRENCY)
  ) {
    throw new Error(
      "Unexpected Paystack currency."
    );
  }

  const amount = Number(
    data?.amount || 0
  );

  if (
    amount !== plan.amount
  ) {
    throw new Error(
      "Unexpected Paystack payment amount."
    );
  }

  const userId =
    getUserId(data);

  const email =
    getCustomerEmail(data);

  /*
    Initial transactions contain our userId
    in metadata.

    Recurring Paystack charges may not always
    contain the original application metadata.

    Therefore we require userId here rather than
    guessing which OBITREND account should receive
    the credits.
  */

  if (!userId) {
    throw new Error(
      "Paystack webhook does not contain an OBITREND user ID."
    );
  }

  const activated =
    await activatePro(
      userId,
      email,
      reference,
      redis,
      plan.type
    );

  return {
    processed: true,
    reference,
    userId,
    email,
    plan: plan.type,
    amount,
    activated,
  };
}

/* =========================================================
   HTTP HANDLER
========================================================= */

export default async function handler(
  req,
  res
) {
  if (req.method !== "POST") {
    res.setHeader(
      "Allow",
      "POST"
    );

    return res.status(405).json({
      success: false,
      error: "Method not allowed.",
    });
  }

  try {
    if (!PAYSTACK_SECRET_KEY) {
      console.error(
        "[OBITREND PAYSTACK WEBHOOK] PAYSTACK_SECRET_KEY is missing."
      );

      return res.status(500).json({
        success: false,
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
      IMPORTANT:
      Signature is verified against the
      original raw request body.
    */

    if (
      !verifySignature(
        rawBody,
        signature
      )
    ) {
      console.error(
        "[OBITREND PAYSTACK WEBHOOK] Invalid signature."
      );

      return res.status(401).json({
        success: false,
      });
    }

    let event;

    try {
      event = JSON.parse(
        rawBody.toString("utf8")
      );
    } catch {
      return res.status(400).json({
        success: false,
      });
    }

    /*
      We only need charge.success
      for adding generation credits.
    */

    if (
      event?.event !==
      "charge.success"
    ) {
      return res.status(200).json({
        success: true,
        ignored: true,
      });
    }

    const redis =
      getRedisConfig();

    const result =
      await processChargeSuccess(
        event,
        redis
      );

    console.log(
      "[OBITREND PAYSTACK WEBHOOK] Payment processed:",
      {
        reference:
          result.reference,
        plan:
          result.plan,
        userId:
          result.userId,
      }
    );

    return res.status(200).json({
      success: true,
      processed: true,
    });
  } catch (error) {
    /*
      Never expose internal Paystack,
      Redis, or application errors.
    */

    console.error(
      "[OBITREND PAYSTACK WEBHOOK ERROR]",
      error
    );

    /*
      Paystack should receive a successful
      HTTP response only when processing
      completed.

      A 500 allows Paystack to retry the
      webhook delivery.
    */

    return res.status(500).json({
      success: false,
    });
  }
}
