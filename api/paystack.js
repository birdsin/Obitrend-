/*
===========================================================
OBITREND AI FASHION CREATOR — PAYSTACK API

Vercel environment variables:
PAYSTACK_SECRET_KEY
PAYSTACK_WEEKLY_PLAN_CODE   = ₦15,000 weekly Paystack plan
PAYSTACK_MONTHLY_PLAN_CODE  = ₦45,000 monthly Paystack plan

Optional:
OBITREND_APP_URL
PAYSTACK_WEEKLY_PRO_CREDITS   (default 30)
PAYSTACK_MONTHLY_PRO_CREDITS  (default 120)
===========================================================
*/

import { getRedisConfig, activatePro, getProStatus, getAuthenticatedUser, getPlanDefinition } from './credits.js';

const PAYSTACK_API = 'https://api.paystack.co';
const DEFAULT_APP_URL = 'https://obitrend.vercel.app';

function clean(v) { return String(v ?? '').trim(); }
function lower(v) { return clean(v).toLowerCase(); }
function upper(v) { return clean(v).toUpperCase(); }
function send(res, status, data) { return res.status(status).json(data); }

function config() {
  return {
    secretKey: clean(process.env.PAYSTACK_SECRET_KEY),
    weeklyPlanCode: clean(process.env.PAYSTACK_WEEKLY_PLAN_CODE) || clean(process.env.PAYSTACK_PRO_PLAN_CODE),
    monthlyPlanCode: clean(process.env.PAYSTACK_MONTHLY_PLAN_CODE),
    appUrl: clean(process.env.OBITREND_APP_URL) || DEFAULT_APP_URL
  };
}

function getPlanConfig(cfg, requested) {
  const p = getPlanDefinition(requested);
  const planCode = p.key === 'PRO_MONTHLY' ? cfg.monthlyPlanCode : cfg.weeklyPlanCode;
  return { ...p, planCode };
}

function validate(res, cfg) {
  if (!cfg.secretKey) return send(res, 500, { success: false, error: 'PAYSTACK_SECRET_KEY is not configured.' });
  if (!cfg.weeklyPlanCode) return send(res, 500, { success: false, error: 'PAYSTACK_WEEKLY_PLAN_CODE is not configured.' });
  if (!cfg.monthlyPlanCode) return send(res, 500, { success: false, error: 'PAYSTACK_MONTHLY_PLAN_CODE is not configured.' });
  return null;
}

async function paystack(path, secretKey, options = {}) {
  const response = await fetch(`${PAYSTACK_API}${path}`, {
    method: options.method || 'GET',
    headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });
  let data = null; try { data = await response.json(); } catch {}
  return { ok: response.ok, status: response.status, data };
}

async function verifyPlan(cfg, plan) {
  const p = getPlanConfig(cfg, plan);
  if (!p.planCode) return { valid: false, error: `${p.key === 'PRO_MONTHLY' ? 'PAYSTACK_MONTHLY_PLAN_CODE' : 'PAYSTACK_WEEKLY_PLAN_CODE'} is not configured.` };
  const result = await paystack(`/plan/${encodeURIComponent(p.planCode)}`, cfg.secretKey);
  if (!result.ok || !result.data?.status || !result.data?.data) return { valid: false, error: result.data?.message || 'Unable to verify the Paystack plan.' };
  const planData = result.data.data;
  const amount = Number(planData.amount);
  const currency = upper(planData.currency);
  const interval = lower(planData.interval);
  if (amount !== p.amount) return { valid: false, error: `The ${p.interval} Paystack plan amount does not match OBITREND.`, details: { expected: p.amount, actual: amount } };
  if (currency && currency !== 'NGN') return { valid: false, error: 'Paystack plan currency must be NGN.' };
  if (interval && interval !== p.interval) return { valid: false, error: `The Paystack plan interval must be ${p.interval}.` };
  return { valid: true, plan: planData, definition: p };
}

async function initializePayment(email, userId, requestedPlan, cfg, redis) {
  const p = getPlanConfig(cfg, requestedPlan);
  if (!p.planCode) return { success: false, error: `${p.key === 'PRO_MONTHLY' ? 'PAYSTACK_MONTHLY_PLAN_CODE' : 'PAYSTACK_WEEKLY_PLAN_CODE'} is not configured.` };
  const planCheck = await verifyPlan(cfg, p.key);
  if (!planCheck.valid) return { success: false, error: planCheck.error };

  const reference = `OBITREND-${p.key}-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
  const callbackUrl = `${cfg.appUrl.replace(/\/+$/, '')}/`;
  const payload = {
    email,
    amount: String(p.amount),
    currency: 'NGN',
    plan: p.planCode,
    reference,
    callback_url: callbackUrl,
    metadata: {
      product: 'OBITREND_PRO',
      obitrend_user_id: userId,
      obitrend_plan: p.key,
      obitrend_tier: p.tier,
      obitrend_interval: p.interval,
      obitrend_amount: p.amount
    }
  };

  const result = await paystack('/transaction/initialize', cfg.secretKey, { method: 'POST', body: payload });
  if (!result.ok || !result.data?.status || !result.data?.data?.authorization_url || !result.data?.data?.reference) {
    return { success: false, error: result.data?.message || 'Paystack could not initialize the OBITREND payment.' };
  }

  // Bind the payment reference to the authenticated user and selected plan.
  await redisCommand(redis.url, redis.token, ['SET', `obitrend:payment:${reference}`, JSON.stringify({ userId, plan: p.key, planCode: p.planCode, amount: p.amount, email }), 'EX', 86400]);

  return {
    success: true,
    authorization_url: result.data.data.authorization_url,
    reference: result.data.data.reference,
    access_code: result.data.data.access_code || '',
    plan: p.key,
    planTier: p.tier,
    amount: p.amount,
    currency: 'NGN',
    interval: p.interval
  };
}

async function redisCommand(url, token, command) {
  const response = await fetch(`${url.replace(/\/$/, '')}/${command.map(encodeURIComponent).join('/')}`, { headers: { Authorization: `Bearer ${token}` } });
  let data = null; try { data = await response.json(); } catch {}
  if (!response.ok || !data || data.error) throw new Error(data?.error || `Redis request failed (${response.status}).`);
  return data.result;
}

async function verifyTransaction(reference, cfg, pending) {
  const result = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`, cfg.secretKey);
  if (!result.ok || !result.data?.status || !result.data?.data) return { success: false, paid: false, error: result.data?.message || 'Paystack could not verify the payment.' };
  const tx = result.data.data;
  if (lower(tx.status) !== 'success') return { success: false, paid: false, error: 'Payment has not been completed successfully.' };
  if (upper(tx.currency) !== 'NGN') return { success: false, paid: false, error: 'Payment currency does not match OBITREND.' };

  const expected = pending ? getPlanDefinition(pending.plan) : null;
  const expectedAmount = expected?.amount || 0;
  const expectedPlanCode = pending?.planCode || '';
  const requestedAmount = Number(tx.requested_amount);
  const actualAmount = Number(tx.amount);
  const fees = Number(tx.fees);
  const verifiedAmount = Number.isFinite(requestedAmount) && requestedAmount > 0
    ? requestedAmount === expectedAmount
    : Number.isFinite(actualAmount) && Number.isFinite(fees)
      ? actualAmount - fees === expectedAmount
      : actualAmount === expectedAmount;
  if (!verifiedAmount) return { success: false, paid: false, error: 'Payment amount does not match the selected OBITREND plan.' };

  let txPlan = '';
  if (typeof tx.plan === 'string') txPlan = clean(tx.plan);
  else if (tx.plan && typeof tx.plan === 'object') txPlan = clean(tx.plan.plan_code || tx.plan.planCode || tx.plan.code);
  if (!txPlan && tx.plan_object) txPlan = clean(tx.plan_object.plan_code || tx.plan_object.planCode || tx.plan_object.code);
  if (expectedPlanCode && txPlan && txPlan !== expectedPlanCode) return { success: false, paid: false, error: 'The successful payment is not for the selected OBITREND plan.' };

  const email = clean(tx.customer?.email || tx.email || '').toLowerCase();
  return { success: true, paid: true, reference: tx.reference || reference, email, amount: actualAmount, requestedAmount, planCode: txPlan || expectedPlanCode, plan: pending?.plan || null };
}

async function handlePost(req, res) {
  const cfg = config();
  const configError = validate(res, cfg); if (configError) return configError;
  const auth = await getAuthenticatedUser(req); if (!auth.ok) return send(res, auth.status, { success: false, error: auth.error });
  const redis = getRedisConfig(); if (!redis.url || !redis.token) return send(res, 500, { success: false, error: 'Redis environment variables are missing in Vercel.' });
  let body = req.body || {}; if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return send(res, 400, { success: false, error: 'Invalid JSON.' }); } }
  const requestedEmail = clean(body.email || body.customer_email).toLowerCase();
  if (requestedEmail && requestedEmail !== auth.user.email) return send(res, 400, { success: false, error: 'The payment email must match your signed-in OBITREND account.' });
  const requestedPlan = clean(body.plan || 'PRO_WEEKLY').toUpperCase();
  if (!['PRO_WEEKLY','PRO_MONTHLY'].includes(requestedPlan)) return send(res, 400, { success: false, error: 'Invalid OBITREND Pro plan.' });
  const payment = await initializePayment(auth.user.email, auth.user.id, requestedPlan, cfg, redis);
  return send(res, payment.success ? 200 : 400, payment);
}

async function handleGet(req, res) {
  const cfg = config();
  const configError = validate(res, cfg); if (configError) return configError;
  const url = new URL(req.url, cfg.appUrl);
  const reference = clean(url.searchParams.get('reference') || url.searchParams.get('trxref') || '');
  const action = lower(url.searchParams.get('action') || '');
  if (action === 'plans') return send(res, 200, {
    success: true,
    weekly: { planCodeConfigured: Boolean(cfg.weeklyPlanCode), amount: 1500000, interval: 'weekly', tier: 'standard' },
    monthly: { planCodeConfigured: Boolean(cfg.monthlyPlanCode), amount: 4500000, interval: 'monthly', tier: 'full' }
  });
  if (!reference) return send(res, 400, { success: false, paid: false, proActive: false, error: 'Payment reference is required.' });

  const auth = await getAuthenticatedUser(req); if (!auth.ok) return send(res, auth.status, { success: false, paid: false, proActive: false, error: auth.error });
  const redis = getRedisConfig(); if (!redis.url || !redis.token) return send(res, 500, { success: false, paid: false, proActive: false, error: 'Redis environment variables are missing in Vercel.' });

  let pending = null;
  try { const raw = await redisCommand(redis.url, redis.token, ['GET', `obitrend:payment:${reference}`]); if (raw) pending = JSON.parse(raw); } catch {}
  if (pending?.userId && pending.userId !== auth.user.id) return send(res, 403, { success: false, paid: false, proActive: false, error: 'This payment belongs to a different OBITREND account.' });

  const verified = await verifyTransaction(reference, cfg, pending);
  if (!verified.success || !verified.paid) return send(res, 400, { success: false, paid: false, proActive: false, error: verified.error || 'Payment could not be verified.' });
  if (verified.email && verified.email !== auth.user.email) return send(res, 403, { success: false, paid: false, proActive: false, error: 'This payment belongs to a different OBITREND account.' });

  const planKey = pending?.plan || (verified.amount === 4500000 ? 'PRO_MONTHLY' : 'PRO_WEEKLY');
  const activated = await activatePro(auth.user.id, auth.user.email, verified.reference, redis, planKey);
  const status = await getProStatus(auth.user.id, redis);
  try { await redisCommand(redis.url, redis.token, ['DEL', `obitrend:payment:${reference}`]); } catch {}

  return send(res, 200, {
    success: true, paid: true, activated: activated.active === true, proActive: status.active === true,
    active: status.active === true, reference: verified.reference, email: auth.user.email,
    expiresAt: status.expiresAt, proExpiresAt: status.expiresAt,
    proSecondsRemaining: status.expiresAt == null ? null : Math.max(0, Number(status.expiresAt) - Math.floor(Date.now()/1000)),
    proCredits: Number(status.proCredits || 0), proCreditsTotal: Number(status.proCreditsTotal || 0),
    plan: status.plan, planTier: status.planTier, planInterval: status.planInterval, planAmount: status.planAmount,
    message: `OBITREND ${status.planTier === 'full' ? 'Monthly' : 'Weekly'} Pro activated successfully.`
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'POST') return await handlePost(req, res);
    if (req.method === 'GET') return await handleGet(req, res);
    res.setHeader('Allow', 'GET, POST, OPTIONS'); return send(res, 405, { success: false, error: 'Method not allowed.' });
  } catch (error) {
    console.error('OBITREND PAYSTACK ERROR:', error);
    return send(res, 500, { success: false, error: error?.message || 'Unexpected Paystack server error.' });
  }
}
