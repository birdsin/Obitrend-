/*
===========================================================
OBITREND PRO — PAYSTACK PAYMENT API
===========================================================

STANDARD PRO:
NGN 15,000 / week
20 credits
7 days

Required Vercel variables:
PAYSTACK_SECRET_KEY
PAYSTACK_PRO_PLAN_CODE

Optional:
OBITREND_APP_URL
PAYSTACK_EXPECTED_AMOUNT
PAYSTACK_EXPECTED_CURRENCY
PAYSTACK_EXPECTED_INTERVAL

Security:
- Payment must be initiated by an authenticated user.
- Payment reference is bound to that authenticated account.
- Paystack transaction is verified server-side.
- Customer email is checked against the authenticated account.
- Payment references cannot be reused to restore credits.
- The same successful payment cannot repeatedly restore credits.
- Technical details are kept in server logs only.
===========================================================
*/

import {
  activatePro,
  getAuthenticatedUser,
  getRedisConfig
} from "./credits.js";

const PAYSTACK_API =
  "https://api.paystack.co";

const DEFAULT_APP_URL =
  "https://obitrend.vercel.app";

const DEFAULT_AMOUNT =
  1500000;

const DEFAULT_CURRENCY =
  "NGN";

const DEFAULT_INTERVAL =
  "weekly";

/*
-----------------------------------------------------------
Monthly support is preserved from the existing workflow.
Weekly Standard Pro remains the primary plan.
-----------------------------------------------------------
*/

const DEFAULT_MONTHLY_AMOUNT =
  4500000;

const DEFAULT_MONTHLY_INTERVAL =
  "monthly";

const PAYMENT_PENDING_SECONDS =
  24 * 60 * 60;

const PAYMENT_PROCESSED_SECONDS =
  10 * 365 * 24 * 60 * 60;

const PAYMENT_LOCK_SECONDS =
  60;

/*
===========================================================
BASIC HELPERS
===========================================================
*/

function clean(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return clean(value).toLowerCase();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function send(res, status, data) {
  return res.status(status).json(data);
}

function pendingPaymentKey(reference) {
  return `obitrend:paystack:pending:${clean(reference)}`;
}

function processedPaymentKey(reference) {
  return `obitrend:paystack:processed:${clean(reference)}`;
}

function paymentLockKey(reference) {
  return `obitrend:paystack:lock:${clean(reference)}`;
}

/*
===========================================================
REDIS HELPER
===========================================================
*/

async function redisCommand(
  redis,
  command
) {
  if (!redis?.url || !redis?.token) {
    throw new Error(
      "Redis is not configured."
    );
  }

  const response = await fetch(
    `${redis.url.replace(/\/$/, "")}/${command
      .map(encodeURIComponent)
      .join("/")}`,
    {
      method: "GET",
      headers: {
        Authorization:
          `Bearer ${redis.token}`
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
      "Redis request failed."
    );
  }

  return data.result;
}

/*
===========================================================
PAYSTACK CONFIG
===========================================================
*/

function config() {
  return {
    secretKey:
      clean(
        process.env.PAYSTACK_SECRET_KEY
      ),

    planCode:
      clean(
        process.env.PAYSTACK_PRO_PLAN_CODE
      ) ||
      "PLN_sd2ggtyt2egdre",

    appUrl:
      clean(
        process.env.OBITREND_APP_URL
      ) ||
      DEFAULT_APP_URL,

    expectedAmount:
      Number.isFinite(
        Number(
          process.env.PAYSTACK_EXPECTED_AMOUNT
        )
      )
        ? Number(
            process.env.PAYSTACK_EXPECTED_AMOUNT
          )
        : DEFAULT_AMOUNT,

    expectedCurrency:
      clean(
        process.env.PAYSTACK_EXPECTED_CURRENCY
      ) ||
      DEFAULT_CURRENCY,

    expectedInterval:
      clean(
        process.env.PAYSTACK_EXPECTED_INTERVAL
      ) ||
      DEFAULT_INTERVAL,

    monthlyAmount:
      Number.isFinite(
        Number(
          process.env.PAYSTACK_MONTHLY_EXPECTED_AMOUNT
        )
      )
        ? Number(
            process.env.PAYSTACK_MONTHLY_EXPECTED_AMOUNT
          )
        : DEFAULT_MONTHLY_AMOUNT,

    monthlyInterval:
      clean(
        process.env.PAYSTACK_MONTHLY_EXPECTED_INTERVAL
      ) ||
      DEFAULT_MONTHLY_INTERVAL,

    monthlyPlanCode:
      clean(
        process.env.PAYSTACK_MONTHLY_PLAN_CODE
      )
  };
}

/*
===========================================================
CONFIG VALIDATION
===========================================================
*/

function validate(res, cfg) {
  if (!cfg.secretKey) {
    return send(res, 500, {
      success: false,
      error:
        "OBITREND payments are temporarily unavailable. Please try again later."
    });
  }

  return null;
}

/*
===========================================================
PAYSTACK REQUEST
===========================================================
*/

async function paystack(
  path,
  secretKey,
  options = {}
) {
  const response = await fetch(
    `${PAYSTACK_API}${path}`,
    {
      method:
        options.method || "GET",

      headers: {
        Authorization:
          `Bearer ${secretKey}`,

        "Content-Type":
          "application/json",

        Accept:
          "application/json"
      },

      body:
        options.body !== undefined
          ? JSON.stringify(
              options.body
            )
          : undefined
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

/*
===========================================================
VERIFY PAYSTACK PLAN
===========================================================
*/

async function verifyPlan(cfg) {
  const result =
    await paystack(
      `/plan/${encodeURIComponent(
        cfg.planCode
      )}`,
      cfg.secretKey
    );

  if (
    !result.ok ||
    !result.data?.status
  ) {
    return {
      valid: false,
      error:
        "Unable to verify the OBITREND Pro payment plan."
    };
  }

  const plan =
    result.data.data;

  if (!plan) {
    return {
      valid: false,
      error:
        "The OBITREND Pro payment plan could not be verified."
    };
  }

  const amount =
    Number(plan.amount);

  const currency =
    upper(plan.currency);

  const interval =
    lower(plan.interval);

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return {
      valid: false,
      error:
        "The OBITREND Pro payment plan is not available right now."
    };
  }

  if (
    amount !==
    cfg.expectedAmount
  ) {
    return {
      valid: false,
      error:
        "The OBITREND Pro payment price needs attention."
    };
  }

  if (
    currency &&
    currency !==
      upper(cfg.expectedCurrency)
  ) {
    return {
      valid: false,
      error:
        "The OBITREND payment currency is not configured correctly."
    };
  }

  if (
    interval &&
    interval !==
      lower(cfg.expectedInterval)
  ) {
    return {
      valid: false,
      error:
        "The OBITREND payment plan is not configured correctly."
    };
  }

  return {
    valid: true,
    plan
  };
}

/*
===========================================================
VERIFY SUCCESSFUL TRANSACTION
===========================================================
*/

async function verifyTransaction(
  reference,
  cfg,
  authenticatedEmail = ""
) {
  const ref =
    clean(reference);

  const isMonthly =
    /-PRO_MONTHLY-/i.test(
      ref
    );

  const expectedAmount =
    isMonthly
      ? cfg.monthlyAmount
      : cfg.expectedAmount;

  const expectedInterval =
    isMonthly
      ? cfg.monthlyInterval
      : cfg.expectedInterval;

  const expectedPlanCode =
    isMonthly
      ? cfg.monthlyPlanCode
      : cfg.planCode;

  const durationSeconds =
    isMonthly
      ? 30 * 24 * 60 * 60
      : 7 * 24 * 60 * 60;

  if (!ref) {
    return {
      success: false,
      paid: false,
      error:
        "Payment information is missing."
    };
  }

  const result =
    await paystack(
      `/transaction/verify/${encodeURIComponent(
        ref
      )}`,
      cfg.secretKey
    );

  if (
    !result.ok ||
    !result.data?.status
  ) {
    return {
      success: false,
      paid: false,
      reference: ref,
      error:
        "We could not verify this payment yet. Please try again."
    };
  }

  const tx =
    result.data.data;

  if (!tx) {
    return {
      success: false,
      paid: false,
      reference: ref,
      error:
        "We could not confirm the payment. Please try again."
    };
  }

  if (
    lower(tx.status) !==
    "success"
  ) {
    return {
      success: false,
      paid: false,
      status: tx.status,
      reference:
        tx.reference || ref,
      error:
        "The payment has not been completed successfully."
    };
  }

  if (
    upper(tx.currency) !==
    upper(cfg.expectedCurrency)
  ) {
    return {
      success: false,
      paid: false,
      status: tx.status,
      reference:
        tx.reference || ref,
      error:
        "The payment currency does not match OBITREND Pro."
    };
  }

  /*
  ---------------------------------------------------------
  VERIFY AMOUNT
  ---------------------------------------------------------
  */

  const actualAmount =
    Number(tx.amount);

  const requestedAmount =
    Number(
      tx.requested_amount
    );

  const fees =
    Number(tx.fees);

  let verifiedAmount =
    false;

  if (
    Number.isFinite(
      requestedAmount
    ) &&
    requestedAmount > 0
  ) {
    verifiedAmount =
      requestedAmount ===
      expectedAmount;
  } else if (
    Number.isFinite(
      actualAmount
    ) &&
    Number.isFinite(
      fees
    )
  ) {
    verifiedAmount =
      actualAmount - fees ===
      expectedAmount;
  } else {
    verifiedAmount =
      actualAmount ===
      expectedAmount;
  }

  if (!verifiedAmount) {
    return {
      success: false,
      paid: false,
      status: tx.status,
      reference:
        tx.reference || ref,
      error:
        "The payment amount could not be verified."
    };
  }

  /*
  ---------------------------------------------------------
  VERIFY PLAN WHEN PAYSTACK RETURNS IT
  ---------------------------------------------------------
  */

  let transactionPlanCode =
    "";

  if (
    typeof tx.plan ===
    "string"
  ) {
    transactionPlanCode =
      clean(tx.plan);
  } else if (
    tx.plan &&
    typeof tx.plan ===
      "object"
  ) {
    transactionPlanCode =
      clean(
        tx.plan.plan_code ||
        tx.plan.planCode ||
        tx.plan.code ||
        ""
      );
  }

  if (
    !transactionPlanCode &&
    tx.plan_object
  ) {
    transactionPlanCode =
      clean(
        tx.plan_object.plan_code ||
        tx.plan_object.planCode ||
        tx.plan_object.code ||
        ""
      );
  }

  if (
    transactionPlanCode &&
    expectedPlanCode &&
    transactionPlanCode !==
      expectedPlanCode
  ) {
    return {
      success: false,
      paid: false,
      status: tx.status,
      reference:
        tx.reference || ref,
      error:
        "This payment is not for the configured OBITREND Pro plan."
    };
  }

  /*
  ---------------------------------------------------------
  VERIFY CUSTOMER EMAIL
  ---------------------------------------------------------
  */

  const email =
    clean(
      tx.customer?.email ||
      tx.email ||
      ""
    );

  if (
    authenticatedEmail &&
    email &&
    email.toLowerCase() !==
      authenticatedEmail.toLowerCase()
  ) {
    return {
      success: false,
      paid: false,
      reference:
        tx.reference || ref,
      error:
        "This payment belongs to a different OBITREND account."
    };
  }

  const customerCode =
    clean(
      tx.customer?.customer_code ||
      tx.customer?.customerCode ||
      ""
    );

  return {
    success: true,
    paid: true,
    pro: true,

    reference:
      tx.reference || ref,

    status:
      tx.status,

    amount:
      actualAmount,

    requestedAmount:
      Number.isFinite(
        requestedAmount
      )
        ? requestedAmount
        : expectedAmount,

    currency:
      tx.currency,

    fees:
      Number.isFinite(fees)
        ? fees
        : null,

    email,

    customerCode,

    paidAt:
      tx.paid_at ||
      tx.paidAt ||
      tx.transaction_date ||
      tx.created_at ||
      tx.createdAt ||
      null,

    authorization:
      tx.authorization ||
      null,

    planCode:
      expectedPlanCode ||
      null,

    planName:
      isMonthly
        ? "OBITREND Full Pro Monthly"
        : "OBITREND Standard Pro Weekly",

    interval:
      expectedInterval,

    durationSeconds,

    message:
      "OBITREND Pro payment verified successfully."
  };
}

/*
===========================================================
STORE PENDING PAYMENT

The reference is bound to the authenticated user BEFORE
the customer is allowed to complete the payment.

This prevents someone from taking an unrelated old
Paystack reference and using it to activate another account.
===========================================================
*/

async function storePendingPayment(
  redis,
  reference,
  userId,
  email,
  plan
) {
  const payload = {
    userId: String(userId),
    email: String(email)
      .trim()
      .toLowerCase(),

    plan:
      upper(plan) ===
      "PRO_MONTHLY"
        ? "PRO_MONTHLY"
        : "PRO_WEEKLY",

    createdAt:
      Math.floor(
        Date.now() / 1000
      )
  };

  await redisCommand(
    redis,
    [
      "SET",
      pendingPaymentKey(
        reference
      ),
      JSON.stringify(payload),
      "EX",
      PAYMENT_PENDING_SECONDS
    ]
  );

  return payload;
}

/*
===========================================================
GET PENDING PAYMENT
===========================================================
*/

async function getPendingPayment(
  redis,
  reference
) {
  const raw =
    await redisCommand(
      redis,
      [
        "GET",
        pendingPaymentKey(
          reference
        )
      ]
    );

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/*
===========================================================
GET PROCESSED PAYMENT
===========================================================
*/

async function getProcessedPayment(
  redis,
  reference
) {
  const raw =
    await redisCommand(
      redis,
      [
        "GET",
        processedPaymentKey(
          reference
        )
      ]
    );

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/*
===========================================================
MARK PAYMENT PROCESSED
===========================================================
*/

async function markPaymentProcessed(
  redis,
  reference,
  userId
) {
  const payload = {
    userId: String(userId),
    reference: String(reference),
    processedAt:
      Math.floor(
        Date.now() / 1000
      )
  };

  await redisCommand(
    redis,
    [
      "SET",
      processedPaymentKey(
        reference
      ),
      JSON.stringify(payload),
      "EX",
      PAYMENT_PROCESSED_SECONDS
    ]
  );

  return payload;
}

/*
===========================================================
DELETE PAYMENT LOCK
===========================================================
*/

async function releasePaymentLock(
  redis,
  reference
) {
  try {
    await redisCommand(
      redis,
      [
        "DEL",
        paymentLockKey(
          reference
        )
      ]
    );
  } catch (error) {
    console.error(
      "OBITREND payment lock cleanup failed:",
      error
    );
  }
}

/*
===========================================================
ACQUIRE PAYMENT LOCK
===========================================================
*/

async function acquirePaymentLock(
  redis,
  reference,
  userId
) {
  const result =
    await redisCommand(
      redis,
      [
        "SET",
        paymentLockKey(
          reference
        ),
        String(userId),
        "EX",
        PAYMENT_LOCK_SECONDS,
        "NX"
      ]
    );

  return result === "OK";
}

/*
===========================================================
INITIALIZE PAYMENT
===========================================================
*/

async function initializePayment(
  email,
  userId,
  cfg,
  plan = "PRO_WEEKLY",
  redis
) {
  const cleanEmail =
    clean(email).toLowerCase();

  const cleanUser =
    clean(userId);

  if (!cleanEmail) {
    return {
      success: false,
      error:
        "Your account email is required."
    };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return {
      success: false,
      error:
        "Please use a valid account email."
    };
  }

  if (!cleanUser) {
    return {
      success: false,
      error:
        "Your account could not be verified. Please sign in again."
    };
  }

  const isMonthly =
    upper(plan) ===
    "PRO_MONTHLY";

  const amount =
    isMonthly
      ? cfg.monthlyAmount
      : cfg.expectedAmount;

  const interval =
    isMonthly
      ? cfg.monthlyInterval
      : cfg.expectedInterval;

  const planCode =
    isMonthly
      ? cfg.monthlyPlanCode
      : cfg.planCode;

  /*
  ---------------------------------------------------------
  SERVER-GENERATED UNIQUE REFERENCE
  ---------------------------------------------------------
  */

  const reference =
    `OBITREND-${
      isMonthly
        ? "PRO_MONTHLY"
        : "PRO_WEEKLY"
    }-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;

  /*
  ---------------------------------------------------------
  BIND REFERENCE TO ACCOUNT BEFORE PAYMENT
  ---------------------------------------------------------
  */

  try {
    await storePendingPayment(
      redis,
      reference,
      cleanUser,
      cleanEmail,
      plan
    );
  } catch (error) {
    console.error(
      "OBITREND pending payment storage failed:",
      error
    );

    return {
      success: false,
      error:
        "OBITREND payment setup is temporarily unavailable. Please try again."
    };
  }

  const callbackUrl =
    `${cfg.appUrl.replace(
      /\/+$/,
      ""
    )}/`;

  const payload = {
    email: cleanEmail,

    amount:
      String(amount),

    currency:
      cfg.expectedCurrency,

    reference,

    callback_url:
      callbackUrl,

    metadata: {
      product:
        "OBITREND_PRO",

      plan:
        isMonthly
          ? "OBITREND Full Pro Monthly"
          : "OBITREND Standard Pro Weekly",

      plan_code:
        planCode || "",

      interval,

      source:
        "OBITREND_AI_FASHION_CREATOR"
    }
  };

  if (planCode) {
    payload.plan =
      planCode;
  }

  let result =
    await paystack(
      "/transaction/initialize",
      cfg.secretKey,
      {
        method: "POST",
        body: payload
      }
    );

  /*
  ---------------------------------------------------------
  FALLBACK WITHOUT PLAN CODE

  Existing behavior preserved.
  ---------------------------------------------------------
  */

  if (
    (!result.ok ||
      !result.data?.status) &&
    payload.plan
  ) {
    const fallbackPayload =
      {
        ...payload
      };

    delete fallbackPayload.plan;

    result =
      await paystack(
        "/transaction/initialize",
        cfg.secretKey,
        {
          method: "POST",
          body: fallbackPayload
        }
      );
  }

  if (
    !result.ok ||
    !result.data?.status
  ) {
    return {
      success: false,
      error:
        "Unable to open the secure OBITREND payment page. Please try again."
    };
  }

  const data =
    result.data.data;

  if (!data?.authorization_url) {
    return {
      success: false,
      error:
        "The secure payment page could not be opened. Please try again."
    };
  }

  const finalReference =
    data.reference ||
    reference;

  /*
  ---------------------------------------------------------
  If Paystack returns the same reference, everything is
  already bound correctly.

  If Paystack returns another reference, bind that reference
  to the same authenticated account.
  ---------------------------------------------------------
  */

  if (
    finalReference !==
    reference
  ) {
    try {
      await storePendingPayment(
        redis,
        finalReference,
        cleanUser,
        cleanEmail,
        plan
      );

      await redisCommand(
        redis,
        [
          "DEL",
          pendingPaymentKey(
            reference
          )
        ]
      );
    } catch (error) {
      console.error(
        "OBITREND payment reference update failed:",
        error
      );

      return {
        success: false,
        error:
          "Payment setup could not be completed. Please try again."
      };
    }
  }

  return {
    success: true,

    message:
      "OBITREND Pro payment initialized.",

    authorization_url:
      data.authorization_url,

    reference:
      finalReference,

    access_code:
      data.access_code ||
      null,

    plan_code:
      planCode || null,

    amount,

    currency:
      cfg.expectedCurrency,

    interval,

    product_plan:
      isMonthly
        ? "PRO_MONTHLY"
        : "PRO_WEEKLY"
  };
}

/*
===========================================================
GET

Supports:
?reference=...
?trxref=...
?transaction=...
?transaction_reference=...
?action=plan
?action=config
===========================================================
*/

async function handleGet(
  req,
  res
) {
  const cfg =
    config();

  const configError =
    validate(
      res,
      cfg
    );

  if (configError) {
    return configError;
  }

  const url =
    new URL(
      req.url,
      cfg.appUrl
    );

  const reference =
    clean(
      url.searchParams.get(
        "reference"
      ) ||
      url.searchParams.get(
        "trxref"
      ) ||
      url.searchParams.get(
        "transaction"
      ) ||
      url.searchParams.get(
        "transaction_reference"
      ) ||
      ""
    );

  const action =
    lower(
      url.searchParams.get(
        "action"
      ) || ""
    );

  /*
  =========================================================
  PAYMENT VERIFICATION
  =========================================================
  */

  if (reference) {
    const auth =
      await getAuthenticatedUser(
        req
      );

    if (!auth.ok) {
      return send(
        res,
        auth.status,
        {
          success: false,
          paid: false,
          error: auth.error
        }
      );
    }

    const redis =
      getRedisConfig();

    if (
      !redis.url ||
      !redis.token
    ) {
      return send(
        res,
        500,
        {
          success: false,
          paid: false,
          error:
            "OBITREND payment verification is temporarily unavailable. Please try again."
        }
      );
    }

    /*
    -------------------------------------------------------
    FIRST: CHECK WHETHER THIS PAYMENT WAS ALREADY PROCESSED
    -------------------------------------------------------
    */

    try {
      const processed =
        await getProcessedPayment(
          redis,
          reference
        );

      if (processed) {
        if (
          String(
            processed.userId
          ) !==
          String(
            auth.user.id
          )
        ) {
          return send(
            res,
            400,
            {
              success: false,
              paid: false,
              error:
                "This payment is not connected to your OBITREND account."
            }
          );
        }

        return send(
          res,
          200,
          {
            success: true,
            paid: true,
            pro: true,
            proActivated: true,
            proActive: true,
            reference,
            alreadyProcessed: true,
            accountUserId:
              auth.user.id,
            message:
              "Your OBITREND Pro payment has already been applied."
          }
        );
      }
    } catch (error) {
      console.error(
        "OBITREND processed payment lookup failed:",
        error
      );
    }

    /*
    -------------------------------------------------------
    VERIFY TRANSACTION WITH PAYSTACK
    -------------------------------------------------------
    */

    const result =
      await verifyTransaction(
        reference,
        cfg,
        auth.user.email
      );

    if (!result.success) {
      return send(
        res,
        400,
        result
      );
    }

    /*
    -------------------------------------------------------
    CHECK SERVER-SIDE PAYMENT OWNERSHIP
    -------------------------------------------------------
    */

    let pending = null;

    try {
      pending =
        await getPendingPayment(
          redis,
          result.reference
        );
    } catch (error) {
      console.error(
        "OBITREND pending payment lookup failed:",
        error
      );
    }

    /*
    A newly created payment must have a server-side
    account binding.

    The only exception is if the same reference already
    belongs to the current account's active Pro entitlement.
    */

    if (!pending) {
      try {
        const existingReference =
          await redisCommand(
            redis,
            [
              "GET",
              `obitrend:pro:reference:${auth.user.id}`
            ]
          );

        if (
          existingReference &&
          String(
            existingReference
          ).trim() ===
            String(
              result.reference
            ).trim()
        ) {
          return send(
            res,
            200,
            {
              ...result,
              proActivated: true,
              proActive: true,
              alreadyProcessed: true,
              accountUserId:
                auth.user.id,
              message:
                "Your OBITREND Pro payment has already been applied."
            }
          );
        }
      } catch (error) {
        console.error(
          "OBITREND existing entitlement check failed:",
          error
        );
      }

      return send(
        res,
        400,
        {
          success: false,
          paid: false,
          error:
            "This payment could not be connected to your OBITREND account."
        }
      );
    }

    if (
      String(
        pending.userId
      ) !==
      String(
        auth.user.id
      )
    ) {
      return send(
        res,
        400,
        {
          success: false,
          paid: false,
          error:
            "This payment is not connected to your OBITREND account."
        }
      );
    }

    if (
      lower(
        pending.email
      ) !==
      lower(
        auth.user.email
      )
    ) {
      return send(
        res,
        400,
        {
          success: false,
          paid: false,
          error:
            "This payment is not connected to your OBITREND account."
        }
      );
    }

    /*
    -------------------------------------------------------
    LOCK PAYMENT PROCESSING
    -------------------------------------------------------
    */

    let locked = false;

    try {
      locked =
        await acquirePaymentLock(
          redis,
          result.reference,
          auth.user.id
        );
    } catch (error) {
      console.error(
        "OBITREND payment lock failed:",
        error
      );
    }

    if (!locked) {
      /*
      Another request may have completed it between
      the first check and this lock attempt.
      */

      try {
        const processed =
          await getProcessedPayment(
            redis,
            result.reference
          );

        if (
          processed &&
          String(
            processed.userId
          ) ===
            String(
              auth.user.id
            )
        ) {
          return send(
            res,
            200,
            {
              ...result,
              proActivated: true,
              proActive: true,
              alreadyProcessed: true,
              accountUserId:
                auth.user.id,
              message:
                "Your OBITREND Pro payment has already been applied."
            }
          );
        }
      } catch (error) {
        console.error(
          "OBITREND payment recheck failed:",
          error
        );
      }

      return send(
        res,
        409,
        {
          success: false,
          paid: true,
          proActivated: false,
          reference:
            result.reference,
          error:
            "Your payment is being processed. Please wait a moment and try again."
        }
      );
    }

    /*
    -------------------------------------------------------
    ACTIVATE PRO
    -------------------------------------------------------
    */

    try {
      await activatePro(
        auth.user.id,
        auth.user.email,
        result.reference,
        redis,
        result.durationSeconds
      );

      /*
      Mark the payment permanently processed.
      */

      await markPaymentProcessed(
        redis,
        result.reference,
        auth.user.id
      );

      /*
      Remove pending reference.
      */

      try {
        await redisCommand(
          redis,
          [
            "DEL",
            pendingPaymentKey(
              result.reference
            )
          ]
        );
      } catch {}

      return send(
        res,
        200,
        {
          ...result,

          proActivated:
            true,

          proActive:
            true,

          accountUserId:
            auth.user.id,

          message:
            "OBITREND Pro is now active with your weekly credits."
        }
      );
    } catch (activationError) {
      console.error(
        "OBITREND PRO ACTIVATION ERROR:",
        activationError
      );

      return send(
        res,
        500,
        {
          success: false,
          paid: true,
          proActivated: false,
          reference:
            result.reference,
          error:
            "Your payment was received, but Pro activation is still being completed. Please try again shortly."
        }
      );
    } finally {
      await releasePaymentLock(
        redis,
        result.reference
      );
    }
  }

  /*
  =========================================================
  PLAN CHECK
  =========================================================
  */

  if (action === "plan") {
    const result =
      await verifyPlan(
        cfg
      );

    if (!result.valid) {
      return send(
        res,
        400,
        {
          success: false,
          planFound: false,
          error:
            result.error
        }
      );
    }

    return send(
      res,
      200,
      {
        success: true,

        planFound: true,

        proPlan: {
          name:
            result.plan.name,

          planCode:
            result.plan.plan_code ||
            cfg.planCode,

          amount:
            Number(
              result.plan.amount
            ),

          currency:
            result.plan.currency,

          interval:
            result.plan.interval,

          description:
            result.plan.description ||
            null
        }
      }
    );
  }

  /*
  =========================================================
  CONFIG CHECK
  =========================================================
  */

  if (action === "config") {
    return send(
      res,
      200,
      {
        success: true,

        service:
          "OBITREND Paystack Pro",

        status:
          "ready",

        secretKeyConfigured:
          Boolean(
            cfg.secretKey
          ),

        planConfigured:
          Boolean(
            cfg.planCode
          ),

        expectedAmount:
          cfg.expectedAmount,

        expectedCurrency:
          cfg.expectedCurrency,

        expectedInterval:
          cfg.expectedInterval,

        monthlyAmount:
          cfg.monthlyAmount,

        monthlyCurrency:
          cfg.expectedCurrency,

        monthlyInterval:
          cfg.monthlyInterval,

        monthlyPlanConfigured:
          Boolean(
            cfg.monthlyPlanCode
          ),

        appUrl:
          cfg.appUrl
      }
    );
  }

  /*
  =========================================================
  DEFAULT RESPONSE
  =========================================================
  */

  return send(
    res,
    200,
    {
      success: true,

      service:
        "OBITREND Paystack Pro",

      status:
        "ready",

      endpoints: {
        verify:
          "/api/paystack?reference=PAYSTACK_REFERENCE",

        planCheck:
          "/api/paystack?action=plan",

        configCheck:
          "/api/paystack?action=config"
      }
    }
  );
}

/*
===========================================================
POST
===========================================================
*/

async function handlePost(
  req,
  res
) {
  const cfg =
    config();

  const configError =
    validate(
      res,
      cfg
    );

  if (configError) {
    return configError;
  }

  let body =
    req.body || {};

  if (
    typeof body ===
    "string"
  ) {
    try {
      body =
        JSON.parse(body);
    } catch {
      return send(
        res,
        400,
        {
          success: false,
          error:
            "We could not process that request. Please try again."
        }
      );
    }
  }

  /*
  ---------------------------------------------------------
  AUTHENTICATE ACCOUNT FIRST
  ---------------------------------------------------------
  */

  const auth =
    await getAuthenticatedUser(
      req
    );

  if (!auth.ok) {
    return send(
      res,
      auth.status,
      {
        success: false,
        error:
          auth.error
      }
    );
  }

  const email =
    clean(
      auth.user.email
    ).toLowerCase();

  const requestedPlan =
    upper(
      body.plan ||
      "PRO_WEEKLY"
    );

  if (
    ![
      "PRO_WEEKLY",
      "PRO_MONTHLY"
    ].includes(
      requestedPlan
    )
  ) {
    return send(
      res,
      400,
      {
        success: false,
        error:
          "Please select a valid OBITREND Pro plan."
      }
    );
  }

  /*
  ---------------------------------------------------------
  REDIS IS REQUIRED TO BIND PAYMENT TO ACCOUNT
  ---------------------------------------------------------
  */

  const redis =
    getRedisConfig();

  if (
    !redis.url ||
    !redis.token
  ) {
    return send(
      res,
      500,
      {
        success: false,
        error:
          "OBITREND payment setup is temporarily unavailable. Please try again."
      }
    );
  }

  const payment =
    await initializePayment(
      email,
      auth.user.id,
      cfg,
      requestedPlan,
      redis
    );

  return send(
    res,
    payment.success
      ? 200
      : 400,
    payment
  );
}

/*
===========================================================
VERCEL HANDLER
===========================================================
*/

export default async function handler(
  req,
  res
) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    process.env.OBITREND_APP_URL ||
      DEFAULT_APP_URL
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  /*
  Authorization is included because the existing
  Supabase-authenticated frontend sends a bearer token.
  */

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization"
  );

  if (
    req.method ===
    "OPTIONS"
  ) {
    return res
      .status(204)
      .end();
  }

  try {
    if (
      req.method ===
      "GET"
    ) {
      return await handleGet(
        req,
        res
      );
    }

    if (
      req.method ===
      "POST"
    ) {
      return await handlePost(
        req,
        res
      );
    }

    res.setHeader(
      "Allow",
      "GET, POST, OPTIONS"
    );

    return send(
      res,
      405,
      {
        success: false,
        error:
          "This request cannot be completed."
      }
    );
  } catch (error) {
    console.error(
      "OBITREND PAYSTACK ERROR:",
      error
    );

    /*
    IMPORTANT:
    Never expose the technical error or provider response
    to the OBITREND user.
    */

    return send(
      res,
      500,
      {
        success: false,
        error:
          "Something went wrong while processing your payment. Please try again."
      }
    );
  }
}
