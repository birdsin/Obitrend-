(() => {
  "use strict";

  /*
  =========================================================
  OBITREND AI VIDEO CREATOR
  FRONTEND UI
  =========================================================
  */

  const state = {
    balance5: 0,
    balance10: 0,
    selectedDuration: 5,
    pollingTimer: null,
    pollingBusy: false,
    currentTaskId: null,
    currentVideoUrl: null
  };

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);

    Object.entries(attrs).forEach(([key, value]) => {
      if (key === "text") {
        node.textContent = value;
      } else if (key === "html") {
        node.innerHTML = value;
      } else if (key === "class") {
        node.className = value;
      } else if (key === "style") {
        node.style.cssText = value;
      } else if (key.startsWith("on")) {
        node.addEventListener(
          key.slice(2),
          value
        );
      } else {
        node.setAttribute(key, value);
      }
    });

    children.forEach(child => {
      if (child) node.appendChild(child);
    });

    return node;
  }

  function addStyles() {
    if (document.getElementById(
      "obitrend-video-ui-styles"
    )) {
      return;
    }

    const style = document.createElement("style");

    style.id =
      "obitrend-video-ui-styles";

    style.textContent = `
      #obitrendVideoLauncher{
        position:fixed;
        right:16px;
        bottom:92px;
        z-index:210;
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
        border:1px solid rgba(255,255,255,.1);
        font-size:20px;
      }

      .ob-video-wallet{
        display:grid;
        grid-template-columns:1fr 1fr;
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
        grid-template-columns:1fr 1fr;
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
      }

      .ob-video-generate{
        color:#fff;
        background:
          linear-gradient(
            135deg,
            #8b4dff,
            #5422c8
          );
      }

      .ob-video-btn:disabled{
        opacity:.5;
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

  function getOverlay() {
    return document.getElementById(
      "obitrendVideoOverlay"
    );
  }

  function setStatus(message, type = "") {
    const box =
      document.getElementById(
        "obitrendVideoStatus"
      );

    if (!box) return;

    box.textContent = message;

    box.style.color =
      type === "error"
        ? "#ff7777"
        : type === "success"
          ? "#79e6a0"
          : "#aaa5b5";
  }

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
          data?.error ||
          "Unable to load video credits."
        );
      }

      state.balance5 =
        Number(data.balance5 || 0);

      state.balance10 =
        Number(data.balance10 || 0);

      const b5 =
        document.getElementById(
          "obVideoBalance5"
        );

      const b10 =
        document.getElementById(
          "obVideoBalance10"
        );

      if (b5) {
        b5.textContent =
          state.balance5;
      }

      if (b10) {
        b10.textContent =
          state.balance10;
      }

    } catch (error) {
      console.warn(
        "OBITREND video credits:",
        error?.message || error
      );
    }
  }

  function getLatestGeneratedImage() {
    const gallery =
      document.getElementById(
        "generatedGallery"
      );

    const image =
      gallery?.querySelector(
        "img"
      );

    const src =
      image?.src || "";

    if (
      src.startsWith("http://") ||
      src.startsWith("https://")
    ) {
      return src;
    }

    return "";
  }

  function defaultPrompt() {
    return (
      "Create a premium photorealistic fashion " +
      "campaign video. Keep the clothing design " +
      "exactly the same as the reference image. " +
      "Natural realistic model movement, subtle " +
      "camera motion, realistic fabric movement, " +
      "professional fashion lighting, luxury " +
      "commercial production, physically believable " +
      "motion, no redesign of the garment."
    );
  }

  async function startVideoPayment() {
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
          data?.error ||
          "Unable to start video payment."
        );
      }

      if (
        !data.authorization_url
      ) {
        throw new Error(
          "Paystack did not return a payment page."
        );
      }

      localStorage.setItem(
        "obitrend_pending_video_reference",
        data.reference || ""
      );

      localStorage.setItem(
        "obitrend_pending_video_duration",
        String(duration)
      );

      window.location.href =
        data.authorization_url;

    } catch (error) {
      setStatus(
        error?.message ||
        "Unable to start payment.",
        "error"
      );
    }
  }

  async function verifyPendingVideoPayment() {
    const reference =
      new URLSearchParams(
        window.location.search
      ).get("reference") ||
      new URLSearchParams(
        window.location.search
      ).get("trxref") ||
      localStorage.getItem(
        "obitrend_pending_video_reference"
      ) ||
      "";

    if (!reference) {
      return;
    }

    try {
      const token =
        await getToken();

      setStatus(
        "⏳ Verifying your video payment..."
      );

      const response =
        await fetch(
          "/api/video-payment-verify",
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

      const data =
        await response.json();

      if (
        !response.ok ||
        data?.success !== true
      ) {
        throw new Error(
          data?.error ||
          "Video payment could not be verified."
        );
      }

      localStorage.removeItem(
        "obitrend_pending_video_reference"
      );

      localStorage.removeItem(
        "obitrend_pending_video_duration"
      );

      setStatus(
        "✅ Payment verified. Your video credit has been added.",
        "success"
      );

      await loadVideoCredits();

      window.history.replaceState(
        {},
        document.title,
        window.location.pathname
      );

    } catch (error) {
      setStatus(
        error?.message ||
        "Unable to verify video payment.",
        "error"
      );
    }
  }

  async function generateVideo() {
    if (state.pollingBusy) {
      return;
    }

    const duration =
      state.selectedDuration;

    const available =
      duration === 5
        ? state.balance5
        : state.balance10;

    if (available <= 0) {
      setStatus(
        duration === 5
          ? "You need a 5-second video credit. Tap Buy 5 Seconds."
          : "You need a 10-second video credit. Tap Buy 10 Seconds.",
        "error"
      );
      return;
    }

    const prompt =
      document.getElementById(
        "obVideoPrompt"
      )?.value.trim() ||
      defaultPrompt();

    const imageUrl =
      getLatestGeneratedImage();

    try {
      const token =
        await getToken();

      state.pollingBusy = true;

      const generateButton =
        document.getElementById(
          "obVideoGenerate"
        );

      if (generateButton) {
        generateButton.disabled =
          true;

        generateButton.textContent =
          "⏳ Starting...";
      }

      setStatus(
        "⏳ Starting your paid video generation..."
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
                  "1280:720"
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
          data?.error ||
          "Unable to start video generation."
        );
      }

      state.currentTaskId =
        data.taskId;

      state.selectedDuration =
        duration;

      if (duration === 5) {
        state.balance5 =
          Math.max(
            0,
            state.balance5 - 1
          );
      } else {
        state.balance10 =
          Math.max(
            0,
            state.balance10 - 1
          );
      }

      updateBalanceDisplay();

      setStatus(
        "🎬 Video generation started. OBITREND is processing it..."
      );

      pollVideoStatus(
        data.taskId
      );

    } catch (error) {
      state.pollingBusy = false;

      const generateButton =
        document.getElementById(
          "obVideoGenerate"
        );

      if (generateButton) {
        generateButton.disabled =
          false;

        generateButton.textContent =
          "🎬 Generate Video";
      }

      setStatus(
        error?.message ||
        "Unable to generate video.",
        "error"
      );

      await loadVideoCredits();
    }
  }

  async function pollVideoStatus(taskId) {
    clearTimeout(
      state.pollingTimer
    );

    try {
      const token =
        await getToken();

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
        !response.ok &&
        data?.status !== "FAILED"
      ) {
        throw new Error(
          data?.error ||
          "Unable to check video status."
        );
      }

      if (
        data?.status === "SUCCEEDED" &&
        data?.videoUrl
      ) {
        state.pollingBusy = false;
        state.currentVideoUrl =
          data.videoUrl;

        showVideoResult(
          data.videoUrl
        );

        setStatus(
          "✅ Your AI fashion video is ready.",
          "success"
        );

        await loadVideoCredits();

        return;
      }

      if (
        data?.status === "FAILED" ||
        data?.status === "CANCELED"
      ) {
        state.pollingBusy = false;

        setStatus(
          data?.error ||
          "Video generation did not complete.",
          "error"
        );

        await loadVideoCredits();

        resetGenerateButton();

        return;
      }

      const progress =
        Number(data?.progress || 0);

      setStatus(
        `⏳ Generating video... ${progress}%`
      );

      state.pollingTimer =
        setTimeout(
          () =>
            pollVideoStatus(
              taskId
            ),
          5000
        );

    } catch (error) {
      setStatus(
        "⏳ Checking video generation...",
        ""
      );

      state.pollingTimer =
        setTimeout(
          () =>
            pollVideoStatus(
              taskId
            ),
          7000
        );
    }
  }

  function resetGenerateButton() {
    const button =
      document.getElementById(
        "obVideoGenerate"
      );

    if (!button) return;

    button.disabled = false;
    button.textContent =
      "🎬 Generate Video";
  }

  function showVideoResult(url) {
    const box =
      document.getElementById(
        "obVideoResult"
      );

    const player =
      document.getElementById(
        "obVideoPlayer"
      );

    if (!box || !player) {
      return;
    }

    player.src = url;

    box.classList.add("show");

    resetGenerateButton();
  }

  function updateBalanceDisplay() {
    const b5 =
      document.getElementById(
        "obVideoBalance5"
      );

    const b10 =
      document.getElementById(
        "obVideoBalance10"
      );

    if (b5) {
      b5.textContent =
        state.balance5;
    }

    if (b10) {
      b10.textContent =
        state.balance10;
    }
  }

  function selectDuration(duration) {
    state.selectedDuration =
      duration;

    const five =
      document.getElementById(
        "obVideoPackage5"
      );

    const ten =
      document.getElementById(
        "obVideoPackage10"
      );

    five?.classList.toggle(
      "selected",
      duration === 5
    );

    ten?.classList.toggle(
      "selected",
      duration === 10
    );

    const buy =
      document.getElementById(
        "obVideoBuy"
      );

    if (buy) {
      buy.textContent =
        duration === 5
          ? "💳 Buy 5 Seconds — ₦8,000"
          : "💳 Buy 10 Seconds — ₦16,000";
    }

    const generate =
      document.getElementById(
        "obVideoGenerate"
      );

    if (generate) {
      generate.textContent =
        duration === 5
          ? "🎬 Generate 5-Second Video"
          : "🎬 Generate 10-Second Video";
    }
  }

  function buildUI() {
    if (
      document.getElementById(
        "obitrendVideoOverlay"
      )
    ) {
      return;
    }

    addStyles();

    const launcher =
      el(
        "button",
        {
          id:
            "obitrendVideoLauncher",
          text:
            "🎬 AI Video"
        }
      );

    const close =
      el(
        "button",
        {
          class:
            "ob-video-close",
          text:
            "×",
          onclick: () =>
            getOverlay()
              ?.classList.remove(
                "show"
              )
        }
      );

    const title =
      el(
        "div",
        {},
        [
          el(
            "h2",
            {
              text:
                "OBITREND AI Video"
            }
          ),
          el(
            "p",
            {
              text:
                "Create premium fashion campaign videos"
            }
          )
        ]
      );

    const head =
      el(
        "div",
        {
          class:
            "ob-video-head"
        },
        [
          title,
          close
        ]
      );

    const wallet =
      el(
        "div",
        {
          class:
            "ob-video-wallet"
        },
        [
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
                    "5-SECOND CREDITS"
                }
              ),
              el(
                "strong",
                {
                  id:
                    "obVideoBalance5",
                  text:
                    "0"
                }
              )
            ]
          ),
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
                    "10-SECOND CREDITS"
                }
              ),
              el(
                "strong",
                {
                  id:
                    "obVideoBalance10",
                  text:
                    "0"
                }
              )
            ]
          )
        ]
      );

    const package5 =
      el(
        "button",
        {
          id:
            "obVideoPackage5",
          class:
            "ob-video-package selected",
          onclick: () =>
            selectDuration(5)
        },
        [
          el(
            "strong",
            {
              text:
                "5 Seconds"
            }
          ),
          el(
            "span",
            {
              text:
                "₦8,000 • 1 video credit"
            }
          )
        ]
      );

    const package10 =
      el(
        "button",
        {
          id:
            "obVideoPackage10",
          class:
            "ob-video-package",
          onclick: () =>
            selectDuration(10)
        },
        [
          el(
            "strong",
            {
              text:
                "10 Seconds"
            }
          ),
          el(
            "span",
            {
              text:
                "₦16,000 • 1 video credit"
            }
          )
        ]
      );

    const durationSection =
      el(
        "div",
        {
          class:
            "ob-video-section"
        },
        [
          el(
            "label",
            {
              class:
                "ob-video-label",
              text:
                "VIDEO PACKAGE"
            }
          ),
          el(
            "div",
            {
              class:
                "ob-video-duration"
            },
            [
              package5,
              package10
            ]
          )
        ]
      );

    const prompt =
      el(
        "textarea",
        {
          id:
            "obVideoPrompt",
          class:
            "ob-video-prompt",
          placeholder:
            "Describe the fashion video movement..."
        }
      );

    prompt.value =
      defaultPrompt();

    const promptSection =
      el(
        "div",
        {
          class:
            "ob-video-section"
        },
        [
          el(
            "label",
            {
              class:
                "ob-video-label",
              text:
                "VIDEO PROMPT"
            }
          ),
          prompt
        ]
      );

    const buy =
      el(
        "button",
        {
          id:
            "obVideoBuy",
          class:
            "ob-video-btn ob-video-buy",
          text:
            "💳 Buy 5 Seconds — ₦8,000",
          onclick:
            startVideoPayment
        }
      );

    const generate =
      el(
        "button",
        {
          id:
            "obVideoGenerate",
          class:
            "ob-video-btn ob-video-generate",
          text:
            "🎬 Generate 5-Second Video",
          onclick:
            generateVideo
        }
      );

    const actions =
      el(
        "div",
        {
          class:
            "ob-video-actions"
        },
        [
          buy,
          generate
        ]
      );

    const status =
      el(
        "div",
        {
          id:
            "obitrendVideoStatus",
          class:
            "ob-video-status"
        }
      );

    const result =
      el(
        "div",
        {
          id:
            "obVideoResult",
          class:
            "ob-video-result"
        },
        [
          el(
            "video",
            {
              id:
                "obVideoPlayer",
              controls: true,
              playsinline: true
            }
          ),
          el(
            "button",
            {
              class:
                "ob-video-download",
              text:
                "⬇️ Download Video",
              onclick: () => {
                if (
                  !state.currentVideoUrl
                ) {
                  return;
                }

                const link =
                  document.createElement(
                    "a"
                  );

                link.href =
                  state.currentVideoUrl;

                link.download =
                  "obitrend-fashion-video.mp4";

                document.body.appendChild(
                  link
                );

                link.click();

                link.remove();
              }
            }
          ),
          el(
            "div",
            {
              class:
                "ob-video-source",
              text:
                "Your completed video is stored privately in OBITREND."
            }
          )
        ]
      );

    const modal =
      el(
        "div",
        {
          class:
            "ob-video-modal"
        },
        [
          head,
          wallet,
          durationSection,
          promptSection,
          actions,
          status,
          result
        ]
      );

    const overlay =
      el(
        "div",
        {
          id:
            "obitrendVideoOverlay"
        },
        [
          modal
        ]
      );

    launcher.addEventListener(
      "click",
      async () => {
        overlay.classList.add(
          "show"
        );

        await loadVideoCredits();

        await verifyPendingVideoPayment();
      }
    );

    overlay.addEventListener(
      "click",
      event => {
        if (
          event.target === overlay
        ) {
          overlay.classList.remove(
            "show"
          );
        }
      }
    );

    document.body.appendChild(
      launcher
    );

    document.body.appendChild(
      overlay
    );
  }

  function boot() {
    buildUI();

    /*
    -------------------------------------------------------
    If Paystack returned to OBITREND with a reference,
    verify it automatically after the existing app has
    loaded.
    -------------------------------------------------------
    */

    const params =
      new URLSearchParams(
        window.location.search
      );

    const hasReference =
      params.has("reference") ||
      params.has("trxref");

    if (hasReference) {
      setTimeout(
        async () => {
          getOverlay()
            ?.classList.add("show");

          await verifyPendingVideoPayment();

          await loadVideoCredits();
        },
        1200
      );
    }
  }

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      boot,
      {
        once:true
      }
    );
  } else {
    boot();
  }

})();
