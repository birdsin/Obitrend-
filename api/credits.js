/*
===========================================================
OBITREND AI FASHION CREATOR
SERVER-SIDE USER-SPECIFIC FREE + PRO CREDITS

Each Supabase user gets an independent Redis namespace.
Weekly Pro:  ₦15,000 / 7 days / standard Pro access
Monthly Pro: ₦45,000 / 30 days / full Pro access
===========================================================
*/

const FREE_CREDITS = 3;
const WEEKLY_PRO_CREDITS = Math.max(1, Number(process.env.PAYSTACK_WEEKLY_PRO_CREDITS || process.env.PAYSTACK_PRO_CREDITS || 30));
const MONTHLY_PRO_CREDITS = Math.max(1, Number(process.env.PAYSTACK_MONTHLY_PRO_CREDITS || 120));
const FREE_PERIOD_SECONDS = 7 * 24 * 60 * 60;
const WEEKLY_SECONDS = 7 * 24 * 60 * 60;
const MONTHLY_SECONDS = 30 * 24 * 60 * 60;

function send(res, status, data) { return res.status(status).json(data); }

export function getRedisConfig() {
  return {
    url: String(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').trim(),
    token: String(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '').trim()
  };
}

async function redisCommand(url, token, command) {
  if (!url || !token) throw new Error('Redis environment variables are missing.');
  const response = await fetch(`${url.replace(/\/$/, '')}/${command.map(encodeURIComponent).join('/')}`, {
    method: 'GET', headers: { Authorization: `Bearer ${token}` }
  });
  let data = null;
  try { data = await response.json(); } catch { data = null; }
  if (!response.ok || !data || data.error) throw new Error(data?.error || `Redis request failed (${response.status}).`);
  return data.result;
}

function cleanUserId(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
}
function getSupabaseUrl() { return String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, ''); }
function getSupabaseKey() { return String(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim(); }
function getBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = typeof header === 'string' ? header.match(/^Bearer\s+(.+)$/i) : null;
  return match ? match[1].trim() : '';
}

export async function getAuthenticatedUser(req) {
  const token = getBearerToken(req);
  if (!token) return { ok: false, status: 401, error: 'You must be logged in to use OBITREND.' };
  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getSupabaseKey();
  if (!supabaseUrl || !supabaseKey) return { ok: false, status: 500, error: 'Supabase authentication is not configured on the server.' };
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'GET', headers: { apikey: supabaseKey, Authorization: `Bearer ${token}`, Accept: 'application/json' }
    });
    let data = null; try { data = await response.json(); } catch {}
    const userId = cleanUserId(data?.id);
    const email = String(data?.email || '').trim().toLowerCase();
    if (!response.ok || !userId || userId.length < 8 || !email.includes('@')) {
      return { ok: false, status: 401, error: 'Your login session is invalid or expired. Please log in again.' };
    }
    return { ok: true, user: { id: userId, email } };
  } catch (error) {
    console.error('Supabase authentication request failed:', error);
    return { ok: false, status: 502, error: 'Unable to verify your OBITREND login right now.' };
  }
}

function balanceKey(userId) { return `obitrend:credits:${userId}`; }
function resetKey(userId) { return `obitrend:credits:reset:${userId}`; }
function proKey(userId) { return `obitrend:pro:${userId}`; }
function proExpiryKey(userId) { return `obitrend:pro:expiry:${userId}`; }
function proEmailKey(userId) { return `obitrend:pro:email:${userId}`; }
function proReferenceKey(userId) { return `obitrend:pro:reference:${userId}`; }
function proPlanKey(userId) { return `obitrend:pro:plan:${userId}`; }
function proBalanceKey(userId) { return `obitrend:pro:credits:${userId}`; }
function proCreditsExpiryKey(userId) { return `obitrend:pro:credits:expiry:${userId}`; }

export function getPlanDefinition(plan = 'PRO_WEEKLY') {
  const normalized = String(plan || '').trim().toUpperCase();
  if (normalized === 'PRO_MONTHLY' || normalized === 'MONTHLY') {
    return { key: 'PRO_MONTHLY', tier: 'full', label: 'OBITREND Pro Monthly', amount: 4500000, interval: 'monthly', durationSeconds: MONTHLY_SECONDS, credits: MONTHLY_PRO_CREDITS };
  }
  return { key: 'PRO_WEEKLY', tier: 'standard', label: 'OBITREND Pro Weekly', amount: 1500000, interval: 'weekly', durationSeconds: WEEKLY_SECONDS, credits: WEEKLY_PRO_CREDITS };
}

export async function activatePro(userId, email, reference, redis, plan = 'PRO_WEEKLY') {
  const safeUserId = cleanUserId(userId);
  if (!safeUserId) throw new Error('Invalid user ID.');
  if (!redis?.url || !redis?.token) throw new Error('Redis environment variables are missing.');
  const p = getPlanDefinition(plan);
  const ref = String(reference || '').trim();

  // Idempotency: the same verified Paystack reference must never grant credits twice.
  if (ref) {
    const previous = await redisCommand(redis.url, redis.token, ['GET', proReferenceKey(safeUserId)]);
    if (previous === ref) return getProStatus(safeUserId, redis);
  }

  const now = Math.floor(Date.now() / 1000);
  let existingExpiry = 0;
  try { existingExpiry = Number(await redisCommand(redis.url, redis.token, ['GET', proExpiryKey(safeUserId)])) || 0; } catch {}
  const expiresAt = Math.max(now, existingExpiry) + p.durationSeconds;
  const ttl = Math.max(1, expiresAt - now);

  await Promise.all([
    redisCommand(redis.url, redis.token, ['SET', proKey(safeUserId), 'active', 'EX', ttl]),
    redisCommand(redis.url, redis.token, ['SET', proExpiryKey(safeUserId), expiresAt, 'EX', ttl]),
    redisCommand(redis.url, redis.token, ['SET', proPlanKey(safeUserId), p.key, 'EX', ttl]),
    redisCommand(redis.url, redis.token, ['SET', proBalanceKey(safeUserId), p.credits, 'EX', ttl]),
    redisCommand(redis.url, redis.token, ['SET', proCreditsExpiryKey(safeUserId), expiresAt, 'EX', ttl]),
    email ? redisCommand(redis.url, redis.token, ['SET', proEmailKey(safeUserId), String(email).trim().toLowerCase(), 'EX', ttl]) : Promise.resolve(null),
    ref ? redisCommand(redis.url, redis.token, ['SET', proReferenceKey(safeUserId), ref, 'EX', ttl]) : Promise.resolve(null)
  ]);

  return { active: true, userId: safeUserId, expiresAt, proCredits: p.credits, proCreditsRemaining: p.credits, plan: p.key, planTier: p.tier, planInterval: p.interval, proCreditsTotal: p.credits };
}

export async function getProStatus(userId, redis) {
  const safeUserId = cleanUserId(userId);
  if (!safeUserId || !redis?.url || !redis?.token) return { active: false, expiresAt: null, proCredits: 0 };
  try {
    const status = await redisCommand(redis.url, redis.token, ['GET', proKey(safeUserId)]);
    if (!(status === 'active' || status === 'true')) return { active: false, expiresAt: null, proCredits: 0 };
    let expiresAt = Number(await redisCommand(redis.url, redis.token, ['GET', proExpiryKey(safeUserId)])) || null;
    if (!expiresAt) {
      const ttl = Number(await redisCommand(redis.url, redis.token, ['TTL', proKey(safeUserId)]));
      if (Number.isFinite(ttl) && ttl >= 0) expiresAt = Math.floor(Date.now() / 1000) + ttl;
    }
    const now = Math.floor(Date.now() / 1000);
    if (expiresAt && expiresAt <= now) { await deactivatePro(safeUserId, redis); return { active: false, expiresAt: null, proCredits: 0 }; }
    let planKey = await redisCommand(redis.url, redis.token, ['GET', proPlanKey(safeUserId)]).catch(() => null);
    if (planKey !== 'PRO_MONTHLY' && planKey !== 'PRO_WEEKLY') planKey = 'PRO_WEEKLY';
    const p = getPlanDefinition(planKey);
    const raw = await redisCommand(redis.url, redis.token, ['GET', proBalanceKey(safeUserId)]).catch(() => '0');
    const proCredits = Math.max(0, Number(raw || 0));
    return { active: true, expiresAt, proCredits, proCreditsTotal: p.credits, plan: p.key, planTier: p.tier, planInterval: p.interval, planAmount: p.amount };
  } catch (error) {
    console.error('OBITREND Pro status check failed:', error);
    return { active: false, expiresAt: null, proCredits: 0 };
  }
}

export async function deactivatePro(userId, redis) {
  const safeUserId = cleanUserId(userId);
  if (!safeUserId || !redis?.url || !redis?.token) return;
  await Promise.all([
    redisCommand(redis.url, redis.token, ['DEL', proKey(safeUserId)]),
    redisCommand(redis.url, redis.token, ['DEL', proExpiryKey(safeUserId)]),
    redisCommand(redis.url, redis.token, ['DEL', proPlanKey(safeUserId)]),
    redisCommand(redis.url, redis.token, ['DEL', proBalanceKey(safeUserId)]),
    redisCommand(redis.url, redis.token, ['DEL', proCreditsExpiryKey(safeUserId)]),
    redisCommand(redis.url, redis.token, ['DEL', proEmailKey(safeUserId)]),
    redisCommand(redis.url, redis.token, ['DEL', proReferenceKey(safeUserId)])
  ]);
}

async function getOrCreateFreeCredits(userId, redis) {
  const safeUserId = cleanUserId(userId);
  const balance = balanceKey(safeUserId), reset = resetKey(safeUserId);
  const [currentBalance, resetAtValue] = await Promise.all([
    redisCommand(redis.url, redis.token, ['GET', balance]),
    redisCommand(redis.url, redis.token, ['GET', reset])
  ]);
  const now = Math.floor(Date.now() / 1000);
  const resetAt = Number(resetAtValue || 0);
  if (currentBalance === null || !Number.isFinite(resetAt) || resetAt <= now) {
    const newResetAt = now + FREE_PERIOD_SECONDS;
    await Promise.all([
      redisCommand(redis.url, redis.token, ['SET', balance, FREE_CREDITS, 'EX', FREE_PERIOD_SECONDS]),
      redisCommand(redis.url, redis.token, ['SET', reset, newResetAt, 'EX', FREE_PERIOD_SECONDS])
    ]);
    return { balance: FREE_CREDITS, total: FREE_CREDITS, resetAt: newResetAt };
  }
  return { balance: Math.max(0, Number(currentBalance || 0)), total: FREE_CREDITS, resetAt };
}

export async function spendCredit(userId, redis) {
  const safeUserId = cleanUserId(userId);
  if (!safeUserId || !redis?.url || !redis?.token) return { success: false, balance: 0, reason: 'invalid_user' };
  const pro = await getProStatus(safeUserId, redis);
  if (pro.active) {
    if (pro.proCredits <= 0) return { success: false, balance: 0, reason: 'no_pro_credits', upgradeRequired: true, proActive: true, proCredits: 0, expiresAt: pro.expiresAt, plan: pro.plan, planTier: pro.planTier };
    const result = Number(await redisCommand(redis.url, redis.token, ['DECR', proBalanceKey(safeUserId)]));
    if (result < 0) { await redisCommand(redis.url, redis.token, ['INCR', proBalanceKey(safeUserId)]); return { success: false, balance: 0, reason: 'no_pro_credits', upgradeRequired: true, proActive: true, proCredits: 0, expiresAt: pro.expiresAt, plan: pro.plan, planTier: pro.planTier }; }
    return { success: true, balance: result, proCredits: result, proActive: true, usedCredit: true, creditType: 'pro', expiresAt: pro.expiresAt, plan: pro.plan, planTier: pro.planTier };
  }
  const free = await getOrCreateFreeCredits(safeUserId, redis);
  if (free.balance <= 0) return { success: false, balance: 0, reason: 'no_free_credits', upgradeRequired: true, proActive: false, resetAt: free.resetAt };
  const result = Number(await redisCommand(redis.url, redis.token, ['DECR', balanceKey(safeUserId)]));
  if (result < 0) { await redisCommand(redis.url, redis.token, ['INCR', balanceKey(safeUserId)]); return { success: false, balance: 0, reason: 'no_free_credits', upgradeRequired: true, proActive: false, resetAt: free.resetAt }; }
  return { success: true, balance: result, proCredits: null, proActive: false, usedCredit: true, creditType: 'free', resetAt: free.resetAt };
}

export async function refundCredit(userId, redis) {
  const safeUserId = cleanUserId(userId);
  if (!safeUserId || !redis?.url || !redis?.token) return { success: false, balance: 0 };
  const pro = await getProStatus(safeUserId, redis);
  if (pro.active) {
    const current = Number(await redisCommand(redis.url, redis.token, ['GET', proBalanceKey(safeUserId)]));
    if (!Number.isFinite(current)) return { success: false, balance: 0 };
    const newBalance = Math.min(pro.proCreditsTotal, Math.max(0, Number(await redisCommand(redis.url, redis.token, ['INCR', proBalanceKey(safeUserId)]))));
    return { success: true, balance: newBalance, proCredits: newBalance, creditType: 'pro' };
  }
  const current = await redisCommand(redis.url, redis.token, ['GET', balanceKey(safeUserId)]);
  if (current === null) return { success: false, balance: 0 };
  const currentNumber = Number(current);
  if (currentNumber >= FREE_CREDITS) return { success: true, balance: FREE_CREDITS, creditType: 'free' };
  const newBalance = await redisCommand(redis.url, redis.token, ['INCR', balanceKey(safeUserId)]);
  return { success: true, balance: Math.min(FREE_CREDITS, Math.max(0, Number(newBalance))), creditType: 'free' };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return send(res, 405, { success: false, error: 'Method not allowed.' }); }
  const redis = getRedisConfig();
  if (!redis.url || !redis.token) return send(res, 500, { success: false, error: 'Redis environment variables are missing in Vercel.' });
  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth.ok) return send(res, auth.status, { success: false, error: auth.error });
    const userId = auth.user.id;
    const pro = await getProStatus(userId, redis);
    const now = Math.floor(Date.now() / 1000);
    if (pro.active) {
      const seconds = pro.expiresAt == null ? null : Math.max(0, Number(pro.expiresAt) - now);
      return send(res, 200, {
        success: true, proActive: true, proExpiresAt: pro.expiresAt, proSecondsRemaining: seconds,
        proCredits: pro.proCredits, proCreditsTotal: pro.proCreditsTotal, credits: pro.proCredits, total: pro.proCreditsTotal,
        plan: pro.plan, planTier: pro.planTier, planInterval: pro.planInterval, planAmount: pro.planAmount,
        freeTrial: false, freeTrialRemaining: 0, upgradeRequired: pro.proCredits <= 0, resetAt: null, secondsUntilReset: null,
        creditType: 'pro', message: pro.proCredits > 0 ? `OBITREND Pro ${pro.planTier === 'full' ? 'Monthly' : 'Weekly'} is active.` : 'Your OBITREND Pro credits are finished.'
      });
    }
    const free = await getOrCreateFreeCredits(userId, redis);
    const secondsUntilReset = Math.max(0, Number(free.resetAt || 0) - now);
    return send(res, 200, {
      success: true, proActive: false, proExpiresAt: null, proSecondsRemaining: null, proCredits: 0, proCreditsTotal: 0,
      credits: free.balance, total: free.total, plan: null, planTier: null, planInterval: null, planAmount: null,
      freeTrial: true, freeTrialLimit: FREE_CREDITS, freeTrialRemaining: free.balance, resetAt: free.resetAt,
      secondsUntilReset, resetEvery: FREE_PERIOD_SECONDS, upgradeRequired: free.balance <= 0, creditType: 'free',
      message: free.balance > 0 ? `You have ${free.balance} free generation(s) remaining this week.` : 'Your weekly free generations are finished. Upgrade to OBITREND Pro to continue.'
    });
  } catch (error) {
    console.error('OBITREND credits error:', error);
    return send(res, 500, { success: false, error: 'Unable to read OBITREND credits right now.' });
  }
}
