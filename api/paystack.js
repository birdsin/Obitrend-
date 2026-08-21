// api/paystack.js

const PAYSTACK_API = "https://api.paystack.co";

function send(res, status, body) {
  res.status(status).json(body);
}

function getSecretKey() {
  return process.env.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_SECRET;
}

async function paystackRequest(path, options = {}) {
  const secretKey = getSecretKey();

  if (!secretKey) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured in Vercel.");
  }

  const response = await fetch(`${PAYSTACK_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers || {})
    }
  });

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error("Paystack returned an invalid response.");
  }

  return {
    response,
    data
  };
}

function cleanReference(value) {
  if (!value) return "";

  return String(value)
    .trim()
    .replace(/^["']|["']$/g, "");
}
function getOrigin(req) {
  const forwardedHost = req.headers?.["x-forwarded-host"];

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
export default async function handler(req, res) {
  // ---------------------------------------------------------
  // CORS
  // ---------------------------------------------------------

  res.setHeader("Access-Control-Allow-Origin", "*");
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

  // ---------------------------------------------------------
  // PAYSTACK INITIALIZE
  // POST /api/paystack
  // ---------------------------------------------------------

  if (req.method === "POST") {
    try {
      const body =
        typeof req.body === "string"
          ? JSON.parse(req.body || "{}")
          : req.body || {};

      const email = String(body.email || "").trim();

      if (!email) {
        return send(res, 400, {
          success: false,
          error: "Email address is required."
        });
      }

      // OBITREND PRO = ₦15,000
      const amount =
        Number(body.amount) > 0
          ? Math.round(Number(body.amount))
          : 1500000;

      const callbackUrl =
        body.callback_url ||
        body.callbackUrl ||
        `${getOrigin(req)}/`;

      const payload = {
        email,
        amount,
        currency: "NGN",
        callback_url: callbackUrl,
        metadata: {
          product: "OBITREND PRO",
          plan: "weekly",
          email
        }
      };

      const { response, data } = await paystackRequest(
        "/transaction/initialize",
        {
          method: "POST",
          body: JSON.stringify(payload)
        }
      );

      if (!response.ok || !data || data.status !== true) {
        return send(res, 400, {
          success: false,
          error:
            data?.message ||
            data?.data?.message ||
            "Unable to initialize Paystack payment."
        });
      }

      const paymentData = data.data || {};

      const reference = cleanReference(
        paymentData.reference
      );

      const authorizationUrl =
        paymentData.authorization_url ||
        paymentData.authorizationUrl;

      if (!reference || !authorizationUrl) {
        return send(res, 502, {
          success: false,
          error:
            "Paystack did not return a valid payment reference or payment URL."
        });
      }

      // IMPORTANT:
      // Return the exact Paystack reference to the browser.
      return send(res, 200, {
        success: true,
        paid: false,
        reference,
        payment_reference: reference,
        authorization_url: authorizationUrl,
        paymentUrl: authorizationUrl,
        email,
        amount,
        currency: "NGN"
      });
    } catch (error) {
      console.error("OBITREND Paystack initialization error:", error);

      return send(res, 500, {
        success: false,
        error:
          error?.message ||
          "Paystack initialization failed."
      });
    }
  }

  // ---------------------------------------------------------
  // PAYSTACK VERIFY
  //
  // GET /api/paystack?reference=XXXX
  // GET /api/paystack?trxref=XXXX
  // ---------------------------------------------------------

  if (req.method === "GET") {
    try {
      const url = new URL(
        req.url,
        getOrigin(req)
      );

      let reference =
        url.searchParams.get("reference") ||
        url.searchParams.get("trxref") ||
        url.searchParams.get("ref") ||
        url.searchParams.get("transaction_reference");

      reference = cleanReference(reference);

      if (!reference) {
        return send(res, 400, {
          success: false,
          paid: false,
          error:
            "Transaction reference is required."
        });
      }

      console.log(
        "OBITREND verifying Paystack reference:",
        reference
      );

      const { response, data } = await paystackRequest(
        `/transaction/verify/${encodeURIComponent(reference)}`,
        {
          method: "GET"
        }
      );

      console.log(
        "OBITREND Paystack verification:",
        JSON.stringify({
          httpStatus: response.status,
          paystackStatus: data?.status,
          transactionStatus: data?.data?.status,
          reference: data?.data?.reference
        })
      );

      // -----------------------------------------------------
      // Paystack could not find the transaction
      // -----------------------------------------------------

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
            "Transaction reference not found."
        });
      }

      const transaction = data.data || {};

      const transactionReference = cleanReference(
        transaction.reference
      );

      const transactionStatus =
        String(transaction.status || "").toLowerCase();

      const transactionAmount =
        Number(transaction.amount || 0);

      const expectedAmount = 1500000;

      // -----------------------------------------------------
      // SECURITY CHECKS
      // -----------------------------------------------------

      if (
        !transactionReference ||
        transactionReference !== reference
      ) {
        return send(res, 400, {
          success: false,
          paid: false,
          reference,
          error:
            "Paystack reference mismatch."
        });
      }

      if (transactionStatus !== "success") {
        return send(res, 200, {
          success: true,
          paid: false,
          reference,
          status: transaction.status || "unknown",
          error:
            "Payment has not been completed successfully."
        });
      }

      if (transactionAmount < expectedAmount) {
        return send(res, 400, {
          success: false,
          paid: false,
          reference,
          amount: transactionAmount,
          error:
            "Payment amount is lower than the OBITREND PRO price."
        });
      }

      // -----------------------------------------------------
      // PAYMENT IS REALLY VERIFIED
      // -----------------------------------------------------

      return send(res, 200, {
        success: true,
        paid: true,
        reference: transactionReference,
        email:
          transaction.customer?.email || "",
        amount: transactionAmount,
        currency:
          transaction.currency || "NGN",
        status: transaction.status,
        paidAt:
          transaction.paid_at ||
          transaction.paidAt ||
          null,
        customer: {
          email:
            transaction.customer?.email || "",
          name:
            transaction.customer?.first_name
              ? `${transaction.customer.first_name} ${
                  transaction.customer.last_name || ""
                }`.trim()
              : ""
        }
      });
    } catch (error) {
      console.error("OBITREND Paystack verification error:", error);

      return send(res, 500, {
        success: false,
        paid: false,
        error:
          error?.message ||
          "Payment verification failed."
      });
    }
  }

  // ---------------------------------------------------------
  // METHOD NOT ALLOWED
  // ---------------------------------------------------------

  res.setHeader("Allow", "GET, POST, OPTIONS");

  return send(res, 405, {
    success: false,
    error: "Method not allowed."
  });
}

