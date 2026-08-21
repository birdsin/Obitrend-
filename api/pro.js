/**
 * OBITREND PRO ENTITLEMENT API
 *
 * Server-side Pro verification.
 *
 * REQUIRED VERCEL ENVIRONMENT VARIABLES:
 *
 * PAYSTACK_SECRET_KEY
 * PAYSTACK_PRO_PLAN_CODE
 *
 * AND ONE OF:
 *
 * KV_REST_API_URL
 * KV_REST_API_TOKEN
 *
 * OR:
 *
 * UPSTASH_REDIS_REST_URL
 * UPSTASH_REDIS_REST_TOKEN
 *
 * OPTIONAL:
 *
 * PAYSTACK_EXPECTED_AMOUNT
 * PAYSTACK_EXPECTED_CURRENCY
 * PAYSTACK_EXPECTED_INTERVAL
 */

const PAYSTACK_API = "https://api.paystack.co";

const PRO_SECONDS = 7 * 24 * 60 * 60;

const DEFAULT_EXPECTED_AMOUNT = 1500000; // ₦15,000
const DEFAULT_EXPECTED_CURRENCY = "NGN";
const DEFAULT_EXPECTED_INTERVAL = "weekly";


/* =========================================================
   BASIC HELPERS
========================================================= */

function send(res, status, data) {
  return res.status(status).json(data);
}


function clean(value) {
  return String(value ?? "")
    .trim()
    .slice(0, 500);
}


function cleanUserId(value) {
  return clean(value)
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 100);
}


function lower(value) {
  return clean(value).toLowerCase();
}


function upper(value) {
  return clean(value).toUpperCase();
}


/* =========================================================
   CONFIG
========================================================= */

function getConfig() {
  const redisUrl = clean(
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    ""
  );

  const redisToken = clean(
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    ""
  );

  const paystackSecretKey = clean(
    process.env.PAYSTACK_SECRET_KEY
  );

  const planCode = clean(
    process.env.PAYSTACK_PRO_PLAN_CODE
  );

  const amountRaw = clean(
    process.env.PAYSTACK_EXPECTED_AMOUNT
  );

  const expectedAmount =
    amountRaw &&
    Number.isFinite(Number(amountRaw))
      ? Number(amountRaw)
      : DEFAULT_EXPECTED_AMOUNT;

  const expectedCurrency =
    clean(
      process.env.PAYSTACK_EXPECTED_CURRENCY
    ) || DEFAULT_EXPECTED_CURRENCY;

  const expectedInterval =
    clean(
      process.env.PAYSTACK_EXPECTED_INTERVAL
    ) || DEFAULT_EXPECTED_INTERVAL;

  return {
    redisUrl,
    redisToken,
    paystackSecretKey,
    planCode,
    expectedAmount,
    expectedCurrency,
    expectedInterval
  };
}


/* =========================================================
   REDIS
========================================================= */

async function redisCommand(
  url,
  token,
  command
) {
  const response = await fetch(
    `${url}/${command
      .map(encodeURIComponent)
      .join("/")}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (
    !response.ok ||
    !data ||
    data.error
  ) {
    throw new Error(
      data?.error ||
      `Redis request failed (${response.status}).`
    );
  }

  return data.result;
}


function proKey(userId) {
  return `obitrend:pro:${userId}`;
}


function referenceKey(userId) {
  return `obitrend:pro:reference:${userId}`;
}


function emailKey(userId) {
  return `obitrend:pro:email:${userId}`;
}


/* =========================================================
   PAYSTACK REQUEST
========================================================= */

async function paystackRequest(
  path,
  secretKey
) {
  const response = await fetch(
    `${PAYSTACK_API}${path}`,
    {
      method: "GET",
      headers: {
        Authorization:
          `Bearer ${secretKey}`,
        Accept:
          "application/json"
      }
    }
  );

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}


/* =========================================================
   VERIFY PAYSTACK PLAN
========================================================= */

async function verifyPlan(config) {
  const result =
    await paystackRequest(
      `/plan/${encodeURIComponent(
        config.planCode
      )}`,
      config.paystackSecretKey
    );

  if (
    !result.ok ||
    !result.data?.status
  ) {
    return {
      valid: false,
      error:
        result.data?.message ||
        "Unable to verify the OBITREND Pro Paystack plan."
    };
  }

  const plan =
    result.data.data;

  if (!plan) {
    return {
      valid: false,
      error:
        "Paystack returned no plan information."
    };
  }

  const returnedPlanCode =
    clean(
      plan.plan_code ||
      plan.planCode ||
      ""
    );

  if (
    returnedPlanCode &&
    returnedPlanCode !==
      config.planCode
  ) {
    return {
      valid: false,
      error:
        "The Paystack Pro plan code does not match."
    };
  }

  const planAmount =
    Number(plan.amount);

  if (
    !Number.isFinite(planAmount) ||
    planAmount <= 0
  ) {
    return {
      valid: false,
      error:
        "Paystack returned an invalid Pro plan amount."
    };
  }

  if (
    planAmount !==
    config.expectedAmount
  ) {
    return {
      valid: false,
      error:
        "The Paystack Pro plan amount does not match OBITREND Pro."
    };
  }

  if (
    clean(plan.currency) &&
    upper(plan.currency) !==
      upper(config.expectedCurrency)
  ) {
    return {
      valid: false,
      error:
        "The Paystack Pro plan currency does not match OBITREND."
    };
  }

  if (
    clean(plan.interval) &&
    lower(plan.interval) !==
      lower(config.expectedInterval)
  ) {
    return {
      valid: false,
      error:
        "The Paystack Pro plan interval does not match OBITREND."
    };
  }

  return {
    valid: true,
    plan
  };
}


/* =========================================================
   VERIFY TRANSACTION
========================================================= */

async function verifyTransaction(
  reference,
  config
) {
  const cleanReference =
    clean(reference);

  if (!cleanReference) {
    return {
      success: false,
      paid: false,
      error:
        "Payment reference is required."
    };
  }

  const result =
    await paystackRequest(
      `/transaction/verify/${encodeURIComponent(
        cleanReference
      )}`,
      config.paystackSecretKey
    );

  if (
    !result.ok ||
    !result.data?.status
  ) {
    return {
      success: false,
      paid: false,
      reference:
        cleanReference,
      error:
        result.data?.message ||
        "Paystack could not verify the payment."
    };
  }

  const transaction =
    result.data.data;

  if (!transaction) {
    return {
      success: false,
      paid: false,
      reference:
        cleanReference,
      error:
        "Paystack returned no transaction data."
    };
  }

  /* PAYMENT STATUS */

  if (
    lower(transaction.status) !==
    "success"
  ) {
    return {
      success: false,
      paid: false,
      reference:
        transaction.reference ||
        cleanReference,
      status:
        transaction.status,
      error:
        "Payment has not been completed successfully."
    };
  }


  /* CURRENCY */

  if (
    upper(transaction.currency) !==
    upper(config.expectedCurrency)
  ) {
    return {
      success: false,
      paid: false,
      reference:
        transaction.reference ||
        cleanReference,
      error:
        "Payment currency does not match OBITREND Pro."
    };
  }


  /* AMOUNT */

  const actualAmount =
    Number(transaction.amount);

  const requestedAmount =
    Number(
      transaction.requested_amount
    );

  const hasRequestedAmount =
    Number.isFinite(
      requestedAmount
    ) &&
    requestedAmount > 0;

  if (hasRequestedAmount) {
    if (
      requestedAmount !==
      config.expectedAmount
    ) {
      return {
        success: false,
        paid: false,
        reference:
          transaction.reference ||
          cleanReference,
        error:
          "Payment amount does not match OBITREND Pro."
      };
    }
  } else {
    if (
      actualAmount !==
      config.expectedAmount
    ) {
      return {
        success: false,
        paid: false,
        reference:
          transaction.reference ||
          cleanReference,
        error:
          "Payment amount could not be verified."
      };
    }
  }


  /* VERIFY PLAN */

  const planResult =
    await verifyPlan(config);

  if (!planResult.valid) {
    return {
      success: false,
      paid: false,
      reference:
        transaction.reference ||
        cleanReference,
      error:
        planResult.error
    };
  }


  /* TRANSACTION PLAN */

  let transactionPlanCode = "";

  if (
    typeof transaction.plan ===
    "string"
  ) {
    transactionPlanCode =
      clean(transaction.plan);
  }

  if (
    transaction.plan &&
    typeof transaction.plan ===
      "object"
  ) {
    transactionPlanCode =
      clean(
        transaction.plan.plan_code ||
        transaction.plan.planCode ||
        transaction.plan.code ||
        ""
      );
  }

  if (
    transactionPlanCode &&
    transactionPlanCode !==
      config.planCode
  ) {
    return {
      success: false,
      paid: false,
      reference:
        transaction.reference ||
        cleanReference,
      error:
        "The payment is not for the configured OBITREND Pro plan."
    };
  }


  /* CUSTOMER */

  const email =
    clean(
      transaction.customer?.email ||
      transaction.email ||
      ""
    ).toLowerCase();


  /* PAYMENT DATE */

  const paidAt =
    transaction.paid_at ||
    transaction.paidAt ||
    transaction.transaction_date ||
    transaction.created_at ||
    transaction.createdAt ||
    null;


  return {
    success: true,
    paid: true,
    pro: true,

    reference:
      transaction.reference ||
      cleanReference,

    status:
      transaction.status,

    amount:
      actualAmount,

    requestedAmount:
      hasRequestedAmount
        ? requestedAmount
        : config.expectedAmount,

    currency:
      transaction.currency,

    email,

    paidAt,

    planCode:
      config.planCode,

    planName:
      planResult.plan?.name ||
      "OBITREND Pro",

    interval:
      planResult.plan?.interval ||
      config.expectedInterval
  };
}


/* =========================================================
   SAVE PRO ENTITLEMENT
========================================================= */

async function activatePro(
  userId,
  reference,
  email,
  config
) {
  const expiresAt =
    Math.floor(
      Date.now() / 1000
    ) + PRO_SECONDS;


  await redisCommand(
    config.redisUrl,
    config.redisToken,
    [
      "SET",
      proKey(userId),
      "true",
      "EX",
      PRO_SECONDS
    ]
  );


  await redisCommand(
    config.redisUrl,
    config.redisToken,
    [
      "SET",
      referenceKey(userId),
      reference,
      "EX",
      PRO_SECONDS
    ]
  );


  if (email) {
    await redisCommand(
      config.redisUrl,
      config.redisToken,
      [
        "SET",
        emailKey(userId),
        email,
        "EX",
        PRO_SECONDS
      ]
    );
  }


  return {
    active: true,
    expiresAt
  };
}


/* =========================================================
   GET PRO STATUS
========================================================= */

async function getPro(
  userId,
  config
) {
  const active =
    await redisCommand(
      config.redisUrl,
      config.redisToken,
      [
        "GET",
        proKey(userId)
      ]
    );

  const reference =
    await redisCommand(
      config.redisUrl,
      config.redisToken,
      [
        "GET",
        referenceKey(userId)
      ]
    );

  const email =
    await redisCommand(
      config.redisUrl,
      config.redisToken,
      [
        "GET",
        emailKey(userId)
      ]
    );

  return {
    active:
      active === "true",

    reference:
      reference || "",

    email:
      email || ""
  };
}


/* =========================================================
   MAIN HANDLER
========================================================= */

export default async function handler(
  req,
  res
) {
  const config =
    getConfig();


  /* CONFIG CHECK */

  if (
    !config.redisUrl ||
    !config.redisToken
  ) {
    return send(res, 500, {
      success: false,
      error:
        "Redis environment variables are missing in Vercel."
    });
  }


  if (
    !config.paystackSecretKey
  ) {
    return send(res, 500, {
      success: false,
      error:
        "PAYSTACK_SECRET_KEY is missing in Vercel."
    });
  }


  if (!config.planCode) {
    return send(res, 500, {
      success: false,
      error:
        "PAYSTACK_PRO_PLAN_CODE is missing in Vercel."
    });
  }


  try {

    /* =====================================================
       GET — CHECK PRO STATUS
    ===================================================== */

    if (req.method === "GET") {

      const userId =
        cleanUserId(
          req.query?.userId
        );

      if (
        !userId ||
        userId.length < 8
      ) {
        return send(res, 400, {
          success: false,
          error:
            "A valid userId is required."
        });
      }

      const pro =
        await getPro(
          userId,
          config
        );

      return send(res, 200, {
        success: true,
        pro:
          pro.active,
        active:
          pro.active,
        reference:
          pro.reference,
        email:
          pro.email
      });
    }


    /* =====================================================
       POST — VERIFY PAYMENT THEN ACTIVATE PRO
    ===================================================== */

    if (req.method === "POST") {

      const userId =
        cleanUserId(
          req.body?.userId
        );

      const reference =
        clean(
          req.body?.reference
        );

      if (
        !userId ||
        userId.length < 8
      ) {
        return send(res, 400, {
          success: false,
          error:
            "A valid userId is required."
        });
      }


      if (!reference) {
        return send(res, 400, {
          success: false,
          error:
            "A Paystack payment reference is required."
        });
      }


      /*
       * SECURITY:
       *
       * NEVER activate Pro merely because
       * the browser says payment succeeded.
       *
       * This endpoint independently asks
       * Paystack to verify the reference.
       */

      const payment =
        await verifyTransaction(
          reference,
          config
        );


      if (
        !payment.success ||
        !payment.paid
      ) {
        return send(res, 402, {
          success: false,
          pro: false,
          error:
            payment.error ||
            "Payment verification failed."
        });
      }


      /*
       * The verified Paystack customer email
       * is used instead of trusting an email
       * supplied by the browser.
       */

      const email =
        payment.email ||
        clean(
          req.body?.email
        ).toLowerCase();


      const result =
        await activatePro(
          userId,
          payment.reference,
          email,
          config
        );


      return send(res, 200, {
        success: true,

        pro: true,

        active: true,

        reference:
          payment.reference,

        email,

        expiresAt:
          result.expiresAt,

        amount:
          payment.amount,

        requestedAmount:
          payment.requestedAmount,

        currency:
          payment.currency,

        planCode:
          payment.planCode,

        planName:
          payment.planName,

        interval:
          payment.interval,

        message:
          "OBITREND Pro payment verified and entitlement activated."
      });
    }


    /* =====================================================
       OTHER METHODS
    ===================================================== */

    res.setHeader(
      "Allow",
      "GET, POST"
    );

    return send(res, 405, {
      success: false,
      error:
        "Method not allowed."
    });


  } catch (error) {

    console.error(
      "OBITREND Pro entitlement error:",
      error
    );

    return send(res, 500, {
      success: false,
      error:
        "Unable to process OBITREND Pro entitlement."
    });
  }
}
