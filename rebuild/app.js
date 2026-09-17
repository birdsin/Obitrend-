import { supabase } from "../supabase.js";

const $ = (id) => document.getElementById(id);
const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];

let session = null;
let account = null;
let authMode = "signin";

function safeMessage(error) {
  const message = String(error?.message || error || "Something went wrong.");
  if (/invalid login credentials/i.test(message)) return "Email or password is incorrect.";
  if (/email not confirmed/i.test(message)) return "Please confirm your email before signing in.";
  if (/already registered|already exists/i.test(message)) return "That email is already registered. Try signing in.";
  if (/password/i.test(message) && /6/i.test(message)) return "Password must be at least 6 characters.";
  return message.length > 180 ? "Unable to complete that request right now." : message;
}

function setAuthStatus(message = "", type = "") {
  const el = $("authStatus");
  el.textContent = message;
  el.className = `form-status ${type}`.trim();
}

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2600);
}

function setAuthMode(mode) {
  authMode = mode;
  const signIn = mode === "signin";
  $("signInTab").classList.toggle("active", signIn);
  $("signUpTab").classList.toggle("active", !signIn);
  $("signInBtn").classList.toggle("hidden", !signIn);
  $("signUpBtn").classList.toggle("hidden", signIn);
  $("forgotBtn").classList.toggle("hidden", !signIn);
  $("authPassword").autocomplete = signIn ? "current-password" : "new-password";
  setAuthStatus("");
}

async function authAction(kind) {
  const email = $("authEmail").value.trim().toLowerCase();
  const password = $("authPassword").value;
  if (!email || !email.includes("@")) return setAuthStatus("Enter a valid email address.", "error");
  if (password.length < 6) return setAuthStatus("Password must be at least 6 characters.", "error");

  $("signInBtn").disabled = true;
  $("signUpBtn").disabled = true;
  setAuthStatus(kind === "signin" ? "Signing in…" : "Creating your account…");

  try {
    const result = kind === "signin"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });

    if (result.error) throw result.error;

    if (kind === "signup" && !result.data.session) {
      setAuthStatus("Account created. Check your email if confirmation is required, then sign in.", "success");
      setAuthMode("signin");
      $("authPassword").value = "";
      return;
    }

    await loadSession();
  } catch (error) {
    console.error("OBITREND auth error:", error);
    setAuthStatus(safeMessage(error), "error");
  } finally {
    $("signInBtn").disabled = false;
    $("signUpBtn").disabled = false;
  }
}

async function resetPassword() {
  const email = $("authEmail").value.trim().toLowerCase();
  if (!email || !email.includes("@")) return setAuthStatus("Enter your email first.", "error");
  try {
    const redirectTo = window.location.origin + window.location.pathname;
    const result = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (result.error) throw result.error;
    setAuthStatus("Password reset instructions sent to your email.", "success");
  } catch (error) {
    setAuthStatus(safeMessage(error), "error");
  }
}

async function loadSession() {
  const result = await supabase.auth.getSession();
  if (result.error) {
    console.error(result.error);
    showAuth();
    return;
  }
  session = result.data.session || null;
  if (!session) {
    showAuth();
    return;
  }
  showDashboard();
  await loadAccount();
}

async function loadAccount() {
  if (!session?.access_token) return;
  try {
    const response = await fetch("/api/account", {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${session.access_token}`
      },
      cache: "no-store"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok) throw new Error(data?.error || "Unable to load your account.");
    account = data.account;
    renderAccount();
  } catch (error) {
    console.error("OBITREND account error:", error);
    // The dashboard remains usable even if account data is temporarily unavailable.
    account = {
      user: { email: session.user?.email || "", obitrendUserId: "" },
      imageCredits: { free: 0, freeTotal: 3, pro: 0, proTotal: 0, available: 0 },
      pro: { active: false, planName: null, credits: 0 },
      video: { seconds: 0 }
    };
    renderAccount();
    toast("Signed in. Account details are still loading.");
  }
}

function renderAccount() {
  const user = account?.user || {};
  const images = account?.imageCredits || {};
  const pro = account?.pro || {};
  const video = account?.video || {};
  const email = user.email || session?.user?.email || "Creator";
  const letter = email.charAt(0).toUpperCase() || "O";
  const available = Number(images.available || 0);
  const videoSeconds = Number(video.seconds || 0);

  $("profileName").textContent = email.split("@")[0] || "Creator";
  $("avatarLetter").textContent = letter;
  $("accountAvatar").textContent = letter;
  $("accountEmail").textContent = email;
  $("accountId").textContent = user.obitrendUserId || "Authenticated OBITREND account";
  $("accountLocation").textContent = [user.city, user.country].filter(Boolean).join(", ") || "Profile location not set";

  $("homeImageCredits").textContent = available;
  $("homeVideoSeconds").textContent = videoSeconds;
  $("homePlan").textContent = pro.active ? (pro.planName || "Pro") : "Free";
  $("homeExpiry").textContent = pro.active && pro.expiresAt ? formatExpiry(pro.expiresAt) : "No active Pro plan";

  $("creditsAvailable").textContent = available;
  $("creditsPro").textContent = Number(images.pro || 0);
  $("creditsVideo").textContent = videoSeconds;
  $("videoSecondsLarge").textContent = `${videoSeconds} seconds`;

  $("sidePlan").textContent = pro.active ? (pro.planName || "Pro") : "Free";
  $("sideCredits").textContent = `${available} image credit${available === 1 ? "" : "s"}`;
}

function formatExpiry(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value)) return "Active Pro plan";
  const date = new Date(value < 1e12 ? value * 1000 : value);
  if (Number.isNaN(date.getTime())) return "Active Pro plan";
  return `Expires ${date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
}

function showAuth() {
  $("authScreen").classList.remove("hidden");
  $("dashboardScreen").classList.add("hidden");
}

function showDashboard() {
  $("authScreen").classList.add("hidden");
  $("dashboardScreen").classList.remove("hidden");
}

function openPage(page) {
  const valid = ["home", "create", "gallery", "video", "credits", "account"];
  if (!valid.includes(page)) page = "home";
  qsa(".page").forEach(el => el.classList.remove("active-page"));
  $(`page${page.charAt(0).toUpperCase()}${page.slice(1)}`).classList.add("active-page");
  qsa(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.page === page));
  const titles = { home: "Dashboard", create: "Create", gallery: "Gallery", video: "Video AI", credits: "Credits", account: "Account" };
  $("pageTitle").textContent = titles[page];
  $("pageKicker").textContent = page === "home" ? "WORKSPACE" : page.toUpperCase();
  closeSidebar();
}

function openSidebar() {
  $("sidebar").classList.add("open");
  $("overlay").classList.add("open");
}
function closeSidebar() {
  $("sidebar").classList.remove("open");
  $("overlay").classList.remove("open");
}

$("signInTab").onclick = () => setAuthMode("signin");
$("signUpTab").onclick = () => setAuthMode("signup");
$("signInBtn").onclick = (event) => { event.preventDefault(); authAction("signin"); };
$("signUpBtn").onclick = (event) => { event.preventDefault(); authAction("signup"); };
$("forgotBtn").onclick = resetPassword;
$("authForm").addEventListener("submit", (event) => {
  event.preventDefault();
  authAction(authMode);
});

qsa(".nav-item").forEach(button => button.addEventListener("click", () => openPage(button.dataset.page)));
qsa("[data-page-jump]").forEach(button => button.addEventListener("click", () => openPage(button.dataset.pageJump)));
qsa("[data-coming-soon]").forEach(button => button.addEventListener("click", () => toast(`${button.dataset.comingSoon} is the next build section.`)));

$("menuBtn").onclick = openSidebar;
$("overlay").onclick = closeSidebar;
$("profileBtn").onclick = () => openPage("account");
$("signOutBtn").onclick = async () => {
  try {
    const result = await supabase.auth.signOut();
    if (result.error) throw result.error;
  } catch (error) {
    toast(safeMessage(error));
    return;
  }
  session = null;
  account = null;
  setAuthStatus("Signed out.", "success");
  showAuth();
};

supabase.auth.onAuthStateChange((_event, nextSession) => {
  session = nextSession || null;
  if (session) {
    showDashboard();
    loadAccount();
  } else {
    showAuth();
  }
});

setAuthMode("signin");
loadSession();
