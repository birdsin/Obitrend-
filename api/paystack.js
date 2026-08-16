export default async function handler(req, res) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;

  if (!secretKey) {
    return res.status(500).json({
      error: "PAYSTACK_SECRET_KEY is missing in Vercel."
    });
  }

  // =========================================================
  // GET = VERIFY A PAYSTACK TRANSACTION
  // Example:
  // /api/paystack?reference=xxxxx
  // =========================================================
  if (req.method === "GET") {
    try {
      const reference =
        req.query?.reference ||
        new URL(req.url, "https://obitrend.vercel.app").searchParams.get("reference");

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
        console.error("Paystack verification error:", verifyData);

        return res.status(400).json({
          success: false,
          error: verifyData.message || "Unable to verify payment."
        });
      }

      const transaction = verifyData.data;

      // Paystack transaction status must be SUCCESS.
      if (transaction.status !== "success") {
        return res.status(400).json({
          success: false,
          paid: false,
          status: transaction.status,
          error: "Payment has not been completed successfully."
        });
      }

      // OBITREND PRO price is ₦15,000.
      // Paystack represents NGN amounts in kobo.
      const expectedAmount = 15000 * 100;

      // Check the requested amount first.
      // This protects against someone trying to verify an unrelated
      // small transaction as an OBITREND Pro payment.
      const requestedAmount = Number(transaction.requested_amount || 0);
      const actualAmount = Number(transaction.amount || 0);

      if (
        requestedAmount !== expectedAmount &&
        actualAmount < expectedAmount
      ) {
        console.error("Invalid OBITREND payment amount:", {
          requestedAmount,
          actualAmount
        });

        return res.status(400).json({
          success: false,
          paid: false,
          error: "Payment amount does not match OBITREND Pro."
        });
      }

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
        email: transaction.customer?.email || null,
        paidAt: transaction.paid_at || transaction.paidAt || null
      });

    } catch (error) {
      console.error("Verification server error:", error);

      return res.status(500).json({
        success: false,
        error: "Payment verification failed."
      });
    }
  }

  // =========================================================
  // POST = INITIALIZE PAYSTACK PAYMENT
  // =========================================================
  if (req.method === "POST") {
    try {
      const body = req.body || {};

      const email = String(body.email || "").trim();

      if (!email) {
        return res.status(400).json({
          error: "Email address is required."
        });
      }

      // Never trust the amount sent by the browser.
      // OBITREND Pro is fixed at ₦15,000.
      const amountInKobo = 15000 * 100;

      // Use the current website as the Paystack callback.
      const origin =
        req.headers.origin ||
        "https://obitrend.vercel.app";

      const callbackUrl =
        `${origin}/?payment=success`;

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
            amount: amountInKobo,
            currency: "NGN",
            callback_url: callbackUrl,
            metadata: {
              product: "OBITREND_PRO",
              plan: "PRO_WEEKLY",
              plan_amount: 15000
            }
          })
        }
      );

      const data = await paystackResponse.json();

      if (!paystackResponse.ok || !data.status) {
        console.error("Paystack initialization error:", data);

        return res.status(400).json({
          error: data.message || "Failed to initialize Paystack payment."
        });
      }

      return res.status(200).json({
        success: true,
        authorization_url: data.data.authorization_url,
        access_code: data.data.access_code,
        reference: data.data.reference
      });

    } catch (error) {
      console.error("Payment server error:", error);

      return res.status(500).json({
        error: error.message || "Internal server error."
      });
    }
  }

  return res.status(405).json({
    error: "Method not allowed."
  });
}
