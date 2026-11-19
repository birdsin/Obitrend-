const routes = {
  "/api/account": () => import("../api/account.js"),
  "/api/analyze-image": () => import("../api/analyze-image.js"),
  "/api/delete-account": () => import("../api/delete-account.js"),
  "/api/generate-background": () => import("../api/generate-background.js"),
  "/api/generate-video": () => import("../api/generate-video.js"),
  "/api/generate": () => import("../api/generate.js"),
  "/api/generated-image": () => import("../api/generated-image.js"),
  "/api/generation-recover": () => import("../api/generation-recover.js"),
  "/api/generation-status": () => import("../api/generation-status.js"),
  "/api/image-gallery": () => import("../api/image-gallery.js"),
  "/api/paystack-recover": () => import("../api/paystack-recover.js"),
  "/api/paystack": () => import("../api/paystack.js"),
  "/api/pro": () => import("../api/pro.js"),
  "/api/public-config": () => import("../api/public-config.js"),
  "/api/push-public-key": () => import("../api/push-public-key.js"),
  "/api/push-subscription": () => import("../api/push-subscription.js"),
  "/api/video-credits": () => import("../api/video-credits.js"),
  "/api/video-download": () => import("../api/video-download.js"),
  "/api/video-gallery": () => import("../api/video-gallery.js"),
  "/api/video-payment": () => import("../api/video-payment.js"),
  "/api/video-status": () => import("../api/video-status.js")
};

const MAX_BODY_BYTES = 50 * 1024 * 1024;

function responseBridge() {
  let statusCode = 200;
  let body = null;
  let sent = false;
  const headers = new Headers();

  const res = {
    status(code) { statusCode = Number(code) || 200; return res; },
    setHeader(name, value) { if (Array.isArray(value)) { for (const item of value) headers.append(name, String(item)); } else { headers.set(name, String(value)); } return res; },
    getHeader(name) { return headers.get(name); },
    removeHeader(name) { headers.delete(name); return res; },
    json(value) {
      if (!headers.has("content-type")) headers.set("content-type", "application/json; charset=utf-8");
      body = JSON.stringify(value ?? null); sent = true; return res;
    },
    send(value) {
      if (value && typeof value === "object" && !(value instanceof ArrayBuffer) && !ArrayBuffer.isView(value)) return res.json(value);
      body = value ?? ""; sent = true; return res;
    },
    end(value) { body = value ?? ""; sent = true; return res; },
    redirect(statusOrUrl, maybeUrl) {
      const code = typeof statusOrUrl === "number" ? statusOrUrl : 302;
      const target = typeof statusOrUrl === "number" ? maybeUrl : statusOrUrl;
      statusCode = code; headers.set("location", String(target)); body = ""; sent = true; return res;
    },
    _response() {
      if (!sent) return new Response(null, { status: statusCode, headers });
      return new Response([204, 205, 304].includes(statusCode) ? null : body, { status: statusCode, headers });
    }
  };
  return res;
}

async function readBody(request) {
  if (["GET", "HEAD"].includes(request.method)) return undefined;
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) throw new Response("Request body too large", { status: 413 });
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new Response("Request body too large", { status: 413 });
    if (!raw) return {};
    try { return JSON.parse(raw); } catch { throw new Response("Invalid JSON body", { status: 400 }); }
  }
  if (type.includes("application/x-www-form-urlencoded")) return Object.fromEntries(new URLSearchParams(await request.text()));
  if (type.includes("multipart/form-data")) {
    const form = await request.formData();
    const result = {};
    for (const [key, value] of form.entries()) result[key] = value;
    return result;
  }
  return await request.text();
}

function makeLegacyRequest(request, body) {
  const url = new URL(request.url);
  const headers = Object.fromEntries(request.headers.entries());
  headers.get = (name) => request.headers.get(name);
  return {
    method: request.method,
    url: url.pathname + url.search,
    originalUrl: url.pathname + url.search,
    headers,
    body,
    query: Object.fromEntries(url.searchParams.entries()),
    params: {},
    cookies: Object.fromEntries((request.headers.get("cookie") || "").split(";").map(part => part.trim()).filter(Boolean).map(part => { const index = part.indexOf("="); return index < 0 ? [part, ""] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))]; }))
  };
}

function applyCors(response, request, env) {
  const origin = request.headers.get("origin");
  if (!origin) return response;
  const allowed = new Set([env.APP_ORIGIN, env.OBITREND_APP_URL, env.NEXT_PUBLIC_APP_URL].filter(Boolean).map(v => String(v).replace(/\/$/, "")));
  if (!allowed.has(origin.replace(/\/$/, ""))) return response;
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-credentials", "true");
  headers.set("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  headers.set("access-control-allow-headers", "Authorization,Content-Type,X-Paystack-Signature");
  headers.append("vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function handleApi(request, env, ctx) {
  const url = new URL(request.url);
  let path = url.pathname.replace(/\/+$/, "") || "/";
  if (path === "/api/video-payment-verify") path = "/api/video-payment";
  const load = routes[path];
  if (!load) return Response.json({ success: false, error: "API route not found." }, { status: 404 });
  if (request.method === "OPTIONS") return applyCors(new Response(null, { status: 204 }), request, env);
  let body;
  try { body = await readBody(request); }
  catch (error) { if (error instanceof Response) return error; throw error; }

  const mod = await load();
  if (typeof mod.default !== "function") return Response.json({ success: false, error: "API handler is unavailable." }, { status: 500 });
  const req = makeLegacyRequest(request, body);
  const res = responseBridge();
  await mod.default(req, res, ctx);
  return applyCors(res._response(), request, env);
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, ctx);

      if (!env.ASSETS) return new Response("Static assets are not configured.", { status: 503 });
      let response = await env.ASSETS.fetch(request);
      if (response.status === 404 && (url.pathname === "/studio" || url.pathname.startsWith("/studio/"))) {
        const fallback = new URL("/studio/index.html", request.url);
        response = await env.ASSETS.fetch(new Request(fallback, request));
      }
      return response;
    } catch (error) {
      if (error instanceof Response) return error;
      console.error("OBITREND Cloudflare Worker error:", error?.stack || error);
      return Response.json({ success: false, error: "OBITREND service is temporarily unavailable." }, { status: 500 });
    }
  }
};
