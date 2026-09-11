import { waitUntil } from "@vercel/functions";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { getAuthenticatedUser } from "./credits.js";

export const config = {
  maxDuration: 300
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const APP_ORIGIN =
  process.env.APP_ORIGIN ||
  "https://obitrend.vercel.app";

const BUCKET = "obitrend-generated";

const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT ||
  "mailto:admin@obitrend.vercel.app";

function serviceClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Supabase server configuration is missing."
    );
  }

  return createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}

function makeJobId() {
  return crypto.randomUUID();
}

function extractImages(result) {
  if (!result) return [];

  if (Array.isArray(result.images)) {
    return result.images
      .map((item) => {
        if (typeof item === "string") return item;

        return (
          item?.b64_json ||
          item?.base64 ||
          item?.image ||
          item?.url ||
          null
        );
      })
      .filter(Boolean);
  }

  if (result.image) {
    return [
      typeof result.image === "string"
        ? result.image
        : result.image?.b64_json ||
          result.image?.base64 ||
          result.image?.url
    ].filter(Boolean);
  }

  if (result.imageUrl) {
    return [result.imageUrl];
  }

  if (result.url) {
    return [result.url];
  }

  if (result.data && Array.isArray(result.data)) {
    return result.data
      .map((item) => {
        if (typeof item === "string") return item;

        return (
          item?.b64_json ||
          item?.base64 ||
          item?.url ||
          null
        );
      })
      .filter(Boolean);
  }

  return [];
}

function base64ToBuffer(value) {
  let base64 = String(value || "").trim();

  if (base64.startsWith("data:")) {
    const comma = base64.indexOf(",");

    if (comma !== -1) {
      base64 = base64.slice(comma + 1);
    }
  }

  base64 = base64.replace(/\s/g, "");

  return Buffer.from(base64, "base64");
}

async function saveImage(
  supabase,
  userId,
  jobId,
  imageValue,
  index
) {
  if (
    typeof imageValue === "string" &&
    /^https?:\/\//i.test(imageValue)
  ) {
    return imageValue;
  }

  const buffer = base64ToBuffer(imageValue);

  if (!buffer.length) {
    throw new Error("Generated image data is empty.");
  }

  const path =
    `${userId}/${jobId}/image-${index + 1}.png`;

  const { error: uploadError } =
    await supabase.storage
      .from(BUCKET)
      .upload(
        path,
        buffer,
        {
          contentType: "image/png",
          upsert: true
        }
      );

  if (uploadError) {
    throw uploadError;
  }

  const { data, error: signedError } =
    await supabase.storage
      .from(BUCKET)
      .createSignedUrl(
        path,
        60 * 60 * 24 * 7
      );

  if (signedError) {
    throw signedError;
  }

  return data.signedUrl;
}

async function getPushConfig(supabase) {
  const { data, error } =
    await supabase
      .from("push_config")
      .select(
        "public_key,private_key,subject"
      )
      .eq("id", "default")
      .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function sendCompletionNotification(
  supabase,
  userId,
  jobId,
  imageUrl
) {
  const pushConfig =
    await getPushConfig(supabase);

  if (
    !pushConfig?.public_key ||
    !pushConfig?.private_key
  ) {
    console.warn(
      "OBITREND push configuration is not ready."
    );
    return;
  }

  webpush.setVapidDetails(
    pushConfig.subject ||
      VAPID_SUBJECT,
    pushConfig.public_key,
    pushConfig.private_key
  );

  const { data: subscriptions, error } =
    await supabase
      .from("push_subscriptions")
      .select(
        "id,endpoint,p256dh,auth"
      )
      .eq("user_id", userId);

  if (error) {
    throw error;
  }

  if (!subscriptions?.length) {
    return;
  }

  const payload = JSON.stringify({
    title: "OBITREND",
    body: "Your fashion image is ready.",
    tag: `obitrend-generation-${jobId}`,
    url:
      imageUrl ||
      `${APP_ORIGIN}/?generation=${jobId}`,
    jobId
  });

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth
          }
        },
        payload
      );
    } catch (error) {
      const statusCode =
        error?.statusCode;

      if (
        statusCode === 404 ||
        statusCode === 410
      ) {
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("id", subscription.id);
      } else {
        console.error(
          "OBITREND push notification failed:",
          error?.message || error
        );
      }
    }
  }
}

async function updateJob(
  supabase,
  jobId,
  values
) {
  const { error } =
    await supabase
      .from("generation_jobs")
      .update(values)
      .eq("id", jobId);

  if (error) {
    throw error;
  }
}

async function runGeneration({
  supabase,
  jobId,
  userId,
  accessToken,
  payload
}) {
  try {
    await updateJob(
      supabase,
      jobId,
      {
        status: "processing",
        progress: 10
      }
    );

    const response =
      await fetch(
        `${APP_ORIGIN}/api/generate`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
            Authorization:
              `Bearer ${accessToken}`
          },
          body: JSON.stringify(payload)
        }
      );

    const text =
      await response.text();

    let result;

    try {
      result = text
        ? JSON.parse(text)
        : {};
    } catch {
      throw new Error(
        "Generation server returned an invalid response."
      );
    }

    if (!response.ok) {
      throw new Error(
        result?.error ||
        "Image generation failed."
      );
    }

    if (
      result?.success === false
    ) {
      throw new Error(
        result?.error ||
        "Image generation failed."
      );
    }

    await updateJob(
      supabase,
      jobId,
      {
        progress: 70
      }
    );

    const images =
      extractImages(result);

    if (!images.length) {
      throw new Error(
        "No generated image was returned."
      );
    }

    const imageUrls = [];

    for (
      let i = 0;
      i < images.length;
      i++
    ) {
      const imageUrl =
        await saveImage(
          supabase,
          userId,
          jobId,
          images[i],
          i
        );

      imageUrls.push(imageUrl);
    }

    const firstImage =
      imageUrls[0] || null;

    await updateJob(
      supabase,
      jobId,
      {
        status: "completed",
        progress: 100,
        result: {
          images: imageUrls,
          imageUrl: firstImage
        },
        completed_at:
          new Date().toISOString(),
        error_message: null
      }
    );

    try {
      await sendCompletionNotification(
        supabase,
        userId,
        jobId,
        firstImage
      );
    } catch (notificationError) {
      console.error(
        "OBITREND notification error:",
        notificationError?.message ||
          notificationError
      );
    }

  } catch (error) {
    console.error(
      "OBITREND background generation failed:",
      error?.message || error
    );

    try {
      await updateJob(
        supabase,
        jobId,
        {
          status: "failed",
          progress: 100,
          error_message:
            error?.message ||
            "Generation failed.",
          completed_at:
            new Date().toISOString()
        }
      );
    } catch (jobError) {
      console.error(
        "OBITREND job update failed:",
        jobError?.message ||
          jobError
      );
    }
  }
}

export default async function handler(
  req,
  res
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed."
    });
  }

  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY
  ) {
    return res.status(500).json({
      success: false,
      error:
        "Background generation is not configured."
    });
  }

  try {
    const auth =
      await getAuthenticatedUser(req);

    if (!auth.ok) {
      return res.status(auth.status).json({
        success: false,
        error: auth.error
      });
    }

    const payload =
      req.body || {};

    const supabase =
      serviceClient();

    const jobId =
      makeJobId();

    const { error: insertError } =
      await supabase
        .from("generation_jobs")
        .insert({
          id: jobId,
          user_id: auth.user.id,
          status: "queued",
          progress: 0
        });

    if (insertError) {
      throw insertError;
    }

    const accessToken =
      String(
        req.headers.authorization ||
        ""
      )
      .replace(/^Bearer\s+/i, "")
      .trim();

    if (!accessToken) {
      await supabase
        .from("generation_jobs")
        .update({
          status: "failed",
          progress: 100,
          error_message:
            "Authentication token is missing."
        })
        .eq("id", jobId);

      return res.status(401).json({
        success: false,
        error:
          "Authentication token is missing."
      });
    }

    waitUntil(
      runGeneration({
        supabase,
        jobId,
        userId: auth.user.id,
        accessToken,
        payload
      })
    );

    return res.status(202).json({
      success: true,
      jobId,
      status: "queued"
    });

  } catch (error) {
    console.error(
      "OBITREND background endpoint failed:",
      error?.message || error
    );

    return res.status(503).json({
      success: false,
      error:
        "Unable to start background generation right now."
    });
  }
}
