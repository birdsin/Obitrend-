// api/paystack.js
// OBITREND PRO — PAYSTACK PAYMENT API
// ₦15,000 / WEEK

const PAYSTACK_API = "https://api.paystack.co";

const PRO_AMOUNT = 1500000;
const PRO_CURRENCY = "NGN";

function send(res, status, body) {
  return res.status(status).json(body);
}

function getSecretKey() {
  return (
    process.env.PAYSTACK_SECRET_KEY ||
    process.env.PAYSTACK_SECRET ||
    ""
  ).trim();
}

function cleanReference(value) {
  if (!value) return "";

  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._=-]/g, "");
}

function createReference() {
  return (
    "OBITREND-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10)
  );
}

/* IMPORTANT: THIS WAS MISSING IN THE DEPLOYED VERSION */
function getOrigin(req) {
  const forwardedHost =
    req.headers?.["x-forwarded-host"];

  const host =
    forwardedHost ||
    req.headers?.host ||
    "obitrend.vercel.app";

  const forwardedProto =
    req.headers?.["x-forwarded-proto"];

  const protocol =
    forwardedProto ||
    "https";

  return `${protocol}://${host}`;
}

async function paystackRequest(path, options = {}) {
  const secretKey = getSecretKey();

  if (!secretKey) {
    throw new Error(
      "PAYSTACK_SECRET_KEY is not configured in Vercel."
    );
  }

  const response = await fetch(
    `${PAYSTACK_API}${path}`,
    {
      ...options,

      headers: {
        Authorization:
          `Bearer ${secretKey}`,

        "Content-Type":
          "application/json",

        Accept:
          "application/json",

        ...(options.headers || {})
      }
    }
  );

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      "Paystack returned an invalid response."
    );
  }

  return {
    response,
    data
  };
}


/* ============================================================
   MAIN HANDLER
============================================================ */

export default async function handler(req, res) {

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
    "Content-Type, Accept"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }


  /* ==========================================================
     POST — START PAYMENT
  ========================================================== */

  if (req.method === "POST") {

    try {

      const body =
        typeof req.body === "string"
          ? JSON.parse(req.body || "{}")
          : req.body || {};

      const email =
        String(body.email || "")
          .trim()
          .toLowerCase();

      if (
        !email ||
        !email.includes("@") ||
        !email.includes(".")
      ) {
        return send(res, 400, {
          success: false,
          error:
            "Please provide a valid email address."
        });
      }


      const reference =
        createReference();


      const callbackUrl =
        `${getOrigin(req)}/`;


      const payload = {
        email,

        currency:
          PRO_CURRENCY,

        reference,

        callback_url:
          callbackUrl,

        metadata: {
          product:
            "OBITREND PRO",

          plan:
            "WEEKLY",

          email,

          reference
        }
      };


      /*
        If a Paystack plan code exists,
        Paystack uses the plan's price.
      */

      const planCode =
        String(
          process.env.PAYSTACK_PRO_PLAN_CODE || ""
        ).trim();


      if (planCode) {

        payload.plan =
          planCode;

      } else {

        payload.amount =
          PRO_AMOUNT;

      }


      const result =
        await paystackRequest(
          "/transaction/initialize",
          {
            method: "POST",
            body:
              JSON.stringify(payload)
          }
        );


      const {
        response,
        data
      } = result;


      if (
        !response.ok ||
        !data?.status
      ) {

        console.error(
          "Paystack initialization failed:",
          data
        );

        return send(res, 400, {
          success: false,
          error:
            data?.message ||
            "Unable to initialize Paystack payment."
        });

      }


      const payment =
        data.data || {};


      const paymentReference =
        cleanReference(
          payment.reference
        );


      const authorizationUrl =
        payment.authorization_url;


      if (!authorizationUrl) {

        return send(res, 502, {
          success: false,
          error:
            "Paystack did not return a payment URL."
        });

      }


      if (
        !paymentReference ||
        paymentReference !== reference
      ) {

        return send(res, 502, {
          success: false,
          error:
            "Paystack transaction reference mismatch."
        });

      }


      return send(res, 200, {

        success: true,

        paid: false,

        reference:

          paymentReference,

        payment_reference:

          paymentReference,

        authorization_url:

          authorizationUrl,

        paymentUrl:

          authorizationUrl,

        email,

        amount:

          PRO_AMOUNT,

        currency:

          PRO_CURRENCY,

        plan:

          planCode || "₦15,000 WEEKLY"

      });


    } catch (error) {

      console.error(
        "OBITREND Paystack initialization error:",
        error
      );

      return send(res, 500, {

        success: false,

        error:
          error?.message ||
          "Paystack initialization failed."

      });

    }

  }


  /* ==========================================================
     GET — VERIFY PAYMENT
  ========================================================== */

  if (req.method === "GET") {

    try {

      const url =
        new URL(
          req.url,
          getOrigin(req)
        );


      const reference =
        cleanReference(
          url.searchParams.get("reference") ||
          url.searchParams.get("trxref") ||
          url.searchParams.get("ref") ||
          url.searchParams.get("transaction_reference") ||
          ""
        );


      if (!reference) {

        return send(res, 400, {

          success: false,

          paid: false,

          error:
            "Transaction reference is required."

        });

      }


      console.log(
        "OBITREND verifying Paystack:",
        reference
      );


      const {
        response,
        data
      } =
        await paystackRequest(
          `/transaction/verify/${encodeURIComponent(
            reference
          )}`,
          {
            method: "GET"
          }
        );


      if (
        !response.ok ||
        !data?.status
      ) {

        return send(res, 400, {

          success: false,

          paid: false,

          reference,

          error:
            data?.message ||
            "Paystack could not verify this transaction."

        });

      }


      const transaction =
        data.data || {};


      const transactionReference =
        cleanReference(
          transaction.reference
        );


      if (
        !transactionReference ||
        transactionReference !== reference
      ) {

        return send(res, 400, {

          success: false,

          paid: false,

          reference,

          error:
            "Paystack transaction reference mismatch."

        });

      }


      const transactionStatus =
        String(
          transaction.status || ""
        ).toLowerCase();


      if (
        transactionStatus !==
        "success"
      ) {

        return send(res, 200, {

          success: true,

          paid: false,

          reference,

          status:
            transaction.status ||
            "unknown",

          amount:
            Number(
              transaction.amount || 0
            ),

          error:
            "Payment has not been completed successfully."

        });

      }


      const amount =
        Number(
          transaction.amount || 0
        );


      if (amount < PRO_AMOUNT) {

        return send(res, 400, {

          success: false,

          paid: false,

          reference,

          amount,

          expectedAmount:
            PRO_AMOUNT,

          error:
            "Payment amount is lower than the OBITREND PRO price."

        });

      }


      const currency =
        String(
          transaction.currency || ""
        ).toUpperCase();


      if (
        currency &&
        currency !== PRO_CURRENCY
      ) {

        return send(res, 400, {

          success: false,

          paid: false,

          reference,

          currency,

          error:
            "Payment currency is not NGN."

        });

      }


      const customerEmail =
        transaction.customer?.email ||
        "";


      console.log(
        "OBITREND PAYMENT VERIFIED:",
        {
          reference:
            transactionReference,

          email:
            customerEmail,

          amount,

          currency,

          status:
            transaction.status
        }
      );


      return send(res, 200, {

        success: true,

        paid: true,

        reference:
          transactionReference,

        email:
          customerEmail,

        amount,

        currency:
          currency || PRO_CURRENCY,

        status:
          transaction.status,

        paidAt:
          transaction.paid_at ||
          null

      });


    } catch (error) {

      console.error(
        "OBITREND Paystack verification error:",
        error
      );

      return send(res, 500, {

        success: false,

        paid: false,

        error:
          error?.message ||
          "Payment verification failed."

      });

    }

  }


  return send(res, 405, {

    success: false,

    error:
      "Method not allowed."

  });

}
