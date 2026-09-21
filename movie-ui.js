(() => {
  "use strict";

  const state = { plan:null, selectedShot:null, generating:false, currentScene:0, currentShot:0 };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  const authToken = async () => {
    try {
      if (window.supabaseClient?.auth) {
        const { data } = await window.supabaseClient.auth.getSession();
        return data?.session?.access_token || "";
      }
    } catch {}
    return "";
  };

  function styles() {
    if (document.getElementById("obMovieStyles")) return;
    const s = document.createElement("style");
    s.id = "obMovieStyles";
    s.textContent = `
      #obMovieLauncher{display:none!important}
      #obMovieOverlay{position:fixed;inset:0;z-index:11000;display:none;background:#07070a;color:#fff;overflow:auto}
      #obMovieOverlay.show{display:block}
      .obm{max-width:1180px;margin:0 auto;padding:22px}
      .obm-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:20px}
      .obm-kicker{color:#d6b35a;font-size:12px;font-weight:800;letter-spacing:.16em}.obm h1{margin:6px 0;font-size:36px}.obm-sub{color:#9c9ca5;max-width:720px}
      .obm-close{border:1px solid #34343b;background:#151519;color:#fff;border-radius:14px;padding:12px 16px;font-weight:800}
      .obm-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:18px}.obm-card{background:#101014;border:1px solid #292930;border-radius:22px;padding:18px}
      .obm textarea,.obm select{width:100%;box-sizing:border-box;background:#151519;color:#fff;border:1px solid #34343d;border-radius:15px;padding:15px;font:inherit;outline:none}
      .obm textarea{min-height:170px;resize:vertical}.obm-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
      .obm label{display:block;color:#aaaab2;font-size:12px;margin:0 0 6px}.obm button.primary{width:100%;margin-top:12px;border:0;border-radius:16px;padding:16px;background:linear-gradient(135deg,#6d28d9,#8b5cf6);color:#fff;font-weight:850;font-size:16px}
      .obm-status{min-height:22px;color:#7ce6a4;margin-top:10px;font-size:13px}.obm-status.err{color:#ff8e8e}
      .obm-scenes{display:grid;gap:9px;max-height:680px;overflow:auto}.obm-scene{border:1px solid #2b2b32;border-radius:15px;padding:12px;background:#151519;cursor:pointer}.obm-scene.active{border-color:#d6b35a}
      .obm-scene b{display:block}.obm-scene span{display:block;color:#8f8f98;font-size:12px;margin-top:5px}.obm-shot{margin-top:8px;padding:10px;border-left:2px solid #6d28d9;background:#111116;border-radius:8px;color:#b8b8c0;font-size:12px}
      .obm-result{margin-top:18px}.obm-title{font-size:22px;font-weight:850}.obm-meta{color:#9b9ba4;font-size:13px;margin:6px 0 12px}.obm-tags{display:flex;gap:7px;flex-wrap:wrap}.obm-tag{padding:7px 9px;background:#18181d;border:1px solid #2d2d35;border-radius:999px;color:#ddd;font-size:11px}
      @media(max-width:800px){.obm-grid{grid-template-columns:1fr}.obm{padding:15px}.obm h1{font-size:29px}}
    `;
    document.head.appendChild(s);
  }

  function build() {
    if (document.getElementById("obMovieOverlay")) return;
    styles();

    const overlay = document.createElement("div");
    overlay.id = "obMovieOverlay";
    overlay.innerHTML = `
      <div class="obm">
        <div class="obm-head">
          <div><div class="obm-kicker">OBITREND AI CINEMA</div><h1>AI Movie Creator</h1><div class="obm-sub">Turn one idea into a production-ready movie blueprint with persistent characters, scenes and professional camera direction.</div></div>
          <button class="obm-close" id="obmClose">← Back</button>
        </div>
        <div class="obm-grid">
          <section class="obm-card">
            <label>Movie prompt</label>
            <textarea id="obmPrompt" placeholder="Example: A young man returns to Lagos and discovers that his family is in danger. Build a realistic African action drama with emotional character moments, suspense, chase scenes and a cinematic ending."></textarea>
            <div class="obm-row">
              <div><label>Movie length</label><select id="obmLength"><option value="5">5 minutes</option><option value="15">15 minutes</option><option value="30">30 minutes</option></select></div>
              <div><label>Visual style</label><select id="obmStyle"><option>cinematic realism</option><option>photorealistic blockbuster</option><option>premium drama</option><option>action thriller realism</option><option>luxury fashion cinema</option></select></div>
            </div>
            <div class="obm-row">
              <div><label>Aspect ratio</label><select id="obmAspect"><option>16:9</option><option>9:16</option><option>1:1</option></select></div>
              <div><label>Camera director</label><select id="obmCamera"><option>AI Director — automatic cinema camera</option><option>Large-format cinema</option><option>35mm cinema realism</option><option>Documentary realism</option></select></div>
            </div>
            <button class="primary" id="obmPlan">✦ Build Movie Blueprint</button>
            <div class="obm-status" id="obmStatus"></div>
          </section>
          <section class="obm-card">
            <div class="obm-title">Production board</div>
            <div class="obm-meta" id="obmBoardMeta">Your storyboard will appear here.</div>
            <div class="obm-scenes" id="obmScenes"></div>
          </section>
        </div>
        <section class="obm-card obm-result" id="obmResult" style="display:none"></section>
      </div>`;
    document.body.appendChild(overlay);

    document.getElementById("obmClose").onclick = () => overlay.classList.remove("show");
    document.getElementById("obmPlan").onclick = planMovie;
  }

  async function planMovie() {
    const status = document.getElementById("obmStatus");
    const prompt = document.getElementById("obmPrompt").value.trim();
    if (!prompt) { status.textContent = "Describe the movie first."; status.className = "obm-status err"; return; }

    status.className = "obm-status";
    status.textContent = "AI Director is writing the screenplay, continuity bible and shot list…";
    document.getElementById("obmPlan").disabled = true;

    try {
      const token = await authToken();
      const response = await fetch("/api/movie-plan", {
        method:"POST", headers:{ "Content-Type":"application/json", ...(token ? {Authorization:"Bearer "+token}: {}) },
        body:JSON.stringify({
          prompt,
          length:Number(document.getElementById("obmLength").value),
          style:document.getElementById("obmStyle").value,
          aspect:document.getElementById("obmAspect").value,
          camera:document.getElementById("obmCamera").value
        })
      });
      const data = await response.json().catch(()=>({}));
      if (!response.ok || !data.success) throw new Error(data.error || "Movie planning failed.");
      state.plan = data.plan;
      renderPlan(data.plan);
      status.textContent = "Movie blueprint ready.";
    } catch (e) {
      status.textContent = e?.message || "Movie planning failed.";
      status.className = "obm-status err";
    } finally {
      document.getElementById("obmPlan").disabled = false;
    }
  }

  function renderPlan(plan) {
    const meta = document.getElementById("obmBoardMeta");
    const scenes = document.getElementById("obmScenes");
    meta.innerHTML = `<b>${esc(plan.title)}</b> · ${esc(plan.genre)} · ${plan.scenes.length} scenes`;
    scenes.innerHTML = plan.scenes.map((scene,i) => `
      <div class="obm-scene ${i===0?"active":""}" data-i="${i}">
        <b>Scene ${scene.number}: ${esc(scene.heading)}</b>
        <span>${esc(scene.location)} · ${esc(scene.timeOfDay)} · ${scene.durationSeconds}s</span>
        ${scene.shots.slice(0,3).map(shot => `<div class="obm-shot">Shot ${shot.shotNumber} · ${esc(shot.camera)} · ${esc(shot.lens)} · ${esc(shot.movement)}</div>`).join("")}
      </div>`).join("");

    scenes.querySelectorAll(".obm-scene").forEach(node => node.onclick = () => {
      scenes.querySelectorAll(".obm-scene").forEach(x=>x.classList.remove("active"));
      node.classList.add("active");
      const scene = plan.scenes[Number(node.dataset.i)];
      showScene(scene);
    });
    showScene(plan.scenes[0]);
  }

  function showScene(scene) {
    const result = document.getElementById("obmResult");
    result.style.display = "block";
    const si = state.currentScene;
    const qi = state.currentShot;
    const shot = scene.shots[qi] || scene.shots[0];
    result.innerHTML = `
      <div class="obm-title">Scene ${scene.number}: ${esc(scene.heading)}</div>
      <div class="obm-meta">${esc(scene.purpose)} · ${esc(scene.location)} · ${esc(scene.timeOfDay)} · Shot ${(shot?.shotNumber || 1)}</div>
      <div class="obm-tags">${scene.shots.map(s=>`<span class="obm-tag">${esc(s.camera)}</span><span class="obm-tag">${esc(s.lens)}</span><span class="obm-tag">${esc(s.framing)}</span><span class="obm-tag">${esc(s.movement)}</span>`).join("")}</div>
      <p style="color:#c6c6ce;line-height:1.55"><b>Shot direction:</b> ${esc(shot?.prompt || shot?.description || "Cinematic shot.")}</p>
      <p style="color:#c6c6ce;line-height:1.55"><b>Dialogue:</b> ${esc(scene.dialogue || "No dialogue.")}</p>
      <p style="color:#c6c6ce;line-height:1.55"><b>Continuity:</b> ${esc(shot?.continuity || "")}</p>
      <div class="obm-row">
        <button class="primary" id="obmGenerateShot" style="margin-top:4px">🎬 Generate This Shot</button>
        <button class="obm-close" id="obmNextShot" style="margin-top:4px">Next Shot →</button>
      </div>
      <div id="obmShotStatus" class="obm-status"></div>
      <div id="obmShotVideo" style="margin-top:14px"></div>`;
    document.getElementById("obmGenerateShot").onclick = () => generateShot(si, qi);
    document.getElementById("obmNextShot").onclick = () => {
      state.currentShot = (state.currentShot + 1) % scene.shots.length;
      showScene(scene);
    };
  }

  async function generateShot(sceneIndex, shotIndex) {
    if (state.generating || !state.plan) return;
    const status = document.getElementById("obmShotStatus");
    const button = document.getElementById("obmGenerateShot");
    state.generating = true;
    button.disabled = true;
    status.className = "obm-status";
    status.textContent = "AI Director is generating this shot…";
    try {
      const token = await authToken();
      const response = await fetch("/api/movie-shot", {
        method:"POST",
        headers:{ "Content-Type":"application/json", ...(token ? {Authorization:"Bearer "+token}: {}) },
        body:JSON.stringify({ blueprint:state.plan, sceneIndex, shotIndex, ratio:document.getElementById("obmAspect").value })
      });
      const data = await response.json().catch(()=>({}));
      if (!response.ok || !data.success) throw new Error(data.error || "Shot generation failed.");
      status.textContent = "Shot submitted. Rendering…";
      await pollMovieShot(data.taskId, status);
    } catch (e) {
      status.textContent = e?.message || "Shot generation failed.";
      status.className = "obm-status err";
    } finally {
      state.generating = false;
      button.disabled = false;
    }
  }

  async function pollMovieShot(taskId, status) {
    for (let i=0;i<90;i++) {
      await new Promise(r=>setTimeout(r,4000));
      const token = await authToken();
      const response = await fetch("/api/video-status?taskId="+encodeURIComponent(taskId), {
        headers: token ? {Authorization:"Bearer "+token} : {}
      });
      const data = await response.json().catch(()=>({}));
      if (!response.ok) throw new Error(data.error || "Unable to check shot status.");
      if (data.status === "SUCCEEDED" || data.status === "COMPLETED") {
        status.textContent = "Shot ready.";
        const url = data.videoUrl || data.url || data.output?.[0];
        if (url) document.getElementById("obmShotVideo").innerHTML = `<video controls playsinline style="width:100%;border-radius:16px;background:#000" src="${esc(url)}"></video>`;
        return;
      }
      if (data.status === "FAILED" || data.status === "CANCELED") throw new Error("This shot could not be generated. Your reserved video seconds will be refunded.");
      status.textContent = "Rendering… " + (data.progress != null ? Math.round(data.progress)+"%" : "");
    }
    throw new Error("Rendering is taking longer than expected. You can check the shot again later.");
  }

  function open() {
    build();
    document.getElementById("obMovieOverlay").classList.add("show");
  }

  function injectLauncher() {
    build();
    const launcher = document.createElement("button");
    launcher.id = "obMovieLauncher";
    launcher.type = "button";
    launcher.textContent = "AI Movie";
    launcher.onclick = open;
    document.body.appendChild(launcher);

    // Add a visible Create > Movie shortcut without replacing existing navigation.
    const candidates = [...document.querySelectorAll("button,a")].filter(el => /create|video/i.test(el.textContent || ""));
    const host = candidates[0]?.parentElement;
    if (host && !document.getElementById("obMovieNav")) {
      const nav = document.createElement("button");
      nav.id = "obMovieNav";
      nav.type = "button";
      nav.textContent = "🎬 AI Movie";
      nav.style.cssText = "display:block;width:100%;margin-top:8px;padding:12px 14px;border-radius:12px;border:1px solid #d6b35a;background:#121216;color:#f2d37a;font-weight:800;text-align:left;cursor:pointer";
      nav.onclick = open;
      host.appendChild(nav);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", injectLauncher, {once:true});
  else injectLauncher();
})();