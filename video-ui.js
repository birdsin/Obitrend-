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
    currentVideoUrl: null
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

      #obitrendVideoLauncher{
        position:fixed;
        right:16px;
        bottom:92px;
        z-index:9999;
        min-height:54px;
        padding:0 18px;
        border-radius:18px;
        color:#fff;
        font-weight:900;
        letter-spacing:.2px;
        background:
          linear-gradient(
            135deg,
            #8b4dff,
            #5422c8
          );
        border:1px solid
          rgba(255,255,255,.2);
        box-shadow:
          0 18px 50px rgba(0,0,0,.5),
          0 0 30px rgba(139,77,255,.25);
        cursor:pointer;
        display:block;
        visibility:visible;
        opacity:1;
      }

      #obitrendVideoOverlay{
        position:fixed;
        inset:0;
        z-index:10000;
        display:none;
        align-items:center;
        justify-content:center;
        padding:18px;
        background:rgba(2,2,5,.78);
        backdrop-filter:blur(18px);
      }

      #obitrendVideoOverlay.show{
        display:flex;
      }

      .ob-video-modal{
        width:min(620px,100%);
        max-height:92vh;
        overflow:auto;
        border-radius:28px;
        padding:22px;
        background:
          linear-gradient(
            145deg,
            rgba(20,17,30,.98),
            rgba(7,7,12,.98)
          );
        border:1px solid
          rgba(244,211,106,.25);
        box-shadow:
          0 35px 100px rgba(0,0,0,.75);
      }

      .ob-video-head{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        margin-bottom:18px;
      }

      .ob-video-head h2{
        margin:0;
        font-size:22px;
        font-weight:950;
      }

      .ob-video-head p{
        margin-top:5px;
        color:#aaa5b5;
        font-size:11px;
      }

      .ob-video-close{
        width:42px;
        height:42px;
        flex:0 0 auto;
        border-radius:13px;
        color:#fff;
        background:rgba(255,255,255,.07);
        border:1px solid
          rgba(255,255,255,.1);
        font-size:20px;
        cursor:pointer;
      }

      .ob-video-wallet{
        display:grid;
        grid-template-columns:
          repeat(2,minmax(0,1fr));
        gap:10px;
        margin-bottom:16px;
      }

      .ob-video-wallet-card{
        padding:15px;
        border-radius:17px;
        background:
          linear-gradient(
            145deg,
            rgba(139,77,255,.15),
            rgba(255,255,255,.035)
          );
        border:1px solid
          rgba(255,255,255,.1);
      }

      .ob-video-wallet-card small{
        display:block;
        color:#aaa5b5;
        font-size:10px;
        margin-bottom:5px;
      }

      .ob-video-wallet-card strong{
        font-size:23px;
      }

      .ob-video-section{
        margin-top:14px;
      }

      .ob-video-label{
        display:block;
        margin-bottom:7px;
        color:#c8c3cf;
        font-size:11px;
        font-weight:800;
      }

      .ob-video-duration{
        display:grid;
        grid-template-columns:
          repeat(2,minmax(0,1fr));
        gap:10px;
      }

      .ob-video-package{
        padding:15px;
        border-radius:17px;
        text-align:left;
        color:#fff;
        background:rgba(255,255,255,.045);
        border:1px solid
          rgba(255,255,255,.11);
        cursor:pointer;
      }

      .ob-video-package.selected{
        background:
          linear-gradient(
            135deg,
            rgba(139,77,255,.28),
            rgba(244,211,106,.08)
          );
        border-color:
          rgba(244,211,106,.45);
      }

      .ob-video-package strong{
        display:block;
        font-size:17px;
      }

      .ob-video-package span{
        display:block;
        margin-top:5px;
        color:#a9a5b5;
        font-size:10px;
      }

      .ob-video-prompt{
        width:100%;
        min-height:105px;
        resize:vertical;
        padding:13px;
        border-radius:15px;
        outline:none;
        color:#fff;
        background:
          linear-gradient(
            145deg,
            rgba(28,27,36,.96),
            rgba(11,11,17,.96)
          );
        border:1px solid
          rgba(255,255,255,.12);
        box-sizing:border-box;
      }

      .ob-video-prompt:focus{
        border-color:
          rgba(139,77,255,.7);
        box-shadow:
          0 0 0 3px
          rgba(139,77,255,.1);
      }

      .ob-video-actions{
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:9px;
        margin-top:12px;
      }

      .ob-video-btn{
        min-height:50px;
        border-radius:14px;
        font-weight:900;
        cursor:pointer;
      }

      .ob-video-buy{
        color:#080704;
        background:
          linear-gradient(
            145deg,
            #fff1a4,
            #d1a132,
            #f5d96d
          );
        border:0;
      }

      .ob-video-generate{
        color:#fff;
        background:
          linear-gradient(
            135deg,
            #8b4dff,
            #5422c8
          );
        border:0;
      }

      .ob-video-btn:disabled{
        opacity:.5;
        cursor:not-allowed;
      }

      .ob-video-status{
        min-height:24px;
        margin-top:12px;
        text-align:center;
        color:#aaa5b5;
        font-size:11px;
        line-height:1.5;
      }

      .ob-video-result{
        display:none;
        margin-top:16px;
      }

      .ob-video-result.show{
        display:block;
      }

      .ob-video-result video{
        width:100%;
        display:block;
        border-radius:18px;
        background:#000;
        border:1px solid
          rgba(255,255,255,.1);
      }

      .ob-video-download{
        width:100%;
        min-height:48px;
        margin-top:10px;
        border-radius:14px;
        color:#fff;
        background:rgba(255,255,255,.07);
        border:1px solid
          rgba(255,255,255,.1);
        font-weight:850;
        cursor:pointer;
      }

      .ob-video-source{
        margin-top:8px;
        color:#777382;
        font-size:9px;
        line-height:1.5;
      }

      @media(max-width:520px){

        #obitrendVideoLauncher{
          right:12px;
          bottom:88px;
          min-height:50px;
          padding:0 14px;
        }

        .ob-video-modal{
          padding:17px;
          border-radius:23px;
        }

        .ob-video-wallet,
        .ob-video-duration,
        .ob-video-actions{
          grid-template-columns:1fr;
        }
      }

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

    return candidates.length
      ? candidates[0]
      : "";
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
                  videoRatio
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
      getLatestGeneratedImage();

    if (
      generated &&
      !isRawUploadImage(generated)
    ) {

      rememberGeneratedFashionImage(
        generated
      );
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

    if (
      document.getElementById(
        "obitrendVideoLauncher"
      )
    ) {

      return;
    }

    addStyles();

    /*
    LAUNCHER
    */

    const launcher =
      el(
        "button",
        {
          id:
            "obitrendVideoLauncher",

          type:
            "button",

          text:
            "🎬 AI Video"
        }
      );

    launcher.addEventListener(
      "click",
      openVideoUI
    );

    document.body.appendChild(
      launcher
    );

    /*
    OVERLAY
    */

    const overlay =
      el(
        "div",
        {
          id:
            "obitrendVideoOverlay"
        }
      );

    /*
    MODAL
    */

    const modal =
      el(
        "div",
        {
          class:
            "ob-video-modal"
        }
      );

    /*
    HEADER
    */

    const title =
      el(
        "div",
        {
          class:
            "ob-video-head"
        },
        [

          el(
            "div",
            {},
            [

              el(
                "h2",
                {
                  text:
                    "🎬 AI Fashion Video"
                }
              ),

              el(
                "p",
                {
                  text:
                    "Turn your generated fashion image into a premium video."
                }
              )

            ]
          ),

          el(
            "button",
            {
              class:
                "ob-video-close",

              type:
                "button",

              text:
                "×"
            }
          )

        ]
      );

    title
      .querySelector("button")
      .addEventListener(
        "click",
        closeVideoUI
      );

    modal.appendChild(
      title
    );

    /*
    VIDEO BALANCES
    */

    const wallet =
      el(
        "div",
        {
          class:
            "ob-video-wallet"
        }
      );

    [5,10,15,20].forEach(
      duration => {

        const card =
          el(
            "div",
            {
              class:
                "ob-video-wallet-card"
            },
            [

              el(
                "small",
                {
                  text:
                    `${duration}-SECOND CREDITS`
                }
              ),

              el(
                "strong",
                {
                  id:
                    `obVideoBalance${duration}`,

                  text:
                    "0"
                }
              )

            ]
          );

        wallet.appendChild(
          card
        );
      }
    );

    modal.appendChild(
      wallet
    );

    /*
    DURATION
    */

    const durationSection =
      el(
        "div",
        {
          class:
            "ob-video-section"
        }
      );

    durationSection.appendChild(
      el(
        "label",
        {
          class:
            "ob-video-label",

          text:
            "VIDEO DURATION"
        }
      )
    );

    const durationGrid =
      el(
        "div",
        {
          class:
            "ob-video-duration"
        }
      );

    const packages = [
      {
        duration:5,
        price:"₦5,000"
      },
      {
        duration:10,
        price:"₦10,000"
      },
      {
        duration:15,
        price:"₦15,000"
      },
      {
        duration:20,
        price:"₦20,000"
      }
    ];

    packages.forEach(
      packageInfo => {

        const button =
          el(
            "button",
            {
              id:
                `obVideoPackage${packageInfo.duration}`,

              class:
                packageInfo.duration === 5
                  ? "ob-video-package selected"
                  : "ob-video-package",

              type:
                "button"
            },
            [

              el(
                "strong",
                {
                  text:
                    `${packageInfo.duration} Seconds`
                }
              ),

              el(
                "span",
                {
                  text:
                    `1 video credit • ${packageInfo.price}`
                }
              )

            ]
          );

        button.addEventListener(
          "click",
          () => {

            selectDuration(
              packageInfo.duration
            );
          }
        );

        durationGrid.appendChild(
          button
        );
      }
    );

    durationSection.appendChild(
      durationGrid
    );

    modal.appendChild(
      durationSection
    );

    /*
    PROMPT
    */

    const promptSection =
      el(
        "div",
        {
          class:
            "ob-video-section"
        }
      );

    promptSection.appendChild(
      el(
        "label",
        {
          class:
            "ob-video-label",

          text:
            "VIDEO PROMPT"
        }
      )
    );

    const prompt =
      el(
        "textarea",
        {
          id:
            "obVideoPrompt",

          class:
            "ob-video-prompt"
        }
      );

    prompt.value =
      defaultPrompt();

    promptSection.appendChild(
      prompt
    );

    modal.appendChild(
      promptSection
    );

    /*
    ACTION BUTTONS
    */

    const actions =
      el(
        "div",
        {
          class:
            "ob-video-actions"
        }
      );

    const buy =
      el(
        "button",
        {
          id:
            "obVideoBuyBtn",

          class:
            "ob-video-btn ob-video-buy",

          type:
            "button",

          text:
            "💳 Buy 5 Seconds — ₦5,000"
        }
      );

    const generate =
      el(
        "button",
        {
          id:
            "obVideoGenerateBtn",

          class:
            "ob-video-btn ob-video-generate",

          type:
            "button",

          text:
            "✨ Generate Video"
        }
      );

    buy.addEventListener(
      "click",
      buyVideo
    );

    generate.addEventListener(
      "click",
      generateVideo
    );

    actions.appendChild(
      buy
    );

    actions.appendChild(
      generate
    );

    modal.appendChild(
      actions
    );

    /*
    STATUS
    */

    modal.appendChild(
      el(
        "div",
        {
          id:
            "obitrendVideoStatus",

          class:
            "ob-video-status",

          text:
            "Ready to create your fashion video."
        }
      )
    );

    /*
    RESULT
    */

    const result =
      el(
        "div",
        {
          id:
            "obitrendVideoResult",

          class:
            "ob-video-result"
        }
      );

    const video =
      el(
        "video",
        {
          id:
            "obitrendGeneratedVideo",

          controls:
            "controls",

          playsinline:
            "playsinline",

          preload:
            "metadata"
        }
      );

    result.appendChild(
      video
    );

    const download =
      el(
        "button",
        {
          id:
            "obVideoDownloadBtn",

          class:
            "ob-video-download",

          type:
            "button",

          text:
            "⬇️ Download Video"
        }
      );

    result.appendChild(
      download
    );

    result.appendChild(
      el(
        "div",
        {
          class:
            "ob-video-source",

          text:
            "Generated with OBITREND AI Fashion Creator."
        }
      )
    );

    modal.appendChild(
      result
    );

    /*
    OVERLAY CLOSE
    */

    overlay.appendChild(
      modal
    );

    overlay.addEventListener(
      "click",
      event => {

        if (
          event.target ===
          overlay
        ) {

          closeVideoUI();
        }
      }
    );

    document.body.appendChild(
      overlay
    );

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
