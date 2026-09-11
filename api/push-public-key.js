const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ success: false, error: "Method not allowed." });
  if (!VAPID_PUBLIC_KEY) return res.status(503).json({ success: false, error: "Push notifications are not configured yet." });
  return res.status(200).json({ success: true, publicKey: VAPID_PUBLIC_KEY });
}
