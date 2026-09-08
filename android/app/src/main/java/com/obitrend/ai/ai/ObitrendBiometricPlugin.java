package com.obitrend.ai;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.Executor;

@CapacitorPlugin(name = "ObitrendBiometric")
public class ObitrendBiometricPlugin extends Plugin {

    private final Handler handler =
            new Handler(Looper.getMainLooper());

    private final Runnable injectRunnable =
            this::injectBiometricGate;

    @Override
    public void load() {

        super.load();

        handler.postDelayed(injectRunnable, 500);
        handler.postDelayed(injectRunnable, 1200);
        handler.postDelayed(injectRunnable, 2500);
        handler.postDelayed(injectRunnable, 5000);
        handler.postDelayed(injectRunnable, 8000);
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {

        try {

            BiometricManager manager =
                    BiometricManager.from(getContext());

            int authenticators =
                    BiometricManager.Authenticators.BIOMETRIC_WEAK
                            | BiometricManager.Authenticators.DEVICE_CREDENTIAL;

            int result =
                    manager.canAuthenticate(authenticators);

            JSObject response =
                    new JSObject();

            response.put(
                    "available",
                    result == BiometricManager.BIOMETRIC_SUCCESS
            );

            call.resolve(response);

        } catch (Exception ignored) {

            JSObject response =
                    new JSObject();

            response.put(
                    "available",
                    false
            );

            call.resolve(response);
        }
    }

    @PluginMethod
    public void authenticate(PluginCall call) {

        Activity baseActivity =
                getActivity();

        if (!(baseActivity instanceof FragmentActivity)) {

            JSObject response =
                    new JSObject();

            response.put(
                    "success",
                    false
            );

            call.resolve(response);

            return;
        }

        FragmentActivity activity =
                (FragmentActivity) baseActivity;

        try {

            Executor executor =
                    ContextCompat.getMainExecutor(activity);

            BiometricPrompt.AuthenticationCallback callback =
                    new BiometricPrompt.AuthenticationCallback() {

                        @Override
                        public void onAuthenticationSucceeded(
                                @NonNull BiometricPrompt.AuthenticationResult result) {

                            JSObject response =
                                    new JSObject();

                            response.put(
                                    "success",
                                    true
                            );

                            call.resolve(response);
                        }

                        @Override
                        public void onAuthenticationFailed() {
                        }

                        @Override
                        public void onAuthenticationError(
                                int errorCode,
                                @NonNull CharSequence errString) {

                            JSObject response =
                                    new JSObject();

                            response.put(
                                    "success",
                                    false
                            );

                            call.resolve(response);
                        }
                    };

            BiometricPrompt prompt =
                    new BiometricPrompt(
                            activity,
                            executor,
                            callback
                    );

            int authenticators =
                    BiometricManager.Authenticators.BIOMETRIC_WEAK
                            | BiometricManager.Authenticators.DEVICE_CREDENTIAL;

            BiometricPrompt.PromptInfo promptInfo =
                    new BiometricPrompt.PromptInfo.Builder()
                            .setTitle("Unlock OBITREND")
                            .setSubtitle(
                                    "Use your fingerprint or face to continue"
                            )
                            .setDescription(
                                    "Your biometric stays on this device."
                            )
                            .setAllowedAuthenticators(
                                    authenticators
                            )
                            .build();

            prompt.authenticate(promptInfo);

        } catch (Exception ignored) {

            JSObject response =
                    new JSObject();

            response.put(
                    "success",
                    false
            );

            call.resolve(response);
        }
    }

    private void injectBiometricGate() {

        try {

            WebView webView =
                    getBridge().getWebView();

            if (webView == null) {
                return;
            }

            String script =
                    "(function(){"

                    + "if(window.__obitrendBiometricStarted)return;"
                    + "window.__obitrendBiometricStarted=true;"

                    + "var BIO_KEY='obitrend_biometric_enabled';"
                    + "var gate=null;"
                    + "var authenticating=false;"
                    + "var setupAsked=false;"

                    + "function getClient(){"
                    + "return window.obitrendSupabase||"
                    + "window.supabaseClient||null;"
                    + "}"

                    + "async function getSession(){"
                    + "try{"
                    + "var client=getClient();"
                    + "if(!client||!client.auth)return null;"
                    + "var result=await client.auth.getSession();"
                    + "if(result&&result.data)"
                    + "return result.data.session||null;"
                    + "return null;"
                    + "}catch(e){"
                    + "return null;"
                    + "}"
                    + "}"

                    + "async function biometricAvailable(){"
                    + "try{"
                    + "var plugin="
                    + "window.Capacitor&&"
                    + "window.Capacitor.Plugins&&"
                    + "window.Capacitor.Plugins.ObitrendBiometric;"

                    + "if(!plugin)return false;"

                    + "var result=await plugin.isAvailable();"

                    + "return !!(result&&result.available);"

                    + "}catch(e){"
                    + "return false;"
                    + "}"
                    + "}"

                    + "function removeGate(){"

                    + "if(gate){"
                    + "gate.remove();"
                    + "gate=null;"
                    + "}"

                    + "document.body.style.overflow='';"

                    + "var splash="
                    + "document.getElementById('startupScreen');"

                    + "if(splash)"
                    + "splash.classList.add('hide');"

                    + "}"

                    + "function createGate(){"

                    + "if(gate)return;"

                    + "var style=document.createElement('style');"

                    + "style.id='obitrendBiometricStyle';"

                    + "style.textContent="
                    + "'#obitrendBiometricGate{"
                    + "position:fixed;"
                    + "inset:0;"
                    + "z-index:999999;"
                    + "display:flex;"
                    + "align-items:center;"
                    + "justify-content:center;"
                    + "padding:22px;"
                    + "background:"
                    + "radial-gradient(circle at 50% 20%,rgba(139,77,255,.20),transparent 34%),"
                    + "radial-gradient(circle at 20% 80%,rgba(244,211,106,.09),transparent 30%),"
                    + "#030305;"
                    + "color:#fff;"
                    + "font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;"
                    + "}"

                    + "#obitrendBiometricGate *{"
                    + "box-sizing:border-box;"
                    + "}"

                    + ".ob-bio-card{"
                    + "width:min(430px,100%);"
                    + "padding:32px 22px;"
                    + "border-radius:30px;"
                    + "background:linear-gradient(145deg,rgba(20,17,29,.98),rgba(7,7,12,.98));"
                    + "border:1px solid rgba(244,211,106,.28);"
                    + "box-shadow:0 30px 90px rgba(0,0,0,.72),0 0 70px rgba(139,77,255,.08);"
                    + "text-align:center;"
                    + "}"

                    + ".ob-bio-logo{"
                    + "width:76px;"
                    + "height:76px;"
                    + "margin:0 auto 17px;"
                    + "display:grid;"
                    + "place-items:center;"
                    + "border-radius:23px;"
                    + "font-size:35px;"
                    + "background:linear-gradient(145deg,#fff0a0,#d2a536 35%,#71480c 70%,#f3d76c);"
                    + "color:#080704;"
                    + "box-shadow:0 16px 42px rgba(0,0,0,.52);"
                    + "}"

                    + ".ob-bio-brand{"
                    + "font-size:22px;"
                    + "font-weight:950;"
                    + "letter-spacing:5px;"
                    + "}"

                    + ".ob-bio-sub{"
                    + "margin-top:5px;"
                    + "font-size:9px;"
                    + "letter-spacing:3px;"
                    + "color:#aaa5b4;"
                    + "text-transform:uppercase;"
                    + "}"

                    + ".ob-bio-icon{"
                    + "width:92px;"
                    + "height:92px;"
                    + "margin:28px auto 12px;"
                    + "display:grid;"
                    + "place-items:center;"
                    + "border-radius:50%;"
                    + "font-size:42px;"
                    + "background:"
                    + "radial-gradient(circle,"
                    + "rgba(244,211,106,.18),"
                    + "rgba(139,77,255,.12));"
                    + "border:1px solid rgba(244,211,106,.28);"
                    + "}"

                    + ".ob-bio-title{"
                    + "font-size:23px;"
                    + "font-weight:900;"
                    + "margin-top:12px;"
                    + "}"

                    + ".ob-bio-text{"
                    + "margin:9px 0 20px;"
                    + "color:#aaa5b4;"
                    + "font-size:12px;"
                    + "line-height:1.65;"
                    + "}"

                    + ".ob-bio-button{"
                    + "width:100%;"
                    + "min-height:52px;"
                    + "margin-top:11px;"
                    + "border-radius:15px;"
                    + "border:0;"
                    + "font-weight:900;"
                    + "font-size:13px;"
                    + "cursor:pointer;"
                    + "touch-action:manipulation;"
                    + "-webkit-tap-highlight-color:transparent;"
                    + "background:linear-gradient(135deg,#f5dc70,#a87b1e);"
                    + "color:#080704;"
                    + "}"

                    + ".ob-bio-button:disabled{"
                    + "opacity:.55;"
                    + "}"

                    + ".ob-bio-secondary{"
                    + "background:rgba(255,255,255,.07);"
                    + "color:#fff;"
                    + "border:1px solid rgba(255,255,255,.10);"
                    + "}"

                    + ".ob-bio-status{"
                    + "min-height:22px;"
                    + "margin-top:13px;"
                    + "color:#9e99a9;"
                    + "font-size:11px;"
                    + "line-height:1.5;"
                    + "}"

                    + "';";

                    + "document.head.appendChild(style);"

                    + "gate=document.createElement('div');"

                    + "gate.id='obitrendBiometricGate';"

                    + "gate.innerHTML="
                    + "\"<div class='ob-bio-card'>"

                    + "<div class='ob-bio-logo'>👑</div>"

                    + "<div class='ob-bio-brand'>OBITREND</div>"

                    + "<div class='ob-bio-sub'>AI FASHION CREATOR</div>"

                    + "<div class='ob-bio-icon'>👆</div>"

                    + "<div class='ob-bio-title'>Unlock OBITREND</div>"

                    + "<div class='ob-bio-text'>"
                    + "Use your fingerprint, face, or device security to continue."
                    + "</div>"

                    + "<button id='obUseBio' "
                    + "class='ob-bio-button' "
                    + "type='button'>"
                    + "USE BIOMETRIC"
                    + "</button>"

                    + "<button id='obContinue' "
                    + "class='ob-bio-button ob-bio-secondary' "
                    + "type='button'>"
                    + "TRY AGAIN"
                    + "</button>"

                    + "<div id='obBioStatus' "
                    + "class='ob-bio-status'></div>"

                    + "</div>\";"

                    + "document.body.appendChild(gate);"

                    + "var useButton="
                    + "document.getElementById('obUseBio');"

                    + "var retryButton="
                    + "document.getElementById('obContinue');"

                    + "var status="
                    + "document.getElementById('obBioStatus');"

                    + "function setStatus(text){"
                    + "if(status)status.textContent=text||'';"
                    + "}"

                    + "async function authenticate(){"

                    + "if(authenticating)return;"

                    + "authenticating=true;"

                    + "if(useButton)"
                    + "useButton.disabled=true;"

                    + "setStatus('Waiting for device authentication…');"

                    + "var plugin="
                    + "window.Capacitor&&"
                    + "window.Capacitor.Plugins&&"
                    + "window.Capacitor.Plugins.ObitrendBiometric;"

                    + "if(!plugin){"

                    + "authenticating=false;"

                    + "if(useButton)"
                    + "useButton.disabled=false;"

                    + "setStatus('');"

                    + "return;"
                    + "}"

                    + "try{"

                    + "var result=await plugin.authenticate();"

                    + "if(result&&result.success){"

                    + "localStorage.setItem("
                    + "BIO_KEY,"
                    + "'1');"

                    + "authenticating=false;"

                    + "removeGate();"

                    + "return;"

                    + "}"

                    + "authenticating=false;"

                    + "if(useButton)"
                    + "useButton.disabled=false;"

                    + "setStatus('');"

                    + "}catch(e){"

                    + "authenticating=false;"

                    + "if(useButton)"
                    + "useButton.disabled=false;"

                    + "setStatus('');"

                    + "}"

                    + "}"

                    + "useButton.addEventListener("
                    + "'click',"
                    + "function(){authenticate();}"
                    + ");"

                    + "retryButton.addEventListener("
                    + "'click',"
                    + "function(){authenticate();}"
                    + ");"

                    + "setTimeout("
                    + "function(){authenticate();},"
                    + "350"
                    + ");"

                    + "}"

                    + "async function processAuthentication(){"

                    + "var session=await getSession();"

                    + "if(!session||!session.user){"

                    + "if(gate)removeGate();"

                    + "return;"
                    + "}"

                    + "var available="
                    + "await biometricAvailable();"

                    + "if(!available){"

                    + "if(gate)removeGate();"

                    + "return;"
                    + "}"

                    + "var enabled="
                    + "localStorage.getItem(BIO_KEY)==='1';"

                    + "if(enabled){"

                    + "createGate();"

                    + "return;"
                    + "}"

                    + "if(setupAsked)return;"

                    + "setupAsked=true;"

                    + "setTimeout("
                    + "function(){"

                    + "createGate();"

                    + "},"
                    + "700"
                    + ");"

                    + "}"

                    + "function watchAuthentication(){"

                    + "var client=getClient();"

                    + "if(!client||!client.auth)return;"

                    + "try{"

                    + "client.auth.onAuthStateChange("
                    + "function(event,session){"

                    + "if(session&&session.user){"

                    + "setTimeout("
                    + "function(){"
                    + "processAuthentication();"
                    + "},"
                    + "300"
                    + ");"

                    + "}else{"

                    + "setupAsked=false;"

                    + "if(gate)removeGate();"

                    + "}"

                    + "}"
                    + ");"

                    + "}catch(e){"
                    + "}"

                    + "processAuthentication();"

                    + "}"

                    + "var attempts=0;"

                    + "var waitForSupabase="
                    + "setInterval("
                    + "function(){"

                    + "attempts++;"

                    + "if(getClient()){"

                    + "clearInterval(waitForSupabase);"

                    + "watchAuthentication();"

                    + "}else if(attempts>=60){"

                    + "clearInterval(waitForSupabase);"

                    + "}"

                    + "},"
                    + "500"
                    + ");"

                    + "})();";

            webView.post(() ->
                    webView.evaluateJavascript(
                            script,
                            null
                    )
            );

        } catch (Exception ignored) {
        }
    }
}
