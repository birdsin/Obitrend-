export default async function handler(req, res) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;

  if (!secretKey) {
    return res.status(500).json({
      success: false,
      error: "PAYSTACK_SECRET_KEY is missing in Vercel."
    });
  }

  // ============================================================
  // GET = VERIFY PAYSTACK TRANSACTION
  // ============================================================

  if (req.method === "GET") {
    try {
      const url = new URL(
        req.url,
        "https://obitrend.vercel.app"
      );

      const reference =
        req.query?.reference ||
        url.searchParams.get("reference") ||
        url.searchParams.get("trxref");

      if (!reference) {
        return res.status(400).json({
          success: false,
          error: "Payment reference is required."
        });
      }

      const verifyResponse = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${secretKey}`
          }
        }
      );

      const verifyData = await verifyResponse.json();

      if (!verifyResponse.ok || !verifyData.status) {
        console.error(
          "Paystack verification error:",
          verifyData
        );

        return res.status(400).json({
          success: false,
          error:
            verifyData.message ||
            "Unable to verify payment."
        });
      }

      const transaction = verifyData.data;

      // Payment must be successful
      if (transaction.status !== "success") {
        return res.status(400).json({
          success: false,
          paid: false,
          status: transaction.status,
          error: "Payment has not been completed successfully."
        });
      }

      // ========================================================
      // OBITREND PRO PAYMENT CHECK
      // Expected amount = ₦15,000 = 1,500,000 kobo
      // ========================================================

      const expectedAmount = 15000 * 100;

      const requestedAmount = Number(
        transaction.requested_amount || 0
      );

      const actualAmount = Number(
        transaction.amount || 0
      );

      if (
        requestedAmount !== expectedAmount &&
        actualAmount !== expectedAmount
      ) {
        console.error("Invalid OBITREND payment amount:", {
          requestedAmount,
          actualAmount,
          expectedAmount
        });

        return res.status(400).json({
          success: false,
          paid: false,
          error: "Payment amount does not match OBITREND Pro."
        });
      }

      // Currency must be NGN
      if (transaction.currency !== "NGN") {
        return res.status(400).json({
          success: false,
          paid: false,
          error: "Payment currency is not NGN."
        });
      }

      return res.status(200).json({
        success: true,
        paid: true,
        pro: true,
        reference: transaction.reference,
        status: transaction.status,
        amount: actualAmount,
        currency: transaction.currency,
        email:
          transaction.customer?.email ||
          transaction.metadata?.email ||
          null,
        paidAt:
          transaction.paid_at ||
          transaction.paidAt ||
          null
      });

    } catch (error) {
      console.error(
        "Verification server error:",
        error
      );

      return res.status(500).json({
        success: false,
        error: "Payment verification failed."
      });
    }
  }

  // ============================================================
  // POST = INITIALIZE OBITREND PRO SUBSCRIPTION
  // ============================================================

  if (req.method === "POST") {
    try {
      const body = req.body || {};

      const email = String(
        body.email || ""
      ).trim();

      if (!email) {
        return res.status(400).json({
          success: false,
          error: "Email address is required."
        });
      }

      // ========================================================
      // OBITREND PRO
      // ₦15,000 PER WEEK
      // ========================================================

      const amountInKobo = 15000 * 100;

      // Your LIVE Paystack plan
      const planCode = "PLN_sd2ggtyt2egdre";

      // ========================================================
      // CALLBACK
      // ========================================================

      const origin =
        req.headers.origin ||
        "https://obitrend.vercel.app";

      const callbackUrl =
        `${origin}/?payment=success`;

      // ========================================================
      // INITIALIZE PAYSTACK TRANSACTION
      // ========================================================

      const paystackResponse = await fetch(
        "https://api.paystack.co/transaction/initialize",
        {
          method: "POST",

          headers: {
            Authorization: `Bearer ${secretKey}`,
            "Content-Type": "application/json"
          },

          body: JSON.stringify({
            email,

            // Amount is kept here for Paystack's
            // initialization request.
            amount: amountInKobo,

            currency: "NGN",

            // IMPORTANT:
            // This creates the recurring subscription
            // using your actual Paystack plan.
            plan: planCode,

            callback_url: callbackUrl,

            metadata: {
              product: "OBITREND_PRO",
              plan_name: "OBITREND PRO WEEKLY",
              plan_code: planCode,
              plan_amount: 15000,
              plan_interval: "weekly"
            }
          })
        }
      );

      let data = {};

      try {
        data = await paystackResponse.json();
      } catch (jsonError) {
        throw new Error(
          "Paystack returned an invalid response."
        );
      }

      console.log(
        "OBITREND Paystack initialization:",
        data
      );

      if (
        !paystackResponse.ok ||
        !data.status
      ) {
        return res.status(400).json({
          success: false,
          error:
            data.message ||
            "Failed to initialize Paystack payment."
        });
      }

      if (
        !data.data ||
        !data.data.authorization_url
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Paystack did not return a payment URL."
        });
      }

      return res.status(200).json({
        success: true,

        authorization_url:
          data.data.authorization_url,

        access_code:
          data.data.access_code,

        reference:
          data.data.reference,

        plan_code: planCode,

        amount: 15000,

        currency: "NGN",

        interval: "weekly"
      });

    } catch (error) {
      console.error(
        "OBITREND Paystack server error:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          error.message ||
          "Internal payment server error."
      });
    }
  }

  // ============================================================
  // OTHER METHODS NOT ALLOWED
  // ============================================================

  return res.status(405).json({
    success: false,
    error: "Method not allowed."
  });
}
