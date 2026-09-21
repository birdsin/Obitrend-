import { supabase } from "../supabase.js";

const $ = (id) => document.getElementById(id);
const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];
let session = null;
let account = null;
let authMode = "signin";
let selectedImageCamera = "AI Smart Camera";
let selectedImageRatio = "5:4";
let selectedStylePreset = "Realistic";
let creditClockTimer = null;
let uploadedImageAnalysis = null;
let authGeneration = 0;

function messageText(value) { if(typeof value==="string") return value; if(value?.message && typeof value.message==="string") return value.message; if(value?.error && typeof value.error==="string") return value.error; if(value && typeof value==="object"){ try{ const nested=value.message||value.error||value.data?.message||value.data?.error; if(typeof nested==="string") return nested; return JSON.stringify(value); }catch{} } return String(value||"Something went wrong."); }
function safeMessage(error) { const message=messageText(error); if(/invalid login credentials/i.test(message))return "Email or password is incorrect."; if(/email not confirmed/i.test(message))return "Please confirm your email before signing in."; if(/already registered|already exists/i.test(message))return "That email is already registered. Try signing in."; if(/password/i.test(message)&&/6/i.test(message))return "Password must be at least 6 characters."; return message.length>180?"Unable to complete that request right now.":message; }
function setAuthStatus(message="",type=""){const el=$("authStatus");el.textContent=message;el.className=`form-status ${type}`.trim();}
function authAttemptKey(email){return "obitrend_login_attempts_"+encodeURIComponent(String(email||"").trim().toLowerCase());}
function getAuthAttempts(email){try{return Math.max(0,Number(localStorage.getItem(authAttemptKey(email)))||0);}catch{return 0;}}
function setAuthAttempts(email,count){try{localStorage.setItem(authAttemptKey(email),String(Math.max(0,count)));}catch{}}
function clearAuthAttempts(email){try{localStorage.removeItem(authAttemptKey(email));}catch{}}
function applyLoginBlock(email){const blocked=getAuthAttempts(email)>=3;const signIn=$("signInBtn");const password=$("authPassword");if(signIn)signIn.disabled=blocked;if(password)password.disabled=blocked;return blocked;}
function restoreLoginControls(email){const blocked=applyLoginBlock(email);if(blocked){setAuthStatus("Account sign-in is blocked after 3 incorrect passwords. Use Forgot password to reset access.","error");}return blocked;}

function toast(message){const el=$("toast");const safe=messageText(message);el.textContent=safe;el.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove("show"),2600);}
function setAuthMode(mode){authMode=mode;const signIn=mode==="signin";$("signInTab")?.classList.toggle("active",signIn);$("signUpTab")?.classList.toggle("active",!signIn);$("signInBtn")?.classList.toggle("hidden",!signIn);$("signUpBtn")?.classList.toggle("hidden",signIn);$("forgotBtn")?.classList.toggle("hidden",!signIn);if($("authPassword"))$("authPassword").autocomplete=signIn?"current-password":"new-password";setAuthStatus("");}
async function authAction(kind){
  const authAttemptGeneration = kind === "signin" ? ++authGeneration : authGeneration;
  const email=$("authEmail").value.trim().toLowerCase();
  const password=$("authPassword").value;
  if(!email||!email.includes("@"))return setAuthStatus("Enter a valid email address.","error");
  if(kind==="signin"&&restoreLoginControls(email))return;
  if(password.length<6)return setAuthStatus("Password must be at least 6 characters.","error");

  const signInButton=$("signInBtn");
  const signUpButton=$("signUpBtn");
  if(signInButton)signInButton.disabled=true;
  if(signUpButton)signUpButton.disabled=true;
  setAuthStatus(kind==="signin"?"Signing in…":"Creating your account…");

  try{
    const result=kind==="signin"
      ?await supabase.auth.signInWithPassword({email,password})
      :await supabase.auth.signUp({email,password});

    if(result.error)throw result.error;

    if(kind==="signup"&&!result.data?.session){
      setAuthStatus("Account created. Check your email if confirmation is required, then sign in.","success");
      setAuthMode("signin");
      $("authPassword").value="";
      return;
    }

    if(kind==="signin"){
      clearAuthAttempts(email);

      // Use the session returned by Supabase immediately. Do not reload the page:
      // reloading here was causing a successful login to race session persistence
      // and send users back to the sign-in screen on some mobile browsers.
      let nextSession=result.data?.session||null;
      if(!nextSession){
        for(let attempt=0;attempt<5&&!nextSession;attempt++){
          await new Promise(resolve=>setTimeout(resolve,100));
          const current=await supabase.auth.getSession();
          if(!current.error)nextSession=current.data?.session||null;
        }
      }

      if(!nextSession)throw new Error("Your sign-in could not be completed. Please try again.");

      session=nextSession;
      authGeneration++;
      showDashboard();
      await loadAccount();
      initSecurityLocks();
      await verifyReturnedPayment();
      setAuthStatus("Signed in successfully.","success");
      return;
    }

    await loadSession();
  }catch(error){
    console.error("OBITREND auth error:",error);
    if(kind==="signin"&&/invalid login credentials|invalid credentials|invalid password/i.test(messageText(error))){
      const attempts=getAuthAttempts(email)+1;
      setAuthAttempts(email,attempts);
      if(attempts>=3){
        applyLoginBlock(email);
        setAuthStatus("Account sign-in is blocked after 3 incorrect passwords. Use Forgot password to reset access.","error");
      }else{
        setAuthStatus("Incorrect password. "+(3-attempts)+" attempt"+(3-attempts===1?"":"s")+" remaining.","error");
      }
    }else{
      setAuthStatus(safeMessage(error),"error");
    }
  }finally{
    if(kind==="signin"){
      if(getAuthAttempts(email)<3&&signInButton)signInButton.disabled=false;
    }else{
      if(signInButton)signInButton.disabled=false;
      if(signUpButton)signUpButton.disabled=false;
    }
  }
}
window.obitrendAuthAction=authAction;
async function resetPassword(){
  const email=$("authEmail").value.trim().toLowerCase();
  if(!email||!email.includes("@"))return setAuthStatus("Enter your email first.","error");
  const button=$("forgotBtn");
  if(button)button.disabled=true;
  setAuthStatus("Sending password reset email…");
  try{
    const redirectTo=window.location.origin+"/rebuild/";
    let result=await supabase.auth.resetPasswordForEmail(email,{redirectTo});
    if(result.error&&/redirect|url|not allowed|invalid redirect/i.test(messageText(result.error))){
      result=await supabase.auth.resetPasswordForEmail(email);
    }
    if(result.error)throw result.error;
    clearAuthAttempts(email);
    $("resetPasswordPanel")?.classList.remove("hidden");
    $("forgotBtn")?.classList.add("hidden");
    setAuthStatus("Password reset email sent. Open the link in your email, then enter and retype your new password below.","success");
  }catch(error){
    console.error("OBITREND password recovery error:",error);
    const message=messageText(error);
    if(/rate|limit|too many/i.test(message))setAuthStatus("Too many reset requests. Please wait a few minutes and try again.","error");
    else if(/smtp|email|mailer|send/i.test(message))setAuthStatus("We couldn't send the recovery email right now. Please try again in a few minutes.","error");
    else setAuthStatus(message||"Unable to send the password reset email.","error");
  }finally{
    if(button)button.disabled=false;
  }
}
async function finishPasswordReset(){
  const password=String($("resetPasswordInput")?.value||"");
  const confirm=String($("resetPasswordConfirmInput")?.value||"");
  if(password.length<6)return setAuthStatus("Password must be at least 6 characters.","error");
  if(password!==confirm)return setAuthStatus("Passwords do not match. Retype the same password.","error");
  const button=$("resetPasswordBtn");
  if(button)button.disabled=true;
  try{
    const result=await supabase.auth.updateUser({password});
    if(result.error)throw result.error;
    if($("resetPasswordInput"))$("resetPasswordInput").value="";
    if($("resetPasswordConfirmInput"))$("resetPasswordConfirmInput").value="";
    $("resetPasswordPanel")?.classList.add("hidden");
    try{history.replaceState({},document.title,window.location.pathname);}catch{}
    setAuthStatus("Password changed successfully. Welcome back to OBITREND.","success");
    if(session){
      showDashboard();
      await loadAccount();
    }else{
      await loadSession();
    }
  }catch(error){
    console.error("OBITREND password reset completion error:",error);
    setAuthStatus(safeMessage(error),"error");
  }finally{
    if(button)button.disabled=false;
  }
}
function handlePasswordRecoverySession(){
  const hash=window.location.hash||"";
  const search=window.location.search||"";
  const isRecoveryHash=/access_token=/.test(hash)&&/type=recovery/.test(hash);
  const hasRecoveryCode=/[?&]code=/.test(search);
  if(isRecoveryHash||hasRecoveryCode){
    showAuth();
    $("resetPasswordPanel")?.classList.remove("hidden");
    $("forgotBtn")?.classList.add("hidden");
    $("signInBtn")?.classList.add("hidden");
    $("signUpBtn")?.classList.add("hidden");
    setAuthStatus("Enter and retype your new password.","success");
    return true;
  }
  return false;
}
async function recoverPaymentSession() {
  const params = new URLSearchParams(window.location.search);
  let handoff = params.get("obitrend_handoff") || "";
  let pendingReference = params.get("reference") || params.get("trxref") || params.get("trx_ref") || "";
  if (!handoff) {
    try { handoff = localStorage.getItem("obitrend_payment_handoff") || ""; } catch {}
  }
  if (!pendingReference) {
    try { pendingReference = localStorage.getItem("obitrend_pending_payment_reference") || ""; } catch {}
  }
  if (!handoff && !pendingReference) return false;

  try {
    const headers = {
      Accept: "application/json"
    };

    /*
      If the Supabase session survived the Paystack redirect, send it.
      The backend can then fulfill the payment directly for the
      authenticated account instead of requiring a second login.
    */
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }

    const endpoint = handoff
      ? "/api/paystack?obitrend_handoff=" + encodeURIComponent(handoff)
      : "/api/paystack?reference=" + encodeURIComponent(pendingReference);
    const response = await fetch(
      endpoint,
      {
        headers,
        cache: "no-store"
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data?.ok) {
      throw new Error(
        messageText(data?.error) ||
        "Unable to restore your payment."
      );
    }

    try {
      localStorage.removeItem("obitrend_payment_handoff");
      localStorage.removeItem("obitrend_pending_payment_reference");
    } catch {}

    /*
      When no session existed, the backend returns a recovery URL.
      When the session already exists, it returns the fulfillment
      result directly.
    */
    if (data?.recovery_url) {
      window.location.replace(data.recovery_url);
      return true;
    }

    return true;
  } catch (error) {
    console.error("OBITREND payment recovery error:", error);
    return false;
  }
}
async function loadSession(){
  const loadGeneration = authGeneration;
  const result=await supabase.auth.getSession();

  if(result.error){
    console.error(result.error);
    if(await recoverPaymentSession())return;
    if(loadGeneration !== authGeneration)return;
    showAuth();
    return;
  }

  session=result.data.session||null;

  if(handlePasswordRecoverySession())return;

  if(!session){
    if(await recoverPaymentSession())return;
    if(loadGeneration !== authGeneration)return;
    showAuth();
    return;
  }

  /*
    Process a Paystack handoff even when the existing Supabase
    session is still valid. This is the important path for users
    who finish checkout and are returned directly to the dashboard.
  */
  const paymentRecovered = await recoverPaymentSession();

  showDashboard();
  await loadAccount();
  initSecurityLocks();

  if(paymentRecovered){
    await loadAccount();
    openPage("credits");
    toast("Payment confirmed. Your purchased credits are now available.");
    window.history.replaceState({},document.title,window.location.pathname);
    return;
  }

  await verifyReturnedPayment();
}
async function loadAccount(){if(!session?.access_token)return;try{const response=await fetch("/api/account",{method:"GET",headers:{Accept:"application/json",Authorization:`Bearer ${session.access_token}`},cache:"no-store"});const data=await response.json().catch(()=>({}));if(!response.ok||!data?.ok)throw new Error(data?.error||"Unable to load your account.");account=data.account;renderAccount();}catch(error){console.error("OBITREND account error:",error);account={user:{email:session.user?.email||"",obitrendUserId:""},imageCredits:{free:0,freeTotal:3,pro:0,proTotal:0,available:0},pro:{active:false,planName:null,credits:0},video:{seconds:0}};renderAccount();toast("Signed in. Account details are still loading.");}}
function renderAccount(){const user=account?.user||{},images=account?.imageCredits||{},pro=account?.pro||{},video=account?.video||{},email=user.email||session?.user?.email||"Creator",letter=email.charAt(0).toUpperCase()||"O",proCredits=Number(images.pro||0),freeCredits=Number(images.free||0),available=pro.active?proCredits:Math.max(0,freeCredits),videoSeconds=Number(video.seconds||0);const setText=(id,value)=>{const el=$(id);if(el)el.textContent=String(value??"");};const setValue=(id,value)=>{const el=$(id);if(el)el.value=String(value??"");};setText("profileName",email.split("@")[0]||"Creator");setText("avatarLetter",letter);setText("accountAvatar",letter);setText("accountEmail",email);setText("accountId",user.obitrendUserId||"Authenticated OBITREND account");setText("accountLocation",[user.city,user.country].filter(Boolean).join(", ")||"Profile location not set");setValue("settingsEmail",email);setText("homeImageCredits",available);setText("homeVideoSeconds",videoSeconds);setText("homePlan",pro.active?(pro.planName||"Pro"):"Free");setText("homeExpiry",pro.active&&pro.expiresAt?formatExpiry(pro.expiresAt):"No active Pro plan");setText("creditsAvailable",available);setText("creditsPro",Number(images.pro||0));setText("creditsVideo",videoSeconds);setText("videoSecondsLarge",`${videoSeconds} seconds`);setText("sidePlan",pro.active?(pro.planName||"Pro"):"Free");setText("sideCredits",`${available} image credit${available===1?"":"s"}`);startCreditClock();updateLiveCreditStatus();window.obitrendUpdateAddTextProLock?.();}
function formatExpiry(timestamp){const value=Number(timestamp);if(!Number.isFinite(value))return "Active Pro plan";const date=new Date(value<1e12?value*1000:value);if(Number.isNaN(date.getTime()))return "Active Pro plan";return `Expires ${date.toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"})}`;}
function formatCreditDate(timestamp){const value=Number(timestamp);if(!Number.isFinite(value)||value<=0)return "No expiry set";const date=new Date(value<1e12?value*1000:value);if(Number.isNaN(date.getTime()))return "No expiry set";return date.toLocaleString(undefined,{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"});}
function formatCreditCountdown(seconds){const value=Math.max(0,Math.floor(Number(seconds)||0));const days=Math.floor(value/86400);const hours=Math.floor((value%86400)/3600);const minutes=Math.floor((value%3600)/60);const secs=value%60;if(days>0)return `${days}d ${String(hours).padStart(2,"0")}h ${String(minutes).padStart(2,"0")}m ${String(secs).padStart(2,"0")}s remaining`;return `${String(hours).padStart(2,"0")}h ${String(minutes).padStart(2,"0")}m ${String(secs).padStart(2,"0")}s remaining`;}
function updateLiveCreditStatus(){const box=$("liveCreditStatus");if(!box)return;const images=account?.imageCredits||{},pro=account?.pro||{},video=account?.video||{};const proActive=pro.active===true;const proExhausted=pro.exhausted===true;const available=proActive?Number(images.pro||0):Math.max(0,Number(images.free||0));const videoSeconds=Math.max(0,Number(video.seconds||0));const expiry=proActive||proExhausted?Number(pro.expiresAt||0):Number(images.freeResetAt||0);const now=Math.floor(Date.now()/1000);const remaining=Math.max(0,expiry?expiry-now:0);const plan=proActive?"PRO":proExhausted?"PRO FINISHED":"FREE";const expiryLabel=proActive?"Pro plan expires":proExhausted?"Pro access ended":"Free credits reset";const imageEl=$("liveImageCredits"),videoEl=$("liveVideoCredits"),planEl=$("liveCreditPlan"),labelEl=$("liveCreditExpiryLabel"),expiryEl=$("liveCreditExpiry"),countdownEl=$("liveCreditCountdown"),messageEl=$("liveCreditMessage");if(imageEl)imageEl.textContent=String(available);if(videoEl)videoEl.textContent=`${videoSeconds}s`;if(planEl)planEl.textContent=plan;if(labelEl)labelEl.textContent=expiryLabel;if(expiryEl)expiryEl.textContent=expiry?formatCreditDate(expiry):"No expiry set";if(countdownEl)countdownEl.textContent=expiry?formatCreditCountdown(remaining):"No active timer";box.classList.toggle("credit-empty",available<=0);if(messageEl){if(available<=0){messageEl.textContent=proActive?"Your Pro image credits are finished. Renew Pro to continue.":"Your image credits are finished. Upgrade to continue creating."; }else if(proActive){messageEl.textContent=`${available} Pro image credit${available===1?"":"s"} available. Live balance and expiry timer update automatically.`;}else{messageEl.textContent=`${available} free image credit${available===1?"":"s"} available. They reset automatically at the date and time shown above.`;}}return {expiry,remaining};}
function startCreditClock(){if(creditClockTimer)return;creditClockTimer=setInterval(async()=>{const state=updateLiveCreditStatus();if(state?.expiry&&state.remaining<=0){await loadAccount();}},1000);updateLiveCreditStatus();}

function showAuth(){$("authScreen").classList.remove("hidden");$("dashboardScreen").classList.add("hidden");}
function showDashboard(){$("authScreen").classList.add("hidden");$("dashboardScreen").classList.remove("hidden");openPage("home");}
function getStoredNotifications(){try{const value=JSON.parse(localStorage.getItem("obitrend_notifications")||"[]");return Array.isArray(value)?value:[];}catch{return [];}}
function getNotificationsReadAt(){try{return Number(localStorage.getItem("obitrend_notifications_read_at")||0)||0;}catch{return 0;}}
function markNotificationsRead(){try{localStorage.setItem("obitrend_notifications_read_at",String(Date.now()));}catch{}}
function playNotificationAlert(){try{if("vibrate" in navigator)navigator.vibrate([180,90,180]);}catch{}try{const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)return;const context=new AudioContext();const oscillator=context.createOscillator();const gain=context.createGain();oscillator.type="sine";oscillator.frequency.setValueAtTime(880,context.currentTime);oscillator.frequency.setValueAtTime(660,context.currentTime+0.12);gain.gain.setValueAtTime(0.0001,context.currentTime);gain.gain.exponentialRampToValueAtTime(0.16,context.currentTime+0.015);gain.gain.exponentialRampToValueAtTime(0.0001,context.currentTime+0.32);oscillator.connect(gain);gain.connect(context.destination);oscillator.start();oscillator.stop(context.currentTime+0.34);oscillator.addEventListener("ended",()=>{try{context.close();}catch{}});}catch{}}
function saveNotification(title,body){const item={id:Date.now().toString(36)+Math.random().toString(36).slice(2),title,body,time:new Date().toISOString()};const items=[item,...getStoredNotifications()].slice(0,30);try{localStorage.setItem("obitrend_notifications",JSON.stringify(items));}catch{}renderNotificationCenter();playNotificationAlert();return item;}
function renderNotificationCenter(){const list=$("obNotificationList"),dot=$("obNotificationDot");if(!list)return;const items=getStoredNotifications(),readAt=getNotificationsReadAt();list.innerHTML=items.length?items.map(item=>`<article class="ob-notification-item"><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.body)}</span><time>${new Date(item.time).toLocaleString()}</time></article>`).join(""):`<div class="ob-notification-empty">No notifications yet.</div>`;if(dot)dot.style.display=items.some(item=>new Date(item.time).getTime()>readAt)?"block":"none";}
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));}
async function ensureGenerationPushNotifications(){try{if(!session?.access_token||!("Notification" in window)||!("serviceWorker" in navigator)||!("PushManager" in window))return false;let permission=Notification.permission;if(permission==="default")permission=await Notification.requestPermission();if(permission!=="granted")return false;const registration=await navigator.serviceWorker.register("/obitrend-sw.js",{scope:"/"});const keyResponse=await fetch("/api/push-public-key",{headers:{Accept:"application/json",Authorization:`Bearer ${session.access_token}`},cache:"no-store"});const keyData=await keyResponse.json().catch(()=>({}));if(!keyResponse.ok||!keyData?.publicKey)return false;let subscription=await registration.pushManager.getSubscription();if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(keyData.publicKey)});const saveResponse=await fetch("/api/push-subscription",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({subscription:subscription.toJSON()})});return saveResponse.ok;}catch(error){console.warn("OBITREND generation notification setup skipped:",error);return false;}}
let obAppLockTimer=null;
let obAppLocked=false;
function scheduleObAppLock(){clearTimeout(obAppLockTimer);obAppLockTimer=setTimeout(()=>{obAppLockTimer=null;lockObitrendApp();},5000);}
function lockObitrendApp(){if(obAppLocked||!session?.user?.id)return;obAppLocked=true;const state=obSecurityStorage();const overlay=$("obSecurityLockOverlay");if(!overlay)return;const bio=$("unlockBiometricLock"),voice=$("unlockVoiceLock");if(bio)bio.style.display=state.biometric?"":"none";if(voice)voice.style.display=state.voice?"":"none";if(!state.biometric&&!state.voice){obAppLocked=false;return;}obShowSecurityOverlay("OBITREND locked after you left the app. Unlock to continue.");}
function handleObAppVisibility(){if(!session?.user?.id)return;if(document.visibilityState==="hidden"){scheduleObAppLock();}else{clearTimeout(obAppLockTimer);obAppLockTimer=null;}}
function setupObAppLock(){document.addEventListener("visibilitychange",handleObAppVisibility);window.addEventListener("pagehide",()=>{if(session?.user?.id)scheduleObAppLock();});}

function openNotificationPanel(){const panel=$("obNotificationPanel"),button=$("obNotificationButton");if(!panel)return;panel.hidden=false;button?.setAttribute("aria-expanded","true");markNotificationsRead();renderNotificationCenter();}
function closeNotificationPanel(){const panel=$("obNotificationPanel"),button=$("obNotificationButton");if(panel)panel.hidden=true;button?.setAttribute("aria-expanded","false");}
function urlBase64ToUint8Array(base64String){const padding="=".repeat((4-base64String.length%4)%4);const base64=(base64String+padding).replace(/-/g,"+").replace(/_/g,"/");const raw=atob(base64);return Uint8Array.from([...raw].map(char=>char.charCodeAt(0)));}
async function enableObitrendNotifications(){if(!session?.access_token)return toast("Please sign in before enabling notifications.");if(!("Notification" in window)||!("serviceWorker" in navigator)||!("PushManager" in window))return toast("Push notifications are not supported by this browser.");const button=$("obEnableNotifications");if(button){button.disabled=true;button.textContent="Enabling…";}try{const permission=await Notification.requestPermission();if(permission!=="granted")throw new Error("Notification permission was not granted.");const registration=await navigator.serviceWorker.register("/obitrend-sw.js",{scope:"/"});const keyResponse=await fetch("/api/push-public-key",{headers:{Accept:"application/json",Authorization:`Bearer ${session.access_token}`},cache:"no-store"});const keyData=await keyResponse.json().catch(()=>({}));if(!keyResponse.ok||!keyData?.publicKey)throw new Error(keyData?.error||"Push notifications are not configured.");let subscription=await registration.pushManager.getSubscription();if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(keyData.publicKey)});const saveResponse=await fetch("/api/push-subscription",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({subscription:subscription.toJSON()})});const saveData=await saveResponse.json().catch(()=>({}));if(!saveResponse.ok||!saveData?.success)throw new Error(saveData?.error||"Unable to save notification settings.");if(button){button.textContent="Notifications enabled ✓";}saveNotification("Notifications enabled","OBITREND can now alert you when supported generation jobs finish.");toast("Notifications enabled.");}catch(error){console.error("OBITREND notification setup error:",error);if(button){button.disabled=false;button.textContent="Enable notifications";}toast(error?.message||"Unable to enable notifications.");}}
async function setupNotifications(){renderNotificationCenter();$("obNotificationButton")?.addEventListener("click",()=>{const panel=$("obNotificationPanel");if(panel?.hidden)openNotificationPanel();else closeNotificationPanel();});$("obNotificationClose")?.addEventListener("click",closeNotificationPanel);$("obEnableNotifications")?.addEventListener("click",enableObitrendNotifications);document.addEventListener("click",event=>{const panel=$("obNotificationPanel"),button=$("obNotificationButton");if(panel&&!panel.hidden&&!panel.contains(event.target)&&button&&!button.contains(event.target))closeNotificationPanel();});if(session?.access_token&&"serviceWorker" in navigator&&"Notification" in window&&Notification.permission==="granted"){try{await navigator.serviceWorker.register("/obitrend-sw.js",{scope:"/"});}catch(error){console.warn("OBITREND service worker registration failed:",error);}}}
function openPage(page){window.scrollTo({top:0,behavior:"instant"});const requested=page||"home";const target=requested==="settings"?"account":requested;const valid=["home","create","gallery","video","credits","account"];const safe=valid.includes(target)?target:"home";qsa(".page").forEach(el=>el.classList.remove("active-page"));const pageEl=$("page"+safe.charAt(0).toUpperCase()+safe.slice(1));if(pageEl)pageEl.classList.add("active-page");qsa(".nav-item").forEach(el=>el.classList.toggle("active",el.dataset.page===requested));qsa(".ob-icon-nav-item").forEach(el=>el.classList.toggle("active",el.dataset.page===requested));const titles={home:"AI Fashion Creator",create:"Create",gallery:"Gallery",video:"Video AI",credits:"Credits",account:"Account",settings:"Settings"};$("pageTitle")&&($("pageTitle").textContent=titles[requested]||titles.home);$("pageKicker")&&($("pageKicker").textContent=requested==="home"?"OBITREND":requested.toUpperCase());closeSidebar();if(requested==="settings"){const heading=document.querySelector("#pageAccount .section-head");if(heading)setTimeout(()=>heading.scrollIntoView({behavior:"smooth",block:"start"}),0);}if(requested==="gallery"){renderRecentCreations();loadVideoGallery();}if((requested==="credits"||requested==="account")&&session?.access_token){loadAccount();}}document.getElementById("creditsBackBtn")?.addEventListener("click",()=>openPage("home"));document.getElementById("accountBackBtn")?.addEventListener("click",()=>{openPage("home");openSidebar();});
document.getElementById("galleryBackBtn")?.addEventListener("click",()=>openPage("home"));document.getElementById("obRefreshVideoGallery")?.addEventListener("click",loadVideoGallery);
document.getElementById("videoPageBackBtn")?.addEventListener("click",()=>openPage("home"));
function openSidebar(){const sidebar=$("sidebar"),overlay=$("overlay");if(sidebar)sidebar.classList.add("open");if(overlay){overlay.classList.add("open");overlay.style.display="block";overlay.style.pointerEvents="auto";}}function closeSidebar(){const sidebar=$("sidebar"),overlay=$("overlay");if(sidebar)sidebar.classList.remove("open");if(overlay){overlay.classList.remove("open");overlay.style.display="none";overlay.style.pointerEvents="none";}const dashboard=$("dashboardScreen");if(dashboard){dashboard.classList.remove("hidden");dashboard.style.display="block";}const active=document.querySelector(".page.active-page");if(!active){const home=$("pageHome");if(home)home.classList.add("active-page");}document.body.style.background="#08080b";}

/* =====================================================
   CONVERSATIONAL CREATIVE FLOW
===================================================== */
let sketchTimer=null;
function addUserMessage(text){const wrap=document.createElement("div");wrap.className="chat-card user-card";wrap.innerHTML=`<div class="chat-label">YOU</div><p></p>`;wrap.querySelector("p").textContent=text;$("chatMessages").appendChild(wrap);wrap.scrollIntoView({behavior:"smooth",block:"nearest"});}
function renderSketchDots(progress){const canvas=$("dotCanvas");if(!canvas)return;canvas.innerHTML="";const cols=11,rows=6,cx=5,cy=2.5;for(let y=0;y<rows;y++){for(let x=0;x<cols;x++){const d=Math.hypot((x-cx)/1.7,(y-cy)/1.15);const wave=(progress/100)*7;const active=d<1.15+wave*.18||((x+y*3+Math.floor(progress/8))%9===0&&d<3.5);const dot=document.createElement("i");dot.className=active?"dot active":"dot";dot.style.setProperty("--d",Math.min(d,4));dot.style.animationDelay=((x+y)%7)*45+"ms";canvas.appendChild(dot);}}}
function startSketch(){clearInterval(sketchTimer);return new Promise(resolve=>{const card=$("sketchCard"),pct=$("progressText");card.classList.remove("hidden");let progress=0;pct.textContent="0%";renderSketchDots(0);sketchTimer=setInterval(()=>{progress+=Math.floor(Math.random()*7)+3;if(progress>100)progress=100;pct.textContent=progress+"%";renderSketchDots(progress);if(progress>=100){clearInterval(sketchTimer);resolve();}},260);});}
async function getColorPromptInstructions(){const ids=[["Clothes / Top","obColorClothes"],["Trousers / Pants","obColorTrousers"],["Skirt","obColorSkirt"],["Shorts","obColorShorts"],["Dress / One-piece","obColorDress"],["Shoes","obColorShoes"],["Bag / Accessory","obColorBag"],["Object / Prop","obColorObject"],["Custom item","obColorCustom"]];return ids.map(([label,id])=>{const value=$(id)?.value?.trim();return value?label+": "+value:"";}).filter(Boolean);}
function setupColorPromptEngine(){const status=$("obColorStatus");qsa("#obColorSwatches button").forEach(button=>button.addEventListener("click",()=>{const color=button.dataset.color||button.textContent.trim();const target=prompt("Apply "+color+" to which item? Example: clothes, trousers, skirt, shorts, shoes, bag, object.","");if(!target)return;const n=target.toLowerCase();const id=n.includes("trouser")||n.includes("pant")?"obColorTrousers":n.includes("skirt")?"obColorSkirt":n.includes("short")?"obColorShorts":n.includes("dress")||n.includes("one-piece")?"obColorDress":n.includes("shoe")||n.includes("footwear")?"obColorShoes":n.includes("bag")||n.includes("accessory")?"obColorBag":n.includes("object")||n.includes("prop")?"obColorObject":n.includes("custom")?"obColorCustom":"obColorClothes";const input=$(id);if(input){input.value=color;input.dispatchEvent(new Event("input",{bubbles:true}));}if(status)status.textContent=color+" applied to "+(input?.previousElementSibling?.textContent||target)+"."; }));$("obColorReset")?.addEventListener("click",()=>{qsa("#obColorEngine input").forEach(i=>i.value="");if(status)status.textContent="Color instructions reset. The original/reference colors will be used.";});qsa("#obColorEngine input").forEach(i=>i.addEventListener("input",()=>{const count=getColorPromptInstructions().length;if(status)status.textContent=count+" color instruction"+(count===1?"":"s")+" ready for generation.";}));}
async function handleCreative(){
const hasFile=Boolean($("garmentInput")?.files?.[0]);
const mainPrompt=$("creativePrompt")?.value?.trim()||"Create a true-to-life professional fashion image.";
const extraPrompt=$("obExtraPrompt")?.value?.trim()||"";
const model=$("obModel")?.value||"Woman",background=$("obBackground")?.value||"Luxury hotel",garmentColor=$("obGarmentColor")?.value||"Original garment color",trouserColor=$("obTrouserColor")?.value||"Original trouser color";
const promptParts=[mainPrompt];
if(extraPrompt)promptParts.push(`Additional user instructions: ${extraPrompt}`);
promptParts.push(`Model/body: ${model}.`,`Background/location: ${background}.`,`Garment color direction: ${garmentColor}.`,`Trouser color direction: ${trouserColor}.`);
if(hasFile)promptParts.push("true-to-life professional fashion photography, full-body framing, realistic adult model, preserve uploaded garment design exactly.");
else promptParts.push("true-to-life professional photography, realistic proportions, natural lighting, detailed composition, follow the user's text instructions exactly.");
const prompt=promptParts.join(" ");
const file=$("garmentInput")?.files?.[0];if(!session?.access_token)return toast("Please sign in before generating.");if(file&&file.size>10*1024*1024)return toast("Garment image is too large. Use an image under 10 MB.");
const availableCredits=Number(account?.imageCredits?.available||0);if(availableCredits<=0){openCreditOverlay();return;}ensureGenerationPushNotifications();
const button=$("generateCreativeBtn"),status=$("sketchStatus"),card=$("generationProgressCard"),percent=$("generationProgressPercent"),fill=$("generationProgressFill"),progressStatus=$("generationProgressStatus"),ready=$("generationReadyState"),stages=qsa(".generation-stage");
button.disabled=true;
let progressTimer=null;
const setProgress=(value,message,activeStage=-1)=>{if(percent)percent.textContent=`${value}%`;if(fill)fill.style.width=`${value}%`;if(progressStatus)progressStatus.textContent=message;stages.forEach((stage,index)=>{stage.classList.toggle("done",index<activeStage);stage.classList.toggle("active",index===activeStage);});};
const showProgress=()=>{card?.classList.remove("hidden");ready?.classList.add("hidden");const sketchPreview=$("generationSketchPreview");if(sketchPreview){const ratioMap={"5:4":"5 / 4","9:16":"9 / 16","4:5":"4 / 5","16:9":"16 / 9","1:1":"1 / 1"};sketchPreview.style.aspectRatio=ratioMap[selectedImageRatio]||"4 / 5";}setProgress(8,"Sketching it out…",0);clearInterval(progressTimer);let step=0;const steps=[[20,"One last tweak…",1],[34,"Adding final touches…",2],[49,"Finishing up…",3],[64,"Polishing details…",4],[79,"Setting the scene…",5],[92,"Making the first draft…",6]];progressTimer=setInterval(()=>{if(step<steps.length){const s=steps[step++];setProgress(s[0],s[1],s[2]);}},1100);};
const finishProgress=()=>{clearInterval(progressTimer);setProgress(100,"Image generation completed successfully.",7);ready?.classList.remove("hidden");};
const failProgress=(message)=>{clearInterval(progressTimer);if(progressStatus)progressStatus.textContent=message;stages.forEach(s=>s.classList.remove("active"));};
try{const preview=file?($("garmentInput").dataset.preview||await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);})):null;showProgress();const monthly=Boolean(account?.pro?.active&&String(account?.pro?.planName||"").toUpperCase().includes("MONTHLY"));const colorInstructions=getColorPromptInstructions();
const colorPrompt=colorInstructions.length?"COLOR PROMPT ENGINE: "+colorInstructions.join(". ")+". Apply each requested color ONLY to its named item. Do not transfer colors between items. Preserve uploaded garment construction, pattern, logos, texture and details unless the user explicitly requested a color change.":"";
const payload={userId:session.user.id,prompt:colorPrompt?prompt+" "+colorPrompt:prompt,creativeDirection:colorPrompt?prompt+" "+colorPrompt:prompt,cameraStyle:selectedImageCamera,aspectRatio:selectedImageRatio,ratio:selectedImageRatio,stylePreset:selectedStylePreset,clothingPreservation:Boolean(file),"true-to-life":true,realCamera:true,garmentReference:Boolean(file),imageCount:1,monthlyPro:monthly,monthlyProAccess:monthly,plan:account?.pro?.planName||null,planTier:account?.pro?.active?"pro":"free",automaticImageDetection:Boolean(file),detectedScene:uploadedImageAnalysis||null,extraPrompt};if(file)payload.imageBase64=preview;if(status)status.textContent="Generating your true-to-life fashion image…";let response=null;
let queued=null;
let lastGenerationNetworkError=null;
for(let requestAttempt=0;requestAttempt<3;requestAttempt++){
  try{
    const freshSessionResult=await supabase.auth.getSession();
    const freshAccessToken=freshSessionResult?.data?.session?.access_token||session?.access_token||"";
    if(freshSessionResult?.data?.session)session=freshSessionResult.data.session;
    response=await fetch("/api/generate-background",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json",Authorization:`Bearer ${freshAccessToken}`},body:JSON.stringify(payload),cache:"no-store"});
    const raw=await response.text();
    let data={};try{data=raw?JSON.parse(raw):{}}catch{}
    if(!response.ok){
      const serverMessage=messageText(data?.error||data?.message);
      if((response.status===502||response.status===503||response.status===504)&&requestAttempt<2){
        await new Promise(resolve=>setTimeout(resolve,1200*(requestAttempt+1)));
        continue;
      }
      throw new Error(serverMessage||`Generation failed (${response.status}).`);
    }
    queued=data;
    break;
  }catch(error){
    lastGenerationNetworkError=error;
    if(requestAttempt<2&&/failed to fetch|network|load failed|connection/i.test(String(error?.message||""))){
      await new Promise(resolve=>setTimeout(resolve,1200*(requestAttempt+1)));
      continue;
    }
    throw error;
  }
}
if(!queued){
  throw lastGenerationNetworkError||new Error("The generation service could not be reached. Please try again.");
}
const jobId=queued?.jobId;
if(!jobId)throw new Error("Generation could not be started.");
let job=null;
for(let attempt=0;attempt<180;attempt++){
  await new Promise(resolve=>setTimeout(resolve,attempt===0?800:2000));
  let statusResponse;
  try {
    const freshSessionResult=await supabase.auth.getSession();
    const freshAccessToken=freshSessionResult?.data?.session?.access_token||session?.access_token||"";
    if(freshSessionResult?.data?.session) session=freshSessionResult.data.session;
    statusResponse=await fetch(`/api/generation-status?jobId=${encodeURIComponent(jobId)}`,{headers:{Accept:"application/json",Authorization:`Bearer ${freshAccessToken}`},cache:"no-store"});
  } catch (networkError) {
    if(attempt<179){
      await new Promise(resolve=>setTimeout(resolve,Math.min(5000,1000+attempt*250)));
      continue;
    }
    throw new Error("Connection to the generation service was lost. Please try again.");
  }
  if(!statusResponse.ok){
    if(attempt<179)continue;
    const raw=await statusResponse.text();let data={};try{data=raw?JSON.parse(raw):{}}catch{}
    throw new Error(messageText(data?.error||data?.message)||`Unable to check generation status (${statusResponse.status}).`);
  }
  const statusData=await statusResponse.json();
  job=statusData?.job;
  const p=Number(job?.progress);
  if(Number.isFinite(p)){
    const stage=p<16?0:p<30?1:p<44?2:p<58?3:p<72?4:p<86?5:6;
    const stageMessage=p<16?"Sketching it out…":p<30?"One last tweak…":p<44?"Adding final touches…":p<58?"Finishing up…":p<72?"Polishing details…":p<86?"Setting the scene…":"Making the first draft…";
    setProgress(Math.max(8,Math.min(96,p)),stageMessage,stage);
  }
  if(job?.status==="completed")break;
  if(job?.status==="failed")throw new Error(job?.error_message||"Image generation failed.");
}
if(!job||job.status!=="completed")throw new Error("Image generation timed out. Please try again.");
const image=job?.result?.imageUrl||job?.result?.images?.[0]||"";
if(!image)throw new Error("The image engine completed without returning an image.");
/* Use our authenticated image proxy instead of exposing a Supabase signed URL to the browser. */
const displayImage=image;
const displayObjectUrl=image;
finishProgress();if(document.hidden&&"Notification" in window&&Notification.permission==="granted"){try{new Notification("OBITREND",{body:"Your fashion image is ready.",icon:"/icon-192.png",tag:`obitrend-generation-${jobId}`});}catch{}}$("creativeResultImage").src=displayObjectUrl;$("creativeResultImage").dataset.generatedImage=image;window.obitrendLatestImage=displayObjectUrl;window.latestGeneratedImage=displayObjectUrl;window.generatedImageUrl=displayObjectUrl;window.lastGeneratedImage=displayObjectUrl;try{localStorage.setItem("obitrend_latest_generated_image",displayImage);localStorage.setItem("obitrend_latest_image",displayImage);}catch{}$("creativeResult").classList.remove("hidden");$("creativeResultStatus").textContent="Your OBITREND image is ready.";$("downloadCreativeBtn").onclick=()=>downloadImage(image);const heroDownload=$("obDownloadHero");if(heroDownload){heroDownload.disabled=false;heroDownload.onclick=()=>downloadImage(image);}saveRecentCreation(image);saveNotification("Image ready","Your OBITREND fashion image has finished generating.");toast("Image generated successfully.");await loadAccount();
}catch(error){console.error("OBITREND creative generation error:",error);failProgress(`Generation failed. ${safeMessage(error)}`);if(status)status.textContent="Generation could not be completed. Your credit is restored when no image was generated.";toast(safeMessage(error));await loadAccount();}finally{clearInterval(progressTimer);button.disabled=false;}}

function openCreditOverlay(){const el=$("creditOverlay");if(!el)return;el.classList.remove("hidden");document.body.classList.add("credit-overlay-open");}
function closeCreditOverlay(){const el=$("creditOverlay");if(!el)return;el.classList.add("hidden");document.body.classList.remove("credit-overlay-open");}
function setupCreditOverlay(){const close=$("creditOverlayClose"),upgrade=$("creditOverlayUpgrade"),credits=$("creditOverlayCredits");close?.addEventListener("click",closeCreditOverlay);credits?.addEventListener("click",()=>{closeCreditOverlay();openPage("credits");});upgrade?.addEventListener("click",()=>{closeCreditOverlay();openPage("credits");});$("creditOverlay")?.addEventListener("click",e=>{if(e.target===e.currentTarget)closeCreditOverlay();});}
async function downloadImage(image){
  try{
    const response=await fetch(image,{cache:"no-store"});
    if(!response.ok)throw new Error("Image download failed.");
    const blob=await response.blob();
    const objectUrl=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=objectUrl;
    a.download="OBITREND-fashion-campaign.png";
    a.style.display="none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(objectUrl),1500);
  }catch(error){
    console.error("OBITREND image download failed:",error);
    const a=document.createElement("a");
    a.href=image;
    a.download="OBITREND-fashion-campaign.png";
    a.rel="noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}
function getCurrentCreativeImage(){return $("creativeResultImage")?.dataset.generatedImage||$("creativeResultImage")?.src||window.obitrendLatestImage||window.latestGeneratedImage||"";}
function setupCreativeResultActions(){
  $("shareCreativeBtn")?.addEventListener("click",async()=>{
    const image=getCurrentCreativeImage(); if(!image){toast("No generated image to share.");return;}
    try{
      if(navigator.share){await navigator.share({title:"OBITREND Fashion Creation",text:"My OBITREND fashion creation",url:image});}
      else if(navigator.clipboard){await navigator.clipboard.writeText(image);toast("Image link copied.");}
      else toast("Sharing is not available on this device.");
    }catch(error){if(error?.name!=="AbortError")toast("Unable to share this image.");}
  });
  $("fullscreenCreativeBtn")?.addEventListener("click",async()=>{
    const frame=$("creativeResult")?.querySelector(".result-frame"),image=$("creativeResultImage");
    try{if(frame?.requestFullscreen){await frame.requestFullscreen();}else if(image?.webkitEnterFullscreen){image.webkitEnterFullscreen();}else toast("Fullscreen is not available on this device.");}
    catch(error){toast("Unable to open fullscreen.");}
  });
  $("deleteCreativeBtn")?.addEventListener("click",()=>{
    const image=getCurrentCreativeImage(); if(!image){toast("No generated image to delete.");return;}
    try{
      const items=JSON.parse(localStorage.getItem("obitrendRecentCreations")||"[]");
      localStorage.setItem("obitrendRecentCreations",JSON.stringify(items.filter(src=>src!==image)));
    }catch{}
    const result=$("creativeResult"); if(result)result.classList.add("hidden");
    const img=$("creativeResultImage"); if(img){img.removeAttribute("src");delete img.dataset.generatedImage;}
    window.obitrendLatestImage="";window.latestGeneratedImage="";window.generatedImageUrl="";window.lastGeneratedImage="";
    try{localStorage.removeItem("obitrend_latest_generated_image");localStorage.removeItem("obitrend_latest_image");}catch{}
    renderRecentCreations();toast("Creation deleted.");
  });
}

function saveRecentCreation(image){try{const items=JSON.parse(localStorage.getItem("obitrendRecentCreations")||"[]");items.unshift(image);localStorage.setItem("obitrendRecentCreations",JSON.stringify(items.slice(0,5)));renderRecentCreations();}catch{}}
function renderRecentCreations(){const grid=$("obRecentGrid");if(!grid)return;let items=[];try{items=JSON.parse(localStorage.getItem("obitrendRecentCreations")||"[]")}catch{}if(!items.length){grid.innerHTML='<div class="ob-recent-empty">Your generated fashion images will appear here.</div>';return;}grid.innerHTML=items.map((src,i)=>`<button class="ob-recent-card" type="button"><img src="${src}" alt="Recent OBITREND creation"></button>`).join("");qsa(".ob-recent-card",grid).forEach((b,i)=>b.onclick=()=>{const src=items[i];const preview=$("obGalleryImagePreview"),previewImage=$("obGalleryPreviewImage");if(preview&&previewImage){previewImage.src=src;preview.classList.remove("hidden");}const resultImage=$("creativeResultImage");if(resultImage){resultImage.src=src;resultImage.dataset.generatedImage=src;}window.obitrendLatestImage=src;window.latestGeneratedImage=src;window.generatedImageUrl=src;window.lastGeneratedImage=src;try{localStorage.setItem("obitrend_latest_generated_image",src);localStorage.setItem("obitrend_latest_image",src);}catch{}$("creativeResult").classList.remove("hidden");$("downloadCreativeBtn").onclick=()=>downloadImage(src);});}
async function loadVideoGallery(){
  const grid=$("obVideoGalleryGrid");
  if(!grid||!session?.access_token)return;
  grid.innerHTML='<div class="ob-video-gallery-empty">Loading your saved videos…</div>';
  try{
    const response=await fetch("/api/video-gallery",{
      headers:{Accept:"application/json",Authorization:`Bearer ${session.access_token}`},
      cache:"no-store"
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data?.success!==true)throw new Error(messageText(data?.error)||"Unable to load your saved videos.");
    const videos=Array.isArray(data.videos)?data.videos:[];
    if(!videos.length){
      grid.innerHTML='<div class="ob-video-gallery-empty">Your saved AI videos will appear here automatically.</div>';
      return;
    }
    grid.innerHTML=videos.map(video=>`<article class="ob-video-gallery-card"><video controls playsinline preload="metadata" src="${escapeHtml(video.videoUrl)}"></video><div class="ob-video-gallery-meta"><strong>${Number(video.duration)||0}s AI Video</strong><span>${video.completedAt?new Date(video.completedAt).toLocaleDateString():"Saved"}</span></div></article>`).join("");
  }catch(error){
    console.error("OBITREND video gallery:",error);
    grid.innerHTML='<div class="ob-video-gallery-empty">Unable to load your saved videos. Tap Refresh to try again.</div>';
  }
}
window.obitrendRefreshVideoGallery=loadVideoGallery;

function setupGalleryImagePreview(){const preview=$("obGalleryImagePreview"),close=$("obGalleryPreviewClose"),download=$("obGalleryPreviewDownload");if(!preview)return;const closePreview=()=>{preview.classList.add("hidden");const image=$("obGalleryPreviewImage");if(image)image.removeAttribute("src");};close?.addEventListener("click",closePreview);download?.addEventListener("click",()=>{const src=$("obGalleryPreviewImage")?.src;if(src)downloadImage(src);});preview.addEventListener("click",event=>{if(event.target===preview)closePreview();});document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!preview.classList.contains("hidden"))closePreview();});}
function setupImageCamera(){qsa("[data-camera-style]").forEach(card=>card.addEventListener("click",()=>{if(!account?.pro?.active){toast("Camera Style is available to Pro users only.");return;}qsa("[data-camera-style]").forEach(x=>x.classList.remove("selected"));card.classList.add("selected");selectedImageCamera=card.dataset.cameraStyle||"AI Smart Camera";toast(`${selectedImageCamera} selected.`);}));}

function setupCreative(){const input=$("garmentInput"),name=$("garmentName"),button=$("generateCreativeBtn");if(!input)return;
input.addEventListener("change",()=>{const file=input.files?.[0];uploadedImageAnalysis=null;if(name)name.textContent=file?file.name:"image.jpg";if(file){const reader=new FileReader();reader.onload=async()=>{input.dataset.preview=reader.result;const preview=$("dashboardGarmentPreview");if(preview){preview.src=reader.result;preview.style.display="block";preview.style.visibility="visible";}const size=$("dashboardImageSize");if(size)size.textContent=(file.size/(1024*1024)).toFixed(1)+" MB";const badge=$("dashboardImageBadge");if(badge)badge.innerHTML="Detecting image objects… <i>◌</i>";toast("AI is automatically detecting the uploaded image…");try{const response=await fetch("/api/analyze-image",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json",Authorization:`Bearer ${session?.access_token||""}`},body:JSON.stringify({imageBase64:reader.result})});const data=await response.json().catch(()=>({}));if(response.ok&&data?.success){uploadedImageAnalysis=data.analysis||null;input.dataset.analysis=JSON.stringify(uploadedImageAnalysis);const labels=[uploadedImageAnalysis.primarySubject,uploadedImageAnalysis.sceneType,...(uploadedImageAnalysis.vehicles||[]).slice(0,2),...(uploadedImageAnalysis.properties||[]).slice(0,2),...(uploadedImageAnalysis.objects||[]).slice(0,3)].filter(Boolean);if(badge)badge.innerHTML=`AI Detected: ${labels.slice(0,4).join(" · ")} <i>✓</i>`;toast("AI detected the uploaded image automatically.");}else{if(badge)badge.innerHTML="Uploaded Image <i>✓</i>";console.warn("OBITREND image detection:",data?.error||"Detection unavailable");}}catch(error){if(badge)badge.innerHTML="Uploaded Image <i>✓</i>";console.warn("OBITREND image detection failed:",error);}};reader.readAsDataURL(file);}});qsa(".ob-chip").forEach(b=>b.addEventListener("click",()=>{const p=$("creativePrompt");if(p)p.value=b.dataset.prompt||"";}));
const addTextButton=$("obAddTextPrompt"),extraPromptWrap=$("obExtraPromptWrap"),extraPrompt=$("obExtraPrompt"),extraPromptCount=$("obExtraPromptCount"),clearExtraPrompt=$("obClearExtraPrompt");
const isMonthlyProUser=()=>Boolean(account?.pro?.active&&String(account?.pro?.plan||account?.pro?.planName||"").toUpperCase().includes("MONTHLY"));
const updateAddTextProLock=()=>{
  const monthly=isMonthlyProUser();
  if(addTextButton){
    addTextButton.classList.toggle("monthly-pro-locked",!monthly);
    addTextButton.setAttribute("aria-disabled",String(!monthly));
    addTextButton.title=monthly?"Add extra instructions to your prompt":"Monthly Pro users only";
  }
  const status=$("obPromptTextStatus");
  if(status) status.textContent=monthly?"Add extra instructions without uploading an image":"🔒 Monthly Pro users only";
  if(!monthly){
    if(extraPromptWrap){extraPromptWrap.dataset.open="false";extraPromptWrap.classList.add("hidden");}
    if(extraPrompt)extraPrompt.value="";
    if(extraPromptCount)extraPromptCount.textContent="0 characters";
  }
};
window.obitrendUpdateAddTextProLock=updateAddTextProLock;
const updateExtraPromptUI=()=>{const count=(extraPrompt?.value||"").length;if(extraPromptCount)extraPromptCount.textContent=`${count} character${count===1?"":"s"}`;if(extraPromptWrap)extraPromptWrap.classList.toggle("hidden",!extraPromptWrap.dataset.open);if(addTextButton){const open=extraPromptWrap?.dataset.open==="true";addTextButton.setAttribute("aria-expanded",String(open));addTextButton.innerHTML=open?"<span>−</span> Hide Extra Text":"<span>＋</span> Add Text to Prompt";}if(extraPrompt?.value?.trim()){const status=$("obPromptTextStatus");if(status)status.textContent="Extra instructions will be combined automatically when you generate.";}}
addTextButton?.addEventListener("click",()=>{if(!isMonthlyProUser()){toast("🔒 Add Text to Prompt is available only to Monthly Pro users.");openPage("credits");return;}if(!extraPromptWrap)return;const open=extraPromptWrap.dataset.open==="true";extraPromptWrap.dataset.open=open?"false":"true";extraPromptWrap.classList.toggle("hidden",open);updateExtraPromptUI();if(!open)extraPrompt?.focus();});
extraPrompt?.addEventListener("input",updateExtraPromptUI);
clearExtraPrompt?.addEventListener("click",()=>{if(extraPrompt)extraPrompt.value="";updateExtraPromptUI();});
updateExtraPromptUI();updateAddTextProLock();
qsa("[data-ob-upload]").forEach(b=>b.addEventListener("click",()=>input.click()));qsa("[data-ob-generate]").forEach(b=>b.addEventListener("click",handleCreative));button?.addEventListener("click",handleCreative);$("obProfileButton")?.addEventListener("click",()=>openPage("account"));$("obMenuButton")?.addEventListener("click",openSidebar);$("obSideClose")?.addEventListener("click",closeSidebar);renderRecentCreations();}


$("authEmail")?.addEventListener("input",()=>{const email=$("authEmail").value.trim().toLowerCase();if(email)restoreLoginControls(email);});
$("signInTab")?.addEventListener("click",()=>setAuthMode("signin"));$("signUpTab")?.addEventListener("click",()=>setAuthMode("signup"));$("signInBtn")?.addEventListener("click",e=>{e.preventDefault();authAction("signin")});$("signUpBtn")?.addEventListener("click",e=>{e.preventDefault();authAction("signup")});$("forgotBtn")?.addEventListener("click",resetPassword);$("authForm")?.addEventListener("submit",e=>{e.preventDefault();authAction(authMode)});$("toggleAuthPassword")?.addEventListener("click",()=>{const p=$("authPassword");const b=$("toggleAuthPassword");if(p){const show=p.type==="password";p.type=show?"text":"password";b?.setAttribute("aria-pressed",String(show));if(b)b.textContent=show?"Hide":"Show";}});$("authGoogleBtn")?.addEventListener("click",async()=>{try{const result=await supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo:window.location.origin+window.location.pathname}});if(result.error)throw result.error;}catch(error){setAuthStatus(safeMessage(error),"error")}});$("authAppleBtn")?.addEventListener("click",async()=>{try{const result=await supabase.auth.signInWithOAuth({provider:"apple",options:{redirectTo:window.location.origin+window.location.pathname}});if(result.error)throw result.error;}catch(error){setAuthStatus(safeMessage(error),"error")}});
function openVideoStudio(){if(typeof window.obitrendOpenVideoStudio==="function"){window.obitrendOpenVideoStudio();return;}const launcher=$("obitrendVideoLauncher");if(launcher){launcher.click();return;}let attempts=0;const timer=setInterval(()=>{if(typeof window.obitrendOpenVideoStudio==="function"){clearInterval(timer);window.obitrendOpenVideoStudio();return;}const ready=$("obitrendVideoLauncher");if(ready){clearInterval(timer);ready.click();return;}if(++attempts>=120){clearInterval(timer);toast("Video studio is still loading. Try again in a moment.");}},150);}qsa(".nav-item").forEach(button=>button.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();const page=button.dataset.page;if(page==="video"){closeSidebar();openVideoStudio();return;}openPage(page);}));qsa("[data-page-jump]").forEach(button=>button.addEventListener("click",()=>openPage(button.dataset.pageJump)));qsa("[data-coming-soon]").forEach(button=>button.addEventListener("click",()=>toast(`${button.dataset.comingSoon} is the next build section.`)));const openVideoStudioBtn=$("openVideoStudioBtn");openVideoStudioBtn?.addEventListener("click",openVideoStudio);
$("resetPasswordBtn")?.addEventListener("click",finishPasswordReset);$("menuBtn")?.addEventListener("click",openSidebar);$("overlay")?.addEventListener("click",closeSidebar);$("profileBtn")?.addEventListener("click",()=>openPage("account"));$("signOutBtn")?.addEventListener("click",async()=>{try{const result=await supabase.auth.signOut();if(result.error)throw result.error;}catch(error){toast(safeMessage(error));return;}session=null;account=null;setAuthStatus("Signed out.","success");showAuth();});
supabase.auth.onAuthStateChange((event,nextSession)=>{if(event==="PASSWORD_RECOVERY"){session=nextSession||session;showAuth();$("resetPasswordPanel")?.classList.remove("hidden");$("forgotBtn")?.classList.add("hidden");$("signInBtn")?.classList.add("hidden");$("signUpBtn")?.classList.add("hidden");setAuthStatus("Enter your new password.","success");return;}if(nextSession){session=nextSession;showDashboard();loadAccount().then(verifyReturnedPayment);return;}if(event==="SIGNED_OUT"){session=null;account=null;showAuth();}});

/* Reference dashboard interactions: tabs, video settings, and video handoff. */
function setupReferenceAuth(){
  const form=$("dashboardAuthForm"),email=$("dashboardAuthEmail"),password=$("dashboardAuthPassword");
  const status=$("dashboardAuthStatus"),signIn=$("dashboardSignInBtn"),signUp=$("dashboardSignUpBtn");
  const setStatus=(message,type="")=>{if(status){status.textContent=message;status.style.color=type==="error"?"#ff7777":"#6ef29f";}};
  const run=async(kind)=>{
    const e=email?.value.trim().toLowerCase()||"",p=password?.value||"";
    if(!e||!e.includes("@"))return setStatus("Enter a valid email address.","error");
    if(p.length<6)return setStatus("Password must be at least 6 characters.","error");
    if(signIn)signIn.disabled=true;if(signUp)signUp.disabled=true;
    setStatus(kind==="signin"?"Signing in…":"Creating your account…");
    try{
      const result=kind==="signin"
        ?await supabase.auth.signInWithPassword({email:e,password:p})
        :await supabase.auth.signUp({email:e,password:p});
      if(result.error)throw result.error;
      if(kind==="signup"&&!result.data.session){
        setStatus("Account created. Check your email if confirmation is required.");
        return;
      }
      await loadSession();
    }catch(error){console.error(error);setStatus(safeMessage(error),"error");}
    finally{if(signIn)signIn.disabled=false;if(signUp)signUp.disabled=false;}
  };
  form?.addEventListener("submit",e=>{e.preventDefault();run("signin");});
  signUp?.addEventListener("click",()=>run("signup"));
  $("dashboardForgotBtn")?.addEventListener("click",async()=>{
    const e=email?.value.trim().toLowerCase()||"";
    if(!e||!e.includes("@"))return setStatus("Enter your email first.","error");
    try{
      const result=await supabase.auth.resetPasswordForEmail(e,{redirectTo:window.location.origin+window.location.pathname});
      if(result.error)throw result.error;
      setStatus("Password reset instructions sent to your email.");
    }catch(error){setStatus(safeMessage(error),"error");}
  });
  $("dashboardPasswordToggle")?.addEventListener("click",()=>{
    if(!password)return;
    password.type=password.type==="password"?"text":"password";
  });
  $("dashboardGoogleBtn")?.addEventListener("click",async()=>{
    try{const result=await supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo:window.location.origin+window.location.pathname}});if(result.error)throw result.error;}
    catch(error){setStatus(safeMessage(error),"error");}
  });
  $("dashboardAppleBtn")?.addEventListener("click",async()=>{
    try{const result=await supabase.auth.signInWithOAuth({provider:"apple",options:{redirectTo:window.location.origin+window.location.pathname}});if(result.error)throw result.error;}
    catch(error){setStatus(safeMessage(error),"error");}
  });
}
function setupReferenceDashboard(){
  const imageTab=$("obImageTab"), videoTab=$("obVideoTab");
  const setMode=(mode)=>{
    const image=mode==="image";
    imageTab?.classList.toggle("active",image);
    videoTab?.classList.toggle("active",!image);
    imageTab?.setAttribute("aria-selected",String(image));
    videoTab?.setAttribute("aria-selected",String(!image));
  };
  qsa(".ob-icon-nav-item").forEach(item=>item.addEventListener("click",()=>{
    const page=item.dataset.page||"home";
    qsa(".ob-icon-nav-item").forEach(x=>x.classList.toggle("active",x===item));
    openPage(page);
  }));
  qsa(".nav-item[data-page]").forEach(item=>item.addEventListener("click",()=>{
    const page=item.dataset.page||"home";
    qsa(".nav-item[data-page]").forEach(x=>x.classList.toggle("active",x===item));
    qsa(".ob-icon-nav-item[data-page]").forEach(x=>x.classList.toggle("active",x.dataset.page===page));
    openPage(page);
  }));
  qsa(".ob-head-icon").forEach(button=>button.addEventListener("click",()=>{
    if(button.getAttribute("aria-label")==="Notifications") toast("No new notifications.");
    else toast("Search is ready.");
  }));
  imageTab?.addEventListener("click",()=>setMode("image"));
  videoTab?.addEventListener("click",()=>{setMode("video");openVideoStudio();});

  qsa("[data-style-preset]").forEach(card=>card.addEventListener("click",()=>{
    qsa("[data-style-preset]").forEach(x=>x.classList.remove("selected"));
    card.classList.add("selected");
    selectedStylePreset=card.dataset.stylePreset||"Realistic";
  }));

  qsa("[data-ratio]").forEach(button=>button.addEventListener("click",()=>{
    qsa("[data-ratio]").forEach(x=>x.classList.remove("selected"));
    button.classList.add("selected");
    selectedImageRatio=button.dataset.ratio||"5:4";
  }));

  qsa("[data-video-duration]").forEach(button=>button.addEventListener("click",()=>{
    qsa("[data-video-duration]").forEach(x=>x.classList.remove("selected"));
    button.classList.add("selected");
    button.dataset.videoDuration && (window.obitrendVideoDuration=Number(button.dataset.videoDuration));
  }));

  $("obCameraMovement")?.addEventListener("click",()=>{
    const button=$("obCameraMovement");
    const current=button.dataset.movement||"Static Shot";
    const next=current==="Static Shot"?"Slow Pan":"Static Shot";
    button.dataset.movement=next;
    button.innerHTML=`<span>▣</span> ${next} <b>⌄</b>`;
  });

  $("generateVideoDashboardBtn")?.addEventListener("click",openVideoStudio);}

function obSecurityKey(suffix){return "obitrend_security_"+String(session?.user?.id||"guest")+"_"+suffix;}
function obB64u(bytes){let s="";const a=new Uint8Array(bytes);for(const b of a)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");}
function obB64uBytes(value){const s=String(value).replace(/-/g,"+").replace(/_/g,"/");const p=s+"=".repeat((4-s.length%4)%4);const b=atob(p);return Uint8Array.from(b,c=>c.charCodeAt(0));}
async function obHash(value){const data=new TextEncoder().encode(String(value));const digest=await crypto.subtle.digest("SHA-256",data);return obB64u(digest);}
function obSecurityStorage(){return{biometric:localStorage.getItem(obSecurityKey("biometric"))==="1",voice:localStorage.getItem(obSecurityKey("voice"))==="1"};}
function obShowSecurityOverlay(message="Unlock to continue."){const overlay=$("obSecurityLockOverlay");if(!overlay)return;const text=$("obSecurityLockMessage");if(text)text.textContent=message;overlay.classList.remove("hidden");}
function obHideSecurityOverlay(){const overlay=$("obSecurityLockOverlay");if(overlay)overlay.classList.add("hidden");}
function obSecurityStatus(message,type=""){const el=$("obSecurityLockStatus");if(el){el.textContent=message;el.className=`form-status ${type}`.trim();}}
function obGetSpeechRecognition(){return window.SpeechRecognition||window.webkitSpeechRecognition||null;}
async function setupBiometricSecurity(){if(!session?.user?.id)return obSecurityStatus("Please sign in first.","error");if(!window.PublicKeyCredential||!navigator.credentials)return obSecurityStatus("Biometric / Face Lock is not supported on this device or browser.","error");try{const button=$("setupBiometricLock");if(button)button.disabled=true;const credential=await navigator.credentials.create({publicKey:{challenge:crypto.getRandomValues(new Uint8Array(32)),rp:{name:"OBITREND"},user:{id:new TextEncoder().encode(session.user.id),name:session.user.email||session.user.id,displayName:"OBITREND User"},pubKeyCredParams:[{type:"public-key",alg:-7},{type:"public-key",alg:-257}],authenticatorSelection:{residentKey:"required",requireResidentKey:true,userVerification:"required"},timeout:60000,attestation:"none"}});if(!credential)throw new Error("Biometric setup was cancelled.");localStorage.setItem(obSecurityKey("biometric"),"1");localStorage.setItem(obSecurityKey("credential"),obB64u(credential.rawId));obSecurityStatus("Biometric / Face Lock enabled.","success");if(button)button.textContent="Enabled";}catch(error){console.error("OBITREND biometric setup:",error);obSecurityStatus(error?.name==="NotAllowedError"?"Biometric setup was cancelled.":"Unable to enable Biometric / Face Lock.","error");}finally{const button=$("setupBiometricLock");if(button)button.disabled=false;}}
async function unlockWithBiometric(){if(!session?.user?.id)return;try{obSecurityStatus("Waiting for device authentication…");const credentialId=localStorage.getItem(obSecurityKey("credential"));const publicKey={challenge:crypto.getRandomValues(new Uint8Array(32)),rpId:location.hostname,userVerification:"required",timeout:60000};if(credentialId)publicKey.allowCredentials=[{type:"public-key",id:obB64uBytes(credentialId)}];const credential=await navigator.credentials.get({publicKey});if(!credential)throw new Error("Authentication was cancelled.");obAppLocked=false;obHideSecurityOverlay();obSecurityStatus("");}catch(error){console.error("OBITREND biometric unlock:",error);obSecurityStatus(error?.name==="NotAllowedError"?"Biometric authentication was cancelled.":"Biometric authentication failed.","error");}}
function obListenForVoice(onResult,onError){const Speech=obGetSpeechRecognition();if(!Speech){onError(new Error("Voice Lock is not supported on this device or browser."));return null;}const recognition=new Speech();recognition.lang="en-NG";recognition.continuous=false;recognition.interimResults=false;recognition.maxAlternatives=1;recognition.onresult=e=>onResult(String(e.results?.[0]?.[0]?.transcript||"").trim());recognition.onerror=e=>onError(new Error(e.error||"Voice recognition failed."));try{recognition.start();}catch(error){onError(error);}return recognition;}
async function setupVoiceSecurity(){if(!session?.user?.id)return obSecurityStatus("Please sign in first.","error");if(!obGetSpeechRecognition())return obSecurityStatus("Voice Lock is not supported on this device or browser.","error");const modal=$("obVoiceSetupModal"),input=$("obVoicePhraseInput"),continueBtn=$("obVoiceSetupContinue"),cancelBtn=$("obVoiceSetupCancel"),modalStatus=$("obVoiceSetupStatus");if(!modal||!input||!continueBtn||!cancelBtn)return;modal.classList.remove("hidden");input.value="";input.focus();const close=()=>modal.classList.add("hidden");cancelBtn.onclick=close;continueBtn.onclick=()=>{const expectedPhrase=String(input.value||"").toLowerCase().replace(/\s+/g," ").trim();if(!expectedPhrase){if(modalStatus){modalStatus.textContent="Enter a private voice phrase.";modalStatus.className="form-status error";}return;}const button=$("setupVoiceLock");if(button)button.disabled=true;if(modalStatus){modalStatus.textContent="Listening… say the exact phrase now.";modalStatus.className="form-status";}obListenForVoice(async transcript=>{const spoken=String(transcript||"").toLowerCase().replace(/\s+/g," ").trim();if(spoken!==expectedPhrase){if(modalStatus){modalStatus.textContent="Voice phrase did not match. Try again.";modalStatus.className="form-status error";}if(button)button.disabled=false;return;}localStorage.setItem(obSecurityKey("voiceHash"),await obHash(expectedPhrase));localStorage.setItem(obSecurityKey("voice"),"1");close();obSecurityStatus("Voice Lock enabled.","success");if(button)button.textContent="Enabled";},error=>{if(modalStatus){modalStatus.textContent=error.message||"Unable to enable Voice Lock.";modalStatus.className="form-status error";}if(button)button.disabled=false;});};}
async function unlockWithVoice(){if(!session?.user?.id)return;const expected=localStorage.getItem(obSecurityKey("voiceHash"));if(!expected)return obSecurityStatus("Voice Lock is not configured.","error");obSecurityStatus("Listening… say your voice phrase.");obListenForVoice(async transcript=>{const actual=await obHash(transcript.toLowerCase().replace(/\\s+/g," ").trim());if(actual===expected){obAppLocked=false;obHideSecurityOverlay();obSecurityStatus("");}else obSecurityStatus("Voice phrase did not match.","error");},error=>obSecurityStatus(error.message||"Voice unlock failed.","error"));}
function initSecurityLocks(){if(!session?.user?.id)return;const setup=$("setupBiometricLock"),voice=$("setupVoiceLock"),unlockBio=$("unlockBiometricLock"),unlockVoice=$("unlockVoiceLock");setup?.addEventListener("click",setupBiometricSecurity);voice?.addEventListener("click",setupVoiceSecurity);unlockBio?.addEventListener("click",unlockWithBiometric);unlockVoice?.addEventListener("click",unlockWithVoice);const state=obSecurityStorage();if(setup&&state.biometric)setup.textContent="Enabled";if(voice&&state.voice)voice.textContent="Enabled";if(state.biometric||state.voice){if(unlockBio)unlockBio.style.display=state.biometric?"":"none";if(unlockVoice)unlockVoice.style.display=state.voice?"":"none";obShowSecurityOverlay("Use your enabled security lock to continue.");}}

function setupAccountSettings(){const emailInput=$("settingsEmail"),passwordInput=$("settingsPassword"),emailBtn=$("saveSettingsEmail"),passwordBtn=$("saveSettingsPassword"),status=$("settingsStatus");const setStatus=(message,type="")=>{if(status){status.textContent=message;status.className=`form-status ${type}`.trim();}};emailBtn?.addEventListener("click",async()=>{if(!session)return setStatus("Please sign in first.","error");const email=String(emailInput?.value||"").trim().toLowerCase();if(!email||!email.includes("@"))return setStatus("Enter a valid email address.","error");emailBtn.disabled=true;try{const result=await supabase.auth.updateUser({email});if(result.error)throw result.error;setStatus("Email change request sent. Check the new email address to confirm the change.","success");}catch(error){setStatus(safeMessage(error),"error");}finally{emailBtn.disabled=false;}});passwordBtn?.addEventListener("click",async()=>{if(!session)return setStatus("Please sign in first.","error");const password=String(passwordInput?.value||"");if(password.length<6)return setStatus("Password must be at least 6 characters.","error");passwordBtn.disabled=true;try{const result=await supabase.auth.updateUser({password});if(result.error)throw result.error;if(passwordInput)passwordInput.value="";setStatus("Password changed successfully.","success");}catch(error){setStatus(safeMessage(error),"error");}finally{passwordBtn.disabled=false;}});$("obProfileButton")?.addEventListener("dblclick",()=>openPage("settings"));$("openSettingsBtn")?.addEventListener("click",()=>openPage("settings"));} setupAccountSettings();initSecurityLocks();setupCreative();
setupCreativeResultActions();setupImageCamera();setupGalleryImagePreview();setupReferenceAuth();setupReferenceDashboard();setupCreditOverlay();setupColorPromptEngine();
setupNotifications();
setupObAppLock();loadSession();
async function startProPayment(plan){
  if(!session?.access_token)return toast("Please sign in before purchasing Pro.");
  const button=document.querySelector('.pay-pro-btn[data-plan="'+plan+'"]');
  if(button){button.disabled=true;button.dataset.originalText=button.textContent;button.textContent="Connecting to Paystack…";}
  try{
    const email=String(session.user?.email||account?.user?.email||"").trim().toLowerCase();
    const response=await fetch("/api/paystack",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({product:"OBITREND_PRO",plan,email})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data?.authorization_url)throw new Error(messageText(data?.error)||"Unable to start payment.");
    if(data?.reference){try{localStorage.setItem("obitrend_pending_payment_reference",String(data.reference));}catch{}}
    if(data?.handoff){try{localStorage.setItem("obitrend_payment_handoff",String(data.handoff));}catch{}}
    window.location.href=data.authorization_url;
  }catch(error){console.error("OBITREND payment error:",error);toast(safeMessage(error));if(button){button.disabled=false;button.textContent=button.dataset.originalText||"Continue to payment →";}}
}
async function verifyReturnedPayment(){
  const params=new URLSearchParams(window.location.search);
  const reference=params.get("reference")||params.get("trxref")||params.get("trx_ref");
  if(!reference||!session?.access_token)return;
  try{
    toast("Verifying your Paystack payment…");
    const response=await fetch("/api/paystack?reference="+encodeURIComponent(reference),{headers:{Accept:"application/json",Authorization:`Bearer ${session.access_token}`},cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data?.ok)throw new Error(messageText(data?.error)||"Payment verification failed.");
    await loadAccount();
    toast(data?.duplicate?"Payment already applied.":"Payment confirmed. Your Pro credits are now available.");
    window.history.replaceState({},document.title,window.location.pathname);
    openPage("credits");
  }catch(error){console.error("OBITREND payment verification error:",error);toast(safeMessage(error));}
}
qsa(".pay-pro-btn").forEach(b=>b.addEventListener("click",()=>startProPayment(b.dataset.plan)));

qsa(".bottom-nav-item").forEach(button=>button.addEventListener("click",()=>{openPage(button.dataset.page);qsa(".bottom-nav-item").forEach(el=>el.classList.toggle("active",el===button));}));
