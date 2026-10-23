// OBITREND staging-only passkey registration helper.
// Shows setup only on /studio/account for an authenticated user.
// This does not change sign-in methods, credentials, or production settings.
(() => {
  const pathIsAccount = () => /\/studio\/account\/?$/.test(window.location.pathname);
  let mounted = false;

  async function mountPasskeySetup() {
    if (!pathIsAccount() || mounted || !window.supabase?.auth) return;
    let sessionResult;
    try {
      sessionResult = await window.supabase.auth.getSession();
    } catch {
      return;
    }
    const user = sessionResult?.data?.session?.user;
    if (!user || user.is_anonymous) return;

    const main = document.querySelector('main.workspace-main') || document.querySelector('main');
    if (!main) return;

    const section = document.createElement('section');
    section.className = 'form-section mt-4';
    section.setAttribute('aria-labelledby', 'obitrend-passkey-title');
    section.innerHTML = `
      <h2 id="obitrend-passkey-title" class="section-title mb-3">Passkey / fingerprint sign-in</h2>
      <p class="text-xs text-muted-foreground leading-5">Register this device's passkey to use your phone's fingerprint, face unlock, or screen-lock PIN on future sign-ins.</p>
      <button type="button" class="w-full mt-4" data-obitrend-register-passkey>Register passkey on this device</button>
      <p class="text-xs mt-3" role="status" aria-live="polite" data-obitrend-passkey-status></p>
    `;
    main.appendChild(section);
    mounted = true;

    const button = section.querySelector('[data-obitrend-register-passkey]');
    const status = section.querySelector('[data-obitrend-passkey-status]');
    button.addEventListener('click', async () => {
      if (!window.isSecureContext || !navigator.credentials?.create) {
        status.textContent = 'Passkeys need a supported browser and a secure HTTPS domain.';
        return;
      }
      button.disabled = true;
      status.textContent = 'Follow your device prompt to create a passkey…';
      try {
        const { data, error } = await window.supabase.auth.registerPasskey();
        if (error) throw error;
        status.textContent = data?.id
          ? 'Passkey registered. You can now sign out and test passkey sign-in.'
          : 'Passkey registration completed. Sign out and test passkey sign-in.';
      } catch (error) {
        status.textContent = error?.message || 'Passkey registration failed. Check the Supabase passkey settings and relying-party domain.';
      } finally {
        button.disabled = false;
      }
    });
  }

  const start = () => { void mountPasskeySetup(); };
  window.addEventListener('obitrend:supabase-ready', start);
  window.addEventListener('popstate', start);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
  const observer = new MutationObserver(start);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
