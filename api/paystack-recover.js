import {
  activatePro,
  getAuthenticatedUser,
  getRedisConfig
} from "../lib/credits.js";

const PAYSTACK_BASE = "https://api.paystack.co";
const MONTHLY_AMOUNT = 6000000;
const MONTHLY_PLAN = "PRO_MONTHLY";

function clean(value) {
  return String(value ?? "").trim();
}

function json(res, status, data) {
  return res.status(status).json(data);
}

function getSecret() {
  const secret =
    process.env.PAYSTACK_SECRET_KEY ||
    process.env.PAYSTACK_SECRET ||
    "";
  if (!secret) throw new Error("Paystack secret key is not configured.");
  return secret;
}

async function paystack(path) {
  const response = await fetch(PAYSTACK_BASE + path, {
    headers: {
      Authorization: "Bearer " + getSecret(),
      "Content-Type": "application/json"
    }
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { message: text };
  }

  if (!response.ok || data?.status === false) {
    throw new Error(data?.message || "Paystack request failed.");
  }

  return data;
}

async function verify(reference) {
  const data = await paystack(
    "/transaction/verify/" + encodeURIComponent(reference)
  );
  return data?.data || null;
}

function metadataObject(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return json(res, 405, {
        ok: false,
        error: "Method not allowed."
      });
    }

    const auth = await getAuthenticatedUser(req);
    if (!auth?.ok || !auth?.user?.id) {
      return json(res, 401, {
        ok: false,
        error: "Authentication required."
      });
    }

    const userId = String(auth.user.id);
    const email = clean(auth.user.email).toLowerCase();

    if (!email) {
      return json(res, 400, {
        ok: false,
        error: "Authenticated account email is missing."
      });
    }

    /*
      Recovery is deliberately narrow:
      - authenticated OBITREND account only
      - successful NGN transaction
      - exact monthly Pro amount (₦60,000)
      - payment email must match
      - metadata user ID must match when present
      - transaction is verified directly with Paystack before credits are added
    */

    const customer = await paystack(
      "/customer/" + encodeURIComponent(email)
    );

    const customerData = customer?.data || {};
    const customerId = customerData?.id;

    let transactions = Array.isArray(customerData?.transactions)
      ? customerData.transactions
      : [];

    if (customerId) {
      const listed = await paystack(
        "/transaction?customer=" +
          encodeURIComponent(String(customerId)) +
          "&status=success&amount=" +
          MONTHLY_AMOUNT +
          "&perPage=50&page=1"
      );

      if (Array.isArray(listed?.data)) {
        transactions = [...transactions, ...listed.data];
      }
    }

    const seen = new Set();
    const candidates = transactions.filter((tx) => {
      const reference = clean(tx?.reference);
      if (!reference || seen.has(reference)) return false;
      seen.add(reference);

      return (
        clean(tx?.status).toLowerCase() === "success" &&
        Number(tx?.amount) === MONTHLY_AMOUNT &&
        clean(tx?.currency).toUpperCase() === "NGN"
      );
    });

    for (const candidate of candidates) {
      const verified = await verify(candidate.reference);
      if (!verified) continue;

      const verifiedEmail = clean(
        verified?.customer?.email || verified?.email
      ).toLowerCase();

      const metadata = metadataObject(verified?.metadata);
      const metadataUserId = clean(
        metadata?.obitrend_user_id || metadata?.user_id
      );
      const packageName = clean(
        metadata?.package || metadata?.plan
      ).toUpperCase();

      if (
        clean(verified?.status).toLowerCase() !== "success" ||
        Number(verified?.amount) !== MONTHLY_AMOUNT ||
        clean(verified?.currency).toUpperCase() !== "NGN" ||
        verifiedEmail !== email
      ) {
        continue;
      }

      if (metadataUserId && metadataUserId !== userId) {
        continue;
      }

      if (
        metadataUserId !== userId &&
        packageName !== MONTHLY_PLAN
      ) {
        continue;
      }

      const redis = await getRedisConfig();
      if (!redis) {
        throw new Error("Redis configuration is unavailable.");
      }

      const result = await activatePro(
        userId,
        email,
        clean(verified.reference),
        redis,
        MONTHLY_PLAN
      );

      return json(res, 200, {
        ok: true,
        recovered: true,
        duplicate: Boolean(result?.duplicate),
        creditsAdded: Number(result?.creditsAdded || 0),
        plan: MONTHLY_PLAN,
        reference: clean(verified.reference),
        message: "Verified ₦60,000 monthly Pro payment and restored the Pro credits."
      });
    }

    return json(res, 404, {
      ok: false,
      recovered: false,
      error: "No matching successful ₦60,000 monthly Pro transaction was found for this account."
    });
  } catch (error) {
    console.warn(
      "OBITREND Paystack recovery:",
      error?.message || error
    );

    return json(res, 500, {
      ok: false,
      error: error?.message || "Unable to recover the payment."
    });
  }
}
