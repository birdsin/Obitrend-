/*
=========================================================
OBITREND AI VIDEO CREDIT SYSTEM
=========================================================

SEPARATE FROM IMAGE / FASHION CREDITS

VIDEO PACKAGES

₦5,000  = 5 seconds
₦10,000 = 10 seconds
₦15,000 = 15 seconds
₦20,000 = 20 seconds

Video seconds are stored separately from:
- Fashion Studio credits
- Campaign Studio credits
- Free image credits
- Pro image credits

This file only manages the VIDEO wallet.
It does not initialize Paystack payments.
It does not generate videos.
It does not modify image credits.
=========================================================
*/

import { getRedisConfig } from "./lib/credits.js";

/* =======================================================
   VIDEO PACKAGES
======================================================= */

export const VIDEO_PACKAGES = Object.freeze({

  VIDEO_5_SEC: {
    id: "VIDEO_5_SEC",
    amount: 500000,
    seconds: 5,
    name: "OBITREND Video 5 Seconds"
  },

  VIDEO_10_SEC: {
    id: "VIDEO_10_SEC",
    amount: 1000000,
    seconds: 10,
    name: "OBITREND Video 10 Seconds"
  },

  VIDEO_15_SEC: {
    id: "VIDEO_15_SEC",
    amount: 1500000,
    seconds: 15,
    name: "OBITREND Video 15 Seconds"
  },

  VIDEO_20_SEC: {
    id: "VIDEO_20_SEC",
    amount: 2000000,
    seconds: 20,
    name: "OBITREND Video 20 Seconds"
  }

});

/* =======================================================
   REDIS HELPERS
======================================================= */

async function redisCommand(redis, command, args = []) {

  if (!redis) {
    throw new Error("Video Redis configuration is unavailable.");
  }

  const url = redis.url || redis.restUrl || redis.endpoint;
  const token = redis.token || redis.restToken || redis.password;

  if (!url || !token) {
    throw new Error("Video Redis credentials are unavailable.");
  }

  const response = await fetch(
    `${url}/${[command, ...args].map(encodeURIComponent).join("/")}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  if (!response.ok) {
    throw new Error("Video Redis request failed.");
  }

  const data = await response.json();

  return data?.result;
}

async function redisEvalVideo(redis, script, keys = [], args = []) {
  const url = redis.url || redis.restUrl || redis.endpoint;
  const token = redis.token || redis.restToken || redis.password;

  if (!url || !token) throw new Error("Video Redis credentials are unavailable.");

  const path = ["EVAL", script, String(keys.length), ...keys, ...args]
    .map(encodeURIComponent).join("/");

  const response = await fetch(url + "/" + path, {
    method: "GET",
    headers: { Authorization: "Bearer " + token }
  });

  if (!response.ok) throw new Error("Video Redis EVAL request failed.");
  const data = await response.json();
  if (data?.error) throw new Error(String(data.error));
  return data?.result;
}

/* =======================================================
   PACKAGE LOOKUP
======================================================= */

export function getVideoPackage(packageId) {

  if (!packageId) return null;

  return VIDEO_PACKAGES[String(packageId).trim()] || null;
}

/* =======================================================
   REDIS KEYS
======================================================= */

function balanceKey(userId) {
  return `obitrend:video:seconds:${userId}`;
}

function totalKey(userId) {
  return `obitrend:video:seconds:total:${userId}`;
}

function paymentKey(reference) {
  return `obitrend:video:payment:${reference}`;
}

function reservationKey(jobId) {
  return `obitrend:video:reservation:${jobId}`;
}

function taskReservationKey(taskId) {
  return `obitrend:video:task-reservation:${taskId}`;
}

/* =======================================================
   GET VIDEO BALANCE
======================================================= */

export async function getVideoBalance(userId, redis = null) {

  if (!userId) {
    return {
      ok: false,
      seconds: 0,
      totalPurchased: 0
    };
  }

  const client = redis || await getRedisConfig();

  if (!client) {
    return {
      ok: false,
      seconds: 0,
      totalPurchased: 0
    };
  }

  const balance = await redisCommand(
    client,
    "GET",
    [balanceKey(userId)]
  );

  const total = await redisCommand(
    client,
    "GET",
    [totalKey(userId)]
  );

  return {
    ok: true,
    seconds: Math.max(0, Number(balance || 0)),
    totalPurchased: Math.max(0, Number(total || 0))
  };
}

/* =======================================================
   GET VIDEO STATUS
======================================================= */

export async function getVideoStatus(userId, redis = null) {

  const balance = await getVideoBalance(userId, redis);

  return {
    ok: balance.ok,
    active: balance.seconds > 0,
    seconds: balance.seconds,
    totalPurchased: balance.totalPurchased
  };
}

/* =======================================================
   ADD VIDEO SECONDS
=======================================================

IMPORTANT:

A Paystack reference is recorded before value is delivered.

This prevents the same payment from being credited twice.
======================================================= */

export async function addVideoSeconds({
  userId,
  email = "",
  reference,
  packageId,
  redis = null
}) {
  if (!userId) return { ok: false, error: "Video account is unavailable." };
  if (!reference) return { ok: false, error: "Video payment reference is unavailable." };

  const packageInfo = getVideoPackage(packageId);
  if (!packageInfo) return { ok: false, error: "Video package is unavailable." };

  const client = redis || await getRedisConfig();
  if (!client?.url || !client?.token) {
    return { ok: false, error: "Video wallet is temporarily unavailable." };
  }

  const script = `
    local alreadyProcessed = redis.call("GET", KEYS[1])
    local currentBalance = tonumber(redis.call("GET", KEYS[2]) or "0")
    local currentTotal = tonumber(redis.call("GET", KEYS[3]) or "0")

    if alreadyProcessed == "1" then
      return {currentBalance, currentTotal, 1}
    end

    local amount = tonumber(ARGV[1])
    local newBalance = currentBalance + amount
    local newTotal = currentTotal + amount

    redis.call("INCRBY", KEYS[2], ARGV[1])
    redis.call("INCRBY", KEYS[3], ARGV[1])
    redis.call("SET", KEYS[1], "1", "EX", 31536000)

    return {newBalance, newTotal, 0}
  `;

  const result = await redisEvalVideo(
    client,
    script,
    [paymentKey(reference), balanceKey(userId), totalKey(userId)],
    [String(packageInfo.seconds)]
  );

  const seconds = Math.max(0, Number(result?.[0] || 0));
  const totalPurchased = Math.max(0, Number(result?.[1] || 0));
  const duplicate = Number(result?.[2] || 0) === 1;

  return {
    ok: true,
    duplicate,
    added: duplicate ? 0 : packageInfo.seconds,
    seconds,
    totalPurchased,
    package: packageInfo.id
  };
}
/* =======================================================
   RESERVE VIDEO SECONDS
=======================================================

Used when a video generation job starts.

Example:

5-second video
10-second video
15-second video
20-second video

The balance is reserved before the provider request.

If generation fails, the reservation can be refunded.
======================================================= */

export async function reserveVideoSeconds({
  userId,
  seconds,
  jobId,
  redis = null
}) {

  const amount = Math.floor(Number(seconds));

  if (!userId || !jobId || !Number.isFinite(amount) || amount <= 0) {

    return {
      ok: false,
      error: "Video generation request is unavailable."
    };
  }

  const client = redis || await getRedisConfig();

  if (!client) {

    return {
      ok: false,
      error: "Video wallet is temporarily unavailable."
    };
  }

  const key = balanceKey(userId);

  const current = await redisCommand(
    client,
    "GET",
    [key]
  );

  const available = Number(current || 0);

  if (available <= 0) {

    return {
      ok: false,
      error: "Your video credits have finished. Please purchase video credits to continue."
    };
  }

  if (available < amount) {

    return {
      ok: false,
      error: "You do not have enough OBITREND video seconds."
    };
  }

  /*
  -------------------------------------------------------
  Reserve by decrementing the available balance.
  -------------------------------------------------------
  */

  const remaining = await redisCommand(
    client,
    "DECRBY",
    [
      key,
      String(amount)
    ]
  );

  if (Number(remaining) < 0) {

    await redisCommand(
      client,
      "INCRBY",
      [
        key,
        String(amount)
      ]
    );

    return {
      ok: false,
      error: "Your video balance changed. Please try again."
    };
  }

  await redisCommand(
    client,
    "SET",
    [
      reservationKey(jobId),
      JSON.stringify({
        userId,
        seconds: amount,
        jobId,
        status: "reserved",
        createdAt: new Date().toISOString()
      }),
      "EX",
      "86400"
    ]
  );

  return {
    ok: true,
    reserved: amount,
    secondsRemaining: Number(remaining)
  };
}

/* =======================================================
   LINK VIDEO RESERVATION TO RUNWAY TASK
======================================================= */

export async function linkVideoReservation({
  reservationId,
  taskId,
  redis = null
}) {
  if (!reservationId || !taskId) {
    return { ok: false, error: "Video reservation link is unavailable." };
  }

  const client = redis || await getRedisConfig();
  if (!client) {
    return { ok: false, error: "Video wallet is temporarily unavailable." };
  }

  const reservation = await redisCommand(
    client,
    "GET",
    [reservationKey(reservationId)]
  );

  if (!reservation) {
    return { ok: false, error: "Video reservation could not be found." };
  }

  await redisCommand(
    client,
    "SET",
    [
      taskReservationKey(taskId),
      String(reservationId),
      "EX",
      "86400"
    ]
  );

  return {
    ok: true,
    reservationId: String(reservationId),
    taskId: String(taskId)
  };
}

/* =======================================================
   COMPLETE VIDEO RESERVATION BY RUNWAY TASK
======================================================= */

export async function completeVideoReservationByTask({
  taskId,
  redis = null
}) {
  if (!taskId) return { ok: false };

  const client = redis || await getRedisConfig();
  if (!client) return { ok: false };

  const reservationId = await redisCommand(
    client,
    "GET",
    [taskReservationKey(taskId)]
  );

  if (!reservationId) {
    return {
      ok: true,
      alreadyCompleted: true,
      missingReservation: true
    };
  }

  const result = await completeVideoReservation({
    jobId: String(reservationId),
    redis: client
  });

  if (result?.ok) {
    await redisCommand(
      client,
      "DEL",
      [taskReservationKey(taskId)]
    );
  }

  return result;
}

/* =======================================================
   REFUND VIDEO RESERVATION BY RUNWAY TASK
======================================================= */

export async function refundVideoReservationByTask({
  taskId,
  redis = null
}) {
  if (!taskId) return { ok: false };

  const client = redis || await getRedisConfig();
  if (!client) return { ok: false };

  const reservationId = await redisCommand(
    client,
    "GET",
    [taskReservationKey(taskId)]
  );

  if (!reservationId) {
    return {
      ok: true,
      alreadyRefunded: true,
      missingReservation: true
    };
  }

  const result = await refundVideoReservation({
    jobId: String(reservationId),
    redis: client
  });

  if (result?.ok) {
    await redisCommand(
      client,
      "DEL",
      [taskReservationKey(taskId)]
    );
  }

  return result;
}

/* =======================================================
   COMPLETE VIDEO RESERVATION
======================================================= */

export async function completeVideoReservation({
  jobId,
  redis = null
}) {

  if (!jobId) {

    return {
      ok: false
    };
  }

  const client = redis || await getRedisConfig();

  if (!client) {

    return {
      ok: false
    };
  }

  const key = reservationKey(jobId);

  const raw = await redisCommand(
    client,
    "GET",
    [key]
  );

  if (!raw) {

    return {
      ok: true,
      alreadyCompleted: true
    };
  }

  let reservation;

  try {

    reservation = JSON.parse(raw);

  } catch {

    return {
      ok: false,
      error: "Video reservation could not be completed."
    };
  }

  if (reservation.status === "completed") {

    return {
      ok: true,
      alreadyCompleted: true
    };
  }

  reservation.status = "completed";
  reservation.completedAt = new Date().toISOString();

  await redisCommand(
    client,
    "SET",
    [
      key,
      JSON.stringify(reservation),
      "EX",
      "86400"
    ]
  );

  return {
    ok: true,
    completed: true,
    secondsUsed: Number(reservation.seconds || 0)
  };
}

/* =======================================================
   REFUND VIDEO RESERVATION
=======================================================

If Runway/provider generation fails after the wallet was
reserved, this returns the seconds to the customer.

This prevents customers losing video balance because of
a provider-side generation failure.
======================================================= */

export async function refundVideoReservation({
  jobId,
  redis = null
}) {

  if (!jobId) {

    return {
      ok: false
    };
  }

  const client = redis || await getRedisConfig();

  if (!client) {

    return {
      ok: false
    };
  }

  const key = reservationKey(jobId);

  const raw = await redisCommand(
    client,
    "GET",
    [key]
  );

  if (!raw) {

    return {
      ok: true,
      alreadyRefunded: true
    };
  }

  let reservation;

  try {

    reservation = JSON.parse(raw);

  } catch {

    return {
      ok: false,
      error: "Video reservation could not be restored."
    };
  }

  if (
    reservation.status === "refunded" ||
    reservation.status === "completed"
  ) {

    return {
      ok: true,
      alreadyHandled: true
    };
  }

  const amount = Number(reservation.seconds || 0);

  if (amount <= 0) {

    return {
      ok: false
    };
  }

  const restored = await redisCommand(
    client,
    "INCRBY",
    [
      balanceKey(reservation.userId),
      String(amount)
    ]
  );

  reservation.status = "refunded";
  reservation.refundedAt = new Date().toISOString();

  await redisCommand(
    client,
    "SET",
    [
      key,
      JSON.stringify(reservation),
      "EX",
      "86400"
    ]
  );

  return {
    ok: true,
    refunded: amount,
    seconds: Number(restored || 0)
  };
}

/* =======================================================
   SIMPLE SPEND HELPER
======================================================= */

export async function spendVideoSeconds({
  userId,
  seconds,
  redis = null
}) {

  const amount = Math.floor(Number(seconds));

  if (!userId || !Number.isFinite(amount) || amount <= 0) {

    return {
      ok: false,
      error: "Invalid video balance request."
    };
  }

  const client = redis || await getRedisConfig();

  if (!client) {

    return {
      ok: false,
      error: "Video wallet is temporarily unavailable."
    };
  }

  const key = balanceKey(userId);

  const current = Number(
    await redisCommand(
      client,
      "GET",
      [key]
    ) || 0
  );

  if (current < amount) {

    return {
      ok: false,
      error: "You do not have enough OBITREND video seconds."
    };
  }

  const remaining = await redisCommand(
    client,
    "DECRBY",
    [
      key,
      String(amount)
    ]
  );

  if (Number(remaining) < 0) {

    await redisCommand(
      client,
      "INCRBY",
      [
        key,
        String(amount)
      ]
    );

    return {
      ok: false,
      error: "Your video balance changed. Please try again."
    };
  }

  return {
    ok: true,
    spent: amount,
    secondsRemaining: Number(remaining)
  };
}
