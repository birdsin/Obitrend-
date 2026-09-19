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
  - Generated-image-only reference protection
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
    uploadedReferenceImage: null,
    musicRegion: "auto",
    musicStyle: "regional"
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
      data.failureMessage ||
      data.message ||
      data.error ||
      data.details?.message ||
      data.details?.error ||
      data.data?.message ||
      data.data?.error,
      fallback
    );
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
      #obitrendVideoLauncher{display:none!important;}
      #obitrendVideoOverlay{position:fixed;inset:0;z-index:10000;display:none;align-items:flex-start;justify-content:center;padding:0;background:#07060c;overflow:auto;}
      #obitrendVideoOverlay.show{display:flex;}
      .ob-video-modal{position:relative;width:100%;min-height:100%;max-width:760px;box-sizing:border-box;padding:0 16px 28px;color:#f7f5fb;background:linear-gradient(180deg,#09080e 0%,#0b0910 48%,#08070c 100%);border:0;border-radius:0;box-shadow:none;overflow:visible;}
      .ob-video-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 0 12px;margin:0;}
      .ob-video-brand{display:flex;gap:10px;align-items:center;min-width:0;}
      .ob-video-icon{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;font-size:21px;color:#f7d76b;background:linear-gradient(145deg,#25202e,#14111b);border:1px solid rgba(244,211,106,.28);}
      .ob-video-head h2{margin:0;font-size:24px;line-height:1.05;font-weight:900;letter-spacing:-.8px;}.ob-video-head h2 span{color:#f4d36a;}
      .ob-video-head p{margin:5px 0 0;color:#8f8b98;font-size:11px;line-height:1.35;}.ob-video-close{width:42px;height:42px;border-radius:13px;color:#fff;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.11);font-size:25px;cursor:pointer;}
      .ob-video-create-card{padding:0;margin:0;background:transparent;border:0;box-shadow:none;}
      .ob-video-create-top{display:none;}
      .ob-video-reference{position:relative;display:block;min-height:360px;height:52vh;max-height:520px;padding:0;margin:0 0 28px;border-radius:26px;background:#030305;border:1px solid rgba(255,255,255,.12);overflow:hidden;}
      .ob-video-reference-thumb{width:100%;height:100%;border-radius:0;object-fit:contain;display:none;background:#fff;border:0;}
      .ob-video-reference-copy{position:absolute;left:16px;top:16px;z-index:2;display:block;}.ob-video-reference-copy strong{display:inline-block;padding:10px 15px;border-radius:22px;background:rgba(32,31,35,.92);border:1px solid rgba(255,255,255,.10);font-size:13px;font-weight:700;}.ob-video-reference-copy span{display:none;}
      .ob-video-upload-row{display:flex;align-items:center;gap:10px;margin:0 0 12px;}
      .ob-video-upload{display:none;}
      .ob-video-upload-btn{display:flex;align-items:center;justify-content:center;min-height:48px;padding:0 18px;border-radius:16px;color:#fff;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.12);font-size:14px;font-weight:700;cursor:pointer;}
      .ob-video-upload-name{color:#8e8996;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      .ob-video-music{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 22px;}
      .ob-video-select-wrap{display:flex;flex-direction:column;gap:7px;}.ob-video-select-wrap label{color:#8e8996;font-size:11px;}.ob-video-select{width:100%;min-height:50px;padding:0 12px;border-radius:15px;color:#fff;background:#111015;border:1px solid rgba(255,255,255,.11);outline:none;font:inherit;font-size:13px;}
      .ob-video-select:focus{border-color:rgba(244,211,106,.45);}
      .ob-video-prompt{width:100%;min-height:174px;resize:none;box-sizing:border-box;padding:16px 18px;margin:0 0 26px;border-radius:24px;outline:none;color:#fff;background:#0e0d13;border:1px solid rgba(255,255,255,.13);font:inherit;font-size:18px;line-height:1.45;overflow:auto;}
      .ob-video-prompt:focus{border-color:rgba(244,211,106,.42);box-shadow:none;}
      .ob-video-create-footer{display:flex;align-items:center;gap:8px;margin:0 0 24px;}.ob-video-hint{display:none;}
      .ob-video-generate{display:none;}
      .ob-video-wallet{display:none;}
      .ob-video-section{margin-top:0;}.ob-video-label{display:flex;align-items:center;justify-content:space-between;margin:0 0 12px;color:#8e8a96;font-size:13px;font-weight:500;letter-spacing:0;text-transform:uppercase;}.ob-video-label:after{content:"Choose one";text-transform:none;font-size:12px;color:#8e8a96;font-weight:400;}
      .ob-video-duration{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
      .ob-video-package{min-height:126px;padding:22px 24px;border-radius:25px;text-align:left;color:#fff;background:#111015;border:1px solid rgba(255,255,255,.10);cursor:pointer;transition:.18s ease;}
      .ob-video-package:hover{border-color:rgba(244,211,106,.35);}.ob-video-package.selected{background:linear-gradient(145deg,#211a32,#17131e);border-color:#d9bb59;box-shadow:0 0 0 1px rgba(244,211,106,.08);}
      .ob-video-package strong{display:block;font-size:20px;font-weight:500;}.ob-video-package span{display:block;margin-top:9px;color:#8e8996;font-size:13px;}
      .ob-video-actions{display:grid;grid-template-columns:1fr;gap:16px;margin-top:28px;}
      .ob-video-buy,.ob-video-btn{min-height:74px;border-radius:26px;font-size:18px;font-weight:500;cursor:pointer;}
      .ob-video-buy{color:#16100a;background:linear-gradient(145deg,#ffe48b,#f0c84d);border:0;box-shadow:0 12px 32px rgba(244,211,106,.12);}
      #obVideoGenerateAltBtn{color:#fff;background:linear-gradient(135deg,#6d22ef,#7735ee);border:0;font-size:19px;}
      .ob-video-status{min-height:24px;margin-top:18px;text-align:center;color:#7bd99d;font-size:14px;line-height:1.45;}
      .ob-video-result{display:none;margin-top:18px;}.ob-video-result.show{display:block;}.ob-video-result video{width:100%;display:block;border-radius:20px;background:#000;border:1px solid rgba(255,255,255,.10);}
      .ob-video-download{width:100%;min-height:52px;margin-top:10px;border-radius:15px;color:#fff;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);font-weight:800;cursor:pointer;}
      .ob-video-source{margin-top:8px;color:#666270;font-size:9px;text-align:center;}
      @media(max-width:560px){#obitrendVideoOverlay{padding:0;align-items:flex-start;}.ob-video-modal{max-width:none;padding:0 16px 28px;}.ob-video-reference{height:440px;min-height:360px;}.ob-video-prompt{min-height:210px;font-size:18px;}.ob-video-duration{grid-template-columns:1fr 1fr;gap:16px;}.ob-video-package{min-height:126px;padding:20px 24px;}.ob-video-actions{gap:16px;}}
      @media(min-width:561px){.ob-video-modal{padding-left:32px;padding-right:32px;}.ob-video-reference{height:520px;}}
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

      const response =
        await fetch(
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

    if (state.uploadedReferenceImage) {
      return state.uploadedReferenceImage;
    }

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
        isRawUploadImage(src)
      ) {
        return;
      }

      if (
        !candidates.includes(src)
      ) {

        candidates.push(src);
      }
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

    [
      "obitrend_latest_generated_image",
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

    // If no generated image exists yet, use the uploaded image as the visual reference.
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

      "Create a premium photorealistic fashion campaign video " +
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

        if (
          isRawUploadImage(src)
        ) {

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

          const aspect =
            width / height;

          if (
            aspect < 0.5 ||
            aspect > 2
          ) {

            finish(false);

            return;
          }

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
              "Content-Type":
                "application/json",

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

      download.onclick = () => {

        const link =
          document.createElement(
            "a"
          );

        link.href =
          videoUrl;

        link.download =
          "obitrend-ai-fashion-video.mp4";

        link.target =
          "_blank";

        document.body.appendChild(
          link
        );

        link.click();

        link.remove();
      };
    }

    try {

      video.load();

    } catch (_) {}

    setStatus(
      "Your AI fashion video is ready.",
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
      "Preparing your fashion reference…"
    );

    try {

      const token =
        await getToken();

      const imageUrl =
        state.uploadedReferenceImage ||
        getLatestGeneratedImage();

      if (!imageUrl) {

        throw new Error(
          "Generate a fashion image first, then create the video."
        );
      }

      if (
        isRawUploadImage(
          imageUrl
        )
      ) {

        throw new Error(
          "Please generate a clean fashion image before creating the video."
        );
      }

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
      const musicStyle = state.musicStyle || "regional";
      const musicSelect = document.getElementById("obVideoMusicStyle");
      const selectedMusicLabel = musicSelect?.selectedOptions?.[0]?.textContent || "Auto regional soundtrack";

      if (!prompt) {

        throw new Error(
          "Please enter a video prompt."
        );
      }

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
                musicLabel: selectedMusicLabel
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

        throw new Error(
          failureMessage ||
          "Runway rejected the video request. Your video seconds were returned."
        );
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

      setStatus(
        getReadableMessage(
          error,
          "Unable to generate the video."
        ),
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

    const generated =
      state.uploadedReferenceImage ||
      getLatestGeneratedImage();

    if (
      generated &&
      !isRawUploadImage(generated)
    ) {

      rememberGeneratedFashionImage(
        generated
      );

      const thumb = document.getElementById("obVideoReferenceThumb");
      const referenceText = document.getElementById("obVideoReferenceText");

      if (thumb) {
        thumb.src = generated;
        thumb.style.display = "block";
      }

      const referenceTitle = document.getElementById("obVideoReferenceTitle");
      if (referenceTitle) referenceTitle.textContent = isRawUploadImage(generated) ? "Uploaded Image" : "Generated Image";
      if (referenceText) referenceText.textContent = isRawUploadImage(generated) ? "Uploaded image selected as the visual reference." : "Latest generated fashion image selected as the video reference.";
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

    const launcher=el("button",{id:"obitrendVideoLauncher",type:"button",text:"AI Video"});
    launcher.addEventListener("click",openVideoUI);
    document.body.appendChild(launcher);

    const overlay=el("div",{id:"obitrendVideoOverlay"});
    const modal=el("div",{class:"ob-video-modal"});

    const close=el("button",{class:"ob-video-close",type:"button",text:"×"});
    close.addEventListener("click",closeVideoUI);

    modal.appendChild(el("div",{class:"ob-video-head"},[
      el("div",{class:"ob-video-brand"},[
        el("div",{class:"ob-video-icon",text:"🎬"}),
        el("div",{},[
          el("h2",{html:"AI Fashion <span>Video</span>"}),
          el("p",{text:"Turn your generated fashion image into a premium video."})
        ])
      ]),
      close
    ]));

    const createCard=el("div",{class:"ob-video-create-card"},[
      el("div",{class:"ob-video-upload-row"},[
        el("label",{class:"ob-video-upload-btn",html:"＋ Upload image"}),
        el("span",{id:"obVideoUploadName",class:"ob-video-upload-name",text:"Use generated image or upload your own"})
      ]),
      el("div",{class:"ob-video-reference"},[
        el("img",{id:"obVideoReferenceThumb",class:"ob-video-reference-thumb",alt:"Uploaded image"}),
        el("div",{class:"ob-video-reference-copy"},[
          el("strong",{id:"obVideoReferenceTitle",text:"Uploaded Image"}),
          el("span",{id:"obVideoReferenceText",text:"Latest generated fashion image selected as the video reference."})
        ])
      ]),
      el("textarea",{id:"obVideoPrompt",class:"ob-video-prompt",placeholder:"Tell it how to move"}),
      el("div",{class:"ob-video-create-footer"})
    ]);
    const uploadInput=el("input",{id:"obVideoUploadInput",class:"ob-video-upload",type:"file",accept:"image/*"});
    document.body.appendChild(uploadInput);
    createCard.querySelector(".ob-video-upload-btn").htmlFor="obVideoUploadInput";
    const uploadLabel=createCard.querySelector(".ob-video-upload-btn");
    uploadLabel.setAttribute("for","obVideoUploadInput");
    uploadInput.addEventListener("change",event=>{
      const file=event.target.files?.[0];
      if(!file) return;
      if(!file.type.startsWith("image/")){setStatus("Please choose an image file.","error");return;}
      if(file.size>15*1024*1024){setStatus("Image is too large. Please choose an image under 15MB.","error");return;}
      const reader=new FileReader();
      reader.onload=()=>{
        const src=String(reader.result||"");
        state.uploadedReferenceImage=src;
        const thumb=document.getElementById("obVideoReferenceThumb");
        const title=document.getElementById("obVideoReferenceTitle");
        const text=document.getElementById("obVideoReferenceText");
        const name=document.getElementById("obVideoUploadName");
        if(thumb){thumb.src=src;thumb.style.display="block";}
        if(title) title.textContent="Uploaded Image";
        if(text) text.textContent="Your uploaded image will be used as the video reference.";
        if(name) name.textContent=file.name;
        setStatus("Image ready. Add your creative prompt, then create the video.","success");
      };
      reader.readAsDataURL(file);
    });

    modal.appendChild(createCard);

    const musicBox=el("div",{class:"ob-video-music"},[
      el("div",{class:"ob-video-select-wrap"},[
        el("label",{text:"REGION"}),
        el("select",{id:"obVideoMusicRegion",class:"ob-video-select"},[
          el("option",{value:"auto",text:"Auto region"}),
          el("option",{value:"west-africa",text:"West Africa"}),
          el("option",{value:"east-africa",text:"East Africa"}),
          el("option",{value:"southern-africa",text:"Southern Africa"}),
          el("option",{value:"north-america",text:"North America"}),
          el("option",{value:"latin-america",text:"Latin America"}),
          el("option",{value:"europe",text:"Europe"}),
          el("option",{value:"middle-east",text:"Middle East"}),
          el("option",{value:"south-asia",text:"South Asia"}),
          el("option",{value:"east-asia",text:"East Asia"})
        ])
      ]),
      el("div",{class:"ob-video-select-wrap"},[
        el("label",{text:"MUSIC 🎵"}),
        el("select",{id:"obVideoMusicStyle",class:"ob-video-select"},[
          el("option",{value:"regional",text:"Auto regional soundtrack"}),
          el("option",{value:"afrobeats",text:"Afrobeats"}),
          el("option",{value:"amapiano",text:"Amapiano"}),
          el("option",{value:"highlife",text:"Highlife"}),
          el("option",{value:"bongo-flava",text:"Bongo Flava"}),
          el("option",{value:"rnb",text:"R&B"}),
          el("option",{value:"pop",text:"Pop"}),
          el("option",{value:"hip-hop",text:"Hip-hop"}),
          el("option",{value:"reggaeton",text:"Reggaeton"}),
          el("option",{value:"latin-pop",text:"Latin pop"}),
          el("option",{value:"uk-garage",text:"UK garage"}),
          el("option",{value:"arabic-pop",text:"Arabic pop"}),
          el("option",{value:"desi-pop",text:"Desi pop"}),
          el("option",{value:"k-pop",text:"K-pop"}),
          el("option",{value:"instrumental",text:"Cinematic instrumental"})
        ])
      ])
    ]);
    musicBox.querySelector("#obVideoMusicRegion").addEventListener("change",e=>{state.musicRegion=e.target.value;});
    musicBox.querySelector("#obVideoMusicStyle").addEventListener("change",e=>{state.musicStyle=e.target.value;});
    modal.appendChild(musicBox);

    const durationSection=el("div",{class:"ob-video-section"});
    durationSection.appendChild(el("label",{class:"ob-video-label",text:"VIDEO LENGTH"}));
    const durationGrid=el("div",{class:"ob-video-duration"});
    [{duration:5,price:"₦5,000"},{duration:10,price:"₦10,000"}].forEach(info=>{
      const button=el("button",{id:`obVideoPackage${info.duration}`,class:info.duration===5?"ob-video-package selected":"ob-video-package",type:"button"},[
        el("strong",{text:`${info.duration} Seconds`}),
        el("span",{text:`1 video credit • ${info.price}`})
      ]);
      button.addEventListener("click",()=>selectDuration(info.duration));
      durationGrid.appendChild(button);
    });
    durationSection.appendChild(durationGrid);
    modal.appendChild(durationSection);

    const actions=el("div",{class:"ob-video-actions"},[
      el("button",{id:"obVideoBuyBtn",class:"ob-video-btn ob-video-buy",type:"button",text:"💳 Buy 5 Seconds — ₦5,000"}),
      el("button",{id:"obVideoGenerateAltBtn",class:"ob-video-btn ob-video-buy",type:"button",text:"✨ Create Video"})
    ]);
    actions.querySelector("#obVideoBuyBtn").addEventListener("click",buyVideo);
    actions.querySelector("#obVideoGenerateAltBtn").addEventListener("click",generateVideo);
    modal.appendChild(actions);

    modal.appendChild(el("div",{id:"obitrendVideoStatus",class:"ob-video-status",text:"Image ready. Add your creative prompt, then create the video."}));

    const result=el("div",{id:"obitrendVideoResult",class:"ob-video-result"});
    result.appendChild(el("video",{id:"obitrendGeneratedVideo",controls:"controls",playsinline:"playsinline",preload:"metadata"}));
    result.appendChild(el("button",{id:"obVideoDownloadBtn",class:"ob-video-download",type:"button",text:"⬇️ Download Video"}));
    result.appendChild(el("div",{class:"ob-video-source",text:"Generated with OBITREND AI Fashion Creator."}));
    modal.appendChild(result);

    overlay.appendChild(modal);
    overlay.addEventListener("click",event=>{if(event.target===overlay) closeVideoUI();});
    document.body.appendChild(overlay);

    const prompt=document.getElementById("obVideoPrompt");
    if(prompt) prompt.value=defaultPrompt();

    updateDurationUI();
  }

  /*
  =========================================================
  INITIALIZE
  =========================================================
  */

  function init() {

    if (
      document.readyState ===
      "loading"
    ) {

      document.addEventListener(
        "DOMContentLoaded",
        () => {

          buildUI();

          setTimeout(
            verifyReturnedVideoPayment,
            1200
          );

        },
        {
          once:true
        }
      );

    } else {

      buildUI();

      setTimeout(
        verifyReturnedVideoPayment,
        1200
      );
    }
  }

  init();

})();
