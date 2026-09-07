/* =========================================================
   OBITREND AI FASHION CREATOR
   SECURE PAYSTACK PRO PAYMENT API
   =========================================================

   PACKAGES

   ₦10,000  → 4 days  → 5 credits
   ₦20,000  → 8 days  → 10 credits
   ₦30,000  → 14 days → 15 credits
   ₦60,000  → 30 days → 30 credits

   IMPORTANT

   - Supabase authenticated user is the source of truth.
   - Client userId/email is NOT trusted.
   - Paystack payment is verified server-side.
   - Package amount is controlled server-side.
   - Redis uses Upstash REST API.
   - No redis.set(), redis.get(), etc.
   - Payment references are idempotent.
   - Pro activates only after successful Paystack verification.
========================================================= */

import {
  activatePro,
  getAuthenticatedUser,
  getRedisConfig
} from "./credits.js";


const PAYSTACK_API =
  "https://api.paystack.co";

const DEFAULT_APP_URL =
  "https://obitrend.vercel.app";

const CURRENCY =
  "NGN";


/* =========================================================
   SERVER-CONTROLLED PACKAGES
========================================================= */

const PACKAGES = Object.freeze({

  PRO_4_DAY: {
    amount: 1000000,
    durationDays: 4,
    durationSeconds: 4 * 24 * 60 * 60,
    credits: 5,
    tier: "standard",
    name: "OBITREND 4 Day Pro"
  },

  PRO_8_DAY: {
    amount: 2000000,
    durationDays: 8,
    durationSeconds: 8 * 24 * 60 * 60,
    credits: 10,
    tier: "standard",
    name: "OBITREND 8 Day Pro"
  },

  PRO_14_DAY: {
    amount: 3000000,
    durationDays: 14,
    durationSeconds: 14 * 24 * 60 * 60,
    credits: 15,
    tier: "standard",
    name: "OBITREND 14 Day Pro"
  },

  PRO_MONTHLY: {
    amount: 6000000,
    durationDays: 30,
    durationSeconds: 30 * 24 * 60 * 60,
    credits: 30,
    tier: "full",
    name: "OBITREND Monthly Full Pro"
  }

});


/* =========================================================
   GENERAL HELPERS
========================================================= */

function clean(value) {

  return String(
    value ?? ""
  ).trim();

}


function upper(value) {

  return clean(value)
    .toUpperCase();

}


function lower(value) {

  return clean(value)
    .toLowerCase();

}


function send(
  res,
  status,
  data
) {

  return res
    .status(status)
    .json(data);

}


function isValidEmail(email) {

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    .test(
      String(email || "")
    );

}


function getPackage(plan) {

  return PACKAGES[
    upper(plan)
  ] || null;

}


/* =========================================================
   REDIS REST
   =========================================================

   getRedisConfig() returns:

     {
       url,
       token
     }

   It is NOT a redis SDK client.

   Therefore every Redis operation goes through
   the Upstash REST endpoint.
========================================================= */

async function redisCommand(
  redis,
  command
) {

  if(
    !redis?.url ||
    !redis?.token
  ){

    throw new Error(
      "Redis environment variables are missing in Vercel."
    );

  }


  const baseUrl =
    String(redis.url)
      .replace(/\/+$/, "");


  const encodedCommand =
    command
      .map(
        value =>
          encodeURIComponent(
            String(value)
          )
      )
      .join("/");


  const response =
    await fetch(
      `${baseUrl}/${encodedCommand}`,
      {
        method: "GET",

        headers: {
          Authorization:
            `Bearer ${redis.token}`
        }
      }
    );


  let data = null;


  try{

    data =
      await response.json();

  }catch{

    data = null;

  }


  if(
    !response.ok ||
    !data ||
    data.error
  ){

    throw new Error(
      data?.error ||
      `Redis request failed (${response.status}).`
    );

  }


  return data.result;

}


/* =========================================================
   PAYMENT IDEMPOTENCY
========================================================= */

function paymentClaimKey(
  reference
) {

  return (
    "obitrend:paystack:redeemed:" +
    clean(reference)
  );

}


async function claimPaymentReference(
  redis,
  reference
) {

  const key =
    paymentClaimKey(
      reference
    );


  /*
   * SET key 1 NX EX 86400
   *
   * NX:
   *   only create if it does not exist.
   *
   * EX:
   *   automatically expires the claim.
   */

  const result =
    await redisCommand(
      redis,
      [
        "SET",
        key,
        "1",
        "NX",
        "EX",
        "86400"
      ]
    );


  return result === "OK";

}


async function releasePaymentClaim(
  redis,
  reference
) {

  const key =
    paymentClaimKey(
      reference
    );


  try{

    await redisCommand(
      redis,
      [
        "DEL",
        key
      ]
    );

  }catch(error){

    console.error(
      "OBITREND Redis payment claim release error:",
      error
    );

  }

}


/* =========================================================
   PAYSTACK REQUEST
========================================================= */

async function paystackRequest(
  path,
  secretKey,
  options = {}
) {

  const response =
    await fetch(
      `${PAYSTACK_API}${path}`,
      {
        method:
          options.method ||
          "GET",

        headers: {
          Authorization:
            `Bearer ${secretKey}`,

          "Content-Type":
            "application/json",

          Accept:
            "application/json"
        },

        body:
          options.body === undefined
            ?undefined
            :JSON.stringify(
              options.body
            )
      }
    );


  let data = null;


  try{

    data =
      await response.json();

  }catch{

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
   CONFIGURATION
========================================================= */

function getConfig() {

  return {

    secretKey:
      clean(
        process.env.PAYSTACK_SECRET_KEY
      ),

    appUrl:
      clean(
        process.env.OBITREND_APP_URL
      ) ||
      DEFAULT_APP_URL

  };

}


/* =========================================================
   CONFIG VALIDATION
========================================================= */

function validateConfig(
  res,
  cfg
) {

  if(!cfg.secretKey){

    return send(
      res,
      500,
      {
        ok: false,
        success: false,
        error:
          "PAYSTACK_SECRET_KEY is not configured in Vercel."
      }
    );

  }


  return null;

}


/* =========================================================
   INITIALIZE PAYMENT
========================================================= */

async function initializePayment(
  email,
  plan,
  cfg
) {

  const packageInfo =
    getPackage(plan);


  if(!packageInfo){

    return {

      success: false,

      error:
        "Invalid OBITREND Pro package."

    };

  }


  const cleanEmail =
    clean(email)
      .toLowerCase();


  if(
    !isValidEmail(
      cleanEmail
    )
  ){

    return {

      success: false,

      error:
        "Please provide a valid email address."

    };

  }


  const reference =
    `OBITREND-${upper(plan)}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2,10)}`;


  const callbackUrl =
    `${cfg.appUrl.replace(/\/+$/, "")}/`;


  const payload = {

    email:
      cleanEmail,

    amount:
      String(
        packageInfo.amount
      ),

    currency:
      CURRENCY,

    reference,

    callback_url:
      callbackUrl,

    metadata: {

      product:
        "OBITREND_PRO",

      package:
        upper(plan),

      package_name:
        packageInfo.name,

      credits:
        packageInfo.credits,

      duration_days:
        packageInfo.durationDays,

      duration_seconds:
        packageInfo.durationSeconds,

      tier:
        packageInfo.tier,

      source:
        "OBITREND_AI_FASHION_CREATOR"

    }

  };


  const result =
    await paystackRequest(
      "/transaction/initialize",
      cfg.secretKey,
      {
        method: "POST",
        body: payload
      }
    );


  if(
    !result.ok ||
    !result.data?.status
  ){

    return {

      success: false,

      error:
        result.data?.message ||
        "Unable to open the secure OBITREND payment page."

    };

  }


  const data =
    result.data.data;


  if(
    !data?.authorization_url
  ){

    return {

      success: false,

      error:
        "Paystack did not return a payment URL."

    };

  }


  return {

    ok: true,

    success: true,

    authorization_url:
      data.authorization_url,

    reference:
      data.reference ||
      reference,

    access_code:
      data.access_code ||
      null,

    plan:
      upper(plan),

    planName:
      packageInfo.name,

    credits:
      packageInfo.credits,

    durationDays:
      packageInfo.durationDays,

    durationSeconds:
      packageInfo.durationSeconds,

    tier:
      packageInfo.tier,

    amount:
      packageInfo.amount,

    currency:
      CURRENCY

  };

}


/* =========================================================
   RESOLVE PACKAGE FROM VERIFIED TRANSACTION
========================================================= */

function resolvePackageFromTransaction(
  reference,
  transaction
) {

  const ref =
    upper(reference);


  /*
   * Determine package from the reference
   * when the reference was generated by OBITREND.
   */

  let referencePlan = null;


  for(
    const plan of Object.keys(
      PACKAGES
    )
  ){

    if(
      ref.includes(
        plan
      )
    ){

      referencePlan =
        plan;

      break;

    }

  }


  /*
   * Determine package from the amount.
   *
   * Amount is the authoritative package selector.
   */

  const requestedAmount =
    Number(
      transaction?.requested_amount
    );


  const actualAmount =
    Number(
      transaction?.amount
    );


  const fees =
    Number(
      transaction?.fees
    );


  let paidAmount =
    Number.isFinite(
      requestedAmount
    ) &&
    requestedAmount > 0

      ?requestedAmount

      :actualAmount;


  if(
    !Number.isFinite(
      paidAmount
    )
  ){

    return {

      plan: null,

      packageInfo: null

    };

  }


  let amountPlan =
    Object.entries(
      PACKAGES
    ).find(
      ([, packageInfo]) =>
        packageInfo.amount ===
        paidAmount
    );


  /*
   * Some Paystack responses may expose
   * amount including transaction fees.
   */

  if(
    !amountPlan &&
    Number.isFinite(
      actualAmount
    ) &&
    Number.isFinite(
      fees
    )
  ){

    const netAmount =
      actualAmount -
      fees;


    amountPlan =
      Object.entries(
        PACKAGES
      ).find(
        ([, packageInfo]) =>
          packageInfo.amount ===
          netAmount
      );

  }


  /*
   * If the reference explicitly says the package,
   * make sure the amount agrees with it.
   */

  if(
    referencePlan
  ){

    const referencePackage =
      PACKAGES[
        referencePlan
      ];


    if(
      amountPlan &&
      amountPlan[0] !==
      referencePlan
    ){

      return {

        plan: null,

        packageInfo: null,

        mismatch: true

      };

    }


    if(
      !amountPlan &&
      (
        requestedAmount ===
          referencePackage.amount ||

        actualAmount ===
          referencePackage.amount ||

        (
          Number.isFinite(
            fees
          ) &&
          actualAmount -
            fees ===
            referencePackage.amount
        )
      )
    ){

      return {

        plan:
          referencePlan,

        packageInfo:
          referencePackage

      };

    }

  }


  if(
    !amountPlan
  ){

    return {

      plan: null,

      packageInfo: null

    };

  }


  return {

    plan:
      amountPlan[0],

    packageInfo:
      amountPlan[1]

  };

}


/* =========================================================
   VERIFY PAYSTACK TRANSACTION
========================================================= */

async function verifyTransaction(
  reference,
  authenticatedEmail,
  cfg
) {

  const ref =
    clean(reference);


  if(!ref){

    return {

      success: false,
      paid: false,
      error:
        "Payment reference is required."

    };

  }


  const result =
    await paystackRequest(
      `/transaction/verify/${encodeURIComponent(ref)}`,
      cfg.secretKey
    );


  if(
    !result.ok ||
    !result.data?.status ||
    !result.data?.data
  ){

    return {

      success: false,

      paid: false,

      reference: ref,

      error:
        result.data?.message ||
        "Paystack could not verify the payment."

    };

  }


  const tx =
    result.data.data;


  const transactionReference =
    clean(
      tx.reference ||
      ref
    );


  if(
    lower(tx.status) !==
    "success"
  ){

    return {

      success: false,

      paid: false,

      reference:
        transactionReference,

      error:
        "Payment has not been completed successfully."

    };

  }


  if(
    upper(tx.currency) !==
    CURRENCY
  ){

    return {

      success: false,

      paid: false,

      reference:
        transactionReference,

      error:
        "Payment currency does not match OBITREND."

    };

  }


  const paystackEmail =
    clean(
      tx.customer?.email ||
      tx.email ||
      ""
    )
      .toLowerCase();


  const expectedEmail =
    clean(
      authenticatedEmail
    )
      .toLowerCase();


  if(
    !isValidEmail(
      paystackEmail
    )
  ){

    return {

      success: false,

      paid: false,

      reference:
        transactionReference,

      error:
        "Paystack did not return a valid customer email."

    };

  }


  if(
    paystackEmail !==
    expectedEmail
  ){

    return {

      success: false,

      paid: false,

      reference:
        transactionReference,

      error:
        "This payment belongs to a different email account."

    };

  }


  const resolved =
    resolvePackageFromTransaction(
      transactionReference,
      tx
    );


  if(
    resolved.mismatch
  ){

    return {

      success: false,

      paid: false,

      reference:
        transactionReference,

      error:
        "The payment amount does not match the selected OBITREND Pro package."

    };

  }


  if(
    !resolved.plan ||
    !resolved.packageInfo
  ){

    return {

      success: false,

      paid: false,

      reference:
        transactionReference,

      error:
        "The successful payment amount does not match any OBITREND Pro package."

    };

  }


  /*
   * Validate metadata when available.
   * Metadata is supplementary; amount remains authoritative.
   */

  const metadata =
    tx.metadata &&
    typeof tx.metadata ===
      "object"

      ?tx.metadata
      :{};


  const metadataPackage =
    upper(
      metadata.package ||
      metadata.plan ||
      ""
    );


  if(
    metadataPackage &&
    PACKAGES[metadataPackage] &&
    metadataPackage !==
      resolved.plan
  ){

    return {

      success: false,

      paid: false,

      reference:
        transactionReference,

      error:
        "The payment package information does not match the verified amount."

    };

  }


  return {

    success: true,

    paid: true,

    verified: true,

    reference:
      transactionReference,

    email:
      paystackEmail,

    amount:
      Number(tx.amount) || 0,

    requestedAmount:
      Number.isFinite(
        Number(
          tx.requested_amount
        )
      )
        ?Number(
          tx.requested_amount
        )
        :resolved.packageInfo.amount,

    fees:
      Number.isFinite(
        Number(
          tx.fees
        )
      )
        ?Number(
          tx.fees
        )
        :null,

    currency:
      upper(tx.currency),

    status:
      tx.status,

    plan:
      resolved.plan,

    planName:
      resolved.packageInfo.name,

    credits:
      resolved.packageInfo.credits,

    durationDays:
      resolved.packageInfo.durationDays,

    durationSeconds:
      resolved.packageInfo.durationSeconds,

    tier:
      resolved.packageInfo.tier,

    amountExpected:
      resolved.packageInfo.amount,

    paidAt:
      tx.paid_at ||
      tx.transaction_date ||
      tx.created_at ||
      null

  };

}


/* =========================================================
   ACTIVATE VERIFIED PAYMENT
========================================================= */

async function activateVerifiedPayment(
  authUser,
  verified,
  redis
) {

  /*
   * Claim the payment first.
   *
   * Only the first successful verifier can activate it.
   */

  const claimed =
    await claimPaymentReference(
      redis,
      verified.reference
    );


  if(!claimed){

    /*
     * The same payment was already processed.
     *
     * This is not an error.
     * The frontend should simply refresh credits.
     */

    return {

      success: true,

      paid: true,

      verified: true,

      alreadyActivated: true,

      proActive: true,

      reference:
        verified.reference,

      plan:
        verified.plan,

      planName:
        verified.planName,

      credits:
        verified.credits,

      durationDays:
        verified.durationDays,

      durationSeconds:
        verified.durationSeconds,

      tier:
        verified.tier,

      amount:
        verified.amountExpected,

      currency:
        CURRENCY

    };

  }


  try{

    /*
     * IMPORTANT:
     *
     * credits.js activatePro() expects:
     *
     * activatePro(
     *   userId,
     *   email,
     *   reference,
     *   redis,
     *   plan
     * )
     *
     * Keep these arguments in this exact order.
     */

    const activation =
      await activatePro(
        authUser.id,
        authUser.email,
        verified.reference,
        redis,
        verified.plan
      );


    return {

      success: true,

      paid: true,

      verified: true,

      alreadyActivated: false,

      proActive: true,

      reference:
        verified.reference,

      plan:
        verified.plan,

      planName:
        verified.planName,

      credits:
        activation?.proCredits ||
        activation?.proCreditsRemaining ||
        verified.credits,

      durationDays:
        Math.round(
          (
            activation?.durationSeconds ||
            verified.durationSeconds
          ) /
          (24 * 60 * 60)
        ),

      durationSeconds:
        activation?.durationSeconds ||
        verified.durationSeconds,

      tier:
        activation?.tier ||
        getPackage(verified.plan)?.tier ||
        verified.tier,

      expiresAt:
        activation?.expiresAt ||
        null,

      amount:
        verified.amountExpected,

      currency:
        CURRENCY

    };

  }catch(error){

    /*
     * Activation failed.
     *
     * Release the idempotency claim so the
     * verified payment can safely be retried.
     */

    await releasePaymentClaim(
      redis,
      verified.reference
    );


    throw error;

  }

}


/* =========================================================
   POST
   INITIALIZE PAYMENT
========================================================= */

async function handlePost(
  req,
  res,
  cfg,
  authUser
) {

  let body =
    req.body ||
    {};


  if(
    typeof body ===
    "string"
  ){

    try{

      body =
        JSON.parse(body);

    }catch{

      return send(
        res,
        400,
        {
          ok: false,
          success: false,
          error:
            "Request body contains invalid JSON."
        }
      );

    }

  }


  /*
   * IMPORTANT:
   *
   * The client can request a package,
   * but cannot control the amount.
   */

  const requestedPlan =
    upper(
      body?.plan
    );


  const packageInfo =
    getPackage(
      requestedPlan
    );


  if(!packageInfo){

    return send(
      res,
      400,
      {
        ok: false,
        success: false,
        error:
          "Invalid OBITREND Pro package."
      }
    );

  }


  const payment =
    await initializePayment(
      authUser.email,
      requestedPlan,
      cfg
    );


  return send(
    res,
    payment.success
      ?200
      :400,
    payment
  );

}


/* =========================================================
   GET
   VERIFY PAYMENT
========================================================= */

async function handleGet(
  req,
  res,
  cfg,
  authUser,
  redis
) {

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
        "ref"
      ) ||
      ""
    );


  /*
   * No reference:
   * return service information only.
   */

  if(!reference){

    return send(
      res,
      200,
      {
        ok: true,
        success: true,
        service:
          "OBITREND Paystack Pro",
        status:
          "ready",
        currency:
          CURRENCY,
        packages:
          Object.entries(
            PACKAGES
          ).map(
            ([plan,info])=>({
              plan,
              name: info.name,
              amount: info.amount,
              credits: info.credits,
              durationDays:
                info.durationDays,
              tier: info.tier
            })
          )
      }
    );

  }


  /*
   * Verify payment directly with Paystack.
   */

  const verified =
    await verifyTransaction(
      reference,
      authUser.email,
      cfg
    );


  if(
    !verified.success ||
    !verified.paid
  ){

    return send(
      res,
      400,
      verified
    );

  }


  /*
   * Activate only after Paystack verification.
   */

  const activated =
    await activateVerifiedPayment(
      authUser,
      verified,
      redis
    );


  return send(
    res,
    200,
    activated
  );

}


/* =========================================================
   MAIN VERCEL HANDLER
========================================================= */

export default async function handler(
  req,
  res
) {

  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate"
  );


  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );


  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );


  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization"
  );


  if(
    req.method ===
    "OPTIONS"
  ){

    return res
      .status(204)
      .end();

  }


  const cfg =
    getConfig();


  const configError =
    validateConfig(
      res,
      cfg
    );


  if(configError){

    return configError;

  }


  try{

    /*
     * Authenticate the actual Supabase user
     * before processing any payment operation.
     */

    const auth =
      await getAuthenticatedUser(
        req
      );


    if(!auth.ok){

      return send(
        res,
        auth.status,
        {
          ok: false,
          success: false,
          error:
            auth.error
        }
      );

    }


    const redis =
      getRedisConfig();


    if(
      !redis?.url ||
      !redis?.token
    ){

      return send(
        res,
        500,
        {
          ok: false,
          success: false,
          error:
            "Redis environment variables are missing in Vercel."
        }
      );

    }


    if(
      req.method ===
      "POST"
    ){

      return await handlePost(
        req,
        res,
        cfg,
        auth.user
      );

    }


    if(
      req.method ===
      "GET"
    ){

      return await handleGet(
        req,
        res,
        cfg,
        auth.user,
        redis
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
        ok: false,
        success: false,
        error:
          "Method not allowed."
      }
    );

  }catch(error){

    console.error(
      "OBITREND PAYSTACK ERROR:",
      error
    );


    return send(
      res,
      Number(
        error?.status
      ) || 500,
      {
        ok: false,
        success: false,
        error:
          error?.message ||
          "Unable to process the OBITREND payment."
      }
    );

  }

}
