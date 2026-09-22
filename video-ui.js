(() => {
  "use strict";

  /*
  =========================================================
  OBITREND AI VIDEO UI
  =========================================================

  VIDEO PACKAGES

  ₦5,000  = 5 seconds
  ₦10,000 = 10 seconds
  ₦15,000 = 15 seconds
  ₦20,000 = 20 seconds

  FEATURES

  - Separate video balance
  - Paystack video payments
  - 5 / 10 / 15 / 20 second selection
  - Automatic image ratio detection
  - Uploaded-image or generated-image video references
  - Runway video generation
  - Status polling
  - Video player
  - Video download
  - Friendly error messages
  - Never displays [object Object]
  =========================================================
  */

  const state = {
    balance5: 0,
    balance10: 0,
    balance15: 0,
    balance20: 0,

    selectedDuration: 5,

    pollingTimer: null,
    pollingBusy: false,

    currentTaskId: null,
    currentVideoUrl: null,
    generatingTimer: null,
    uploadedReferenceImage: null,
    musicRegion: "auto",
    musicStyle: "regional",
    cameraStyle: "AI Smart Camera"
  };

  /*
  =========================================================
  DOM HELPER
  =========================================================
  */

  function el(tag, attrs = {}, children = []) {

    const node =
      document.createElement(tag);

    Object.entries(attrs).forEach(
      ([key, value]) => {

        if (key === "text") {

          node.textContent =
            value;

        } else if (key === "html") {

          node.innerHTML =
            value;

        } else if (key === "class") {

          node.className =
            value;

        } else if (key === "style") {

          node.style.cssText =
            value;

        } else if (
          key.startsWith("on")
        ) {

          node.addEventListener(
            key.slice(2),
            value
          );

        } else {

          node.setAttribute(
            key,
            value
          );
        }
      }
    );

    children.forEach(child => {

      if (child) {
        node.appendChild(child);
      }

    });

    return node;
  }

  /*
  =========================================================
  SAFE MESSAGE CONVERTER
  FIXES [object Object]
  =========================================================
  */

  function getReadableMessage(
    value,
    fallback = "Unable to complete the request."
  ) {

    if (
      value === null ||
      value === undefined
    ) {
      return fallback;
    }

    if (
      typeof value === "string"
    ) {

      const text =
        value.trim();

      return text ||
        fallback;
    }

    if (
      typeof Event !== "undefined" &&
      value instanceof Event
    ) {
      return fallback;
    }

    if (
      value instanceof Error
    ) {

      return (
        value.message ||
        fallback
      );
    }

    if (
      typeof value === "object"
    ) {

      const possibleMessages = [
        value.message,
        value.error,
        value.failureMessage,
        value.details?.message,
        value.details?.error,
        value.data?.message,
        value.data?.error,
        value.response?.message,
        value.response?.error
      ];

      for (
        const message
        of possibleMessages
      ) {

        if (
          typeof message === "string" &&
          message.trim()
        ) {

          return message.trim();
        }
      }

      try {

        const json =
          JSON.stringify(value);

        if (
          json &&
          json !== "{}"
        ) {

          return json;
        }

      } catch (_) {}

      return fallback;
    }

    return String(value);
  }

  function getResponseMessage(
    data,
    fallback
  ) {

    if (!data) {
      return fallback;
    }

    return getReadableMessage(
      data.message ||
      data.error ||
      data.details?.message ||
      data.details?.error ||
      data.data?.message ||
      data.data?.error ||
      data.failureMessage,
      fallback
    );
  }

  function friendlyVideoMessage(error, fallback = "Unable to generate the video right now.") {
    const message = getReadableMessage(error, fallback);
    const status = Number(error?.status || 0);
    const normalized = message.toLowerCase();
    if (!navigator.onLine || /failed to fetch|networkerror|network error|load failed|offline|internet connection|connection.*lost|could not be reached/i.test(normalized)) {
      return "No internet connection. Please check your Wi-Fi or mobile data and try again. Your video seconds are returned when generation does not start.";
    }
    if (/your video credits have finished|not enough obitrend video seconds|not enough video seconds|insufficient.*video seconds|video seconds.*finished/i.test(normalized)) {
      return "Your video credits are finished or you do not have enough seconds for this video. Please purchase more video seconds to continue.";
    }
    if (/not enough credits to run this task|insufficient.*runway.*credits|runway.*credits/i.test(normalized)) {
      return "The AI video service is temporarily unavailable because the video provider has insufficient processing credits. Your OBITREND video seconds are returned when the task cannot start. Please try again later.";
    }
    if (status === 401 || /unauthorized|authentication failed|sign in again/i.test(normalized)) {
      return "Your session has expired. Please sign in again and try creating the video.";
    }
    if (status === 403 || /available to pro users|pro.*required/i.test(normalized)) {
      return "AI Video is available to OBITREND Pro users only. Please upgrade to Pro to continue.";
    }
    if (status === 413 || /too large|payload.*large/i.test(normalized)) {
      return "The selected image or video reference is too large. Please choose a smaller image and try again.";
    }
    if (status === 429 || /rate limit|too many requests|too many/i.test(normalized)) {
      return "Too many video requests were sent. Please wait a moment and try again.";
    }
    if (/unsupported.*image|invalid.*image|asset.*invalid|cannot be used as a video reference|could not be prepared/i.test(normalized)) {
      return "The selected fashion image cannot be used for this video. Please choose or generate another image and try again.";
    }
    if (/timed out|timeout/i.test(normalized)) {
      return "The video service took too long to respond. Please try again.";
    }
    if (status >= 500 || /temporarily unavailable|internal server error|bad gateway|gateway timeout|service unavailable/i.test(normalized)) {
      return "The video generation service is temporarily unavailable. Please try again in a moment. Your video seconds are returned when the video task does not start.";
    }
    return message;
  }

  /*
  =========================================================
  STYLES
  =========================================================
  */

  function addStyles() {

    if (
      document.getElementById(
        "obitrend-video-ui-styles"
      )
    ) {
      return;
    }

    const style =
      document.createElement("style");

    style.id =
      "obitrend-video-ui-styles";

    style.textContent = `
      #obitrendVideoLauncher{display:none!important}
      #obitrendVideoOverlay{position:fixed;inset:0;z-index:10000;display:none;align-items:flex-start;justify-content:center;background:#0a0a0a;overflow:auto}
      #obitrendVideoOverlay.show{display:flex}
      .ob-video-modal{position:relative;width:100%;max-width:760px;min-height:100vh;padding:18px 28px 28px;box-sizing:border-box;color:#f7f7f8;background:linear-gradient(180deg,#0a0a0a 0%,#0d0d10 55%,#0a0a0a 100%);overflow:visible}
      .ob-video-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:0 0 14px}
      .ob-video-brand{display:flex;gap:12px;align-items:flex-start;min-width:0}
      .ob-video-icon{width:60px;height:60px;flex:0 0 60px;border-radius:17px;display:grid;place-items:center;color:#f7d35d;background:linear-gradient(145deg,#171717,#101010);border:1px solid rgba(255,214,10,.38);box-shadow:inset 0 0 0 1px rgba(255,255,255,.02)}
      .ob-video-icon svg{width:34px;height:34px}
      .ob-video-head h2{margin:1px 0 0;font-size:31px;line-height:1.08;font-weight:850;letter-spacing:-1.15px;color:#fafafa}
      .ob-video-head h2 span{color:#ffd60a}
      .ob-video-head p{margin:8px 0 0;color:#9a9aa1;font-size:15px;line-height:1.28;max-width:490px}
            .ob-video-back{min-height:48px;padding:0 16px;border-radius:14px;color:#f4f4f6;background:#17171a;border:1px solid #33333a;font-size:15px;font-weight:800;cursor:pointer;white-space:nowrap;align-self:flex-start}.ob-video-back:hover{border-color:#d5b447}
      .ob-video-close{width:62px;height:62px;flex:0 0 62px;border-radius:18px;color:#fff;background:#17171a;border:1px solid #2d2d31;font-size:34px;font-weight:300;line-height:1;cursor:pointer}
      .ob-video-create-card{padding:0;margin:0;background:transparent;border:0;box-shadow:none}
      .ob-video-upload-row{display:flex;align-items:center;gap:20px;margin:2px 0 12px}
      .ob-video-upload{display:none}
      .ob-video-upload-btn{display:inline-flex;align-items:center;justify-content:center;min-height:51px;padding:0 22px;border-radius:16px;color:#fff;background:#111113;border:2px solid #eabf33;font-size:17px;font-weight:800;cursor:pointer;white-space:nowrap;box-shadow:0 0 0 1px rgba(255,214,10,.04)}
      .ob-video-upload-btn .ob-plus{font-size:29px;font-weight:300;margin-right:10px;line-height:0}
      .ob-video-upload-hint{color:#7f7f87;font-size:14px;white-space:nowrap}
      .ob-video-reference{position:relative;display:flex;align-items:center;gap:18px;min-height:156px;height:156px;padding:13px 17px;margin:0 0 14px;border-radius:20px;background:#111113;border:1px solid #2a2a2f;overflow:hidden}
      .ob-video-reference-thumb{width:145px;height:126px;flex:0 0 145px;border-radius:14px;object-fit:cover;display:none;background:#1a1a1c;border:1px solid rgba(255,255,255,.08)}
      .ob-video-reference-copy{position:static;min-width:0;flex:1;display:flex;flex-direction:column;gap:9px}
      .ob-video-reference-copy strong{display:inline-flex;align-items:center;gap:9px;width:max-content;max-width:100%;padding:9px 14px;border-radius:21px;background:#1b1b1f;border:1px solid #303036;font-size:14px;font-weight:800;color:#f7f7f8}
      .ob-video-reference-copy strong .ob-check{width:19px;height:19px;display:grid;place-items:center;border-radius:50%;background:#55e38a;color:#07120b;font-size:12px;font-weight:900}
      .ob-video-reference-copy span{display:block;color:#9b9aa2;font-size:14px;line-height:1.45}
      .ob-video-file-name{color:#aaa9b0;font-size:14px}
      .ob-video-file-size{color:#85858d;font-size:14px;margin-top:-4px}
      .ob-video-change{position:absolute;right:18px;top:50%;transform:translateY(-50%);display:inline-flex;align-items:center;gap:9px;min-height:48px;padding:0 18px;border-radius:15px;color:#f4f4f6;background:#18181b;border:1px solid #33333a;font-size:15px;font-weight:700;cursor:pointer}
      .ob-video-change svg{width:20px;height:20px}
      .ob-video-ai-card{padding:14px 17px 12px;margin:0 0 14px;border-radius:20px;background:linear-gradient(145deg,#171121,#101015);border:1px solid #322943;box-shadow:none}
      .ob-video-ai-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 10px}
      .ob-video-ai-title{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:850}
      .ob-video-ai-title span{width:35px;height:35px;display:grid;place-items:center;border-radius:10px;background:linear-gradient(145deg,#9a55ff,#6220d9);box-shadow:0 7px 18px rgba(124,58,237,.25)}
      .ob-video-ai-title span svg{width:24px;height:24px}
      .ob-video-ai-sub{color:#9996a2;font-size:15px}
      .ob-video-prompt{width:100%;min-height:93px;resize:none;box-sizing:border-box;padding:15px 16px;margin:0;border-radius:17px;outline:none;color:#f7f7f8;background:#17171b;border:1px solid #31313a;font:inherit;font-size:17px;line-height:1.42;overflow:auto}
      .ob-video-prompt::placeholder{color:#777781;opacity:1}
      .ob-video-prompt:focus{border-color:#45404f;box-shadow:none}
      .ob-video-ai-chips{display:flex;gap:9px;overflow:hidden;margin-top:10px;padding-bottom:0}
      .ob-video-ai-chip{display:inline-flex;align-items:center;gap:8px;white-space:nowrap;border:1px solid #35353b;background:#141417;color:#e8e7eb;border-radius:16px;padding:8px 13px;font-size:13px;cursor:pointer}
      .ob-video-ai-chip svg{width:17px;height:17px}
      .ob-video-camera{margin:0 0 14px;padding:14px 17px 12px;border-radius:20px;background:#0f0f11;border:1px solid #2a2a2f}
      .ob-video-camera-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
      .ob-video-camera-title{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:850}
      .ob-video-camera-title .camera-icon{color:#ffd34d}
      .ob-video-pro-badge{font-size:13px;padding:4px 9px;border-radius:10px;color:#d7b5ff;background:#3a216b;border:1px solid #7143ad;font-weight:850}
      .ob-video-pro-right{display:flex;align-items:center;gap:8px;color:#ffd34d;font-size:14px;font-weight:700}
      .ob-video-camera-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .ob-video-camera-card{position:relative;min-width:0;min-height:184px;padding:10px 10px 11px;border-radius:15px;background:#171719;border:1px solid #2c2c31;color:#fff;text-align:left;cursor:pointer;overflow:hidden}
      .ob-video-camera-card.selected{border-color:#e1bd45;box-shadow:0 0 0 1px rgba(255,214,10,.08)}
      .ob-video-camera-card.locked{cursor:not-allowed}
      .ob-video-camera-card .camera-art{height:74px;display:flex;align-items:center;justify-content:center;margin:-2px 0 7px}
      .ob-video-camera-card .camera-art svg{width:105px;height:70px}
      .ob-video-camera-card strong{display:block;font-size:15px;line-height:1.23;font-weight:700;padding-right:22px}
      .ob-video-camera-card small{display:block;margin-top:7px;color:#8c8b92;font-size:13px;line-height:1.27}
      .ob-video-camera-card .lock{position:absolute;right:11px;top:12px;color:#f1f1f2}
      .ob-video-camera-card .lock svg{width:18px;height:18px}
      .ob-video-music-section{margin:0 0 14px;padding:13px 17px 12px;border-radius:20px;background:#0f0f11;border:1px solid #2a2a2f}
      .ob-video-music-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px}
      .ob-video-music-title{display:flex;align-items:flex-start;gap:10px}
      .ob-video-music-title .music-icon{color:#ffd34d;margin-top:1px}
      .ob-video-music-title b{display:block;font-size:18px;line-height:1.1}
      .ob-video-music-title small{display:block;color:#88878f;font-size:13px;margin-top:4px}
      .ob-video-region{min-height:44px;padding:0 13px;border-radius:14px;color:#ededf0;background:#19191c;border:1px solid #2d2d32;outline:none;font-size:14px;font-weight:650}
      .ob-video-music-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:9px}
      .ob-video-music-option{min-width:0;border:0;background:transparent;color:#f3f3f4;padding:0;cursor:pointer;text-align:center}
      .ob-video-music-thumb{height:72px;border-radius:12px;border:1px solid #2c2c31;background:#19191d;display:grid;place-items:center;overflow:hidden;box-sizing:border-box}
      .ob-video-music-option.selected .ob-video-music-thumb{border:2px solid #ffd34d;box-shadow:0 0 0 1px rgba(255,214,10,.05)}
      .ob-video-music-thumb svg{width:58px;height:58px}
      .ob-video-music-name{display:block;margin-top:5px;font-size:12px;line-height:1.05;color:#efeff1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .ob-video-duration-section{margin:0 0 14px;padding:13px 17px 14px;border-radius:20px;background:#0f0f11;border:1px solid #2a2a2f}
      .ob-video-duration-head{display:flex;align-items:center;gap:10px;margin-bottom:10px}
      .ob-video-duration-head .clock-icon{color:#ffd34d}
      .ob-video-duration-head b{display:block;font-size:18px;line-height:1.05}
      .ob-video-duration-head small{display:block;color:#88878f;font-size:13px;margin-top:4px}
      .ob-video-duration{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .ob-video-package{position:relative;min-height:86px;padding:13px 17px;border-radius:18px;text-align:left;color:#fff;background:#111113;border:1px solid #2c2c31;cursor:pointer;transition:.18s ease}
      .ob-video-package:hover{border-color:#8b753c}
      .ob-video-package.selected{border:2px solid #ffd34d;background:#191714}
      .ob-video-package strong{display:block;font-size:17px;font-weight:800}
      .ob-video-package span{display:block;margin-top:7px;color:#88878f;font-size:12px}
      .ob-video-package .radio{position:absolute;right:15px;top:15px;width:21px;height:21px;border-radius:50%;border:2px solid #707077}
      .ob-video-package.selected .radio{border-color:#ffd34d;box-shadow:inset 0 0 0 4px #171411;background:#ffd34d}
      .ob-video-actions{display:grid;grid-template-columns:1fr;gap:10px;margin-top:0}
      .ob-video-buy{display:flex!important;align-items:center;justify-content:center;width:100%;min-height:52px;border-radius:16px;color:#fff;background:#17171a;border:1px solid #e4bd45;font-size:16px;font-weight:800;cursor:pointer}
      .ob-video-btn{width:100%;height:75px;border:0;border-radius:20px;color:#fff;background:linear-gradient(135deg,#5f32ef,#7040f4);font-size:18px;font-weight:800;cursor:pointer;box-shadow:0 10px 25px rgba(91,47,235,.2)}
      .ob-video-btn:disabled{opacity:.55;cursor:wait}
      .ob-video-btn .sparkle{margin-right:12px}
      .ob-video-btn .arrow{margin-left:11px;font-size:26px;font-weight:400;vertical-align:-2px}
      .ob-video-status{min-height:21px;margin-top:9px;text-align:center;color:#68df9a;font-size:13px;line-height:1.35}
      .ob-video-generating-card{display:none;margin:14px 0 0;padding:16px 17px;border:1px solid #303039;border-radius:18px;background:linear-gradient(145deg,#15151a,#101014);box-shadow:0 10px 30px rgba(0,0,0,.18)}
      .ob-video-generating-card.show{display:block}
      .ob-video-generating-head{display:flex;align-items:center;gap:12px}
      .ob-video-generating-icon{width:42px;height:42px;flex:0 0 42px;border-radius:13px;display:grid;place-items:center;background:linear-gradient(145deg,#7c3aed,#5b21b6);color:#fff;font-size:20px;animation:obVideoPulse 1.7s ease-in-out infinite}
      .ob-video-generating-copy{min-width:0;flex:1}
      .ob-video-generating-copy strong{display:block;font-size:16px;line-height:1.2;color:#f7f7f8}
      .ob-video-generating-copy span{display:block;margin-top:4px;color:#9b9aa2;font-size:13px;line-height:1.35}
      .ob-video-generating-percent{font-size:13px;font-weight:800;color:#d7b5ff}
      .ob-video-generating-track{height:5px;margin-top:14px;border-radius:999px;background:#25252b;overflow:hidden}
      .ob-video-generating-track span{display:block;width:42%;height:100%;border-radius:999px;background:linear-gradient(90deg,#6d28d9,#a855f7,#6d28d9);animation:obVideoShimmer 1.5s ease-in-out infinite}
      .ob-video-generating-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}
      .ob-video-generating-step{padding:9px 8px;border-radius:11px;background:#151519;border:1px solid #27272d;color:#73727a;font-size:11px;text-align:center}
      .ob-video-generating-step.active{color:#fff;border-color:#5b3b91;background:#1b1625}
      .ob-video-generating-step.done{color:#7ce6a4;border-color:#31553f}
      @keyframes obVideoShimmer{0%{transform:translateX(-120%)}100%{transform:translateX(280%)}}
      @keyframes obVideoPulse{0%,100%{transform:scale(1);opacity:.9}50%{transform:scale(1.06);opacity:1}}
      @media(max-width:430px){.ob-video-generating-steps{grid-template-columns:1fr 1fr 1fr}.ob-video-generating-step{font-size:10px;padding:8px 4px}}
      .ob-video-result{display:none;margin-top:16px}.ob-video-result.show{display:block}.ob-video-result video{width:100%;display:block;border-radius:16px;background:#000;border:1px solid rgba(255,255,255,.1)}
      .ob-video-download{width:100%;min-height:52px;margin-top:10px;border-radius:15px;color:#fff;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);font-weight:800;cursor:pointer}
      .ob-video-source{margin-top:8px;color:#666270;font-size:9px;text-align:center}
      @media(max-width:560px){
        .ob-video-modal{max-width:none;padding:18px 28px 28px}
        .ob-video-head h2{font-size:31px}.ob-video-head p{font-size:15px}.ob-video-icon{width:60px;height:60px;flex-basis:60px}.ob-video-close{width:62px;height:62px;flex-basis:62px}
        .ob-video-upload-row{gap:20px}.ob-video-upload-hint{font-size:14px}
        .ob-video-reference{min-height:156px;height:156px}.ob-video-reference-thumb{width:145px;height:126px;flex-basis:145px}.ob-video-change{right:18px}
        .ob-video-camera-grid{grid-template-columns:repeat(3,minmax(0,1fr));overflow:hidden}.ob-video-camera-card{min-height:184px}
        .ob-video-music-grid{grid-template-columns:repeat(7,78px);overflow-x:auto;padding-bottom:2px}
        .ob-video-music-thumb{height:72px}
      }
      @media(max-width:430px){
        .ob-video-modal{padding-left:18px;padding-right:18px}
        .ob-video-head{gap:8px}.ob-video-head h2{font-size:27px}.ob-video-head p{font-size:13px}.ob-video-icon{width:54px;height:54px;flex-basis:54px}.ob-video-close{width:54px;height:54px;flex-basis:54px}
        .ob-video-upload-row{gap:10px}.ob-video-upload-btn{padding:0 15px;font-size:15px}.ob-video-upload-hint{font-size:12px}
        .ob-video-reference{gap:12px;padding:10px;height:140px;min-height:140px}.ob-video-reference-thumb{width:112px;height:116px;flex-basis:112px}.ob-video-change{right:10px;padding:0 10px;font-size:12px}.ob-video-file-size,.ob-video-file-name{font-size:12px}
        .ob-video-camera-card{padding:8px;min-height:174px}.ob-video-camera-card .camera-art{height:61px}.ob-video-camera-card .camera-art svg{width:82px;height:58px}.ob-video-camera-card strong{font-size:12px}.ob-video-camera-card small{font-size:10px}.ob-video-pro-right{font-size:12px}
        .ob-video-ai-chip{font-size:11px;padding:8px 9px}.ob-video-ai-sub{font-size:13px}
        .ob-video-package{min-height:84px;padding:12px}.ob-video-package strong{font-size:15px}.ob-video-package span{font-size:10px}
        .ob-video-btn{height:70px}
      }





    
      .ob-video-camera-card .camera-art{height:88px!important;display:flex;align-items:center;justify-content:center;margin:-2px 0 5px;overflow:hidden;border-radius:10px}
      .ob-video-camera-card .camera-photo-art{width:100%;height:88px;display:block;object-fit:cover;object-position:center;border-radius:10px;filter:saturate(.9) contrast(1.02)}
      .ob-video-music-thumb .music-photo-art{width:100%;height:100%;display:block;object-fit:cover;border-radius:10px}
      @media(max-width:560px){.ob-video-camera-card .camera-art{height:84px!important}.ob-video-camera-card .camera-photo-art{height:84px}.ob-video-music-thumb{height:78px}}
`;

    document.head.appendChild(style);
  }

  /*
  =========================================================
  OVERLAY
  =========================================================
  */

  function getOverlay() {

    return document.getElementById(
      "obitrendVideoOverlay"
    );
  }

  /*
  =========================================================
  STATUS
  =========================================================
  */

  function setStatus(
    message,
    type = ""
  ) {

    const box =
      document.getElementById(
        "obitrendVideoStatus"
      );

    if (!box) {
      return;
    }

    const readable =
      getReadableMessage(
        message,
        "Ready to create your fashion video."
      );

    box.textContent =
      readable;

    box.style.color =
      type === "error"
        ? "#ff7777"
        : type === "success"
          ? "#79e6a0"
          : "#aaa5b5";
  }

  /*
  =========================================================
  SUPABASE TOKEN
  =========================================================
  */
  async function getToken() {

    const client =
      window.supabaseClient ||
      window.supabase;

    if (!client?.auth) {

      throw new Error(
        "OBITREND account service is not ready."
      );
    }

    const {
      data,
      error
    } =
      await client.auth.getSession();
    if (error) {
      throw error;
    }

    const token =
      data?.session?.access_token;

    if (!token) {

      throw new Error(
        "Please sign in before using AI Video."
      );
    }

    return token;
  }

  /*
  =========================================================
  VIDEO CREDIT BALANCE
  =========================================================
  */

  async function loadVideoCredits() {

    try {

      const token =
        await getToken();

      const response =        await fetch(
          "/api/video-credits",
          {
            method:"GET",
            cache:"no-store",
            headers:{
              Accept:
                "application/json",

              Authorization:
                `Bearer ${token}`
            }
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        data?.success !== true
      ) {

        throw new Error(
          getResponseMessage(
            data,
            "Unable to load video credits."
          )
        );
      }

      state.balance5 =
        Number(
          data.balance5 ?? 0
        );

      state.balance10 =
        Number(
          data.balance10 ?? 0
        );

      state.balance15 =
        Number(
          data.balance15 ?? 0
        );

      state.balance20 =
        Number(
          data.balance20 ?? 0
        );

      const balances = {
        5:
          state.balance5,

        10:
          state.balance10,

        15:
          state.balance15,

        20:
          state.balance20
      };

      Object.entries(
        balances
      ).forEach(
        ([duration,balance]) => {

          const element =
            document.getElementById(
              `obVideoBalance${duration}`
            );

          if (element) {

            element.textContent =
              balance;
          }
        }
      );

    } catch (error) {

      console.warn(
        "OBITREND video credits:",
        getReadableMessage(
          error,
          "Unable to load video credits."
        )
      );
    }
  }

  /*
  =========================================================
  RECOVER MISSED VIDEO PAYMENTS
  =========================================================
  */

  async function reconcileVideoPayment() {
    try {
      const token = await getToken();
      if (!token) return;
      const response = await fetch(
        "/api/paystack?reconcile=VIDEO",
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`
          }
        }
      );
      if (!response.ok) return;
      const result = await response.json();
      if (result?.ok === true) await loadVideoCredits();
    } catch (_) {}
  }

  /*
  =========================================================
  PAYSTACK RETURN
  =========================================================
  */

  async function verifyReturnedVideoPayment() {

    const params =
      new URLSearchParams(
        window.location.search
      );

    const reference =
      params.get("reference") ||
      params.get("trxref") ||
      params.get("trx_ref");

    if (!reference) {
      return;
    }

    try {

      const token =
        await getToken();

      const response =
        await fetch(
          "/api/video-payment",
          {
            method:"POST",

            headers:{
              "Content-Type":
                "application/json",

              Accept:
                "application/json",

              Authorization:
                `Bearer ${token}`
            },

            body:
              JSON.stringify({
                reference
              })
          }
        );

      const result =
        await response.json();

      if (
        !response.ok ||
        result?.success !== true
      ) {

        const message =
          getResponseMessage(
            result,
            ""
          );

        if (message) {

          setStatus(
            message,
            "error"
          );
        }

        return;
      }

      await loadVideoCredits();

      setStatus(
        "Payment successful. Your video seconds have been added.",
        "success"
      );

      try {

        const cleanUrl =
          window.location.origin +
          window.location.pathname;

        window.history.replaceState(
          {},
          document.title,
          cleanUrl
        );

      } catch (_) {}

    } catch (error) {

      console.warn(
        "OBITREND video payment return:",
        getReadableMessage(
          error,
          "Unable to verify video payment."
        )
      );
    }
  }

  /*
  =========================================================
  IMAGE SOURCE VALIDATION
  =========================================================
  */

  function isValidImageSource(
    value
  ) {

    if (
      typeof value !== "string"
    ) {
      return false;
    }

    const src =
      value.trim();

    if (!src) {
      return false;
    }

    return (
      src.startsWith("https://") ||
      src.startsWith("http://") ||
      src.startsWith("data:image/") ||
      src.startsWith("blob:")
    );
  }

  function normaliseImageSource(
    value
  ) {

    if (
      !isValidImageSource(value)
    ) {
      return "";
    }

    return value.trim();
  }

  function getImageSourcesFromSelector(
    selectors
  ) {

    const results = [];

    selectors.forEach(
      selector => {

        try {

          document
            .querySelectorAll(selector)
            .forEach(node => {

              if (
                node?.tagName !== "IMG"
              ) {
                return;
              }

              const values = [

                node.currentSrc,

                node.src,

                node.dataset?.url,

                node.dataset?.imageUrl

              ];

              values.forEach(
                value => {

                  const src =
                    normaliseImageSource(
                      value
                    );

                  if (src) {

                    results.push(
                      src
                    );
                  }

                }
              );

            });

        } catch (_) {}

      }
    );

    return results;
  }

  function getRawUploadImages() {

    const selectors = [

      "#preview",

      "#imagePreview",

      "#uploadPreview",

      "#uploadedImage",

      "#clothingPreview",

      ".upload-preview",

      ".clothing-preview",

      ".preview-image",

      "[data-upload-preview]"

    ];

    return getImageSourcesFromSelector(
      selectors
    );
  }

  function isRawUploadImage(
    src
  ) {

    const candidate =
      normaliseImageSource(src);

    if (!candidate) {
      return true;
    }

    const uploads =
      getRawUploadImages();

    return uploads.some(
      upload =>
        upload === candidate
    );
  }

  /*
  =========================================================
  LATEST GENERATED IMAGE
  =========================================================
  */

  function getLatestGeneratedImage() {

    const candidates = [];

    function addCandidate(value) {

      const src =
        normaliseImageSource(
          value
        );

      if (!src) {
        return;
      }

      if (
        !candidates.includes(src)
      ) {

        candidates.push(src);
      }
    }

    /*
      IMPORTANT: an image explicitly uploaded on the video screen
      must always take priority over any stale generated image saved
      in localStorage. Otherwise the UI can display the uploaded image
      while the generator silently validates an older/stale image.
    */
    if (state.uploadedReferenceImage) {
      const uploaded = normaliseImageSource(state.uploadedReferenceImage);
      if (uploaded) return uploaded;
    }

    try {

      addCandidate(
        window.obitrendLatestImage
      );
      addCandidate(
        window.latestGeneratedImage
      );

      addCandidate(
        window.generatedImageUrl
      );

      addCandidate(
        window.lastGeneratedImage
      );

    } catch (_) {}

    [      "obitrend_latest_generated_image",
      "obitrend_latest_image"
    ].forEach(
      key => {

        try {

          addCandidate(
            localStorage.getItem(
              key
            )
          );

        } catch (_) {}

      }
    );

    if (candidates.length) return candidates[0];

    // Also allow an image already uploaded on the main OBITREND page.
    const rawUploads = getRawUploadImages();
    return rawUploads.length ? rawUploads[0] : "";
  }

  function rememberGeneratedFashionImage(
    imageUrl
  ) {

    const src =
      normaliseImageSource(
        imageUrl
      );

    if (!src) {
      return;
    }

    if (
      isRawUploadImage(src)
    ) {
      return;
    }

    window.obitrendLatestImage =
      src;

    window.latestGeneratedImage =
      src;

    window.generatedImageUrl =
      src;

    window.lastGeneratedImage =
      src;

    try {

      localStorage.setItem(
        "obitrend_latest_generated_image",
        src
      );

      localStorage.setItem(
        "obitrend_latest_image",
        src
      );

    } catch (_) {}
  }

  /*
  =========================================================
  DEFAULT VIDEO PROMPT
  =========================================================
  */

  function defaultPrompt() {

    return (

      "Create a premium true-to-life fashion campaign video " +
      "from the reference image. " +

      "Preserve the same adult model, clothing, colors, patterns, " +
      "fabric, fit, silhouette, proportions, and garment construction " +
      "shown in the reference. " +
      "Keep the complete outfit visually consistent throughout the video. " +

      "For a full-body reference, keep the model visible from head to toe " +
      "with comfortable space above the head and below the feet. " +

      "Use subtle natural movement, realistic posing, natural walking or " +
      "standing motion when appropriate, realistic fabric movement, " +
      "smooth professional camera movement, realistic lighting, natural " +
      "shadows, accurate skin texture and premium editorial cinematography. " +

      "Do not redesign, replace, recolor, distort, stretch, shorten, " +
      "lengthen or alter the clothing. " +

      "Do not change the garment construction, pattern, logo placement, " +
      "fabric appearance or silhouette. " +

      "Avoid aggressive zooming, extreme close-ups, warped anatomy, " +
      "artificial CGI appearance or unstable backgrounds."
    );
  }

  /*
  =========================================================
  AUTOMATIC VIDEO RATIO
  =========================================================
  */

  function getVideoRatio(
    imageUrl
  ) {

    return new Promise(
      resolve => {

        const img =
          new Image();

        let finished =
          false;

        function finish(value) {

          if (finished) {
            return;
          }

          finished = true;

          resolve(value);
        }

        img.onload = () => {

          const w =
            img.naturalWidth || 0;

          const h =
            img.naturalHeight || 0;

          if (
            !w ||
            !h
          ) {

            finish(
              "720:1280"
            );

            return;
          }

          const aspect =
            w / h;

          const ratios = [

            {
              value:"1280:720",
              aspect:1280 / 720
            },

            {
              value:"1584:672",
              aspect:1584 / 672
            },

            {
              value:"1104:832",
              aspect:1104 / 832
            },

            {
              value:"960:960",
              aspect:1
            },

            {
              value:"832:1104",
              aspect:832 / 1104
            },

            {
              value:"720:1280",
              aspect:720 / 1280
            },

            {
              value:"672:1584",
              aspect:672 / 1584
            }

          ];

          let best =
            ratios[0];

          let bestDifference =
            Math.abs(
              aspect -
              best.aspect
            );

          for (
            const item of ratios
          ) {

            const difference =
              Math.abs(
                aspect -
                item.aspect
              );

            if (
              difference <
              bestDifference
            ) {

              best =
                item;

              bestDifference =
                difference;
            }
          }

          finish(
            best.value
          );
        };

        img.onerror = () => {

          finish(
            "720:1280"
          );
        };

        img.src =
          imageUrl;
      }
    );
  }

  /*
  =========================================================
  REFERENCE IMAGE VALIDATION
  =========================================================
  */

  function validateReferenceImage(
    imageUrl
  ) {

    return new Promise(
      resolve => {

        const src =
          normaliseImageSource(
            imageUrl
          );

        if (!src) {

          resolve(false);

          return;
        }

        const img =
          new Image();

        let finished =
          false;

        function finish(value) {

          if (finished) {
            return;
          }

          finished = true;

          resolve(value);
        }

        img.onload = () => {

          const width =
            img.naturalWidth || 0;

          const height =
            img.naturalHeight || 0;

          if (
            !width ||
            !height
          ) {

            finish(false);

            return;
          }

          /*
            Do not reject valid portrait/landscape uploads based on
            an arbitrary client-side aspect-ratio limit. The video
            ratio is selected separately by getVideoRatio().
          */
          finish(true);
        };

        img.onerror = () => {

          finish(false);
        };

        img.src =
          src;
      }
    );
  }

  /*
  =========================================================
  DURATION UI
  =========================================================
  */

  function updateVideoBuyLabel(){const buy=document.getElementById("obVideoBuyBtn");if(!buy)return;const d=Number(state.selectedDuration)||5;const amounts={5:"₦5,000",10:"₦10,000",15:"₦15,000",20:"₦20,000"};const amount=amounts[d]||"₦5,000";buy.textContent="Buy Video Credits · "+d+" Seconds · "+amount;}

function updateDurationUI() {

    [5,10,15,20].forEach(
      duration => {

        const button =
          document.getElementById(
            `obVideoPackage${duration}`
          );

        if (button) {

          button.classList.toggle(
            "selected",
            state.selectedDuration === duration
          );
        }

      }
    );

    const prices = {
      5: "₦5,000",
      10: "₦10,000",
      15: "₦15,000",
      20: "₦20,000"
    };

    const buy =
      document.getElementById(
        "obVideoBuyBtn"
      );

    if (buy) {

      buy.textContent =
        `💳 Buy ${state.selectedDuration} Seconds — ${prices[state.selectedDuration]}`;
    }
  }

  function selectDuration(
    duration
  ) {

    duration =
      Number(duration);

    if (
      ![5,10,15,20].includes(
        duration
      )
    ) {

      return;
    }

    state.selectedDuration =
      duration;

    updateDurationUI();
  }

  /*
  =========================================================
  BUY VIDEO SECONDS
  =========================================================
  */

  async function buyVideo() {

    const buy =
      document.getElementById(
        "obVideoBuyBtn"
      );

    if (buy) {
      buy.disabled = true;
    }

    try {
      const token =
        await getToken();

      const duration =
        state.selectedDuration;

      const response =
        await fetch(
          "/api/video-payment",
          {
            method:"POST",

            headers:{
              "Content-Type":                "application/json",

              Accept:
                "application/json",

              Authorization:
                `Bearer ${token}`
            },

            body:
              JSON.stringify({
                duration
              })
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        data?.success !== true
      ) {

        throw new Error(
          getResponseMessage(
            data,
            "Unable to start video payment."
          )
        );
      }

      const authorizationUrl =
        data.authorization_url ||
        data.authorizationUrl ||
        data.data?.authorization_url ||
        data.data?.authorizationUrl;

      if (!authorizationUrl) {

        throw new Error(
          "Payment page is not available."
        );
      }

      window.location.href =
        authorizationUrl;

    } catch (error) {

      setStatus(
        getReadableMessage(
          error,
          "Unable to start payment."
        ),
        "error"
      );

      if (buy) {
        buy.disabled = false;
      }
    }
  }

  /*
  =========================================================
  CHATGPT-STYLE VIDEO GENERATION CARD
  =========================================================
  */

  function showGeneratingCard(progress = 0, status = "PENDING") {
    const card = document.getElementById("obVideoGeneratingCard");
    if (!card) return;

    card.classList.add("show");

    const steps = [...card.querySelectorAll(".ob-video-generating-step")];
    const title = document.getElementById("obVideoGeneratingTitle");
    const detail = document.getElementById("obVideoGeneratingDetail");
    const percent = document.getElementById("obVideoGeneratingPercent");
    const track = card.querySelector(".ob-video-generating-track span");

    let value = Number(progress);
    if (!Number.isFinite(value)) value = 0;
    value = Math.max(0, Math.min(100, Math.round(value)));

    const runwayStatus = String(status || "PENDING").toUpperCase();

    let stage = 0;
    let stageTitle = "Preparing your video";
    let stageDetail = "Preparing the reference image and starting the video task…";

    if (runwayStatus === "RUNNING" || value >= 34) {
      stage = 1;
      stageTitle = "Generating motion";
      stageDetail = "Building realistic movement, camera motion and fabric behavior…";
    }

    if (value >= 70) {
      stage = 2;
      stageTitle = "Finalizing video";
      stageDetail = "Polishing the generated frames and preparing the result…";
    }

    if (runwayStatus === "PENDING" && value === 0) {
      value = 1;
    }

    steps.forEach((step, i) => {
      step.classList.toggle("active", i === stage);
      step.classList.toggle("done", i < stage);
    });

    if (title) title.textContent = stageTitle;
    if (detail) detail.textContent = stageDetail;
    if (percent) percent.textContent = `${value}%`;

    if (track) {
      track.style.width = `${Math.max(3, value)}%`;
      track.style.transform = "none";
      track.style.animation = "none";
    }
  }

  function updateGeneratingCard(progress, status) {
    showGeneratingCard(progress, status);
  }

  function hideGeneratingCard() {
    if (state.generatingTimer) {
      clearInterval(state.generatingTimer);
      state.generatingTimer = null;
    }

    const card = document.getElementById("obVideoGeneratingCard");
    if (card) card.classList.remove("show");
  }

  /*
  =========================================================
  SHOW VIDEO
  =========================================================
  */

  function showVideo(
    videoUrl
  ) {

    const result =
      document.getElementById(
        "obitrendVideoResult"
      );

    const video =
      document.getElementById(
        "obitrendGeneratedVideo"
      );

    const download =
      document.getElementById(
        "obVideoDownloadBtn"
      );
    if (
      !result ||
      !video
    ) {

      return;
    }

    hideGeneratingCard();

    state.currentVideoUrl =
      videoUrl;

    video.src =
      videoUrl;

    video.controls =
      true;

    video.playsInline =
      true;

    result.classList.add(
      "show"
    );

    if (download) {

      download.onclick = async () => {
        if (download.disabled) return;

        const originalText =
          download.textContent;

        try {
          download.disabled = true;
          download.textContent = "⬇️ Saving Video...";

          const supabase =
            window.obitrendSupabase;

          const sessionResult =
            supabase?.auth
              ? await supabase.auth.getSession()
              : null;

          const token =
            sessionResult?.data?.session?.access_token || "";

          if (!token || !state.currentTaskId) {
            throw new Error("Please sign in again before saving this video.");
          }

          const response =
            await fetch(
              `/api/video-download?taskId=${encodeURIComponent(state.currentTaskId)}`,
              {
                method: "GET",
                cache: "no-store",
                headers: {
                  Accept: "video/mp4",
                  Authorization: `Bearer ${token}`
                }
              }
            );

          if (!response.ok) {
            let message = "Unable to save the video right now.";
            try {
              const data = await response.json();
              message = data?.error || message;
            } catch (_) {}
            throw new Error(message);
          }

          const blob = await response.blob();
          if (!blob.size) {
            throw new Error("The video file is empty.");
          }

          const objectUrl =
            URL.createObjectURL(blob);

          const link =
            document.createElement("a");

          link.href = objectUrl;
          link.download =
            "obitrend-ai-fashion-video.mp4";
          document.body.appendChild(link);
          link.click();
          link.remove();

          setTimeout(() => {
            try {
              URL.revokeObjectURL(objectUrl);
            } catch (_) {}
          }, 2000);

          setStatus(
            "Video saved to your device.",
            "success"
          );
        } catch (error) {
          setStatus(
            getReadableMessage(
              error,
              "Unable to save the video right now."
            ),
            "error"
          );
        } finally {
          download.disabled = false;
          download.textContent =
            originalText || "⬇️ Download Video";
        }
      };
    }

    try {

      video.load();

    } catch (_) {}

    setStatus(
      "Your AI fashion video is ready and saved automatically to your Video Folder.",
      "success"
    );
  }

  /*
  =========================================================
  RUNWAY STATUS POLLING
  =========================================================
  */

  async function pollVideoStatus(
    taskId,
    token
  ) {

    if (
      !taskId ||
      !token
    ) {

      return;
    }

    state.currentTaskId =
      taskId;

    state.pollingBusy =
      false;

    if (
      state.pollingTimer
    ) {

      clearInterval(
        state.pollingTimer
      );
    }

    const check =
      async () => {

        if (
          state.pollingBusy
        ) {

          return;
        }

        state.pollingBusy =
          true;

        try {

          const response =
            await fetch(
              `/api/video-status?taskId=${encodeURIComponent(taskId)}`,
              {
                method:"GET",
                cache:"no-store",

                headers:{
                  Accept:
                    "application/json",

                  Authorization:
                    `Bearer ${token}`
                }
              }
            );

          const data =
            await response.json();

          updateGeneratingCard(
            data?.progress ?? 0,
            data?.status || "PENDING"
          );

          if (
            !response.ok
          ) {

            throw new Error(
              getResponseMessage(
                data,
                "Unable to check video status."
              )
            );
          }

          if (
            data?.status ===
              "SUCCEEDED" &&
            data?.videoUrl
          ) {

            if (
              state.pollingTimer
            ) {

              clearInterval(
                state.pollingTimer
              );

              state.pollingTimer =
                null;
            }

            state.pollingBusy =
              false;

            showVideo(
              data.videoUrl
            );

            if (typeof window.obitrendRefreshVideoGallery === "function") {
              window.obitrendRefreshVideoGallery();
            }

            const generate =
              document.getElementById(
                "obVideoGenerateBtn"
              );

            if (generate) {

              generate.disabled =
                false;
            }

            await loadVideoCredits();

            return;
          }

          if (
            data?.status === "FAILED" ||
            data?.status === "CANCELED"
          ) {

            if (
              state.pollingTimer
            ) {

              clearInterval(
                state.pollingTimer
              );

              state.pollingTimer =
                null;
            }

            state.pollingBusy =
              false;

            const generate =
              document.getElementById(
                "obVideoGenerateBtn"
              );

            if (generate) {

              generate.disabled =
                false;
            }

            const failure =
              getResponseMessage(
                data,
                "The video could not be generated. Your video seconds were returned."
              );

            setStatus(
              failure,
              "error"
            );

            await loadVideoCredits();

            return;
          }

          setStatus(
            "Runway is creating your fashion video…"
          );

        } catch (error) {

          console.warn(
            "OBITREND video status:",
            getReadableMessage(
              error,
              "Unable to check video status."
            )
          );

          setStatus(
            friendlyVideoMessage(
              error,
              "Unable to check video status. Please check your internet connection and try again."
            ),
            "error"
          );

        } finally {

          state.pollingBusy =
            false;
        }
      };

    await check();

    if (
      !state.pollingTimer
    ) {

      state.pollingTimer =
        setInterval(
          check,
          5000
        );
    }
  }

  /*
  =========================================================
  RESOLVE VIDEO REFERENCE IMAGE
  =========================================================
  Browser blob: URLs cannot be sent to the server because
  they only exist inside the current browser session.
  Convert them to image data before starting video generation.
  =========================================================
  */

  async function resolveVideoReferenceImage(imageUrl) {
    const src = normaliseImageSource(imageUrl);
    if (!src) return "";

    if (!src.startsWith("blob:")) {
      return src;
    }

    const response = await fetch(src);
    if (!response.ok) {
      throw new Error("The selected fashion image could not be prepared for video generation.");
    }

    const blob = await response.blob();

    if (!blob.type || !blob.type.startsWith("image/")) {
      throw new Error("The selected fashion image is not a supported image.");
    }

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("The selected fashion image could not be prepared."));
      reader.readAsDataURL(blob);
    });

    if (!dataUrl.startsWith("data:image/")) {
      throw new Error("The selected fashion image could not be converted.");
    }

    return dataUrl;
  }

  /*
  =========================================================
  NORMALIZE RUNWAY REFERENCE ASPECT RATIO
  =========================================================
  Runway requires the prompt image aspect ratio to stay between
  0.5 and 4.0. Preserve the complete uploaded/generated image
  by fitting it inside the nearest supported boundary instead
  of cropping the garment or changing the selected video ratio.
  =========================================================
  */

  async function normalizeVideoReferenceAspect(imageUrl) {
    const src = normaliseImageSource(imageUrl);
    if (!src) return "";

    const dimensions = await new Promise(resolve => {
      const img = new Image();
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      img.onload = () => finish({
        width: img.naturalWidth || 0,
        height: img.naturalHeight || 0
      });
      img.onerror = () => finish(null);
      if (src.startsWith("http://") || src.startsWith("https://")) {
        img.crossOrigin = "anonymous";
      }
      img.src = src;
    });

    if (!dimensions?.width || !dimensions?.height) return src;

    const aspect = dimensions.width / dimensions.height;
    if (aspect >= 0.5 && aspect <= 4) return src;

    const targetAspect = aspect < 0.5 ? 0.5 : 4;
    const canvas = document.createElement("canvas");
    let canvasWidth = dimensions.width;
    let canvasHeight = Math.round(canvasWidth / targetAspect);

    if (canvasHeight < dimensions.height) {
      canvasHeight = dimensions.height;
      canvasWidth = Math.round(canvasHeight * targetAspect);
    }

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("The selected fashion image could not be prepared for video generation.");
    }

    ctx.fillStyle = "#111111";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const x = Math.round((canvasWidth - dimensions.width) / 2);
    const y = Math.round((canvasHeight - dimensions.height) / 2);
    const img = new Image();
    if (src.startsWith("http://") || src.startsWith("https://")) {
      img.crossOrigin = "anonymous";
    }

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("The selected fashion image could not be prepared for video generation."));
      img.src = src;
    });

    ctx.drawImage(img, x, y, dimensions.width, dimensions.height);

    const normalized = canvas.toDataURL("image/jpeg", 0.94);
    if (!normalized.startsWith("data:image/")) {
      throw new Error("The selected fashion image could not be converted.");
    }

    return normalized;
  }

  /*
  =========================================================
  GENERATE VIDEO
  =========================================================
  */

  async function generateVideo() {

    const generate =
      document.getElementById(
        "obVideoGenerateBtn"
      );

    const promptBox =
      document.getElementById(
        "obVideoPrompt"
      );

    if (generate) {

      generate.disabled =
        true;
    }

    setStatus(
      "Preparing your fashion reference…"    );

    try {

      const token =
        await getToken();

      let imageUrl =
        getLatestGeneratedImage();

      if (!imageUrl) {

        throw new Error(
          "Upload an image or generate a fashion image, then create the video."
        );
      }

      imageUrl = await resolveVideoReferenceImage(imageUrl);
      imageUrl = await normalizeVideoReferenceAspect(imageUrl);

      const validReference =
        await validateReferenceImage(
          imageUrl
        );

      if (
        !validReference
      ) {

        throw new Error(
          "The selected fashion image cannot be used as a video reference. Please generate a new fashion image."
        );
      }

      const videoRatio =
        await getVideoRatio(
          imageUrl
        );

      const duration =
        state.selectedDuration;

      const prompt =
        (
          promptBox?.value ||
          defaultPrompt()
        ).trim();

      const musicRegion = state.musicRegion || "auto";
      const cameraStyle = state.cameraStyle || "AI Smart Camera";
      const musicStyle = state.musicStyle || "regional";
      const musicSelect = document.getElementById("obVideoMusicStyle");
      const selectedMusicLabel = musicSelect?.selectedOptions?.[0]?.textContent || "Auto regional soundtrack";

      if (!prompt) {

        throw new Error(
          "Please enter a video prompt."        );
      }

      showGeneratingCard(0, "PENDING");

      setStatus(
        "Sending your fashion video to Runway…"
      );

      const response =
        await fetch(
          "/api/generate-video",
          {
            method:"POST",

            headers:{
              "Content-Type":
                "application/json",

              Accept:
                "application/json",

              Authorization:
                `Bearer ${token}`
            },

            body:
              JSON.stringify({
                prompt,
                imageUrl,
                duration,
                ratio:
                  videoRatio,
                musicRegion,
                musicStyle,
                musicLabel: selectedMusicLabel,
                cameraStyle
              })
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        data?.success !== true
      ) {

        const failureMessage =
          getResponseMessage(
            data,
            ""
          );

        const generationError = new Error(
          failureMessage ||
          "Runway rejected the video request. Your video seconds were returned."
        );
        generationError.status = response.status;
        throw generationError;
      }

      if (
        !data.taskId
      ) {

        throw new Error(
          "The video task could not be started."
        );
      }

      state.currentTaskId =
        data.taskId;

      setStatus(
        "Runway is creating your fashion video…"
      );

      await pollVideoStatus(
        data.taskId,
        token
      );

    } catch (error) {

      console.warn(
        "OBITREND video generation:",
        getReadableMessage(
          error,
          "Unable to generate the video."
        )
      );

      hideGeneratingCard();

      const userMessage = friendlyVideoMessage(error);

      setStatus(
        userMessage,
        "error"
      );

      if (generate) {

        generate.disabled =
          false;
      }

      await loadVideoCredits();
    }
  }

  /*
  =========================================================
  OPEN VIDEO UI
  =========================================================
  */

  function openVideoUI() {

    const overlay =
      getOverlay();

    if (!overlay) {
      return;
    }

    overlay.classList.add(
      "show"
    );

    loadVideoCredits();

    /*
      If the user uploaded an image in this video screen, keep it as
      the active reference. Otherwise use the latest generated image.
    */
    const generated = state.uploadedReferenceImage
      ? state.uploadedReferenceImage
      : getLatestGeneratedImage();

    if (generated) {
      if (!state.uploadedReferenceImage) {
        rememberGeneratedFashionImage(generated);
      }

      const thumb = document.getElementById("obVideoReferenceThumb");
      const referenceText = document.getElementById("obVideoReferenceText");
      const referenceTitle = document.getElementById("obVideoReferenceTitle");

      if (thumb) {
        thumb.src = generated;
        thumb.style.display = "block";
      }

      if (referenceTitle) {
        referenceTitle.innerHTML =
          state.uploadedReferenceImage
            ? 'Uploaded Image <span class="ob-check">✓</span>'
            : 'Generated Image <span class="ob-check">✓</span>';
      }

      if (referenceText) {
        referenceText.textContent =
          state.uploadedReferenceImage
            ? "Uploaded image selected as the video reference."
            : "Latest generated fashion image selected as the video reference.";
      }
    }

    setStatus(
      "Ready to create your fashion video."
    );
  }

  /*
  =========================================================
  CLOSE VIDEO UI
  =========================================================
  */

  function closeVideoUI() {

    const overlay =
      getOverlay();

    if (!overlay) {
      return;
    }

    overlay.classList.remove(
      "show"
    );
  }

  /*
  =========================================================
  BUILD UI
  =========================================================
  */


  function buildUI() {
    if (document.getElementById("obitrendVideoLauncher")) return;
    addStyles();

    const svg = (body, cls="") => '<svg class="' + cls + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>';
    const icon = (body, cls="") => el("span",{class:cls,html:svg(body)});

    const cameraFallback = (kind) => {
      const label = kind === "canon" ? "CANON" : kind === "fuji" ? "FUJIFILM" : "NIKON";
      return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 420">' +
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#303238"/><stop offset="1" stop-color="#0d0e11"/></linearGradient></defs>' +
        '<rect width="700" height="420" rx="28" fill="url(#g)"/>' +
        '<rect x="120" y="105" width="360" height="220" rx="36" fill="#17191d" stroke="#686b73" stroke-width="8"/>' +
        '<path d="M180 105l28-55h155l38 55" fill="#202227" stroke="#777a82" stroke-width="8"/>' +
        '<circle cx="365" cy="215" r="92" fill="#0a0b0e" stroke="#8c8f97" stroke-width="12"/>' +
        '<circle cx="365" cy="215" r="58" fill="#252a31" stroke="#5d626c" stroke-width="8"/>' +
        '<circle cx="365" cy="215" r="30" fill="#15181d"/>' +
        '<text x="145" y="365" fill="#f5f5f7" font-family="Arial,sans-serif" font-size="34" font-weight="700">'+label+'</text>' +
        '</svg>'
      );
    };

    const musicFallback = (kind) => {
      const labels = {auto:"AUTO",afrobeats:"AFROBEATS",amapiano:"AMAPIANO",hiphop:"HIP-HOP",rnb:"R&amp;B",chill:"CHILL",classical:"CLASSICAL"};
      const hues = {auto:"#6d28d9",afrobeats:"#c2410c",amapiano:"#a16207",hiphop:"#111827",rnb:"#92400e",chill:"#075985",classical:"#312e81"};
      const bg = hues[kind] || hues.auto;
      return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 320">' +
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="'+bg+'"/><stop offset="1" stop-color="#111113"/></linearGradient></defs>' +
        '<rect width="500" height="320" rx="24" fill="url(#g)"/>' +
        '<circle cx="250" cy="150" r="82" fill="rgba(255,255,255,.08)" stroke="#f3d36a" stroke-width="5"/>' +
        '<path d="M278 92v105c0 22-19 39-43 39s-43-13-43-31 19-31 43-31c10 0 19 2 27 6V92z" fill="#fff"/>' +
        '<text x="250" y="292" text-anchor="middle" fill="#fff" font-family="Arial,sans-serif" font-size="25" font-weight="700">'+labels[kind]+'</text>' +
        '</svg>'
      );
    };

    const cameraArt = (kind) => {
      const images = {
        canon:"https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=700&q=90",
        fuji:"https://beafoto.pl/userdata/public/gfx/75033.jpg",
        nikon:"https://images.unsplash.com/photo-1512790182412-b19e6d62bc39?auto=format&fit=crop&w=700&q=90"
      };
      const src = images[kind] || images.nikon;
      return '<img class="camera-photo-art" src="'+src+'" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src=\''+cameraFallback(kind)+'\';">';    };

    const musicArt = (kind) => {
      const images = {
        auto:"https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=500&q=85",
        afrobeats:"https://images.unsplash.com/photo-1519892300165-cb5542fb47c7?auto=format&fit=crop&w=500&q=85",
        amapiano:"https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?auto=format&fit=crop&w=500&q=85",
        hiphop:"https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=500&q=85",
        rnb:"https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=500&q=85",
        chill:"https://images.unsplash.com/photo-1507525428034-b723cf961d3b?auto=format&fit=crop&w=500&q=85",
        classical:"https://images.unsplash.com/photo-1460039230329-eb070fc6c9a7?auto=format&fit=crop&w=500&q=85"
      };
      const src=images[kind]||images.auto;
      return '<img class="music-photo-art" src="'+src+'" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src=\''+musicFallback(kind)+'\';">';
    };

    const launcher=el("button",{id:"obitrendVideoLauncher",type:"button",text:"AI Video"});
    launcher.addEventListener("click",openVideoUI);
    document.body.appendChild(launcher);

    const overlay=el("div",{id:"obitrendVideoOverlay"});
    const modal=el("div",{class:"ob-video-modal"});

    const close=null;
    const back=el("button",{id:"obVideoBackBtn",class:"ob-video-back",type:"button",text:"← Back",ariaLabel:"Back to dashboard"});
    back.addEventListener("click",closeVideoUI);

    modal.appendChild(el("div",{class:"ob-video-head"},[
      el("div",{class:"ob-video-brand"},[
        back,
        el("div",{class:"ob-video-icon",html:svg('<path d="M4 8h16v11H4z" fill="#2b2c30"/><path d="M4 8l3-4h10l3 4" fill="#17181b"/><path d="M8 12h8M8 15h8" stroke="#d8d9dc"/>')}),
        el("div",{},[
          el("h2",{html:"AI Fashion <span>Video</span>"}),
          el("p",{text:"Turn your generated fashion image into a premium video."})
        ])
      ])
    ]));

    const uploadInput=el("input",{id:"obVideoUploadInput",class:"ob-video-upload",type:"file",accept:"image/*"});
    document.body.appendChild(uploadInput);

    const uploadLabel=el("label",{class:"ob-video-upload-btn",for:"obVideoUploadInput"},[
      el("span",{class:"ob-plus",text:"+"}),el("span",{text:"Upload image"})
    ]);
    const uploadHint=el("span",{class:"ob-video-upload-hint",text:"Use generated image or upload your own"});

    const referenceCard=el("div",{class:"ob-video-reference"},[
      el("img",{id:"obVideoReferenceThumb",class:"ob-video-reference-thumb",alt:"Uploaded Image"}),
      el("div",{class:"ob-video-reference-copy"},[
        el("strong",{id:"obVideoReferenceTitle",html:'Uploaded Image <span class="ob-check">✓</span>'}),
        el("div",{class:"ob-video-file-name",id:"obVideoFileName",text:"image.jpg"}),
        el("div",{class:"ob-video-file-size",id:"obVideoFileSize",text:"1.2 MB"})
      ]),
      el("label",{class:"ob-video-change",for:"obVideoUploadInput",html:svg('<path d="M20 11a8 8 0 0 0-14-5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14 5l2-2"/><path d="M20 20v-4h-4"/>') + '<span>Change</span>'})
    ]);

    const createCard=el("div",{class:"ob-video-create-card"},[
      el("div",{class:"ob-video-upload-row"},[uploadLabel,uploadHint]),
      referenceCard
    ]);

    uploadInput.addEventListener("change",event=>{
      const file=event.target.files?.[0];
      if(!file) return;
      if(!file.type.startsWith("image/")){setStatus("Please choose an image file.","error");return;}
      if(file.size>15*1024*1024){setStatus("Image is too large. Please choose an image under 15MB.","error");return;}
      const reader=new FileReader();      reader.onload=()=>{
        const src=String(reader.result||"");
        state.uploadedReferenceImage=src;
        const thumb=document.getElementById("obVideoReferenceThumb");
        const title=document.getElementById("obVideoReferenceTitle");
        const name=document.getElementById("obVideoFileName");
        const size=document.getElementById("obVideoFileSize");
        if(thumb){thumb.src=src;thumb.style.display="block";}
        if(title) title.innerHTML='Uploaded Image <span class="ob-check">✓</span>';
        if(name) name.textContent=file.name;
        if(size) size.textContent=(file.size/(1024*1024)).toFixed(1)+" MB";
        setStatus("Uploaded image is ready. Add your creative prompt, select options, then create the video.","success");
      };
      reader.readAsDataURL(file);
    });
    modal.appendChild(createCard);

    const aiCard=el("div",{class:"ob-video-ai-card"},[
      el("div",{class:"ob-video-ai-head"},[
        el("div",{class:"ob-video-ai-title"},[
          el("span",{html:svg('<path d="M12 3l1.4 5.1L18 10l-4.6 1.9L12 17l-1.4-5.1L6 10l4.6-1.9L12 3Z"/><path d="M19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z"/>')}),
          el("strong",{text:"Create with AI"})
        ]),
        el("span",{class:"ob-video-ai-sub",text:"Tell it how to move"})
      ]),
      el("textarea",{id:"obVideoPrompt",class:"ob-video-prompt",placeholder:"Describe the motion, scene, camera movement, vibe, location, and anything else you want..."})
    ]);

    const aiChips=el("div",{class:"ob-video-ai-chips"},[
      el("button",{class:"ob-video-ai-chip",type:"button",html:svg('<path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z"/><path d="m19 14 .7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7L19 14Z"/>')+'<span>Example</span>'}),
      el("button",{class:"ob-video-ai-chip",type:"button",html:svg('<circle cx="12" cy="5" r="2.2"/><path d="M8 21l1.5-7L7 11l2-2 3 3 3-3 2 2-2.5 3 1.5 7"/><path d="M5 13l-2 3"/><path d="M19 13l2 3"/>')+'<span>Catwalk</span>'}),
      el("button",{class:"ob-video-ai-chip",type:"button",html:svg('<path d="M7 7h5V2"/><path d="M17 17h-5v5"/><path d="M7 7a7 7 0 0 1 12 4"/><path d="M17 17a7 7 0 0 1-12-4"/>')+'<span>Turn around</span>'}),
      el("button",{class:"ob-video-ai-chip",type:"button",html:svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.4"/><path d="m4 17 5-5 3 3 2-2 6 6"/>')+'<span>Lifestyle</span>'})
    ]);
    const aiPrompts=[
      "Create a premium fashion campaign video with elegant natural movement and professional camera motion.",
      "Slow confident catwalk movement with realistic fabric motion and a smooth fashion-camera tracking shot.",
      "Have the model slowly turn around while the camera makes a subtle cinematic orbit.",
      "Create a natural luxury lifestyle fashion scene with gentle movement and realistic environmental motion."
    ];
    aiChips.querySelectorAll(".ob-video-ai-chip").forEach((b,i)=>b.addEventListener("click",()=>{const p=document.getElementById("obVideoPrompt");if(p)p.value=aiPrompts[i];}));
    aiCard.appendChild(aiChips);
    modal.appendChild(aiCard);

    const cameraBox=el("div",{class:"ob-video-camera"},[
      el("div",{class:"ob-video-camera-head"},[
        el("div",{class:"ob-video-camera-title"},[
          icon('<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M7 7l2-3h6l2 3"/><circle cx="12" cy="13" r="3.5"/>',"camera-icon"),
          el("span",{text:"Camera Style"}),
          el("span",{class:"ob-video-pro-badge",text:"PRO"})
        ]),
        el("div",{class:"ob-video-pro-right",html:svg('<path d="m5 20 2-7 3 3 2-6 2 4 3-4 2 10H5Z"/><path d="M8 7c0 1.7-1 3-2.2 3C4.6 10 4 8.8 4 7c0-1.8.6-3 1.8-3S8 5.2 8 7Z"/>')+'<span>Pro users only</span>'})
      ]),
      el("div",{class:"ob-video-camera-grid"})
    ]);
    const cameraGrid=cameraBox.querySelector(".ob-video-camera-grid");
    [
      {id:"canon-r5m2",name:"Canon EOS R5 Mark II",desc:"45MP resolution, AI-powered tracking, 8K video.",kind:"canon"},
      {id:"fujifilm-gfx100sii",name:"Fujifilm GFX 100S II",desc:"100MP medium-format sensor for unmatched detail.",kind:"fuji"},
      {id:"nikon-z8",name:"Nikon Z8",desc:"Elite performance of the Z9 into a more manageable body.",kind:"nikon"}
    ].forEach(cam=>{
      const b=el("button",{class:"ob-video-camera-card locked",type:"button"},[
        el("span",{class:"camera-art",html:cameraArt(cam.kind)}),
        el("strong",{text:cam.name}),
        el("small",{text:cam.desc}),
        el("span",{class:"lock",html:svg('<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>')})
      ]);
      b.addEventListener("click",async()=>{
        try{
          const token=await getToken();
          const response=await fetch("/api/pro",{headers:{Accept:"application/json",Authorization:"Bearer "+token},cache:"no-store"});
          const data=await response.json().catch(()=>({}));
          const active=data?.active===true||data?.proActive===true;
          if(!active){setStatus("Camera Style is available to Pro users only.","error");return;}
          cameraGrid.querySelectorAll(".ob-video-camera-card").forEach(x=>x.classList.remove("selected"));
          b.classList.add("selected");
          state.cameraStyle=cam.name;
          setStatus(cam.name+" selected for your video camera rendering.","success");
        }catch{setStatus("Please sign in to verify Pro access.","error");}
      });
      cameraGrid.appendChild(b);
    });
    modal.appendChild(cameraBox);

    const musicSection=el("div",{class:"ob-video-music-section"});
    const regionSelect=el("select",{id:"obVideoMusicRegion",class:"ob-video-region"},[
      el("option",{value:"auto",text:"Region: Auto"}),
      el("option",{value:"west-africa",text:"Region: West Africa"}),
      el("option",{value:"east-africa",text:"Region: East Africa"}),
      el("option",{value:"southern-africa",text:"Region: Southern Africa"}),
      el("option",{value:"north-america",text:"Region: North America"}),
      el("option",{value:"latin-america",text:"Region: Latin America"}),
      el("option",{value:"europe",text:"Region: Europe"}),
      el("option",{value:"middle-east",text:"Region: Middle East"}),
      el("option",{value:"south-asia",text:"Region: South Asia"}),
      el("option",{value:"east-asia",text:"Region: East Asia"})
    ]);
    regionSelect.addEventListener("change",e=>state.musicRegion=e.target.value);
    musicSection.appendChild(el("div",{class:"ob-video-music-head"},[
      el("div",{class:"ob-video-music-title"},[
        icon('<path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>',"music-icon"),
        el("div",{},[el("b",{text:"Music"}),el("small",{text:"Choose background music for your video"})])
      ]),
      regionSelect
    ]));
    const musicGrid=el("div",{class:"ob-video-music-grid"});
    [
      {id:"regional",name:"Auto",art:"auto"},
      {id:"afrobeats",name:"Afrobeats",art:"afrobeats"},
      {id:"amapiano",name:"Amapiano",art:"amapiano"},
      {id:"hip-hop",name:"Hip-hop",art:"hiphop"},
      {id:"rnb",name:"R&B",art:"rnb"},
      {id:"chill",name:"Chill",art:"chill"},
      {id:"classical",name:"Classical",art:"classical"}
    ].forEach((music,i)=>{
      const option=el("button",{class:i===0?"ob-video-music-option selected":"ob-video-music-option",type:"button"},[
        el("span",{class:"ob-video-music-thumb",html:musicArt(music.art)}),
        el("span",{class:"ob-video-music-name",text:music.name})
      ]);
      option.addEventListener("click",()=>{
        musicGrid.querySelectorAll(".ob-video-music-option").forEach(x=>x.classList.remove("selected"));
        option.classList.add("selected");
        state.musicStyle=music.id;
      });
      musicGrid.appendChild(option);
    });
    musicSection.appendChild(musicGrid);
    modal.appendChild(musicSection);

    const durationSection=el("div",{class:"ob-video-duration-section"},[
      el("div",{class:"ob-video-duration-head"},[
        icon('<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',"clock-icon"),
        el("div",{},[el("b",{text:"Video Duration"}),el("small",{text:"Choose how long your video will be"})])
      ])
    ]);
    const durationGrid=el("div",{class:"ob-video-duration"});
    [{duration:5,price:"₦5,000"},{duration:10,price:"₦10,000"},{duration:15,price:"₦15,000"},{duration:20,price:"₦20,000"}].forEach(info=>{
      const button=el("button",{id:"obVideoPackage"+info.duration,class:info.duration===5?"ob-video-package selected":"ob-video-package",type:"button"},[
        el("strong",{text:info.duration+" Seconds"}),
        el("span",{text:"1 video credit • "+info.price}),
        el("span",{class:"radio"})
      ]);
      button.addEventListener("click",()=>selectDuration(info.duration));
      durationGrid.appendChild(button);
    });
    durationSection.appendChild(durationGrid);
    modal.appendChild(durationSection);

    const actions=el("div",{class:"ob-video-actions"},[
      el("button",{id:"obVideoBuyBtn",class:"ob-video-buy",type:"button",text:"Buy Video Credits"}),
      el("button",{id:"obVideoGenerateBtn",class:"ob-video-btn",type:"button",html:'<span class="sparkle">✦</span> Create Video <span class="arrow">→</span>'})
    ]);
    actions.querySelector("#obVideoBuyBtn").addEventListener("click",buyVideo);
    actions.querySelector("#obVideoGenerateBtn").addEventListener("click",generateVideo);
    modal.appendChild(actions);

    modal.appendChild(el("div",{id:"obitrendVideoStatus",class:"ob-video-status",text:"Image ready. Add your creative prompt, select options, then create the video."}));

    const generatingCard=el("div",{id:"obVideoGeneratingCard",class:"ob-video-generating-card","aria-live":"polite"},[
      el("div",{class:"ob-video-generating-head"},[
        el("div",{class:"ob-video-generating-icon",text:"✦"}),
        el("div",{class:"ob-video-generating-copy"},[
          el("strong",{id:"obVideoGeneratingTitle",text:"Creating your video"}),
          el("span",{id:"obVideoGeneratingDetail",text:"Preparing your reference image and motion direction…"})
        ]),
        el("b",{id:"obVideoGeneratingPercent",class:"ob-video-generating-percent",text:"25%"})
      ]),
      el("div",{class:"ob-video-generating-track"},[el("span")]),
      el("div",{class:"ob-video-generating-steps"},[
        el("div",{class:"ob-video-generating-step active",text:"Reference"}),
        el("div",{class:"ob-video-generating-step",text:"Motion"}),
        el("div",{class:"ob-video-generating-step",text:"Finalizing"})
      ])
    ]);
    modal.appendChild(generatingCard);

    const result=el("div",{id:"obitrendVideoResult",class:"ob-video-result"});
    result.appendChild(el("video",{id:"obitrendGeneratedVideo",controls:"controls",playsinline:"playsinline",preload:"metadata"}));
    result.appendChild(el("button",{id:"obVideoDownloadBtn",class:"ob-video-download",type:"button",text:"⬇️ Download Video"}));
    result.appendChild(el("div",{class:"ob-video-source",text:"Generated with OBITREND AI Fashion Creator."}));
    modal.appendChild(result);

    overlay.appendChild(modal);
    overlay.addEventListener("click",event=>{if(event.target===overlay) closeVideoUI();});
    document.body.appendChild(overlay);

    updateDurationUI();
    updateVideoBuyLabel();
  }

  /*
  =========================================================
  INITIALIZE
  =========================================================
  */

  function init() {

    window.obitrendOpenVideoStudio = openVideoUI;

    if (
      document.readyState ===
      "loading"
    ) {

      document.addEventListener(
        "DOMContentLoaded",
        () => {

          buildUI();

          setTimeout(async () => {
            await verifyReturnedVideoPayment();
            await reconcileVideoPayment();
          }, 1200);

        },
        {
          once:true
        }
      );

    } else {

      buildUI();

      setTimeout(async () => {
            await verifyReturnedVideoPayment();
            await reconcileVideoPayment();
          }, 1200);
    }
  }

  init();

})();