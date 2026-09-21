import { getAuthenticatedUser, getProStatus, getRedisConfig } from "../lib/credits.js";
import { reserveVideoSeconds, linkVideoReservation } from "../video-credits.js";
import { createClient } from "@supabase/supabase-js";

const RUNWAY_API_KEY = process.env.RUNWAY_API_KEY || process.env.RUNWAYML_API_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
const APP_ORIGIN = process.env.APP_ORIGIN || "https://obitrend.vercel.app";

const send = (res,status,body) => res.status(status).json(body);
const supabase = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {auth:{autoRefreshToken:false,persistSession:false}});

const normalizeRatio = (ratio) => ({
  "16:9":"1280:720","9:16":"720:1280","1:1":"960:960","4:5":"832:1040","5:4":"1040:832"
}[ratio] || ratio || "1280:720");

function moviePrompt(plan, scene, shot, characterBible) {
  return [
    "OBITREND AI CINEMA SHOT.",
    "Create one photorealistic cinematic video shot. Preserve exact character identity, face, age, body proportions, hairstyle, wardrobe, props and environment continuity from the movie bible.",
    "CHARACTER/WORLD BIBLE:", characterBible,
    "SCENE:", scene.heading, scene.location, scene.timeOfDay, scene.purpose,
    "SHOT:", shot.shotPrompt,
    "CAMERA:", shot.camera, shot.lens, shot.framing, shot.angle, shot.movement, shot.focus,
    "LIGHTING:", shot.lighting,
    "SOUND:", shot.sound,
    "CONTINUITY:", shot.continuity,
    "No subtitles, no logos, no watermarks, no random wardrobe changes, no identity drift, no duplicate people, no malformed hands or faces. Natural physics and believable human motion."
  ].join("\n");
}

export default async function handler(req,res) {
  if (req.method !== "POST") return send(res,405,{success:false,error:"Method not allowed."});
  if (!RUNWAY_API_KEY) return send(res,503,{success:false,error:"Movie video generation is not configured."});

  const auth = await getAuthenticatedUser(req);
  if (!auth?.ok || !auth.user?.id) return send(res,auth?.status||401,{success:false,error:"Authentication failed."});
  const pro = await getProStatus(auth.user.id,getRedisConfig());
  if (!pro?.active) return send(res,403,{success:false,error:"AI Movie is available to Pro users only."});

  const body = req.body || {};
  const plan = body.plan;
  if (!plan?.scenes?.length) return send(res,400,{success:false,error:"A movie blueprint is required."});

  const sceneIndex = Number(body.sceneIndex);
  const shotIndex = Number(body.shotIndex);
  if (!Number.isInteger(sceneIndex) || !Number.isInteger(shotIndex)) {
    return send(res,400,{success:false,error:"Scene and shot are required."});
  }

  const scene = plan.scenes[sceneIndex];
  const shot = scene?.shots?.[shotIndex];
  if (!scene || !shot) return send(res,400,{success:false,error:"Selected movie shot was not found."});

  const duration = Math.min(10,Math.max(5,Number(shot.durationSeconds)||5));
  const redis = getRedisConfig();
  const jobId = `movie-${auth.user.id}-${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
  const reservation = await reserveVideoSeconds({userId:auth.user.id,seconds:duration,jobId,redis});
  if (!reservation?.ok) return send(res,402,{success:false,error:reservation?.error||"You do not have enough video seconds."});

  const characterBible = (plan.characters||[]).map(c=>`${c.name}: ${c.role}; appearance=${c.appearance}; wardrobe=${c.wardrobe}; personality=${c.personality}`).join("\n");
  const promptText = moviePrompt(plan,scene,shot,characterBible);

  try {
    const ratio = normalizeRatio(body.ratio || "16:9");
    const input = {model:"seedance2_5",promptText,ratio,duration,audio:true};
    if (body.imageUrl) input.promptImage = String(body.imageUrl);

    const response = await fetch("https://api.dev.runwayml.com/v1/image_to_video",{
      method:"POST",
      headers:{"Authorization":`Bearer ${RUNWAY_API_KEY}`,"Content-Type":"application/json","X-Runway-Version":"2024-11-06"},
      body:JSON.stringify(input)
    });
    const result = await response.json().catch(()=>({}));
    if (!response.ok || !result?.id) {
      console.error("OBITREND MOVIE SHOT PROVIDER ERROR",result);
      return send(res,502,{success:false,error:"This movie shot could not be started. Your video seconds remain reserved for retry.",retryable:true});
    }

    const taskId = String(result.id);
    const linked = await linkVideoReservation({reservationId:jobId,taskId,redis});
    if (!linked?.ok) return send(res,503,{success:false,status:"QUEUED",taskId,error:"Movie shot started but wallet tracking needs a retry.",retryable:true});

    const db = supabase();
    const {data,error} = await db.from("video_jobs").insert({
      user_id:auth.user.id,runway_task_id:taskId,status:"queued",progress:0,
      prompt:promptText,image_url:body.imageUrl||null,duration_seconds:duration,credit_refunded:false,
      movie_scene_number:scene.number,movie_shot_number:shot.shotNumber,movie_title:plan.title
    }).select("id").single();

    if (error) {
      console.error("OBITREND MOVIE JOB INSERT ERROR",error);
      return send(res,503,{success:false,status:"QUEUED",taskId,error:"Movie shot started but job registration needs a retry.",retryable:true});
    }

    return send(res,200,{success:true,status:"QUEUED",taskId,jobId:db.id,movieScene:scene.number,movieShot:shot.shotNumber,duration,remainingSeconds:Number(reservation.secondsRemaining||0)});
  } catch (error) {
    console.error("OBITREND MOVIE SHOT ERROR",error);
    return send(res,500,{success:false,error:"Unable to start this movie shot. Please try again."});
  }
}
