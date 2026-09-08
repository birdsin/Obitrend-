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

    private boolean authenticationRunning = false;

    @Override
    public void load() {

        super.load();

        handler.postDelayed(
                this::injectBiometricBridge,
                700
        );

        handler.postDelayed(
                this::injectBiometricBridge,
                1500
        );

        handler.postDelayed(
                this::injectBiometricBridge,
                3000
        );

        handler.postDelayed(
                this::injectBiometricBridge,
                5000
        );

        handler.postDelayed(
                this::injectBiometricBridge,
                8000
        );
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {

        try {

            BiometricManager manager =
                    BiometricManager.from(
                            getContext()
                    );

            int authenticators =
                    BiometricManager.Authenticators.BIOMETRIC_WEAK
                            |
                    BiometricManager.Authenticators.DEVICE_CREDENTIAL;

            int result =
                    manager.canAuthenticate(
                            authenticators
                    );

            JSObject response =
                    new JSObject();

            response.put(
                    "available",
                    result ==
                            BiometricManager.BIOMETRIC_SUCCESS
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

        if (authenticationRunning) {

            JSObject response =
                    new JSObject();

            response.put(
                    "success",
                    false
            );

            call.resolve(response);

            return;
        }

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

        authenticationRunning = true;

        try {

            BiometricManager manager =
                    BiometricManager.from(activity);

            int authenticators =
                    BiometricManager.Authenticators.BIOMETRIC_WEAK
                            |
                    BiometricManager.Authenticators.DEVICE_CREDENTIAL;

            if (
                    manager.canAuthenticate(
                            authenticators
                    )
                    !=
                    BiometricManager.BIOMETRIC_SUCCESS
            ) {

                authenticationRunning = false;

                JSObject response =
                        new JSObject();

                response.put(
                        "success",
                        false
                );

                call.resolve(response);

                return;
            }

            Executor executor =
                    ContextCompat.getMainExecutor(
                            activity
                    );

            BiometricPrompt.AuthenticationCallback callback =
                    new BiometricPrompt.AuthenticationCallback() {

                        @Override
                        public void onAuthenticationSucceeded(
                                @NonNull
                                BiometricPrompt.AuthenticationResult result
                        ) {

                            authenticationRunning = false;

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
                                @NonNull CharSequence errString
                        ) {

                            authenticationRunning = false;

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

            BiometricPrompt.PromptInfo promptInfo =
                    new BiometricPrompt.PromptInfo.Builder()
                            .setTitle(
                                    "Unlock OBITREND"
                            )
                            .setSubtitle(
                                    "Use your fingerprint, face, or device security"
                            )
                            .setDescription(
                                    "Authenticate to continue to your OBITREND account."
                            )
                            .setAllowedAuthenticators(
                                    authenticators
                            )
                            .build();

            prompt.authenticate(
                    promptInfo
            );

        } catch (Exception ignored) {

            authenticationRunning = false;

            JSObject response =
                    new JSObject();

            response.put(
                    "success",
                    false
            );

            call.resolve(response);
        }
    }

    private void injectBiometricBridge() {

        try {

            WebView webView =
                    getBridge().getWebView();

            if (webView == null) {
                return;
            }

            String script =
                    "(function(){"

                    + "if(window.__obitrendBiometricBridge)return;"
                    + "window.__obitrendBiometricBridge=true;"

                    + "var gate=null;"
                    + "var busy=false;"
                    + "var initialCheckDone=false;"

                    + "function client(){"
                    + "return window.obitrendSupabase||null;"
                    + "}"

                    + "function plugin(){"
                    + "return window.Capacitor&&"
                    + "window.Capacitor.Plugins&&"
                    + "window.Capacitor.Plugins.ObitrendBiometric||null;"
                    + "}"

                    + "async function session(){"

                    + "try{"

                    + "var c=client();"

                    + "if(!c||!c.auth)"
                    + "return null;"

                    + "var r="
                    + "await c.auth.getSession();"

                    + "return r&&r.data"
                    + "?r.data.session||null"
                    + ":null;"

                    + "}catch(e){"
                    + "return null;"
                    + "}"

                    + "}"

                    + "async function available(){"

                    + "try{"

                    + "var p=plugin();"

                    + "if(!p)"
                    + "return false;"

                    + "var r="
                    + "await p.isAvailable();"

                    + "return !!("
                    + "r&&r.available"
                    + ");"

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

                    + "}"

                    + "function createGate(){"

                    + "if(gate)"
                    + "return;"

                    + "gate="
                    + "document.createElement('div');"

                    + "gate.id="
                    + "'obitrendBiometricGate';"

                    + "gate.style.cssText="
                    + "'position:fixed;"
                    + "inset:0;"
                    + "z-index:2147483647;"
                    + "display:flex;"
                    + "align-items:center;"
                    + "justify-content:center;"
                    + "padding:22px;"
                    + "background:rgba(3,3,5,.98);"
                    + "color:#fff;"
                    + "font-family:Inter,system-ui,"
                    + "-apple-system,BlinkMacSystemFont,"
                    + "Segoe UI,Arial,sans-serif;'";

                    + "var card="
                    + "document.createElement('div');"

                    + "card.style.cssText="
                    + "'width:min(430px,100%);"
                    + "padding:32px 22px;"
                    + "border-radius:30px;"
                    + "background:linear-gradient("
                    + "145deg,rgba(20,17,29,.99),"
                    + "rgba(7,7,12,.99));"
                    + "border:1px solid rgba(244,211,106,.28);"
                    + "box-shadow:0 30px 90px rgba(0,0,0,.72);"
                    + "text-align:center;'";

                    + "var logo="
                    + "document.createElement('div');"

                    + "logo.textContent='👑';"

                    + "logo.style.cssText="
                    + "'width:76px;"
                    + "height:76px;"
                    + "margin:0 auto 17px;"
                    + "display:grid;"
                    + "place-items:center;"
                    + "border-radius:23px;"
                    + "font-size:35px;"
                    + "background:linear-gradient("
                    + "145deg,#fff0a0,#d2a536 35%,"
                    + "#71480c 70%,#f3d76c);"
                    + "color:#080704;'";

                    + "var brand="
                    + "document.createElement('div');"

                    + "brand.textContent='OBITREND';"

                    + "brand.style.cssText="
                    + "'font-size:22px;"
                    + "font-weight:950;"
                    + "letter-spacing:5px;'";

                    + "var sub="
                    + "document.createElement('div');"

                    + "sub.textContent="
                    + "'AI FASHION CREATOR';"

                    + "sub.style.cssText="
                    + "'margin-top:5px;"
                    + "font-size:9px;"
                    + "letter-spacing:3px;"
                    + "color:#aaa5b4;"
                    + "text-transform:uppercase;'";

                    + "var icon="
                    + "document.createElement('div');"

                    + "icon.textContent='👆';"

                    + "icon.style.cssText="
                    + "'width:92px;"
                    + "height:92px;"
                    + "margin:28px auto 12px;"
                    + "display:grid;"
                    + "place-items:center;"
                    + "border-radius:50%;"
                    + "font-size:42px;"
                    + "background:radial-gradient("
                    + "circle,rgba(244,211,106,.18),"
                    + "rgba(139,77,255,.12));"
                    + "border:1px solid rgba(244,211,106,.28);'";

                    + "var title="
                    + "document.createElement('div');"

                    + "title.textContent="
                    + "'Unlock OBITREND';"

                    + "title.style.cssText="
                    + "'font-size:23px;"
                    + "font-weight:900;"
                    + "margin-top:12px;'";

                    + "var text="
                    + "document.createElement('div');"

                    + "text.textContent="
                    + "'Use your fingerprint, face, or device security to continue.';"

                    + "text.style.cssText="
                    + "'margin:9px 0 20px;"
                    + "color:#aaa5b4;"
                    + "font-size:12px;"
                    + "line-height:1.65;'";

                    + "var button="
                    + "document.createElement('button');"

                    + "button.type='button';"

                    + "button.textContent="
                    + "'USE BIOMETRIC';"

                    + "button.style.cssText="
                    + "'width:100%;"
                    + "min-height:52px;"
                    + "border-radius:15px;"
                    + "border:0;"
                    + "font-weight:900;"
                    + "font-size:13px;"
                    + "background:linear-gradient("
                    + "135deg,#f5dc70,#a87b1e);"
                    + "color:#080704;'";

                    + "var status="
                    + "document.createElement('div');"

                    + "status.style.cssText="
                    + "'min-height:22px;"
                    + "margin-top:13px;"
                    + "color:#9e99a9;"
                    + "font-size:11px;"
                    + "line-height:1.5;'";

                    + "card.append("
                    + "logo,brand,sub,icon,title,"
                    + "text,button,status"
                    + ");"

                    + "gate.appendChild(card);"

                    + "document.body.appendChild(gate);"

                    + "document.body.style.overflow='hidden';"

                    + "button.addEventListener("
                    + "'click',authenticate"
                    + ");"

                    + "}"

                    + "async function authenticate(){"

                    + "if(busy)"
                    + "return;"

                    + "busy=true;"

                    + "var p=plugin();"

                    + "if(!p){"
                    + "busy=false;"
                    + "return;"
                    + "}"

                    + "var b="
                    + "gate?gate.querySelector('button'):null;"

                    + "var s="
                    + "gate?gate.querySelector('div:last-child'):null;"

                    + "if(b)"
                    + "b.disabled=true;"

                    + "if(s)"
                    + "s.textContent="
                    + "'Waiting for device authentication…';"

                    + "try{"

                    + "var r="
                    + "await p.authenticate();"

                    + "if(r&&r.success){"

                    + "removeGate();"

                    + "}else{"

                    + "if(s)"
                    + "s.textContent='';"

                    + "if(b)"
                    + "b.disabled=false;"

                    + "}"

                    + "}catch(e){"

                    + "if(s)"
                    + "s.textContent='';"

                    + "if(b)"
                    + "b.disabled=false;"

                    + "}"

                    + "busy=false;"

                    + "}"

                    + "async function enforce(){"

                    + "var s=await session();"

                    + "if(!s||!s.user){"
                    + "removeGate();"
                    + "return;"
                    + "}"

                    + "if(!(await available())){"
                    + "removeGate();"
                    + "return;"
                    + "}"

                    + "createGate();"

                    + "if(!busy)"
                    + "setTimeout("
                    + "authenticate,"
                    + "250"
                    + ");"

                    + "}"

                    + "function watch(){"

                    + "var c=client();"

                    + "if(!c||!c.auth)"
                    + "return false;"

                    + "try{"

                    + "c.auth.onAuthStateChange("
                    + "function(event,s){"

                    + "if("
                    + "s&&s.user&&"
                    + "event==='SIGNED_IN'"
                    + ")"
                    + "setTimeout("
                    + "enforce,"
                    + "250"
                    + ");"

                    + "if(!s||!s.user)"
                    + "removeGate();"

                    + "}"
                    + ");"

                    + "}catch(e){}"

                    + "return true;"

                    + "}"

                    + "var tries=0;"

                    + "var wait="
                    + "setInterval("
                    + "function(){"

                    + "tries++;"

                    + "if(watch()){"

                    + "clearInterval(wait);"

                    + "if(!initialCheckDone){"

                    + "initialCheckDone=true;"

                    + "setTimeout("
                    + "enforce,"
                    + "350"
                    + ");"

                    + "}"

                    + "}else if(tries>=60){"

                    + "clearInterval(wait);"

                    + "}"

                    + "},500);"

                    + "})();";

            webView.post(
                    () ->
                            webView.evaluateJavascript(
                                    script,
                                    null
                            )
            );

        } catch (Exception ignored) {
        }
    }
}
