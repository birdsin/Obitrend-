export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  try {
    const { email } = req.body || {};

    // Check customer email
    if (!email || !email.includes("@")) {
      return res.status(400).json({
        success: false,
        message: "A valid email address is required."
      });
    }

    // Paystack secret key stored securely in Vercel Environment Variables
    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    if (!secretKey) {
      return res.status(500).json({
        success: false,
        message: "PAYSTACK_SECRET_KEY is not configured."
      });
    }

    // Your OBITREND Pro Paystack plan code will be added here
    const planCode = process.env.PAYSTACK_PRO_PLAN_CODE;

    if (!planCode) {
      return res.status(500).json({
        success: false,
        message: "PAYSTACK_PRO_PLAN_CODE is not configured yet."
      });
    }

    const response = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: email,
          plan: planCode,
          currency: "USD",
          callback_url: "https://obitrend.vercel.app/"
        })
      }
    );

    const data = await response.json();

    if (!response.ok || !data.status) {
      return res.status(400).json({
        success: false,
        message: data.message || "Unable to initialize Paystack payment.",
        paystack: data
      });
    }

    return res.status(200).json({
      success: true,
      authorization_url: data.data.authorization_url,
      access_code: data.data.access_code,
      reference: data.data.reference
    });

  } catch (error) {
    console.error("Paystack error:", error);

    return res.status(500).json({
      success: false,
      message: "Payment initialization failed."
    });
  }
}
