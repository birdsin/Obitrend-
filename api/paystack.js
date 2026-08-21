// api/paystack.js
// OBITREND PRO — PAYSTACK PAYMENT API
// ₦15,000 / WEEK

const PAYSTACK_API = "https://api.paystack.co";

const PRO_AMOUNT = 1500000; // ₦15,000 in kobo
const PRO_CURRENCY = "NGN";
const PRO_PLAN = "weekly";

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
  const timestamp = Date.now().toString(36);

  const random = Math.random()
    .toString(36)
    .slice(2, 10);

  return `OBITREND-${timestamp}-${random}`;
}

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

  /* ==========================================================
     CORS
     ========================================================== */

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
     POST — INITIALIZE PAYMENT
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


      /* --------------------------------------------------------
         VALIDATE EMAIL
         -------------------------------------------------------- */

      if (!email) {

        return send(res, 400, {
          success: false,
          error:
            "Email address is required."
        });

      }

      if (
        !email.includes("@") ||
        !email.includes(".")
      ) {

        return send(res, 400, {
          success: false,
          error:
            "Please provide a valid email address."
        });

      }


      /* --------------------------------------------------------
         CREATE OUR OWN UNIQUE REFERENCE
         -------------------------------------------------------- */

      const reference =
        createReference();


      /* --------------------------------------------------------
         CALLBACK URL
         -------------------------------------------------------- */

      const origin =
        getOrigin(req);

      const callbackUrl =
        `${origin}/`;


      /* --------------------------------------------------------
         PAYSTACK INITIALIZATION PAYLOAD
         -------------------------------------------------------- */

      const payload = {

        email,

        amount:
          PRO_AMOUNT,

        currency:
          PRO_CURRENCY,

        reference,

        callback_url:
          callbackUrl,

        metadata: {

          product:
            "OBITREND PRO",

          plan:
            PRO_PLAN,

          email,

          reference

        }

      };


      /* --------------------------------------------------------
         OPTIONAL PAYSTACK PLAN
         -------------------------------------------------------- */

      const planCode =
        String(
          process.env.PAYSTACK_PRO_PLAN_CODE || ""
        ).trim();

      if (planCode) {

        payload.plan =
          planCode;

      }


      /* --------------------------------------------------------
         SEND TO PAYSTACK
         -------------------------------------------------------- */

      console.log(
        "OBITREND Paystack initialization:",
        {
          email,
          amount: PRO_AMOUNT,
          currency: PRO_CURRENCY,
          reference,
          callbackUrl,
          planCode:
            planCode || null
        }
      );


      const {
        response,
        data
      } =
        await paystackRequest(
          "/transaction/initialize",
          {
            method: "POST",

            body:
              JSON.stringify(payload)
          }
        );


      /* --------------------------------------------------------
         PAYSTACK ERROR
         -------------------------------------------------------- */

      if (
        !response.ok ||
        !data ||
        data.status !== true
      ) {

        console.error(
          "Paystack initialization failed:",
          data
        );

        return send(res, 400, {

          success: false,

          error:
            data?.message ||
            data?.data?.message ||
            "Unable to initialize Paystack payment."

        });

      }


      /* --------------------------------------------------------
         PAYSTACK DATA
         -------------------------------------------------------- */

      const paymentData =
        data.data || {};


      const paystackReference =
        cleanReference(
          paymentData.reference
        );


      const authorizationUrl =
        paymentData.authorization_url ||
        paymentData.authorizationUrl ||
        "";


      /* --------------------------------------------------------
         MAKE SURE PAYSTACK RETURNED EVERYTHING
         -------------------------------------------------------- */

      if (!authorizationUrl) {

        return send(res, 502, {

          success: false,

          error:
            "Paystack did not return a payment URL."

        });

      }


      if (!paystackReference) {

        return send(res, 502, {

          success: false,

          error:
            "Paystack did not return a transaction reference."

        });

      }


      /* --------------------------------------------------------
         VERIFY THAT PAYSTACK KEPT OUR REFERENCE
         -------------------------------------------------------- */

      if (
        paystackReference !==
        reference
      ) {

        console.error(
          "Paystack reference mismatch:",
          {
            createdReference:
              reference,

            returnedReference:
              paystackReference
          }
        );

        return send(res, 502, {

          success: false,

          error:
            "Paystack returned a different transaction reference."

        });

      }


      /* --------------------------------------------------------
         SUCCESS
         -------------------------------------------------------- */

      return send(res, 200, {

        success: true,

        paid: false,

        reference,

        payment_reference:
          reference,

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
          PRO_PLAN

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


      /* --------------------------------------------------------
         ACCEPT ALL COMMON PAYSTACK REFERENCE PARAMETERS
         -------------------------------------------------------- */

      let reference =

        url.searchParams.get(
          "reference"
        ) ||

        url.searchParams.get(
          "trxref"
        ) ||

        url.searchParams.get(
          "ref"
        ) ||

        url.searchParams.get(
          "transaction_reference"
        );


      reference =
        cleanReference(reference);


      /* --------------------------------------------------------
         REFERENCE REQUIRED
         -------------------------------------------------------- */

      if (!reference) {

        return send(res, 400, {

          success: false,

          paid: false,

          error:
            "Transaction reference is required."

        });

      }


      console.log(
        "OBITREND verifying Paystack transaction:",
        reference
      );


      /* --------------------------------------------------------
         VERIFY WITH PAYSTACK
         -------------------------------------------------------- */

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


      /* --------------------------------------------------------
         LOG VERIFICATION RESULT
         -------------------------------------------------------- */

      console.log(
        "OBITREND Paystack verification result:",
        {

          httpStatus:
            response.status,

          paystackStatus:
            data?.status,

          transactionStatus:
            data?.data?.status,

          reference:
            data?.data?.reference,

          amount:
            data?.data?.amount

        }
      );


      /* --------------------------------------------------------
         PAYSTACK COULD NOT VERIFY
         -------------------------------------------------------- */

      if (
        !response.ok ||
        !data ||
        data.status !== true
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


      /* --------------------------------------------------------
         TRANSACTION REFERENCE
         -------------------------------------------------------- */

      const transactionReference =
        cleanReference(
          transaction.reference
        );


      /* --------------------------------------------------------
         TRANSACTION STATUS
         -------------------------------------------------------- */

      const transactionStatus =
        String(
          transaction.status || ""
        ).toLowerCase();


      /* --------------------------------------------------------
         TRANSACTION AMOUNT
         -------------------------------------------------------- */

      const transactionAmount =
        Number(
          transaction.amount || 0
        );


      /* --------------------------------------------------------
         REFERENCE MATCH
         -------------------------------------------------------- */

      if (
        !transactionReference ||
        transactionReference !==
          reference
      ) {

        return send(res, 400, {

          success: false,

          paid: false,

          reference,

          error:
            "Paystack transaction reference mismatch."

        });

      }


      /* --------------------------------------------------------
         PAYMENT NOT SUCCESSFUL
         -------------------------------------------------------- */

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
            transactionAmount,

          error:
            "Payment has not been completed successfully."

        });

      }


      /* --------------------------------------------------------
         VERIFY PAYMENT AMOUNT
         -------------------------------------------------------- */

      if (
        transactionAmount <
        PRO_AMOUNT
      ) {

        return send(res, 400, {

          success: false,

          paid: false,

          reference,

          amount:
            transactionAmount,

          expectedAmount:
            PRO_AMOUNT,

          error:
            "Payment amount is lower than the OBITREND PRO price."

        });

      }


      /* --------------------------------------------------------
         VERIFY CURRENCY
         -------------------------------------------------------- */

      const currency =
        String(
          transaction.currency ||
          ""
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


      /* --------------------------------------------------------
         PAYMENT IS VERIFIED
         -------------------------------------------------------- */

      const customerEmail =
        transaction.customer?.email ||
        "";


      const firstName =
        transaction.customer?.first_name ||
        "";


      const lastName =
        transaction.customer?.last_name ||
        "";


      const customerName =
        `${firstName} ${lastName}`
          .trim();


      console.log(
        "OBITREND PAYMENT VERIFIED:",
        {
          reference:
            transactionReference,

          email:
            customerEmail,

          amount:
            transactionAmount,

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

        amount:
          transactionAmount,

        currency:
          currency || PRO_CURRENCY,

        status:
          transaction.status,

        paidAt:
          transaction.paid_at ||
          transaction.paidAt ||
          null,

        customer: {

          email:
            customerEmail,

          name:
            customerName

        }

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


  /* ==========================================================
     METHOD NOT ALLOWED
     ========================================================== */

  res.setHeader(
    "Allow",
    "GET, POST, OPTIONS"
  );


  return send(res, 405, {

    success: false,

    error:
      "Method not allowed."

  });

    }
