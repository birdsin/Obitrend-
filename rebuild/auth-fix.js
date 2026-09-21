import { supabase } from "../supabase.js";

const button = document.getElementById("signInBtn");
const form = document.getElementById("authForm");
const emailInput = document.getElementById("authEmail");
const passwordInput = document.getElementById("authPassword");
const status = document.getElementById("authStatus");

function setStatus(message, type = "") {
  if (!status) return;
  status.textContent = message;
  status.className = `form-status ${type}`.trim();
}

async function signInNow(event) {
  event?.preventDefault?.();
  event?.stopImmediatePropagation?.();

  const email = String(emailInput?.value || "").trim().toLowerCase();
  const password = String(passwordInput?.value || "");

  if (!email || !email.includes("@")) {
    setStatus("Enter a valid email address.", "error");
    return;
  }
  if (password.length < 6) {
    setStatus("Password must be at least 6 characters.", "error");
    return;
  }

  if (button) button.disabled = true;
  setStatus("Signing in…");

  try {
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;

    setStatus("Signed in. Opening OBITREND…", "success");

    // Let the normal app boot from the persisted Supabase session.
    window.location.reload();
  } catch (error) {
    console.error("OBITREND sign-in:", error);
    const message = String(error?.message || "");
    if (/invalid login credentials|invalid credentials|invalid password/i.test(message)) {
      setStatus("Email or password is incorrect.", "error");
    } else if (/email not confirmed/i.test(message)) {
      setStatus("Please confirm your email before signing in.", "error");
    } else {
      setStatus(message || "Unable to sign in right now.", "error");
    }
    if (button) button.disabled = false;
  }
}

// Capture the tap before any other handler so the Sign in button always works.
button?.addEventListener("click", signInNow, true);
form?.addEventListener("submit", signInNow, true);
