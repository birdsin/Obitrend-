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

            StringBuilder js =
                    new StringBuilder();

            js.append("(function(){");

            js.append("if(window.__obitrendBiometricStarted)return;");
            js.append("window.__obitrendBiometricStarted=true;");

            js.append("var BIO_KEY='obitrend_biometric_enabled';");
            js.append("var gate=null;");
            js.append("var authenticating=false;");
            js.append("var setupAsked=false;");

            js.append("function getClient(){");
            js.append("return window.obitrendSupabase||");
            js.append("window.supabaseClient||null;");
            js.append("}");

            js.append("async function getSession(){");
            js.append("try{");
            js.append("var client=getClient();");
            js.append("if(!client||!client.auth)return null;");
            js.append("var result=await client.auth.getSession();");
            js.append("if(result&&result.data)");
            js.append("return result.data.session||null;");
            js.append("return null;");
            js.append("}catch(e){");
            js.append("return null;");
            js.append("}");
            js.append("}");

            js.append("async function biometricAvailable(){");
            js.append("try{");

            js.append("var plugin=");
            js.append("window.Capacitor&&");
            js.append("window.Capacitor.Plugins&&");
            js.append("window.Capacitor.Plugins.ObitrendBiometric;");

            js.append("if(!plugin)return false;");

            js.append("var result=await plugin.isAvailable();");

            js.append("return !!(result&&result.available);");

            js.append("}catch(e){");
            js.append("return false;");
            js.append("}");
            js.append("}");

            js.append("function removeGate(){");

            js.append("if(gate){");
            js.append("gate.remove();");
            js.append("gate=null;");
            js.append("}");

            js.append("document.body.style.overflow='';");

            js.append("var splash=");
            js.append("document.getElementById('startupScreen');");

            js.append("if(splash)");
            js.append("splash.classList.add('hide');");

            js.append("}");

            js.append("function createGate(){");

            js.append("if(gate)return;");

            js.append("var oldStyle=");
            js.append("document.getElementById('obitrendBiometricStyle');");

            js.append("if(oldStyle)oldStyle.remove();");

            js.append("var style=document.createElement('style');");

            js.append("style.id='obitrendBiometricStyle';");

            js.append("style.textContent=");
            js.append("'");

            js.append("#obitrendBiometricGate{");
            js.append("position:fixed;");
            js.append("inset:0;");
            js.append("z-index:999999;");
            js.append("display:flex;");
            js.append("align-items:center;");
            js.append("justify-content:center;");
            js.append("padding:22px;");
            js.append("background:");
            js.append("radial-gradient(circle at 50% 20%,rgba(139,77,255,.20),transparent 34%),");
            js.append("radial-gradient(circle at 20% 80%,rgba(244,211,106,.09),transparent 30%),");
            js.append("#030305;");
            js.append("color:#fff;");
            js.append("font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;");
            js.append("}");

            js.append("#obitrendBiometricGate *{");
            js.append("box-sizing:border-box;");
            js.append("}");

            js.append(".ob-bio-card{");
            js.append("width:min(430px,100%);");
            js.append("padding:32px 22px;");
            js.append("border-radius:30px;");
            js.append("background:linear-gradient(145deg,rgba(20,17,29,.98),rgba(7,7,12,.98));");
            js.append("border:1px solid rgba(244,211,106,.28);");
            js.append("box-shadow:0 30px 90px rgba(0,0,0,.72),0 0 70px rgba(139,77,255,.08);");
            js.append("text-align:center;");
            js.append("}");

            js.append(".ob-bio-logo{");
            js.append("width:76px;");
            js.append("height:76px;");
            js.append("margin:0 auto 17px;");
            js.append("display:grid;");
            js.append("place-items:center;");
            js.append("border-radius:23px;");
            js.append("font-size:35px;");
            js.append("background:linear-gradient(145deg,#fff0a0,#d2a536 35%,#71480c 70%,#f3d76c);");
            js.append("color:#080704;");
            js.append("box-shadow:0 16px 42px rgba(0,0,0,.52);");
            js.append("}");

            js.append(".ob-bio-brand{");
            js.append("font-size:22px;");
            js.append("font-weight:950;");
            js.append("letter-spacing:5px;");
            js.append("}");

            js.append(".ob-bio-sub{");
            js.append("margin-top:5px;");
            js.append("font-size:9px;");
            js.append("letter-spacing:3px;");
            js.append("color:#aaa5b4;");
            js.append("text-transform:uppercase;");
            js.append("}");

            js.append(".ob-bio-icon{");
            js.append("width:92px;");
            js.append("height:92px;");
            js.append("margin:28px auto 12px;");
            js.append("display:grid;");
            js.append("place-items:center;");
            js.append("border-radius:50%;");
            js.append("font-size:42px;");
            js.append("background:radial-gradient(circle,rgba(244,211,106,.18),rgba(139,77,255,.12));");
            js.append("border:1px solid rgba(244,211,106,.28);");
            js.append("}");

            js.append(".ob-bio-title{");
            js.append("font-size:23px;");
            js.append("font-weight:900;");
            js.append("margin-top:12px;");
            js.append("}");

            js.append(".ob-bio-text{");
            js.append("margin:9px 0 20px;");
            js.append("color:#aaa5b4;");
            js.append("font-size:12px;");
            js.append("line-height:1.65;");
            js.append("}");

            js.append(".ob-bio-button{");
            js.append("width:100%;");
            js.append("min-height:52px;");
            js.append("margin-top:11px;");
            js.append("border-radius:15px;");
            js.append("border:0;");
            js.append("font-weight:900;");
            js.append("font-size:13px;");
            js.append("cursor:pointer;");
            js.append("touch-action:manipulation;");
            js.append("-webkit-tap-highlight-color:transparent;");
            js.append("background:linear-gradient(135deg,#f5dc70,#a87b1e);");
            js.append("color:#080704;");
            js.append("}");

            js.append(".ob-bio-button:disabled{");
            js.append("opacity:.55;");
            js.append("}");

            js.append(".ob-bio-secondary{");
            js.append("background:rgba(255,255,255,.07);");
            js.append("color:#fff;");
            js.append("border:1px solid rgba(255,255,255,.10);");
            js.append("}");

            js.append(".ob-bio-status{");
            js.append("min-height:22px;");
            js.append("margin-top:13px;");
            js.append("color:#9e99a9;");
            js.append("font-size:11px;");
            js.append("line-height:1.5;");
            js.append("}");

            js.append("';");

            js.append("document.head.appendChild(style);");

            js.append("gate=document.createElement('div');");

            js.append("gate.id='obitrendBiometricGate';");

            js.append("gate.innerHTML=");
            js.append("\"");

            js.append("<div class='ob-bio-card'>");

            js.append("<div class='ob-bio-logo'>👑</div>");

            js.append("<div class='ob-bio-brand'>OBITREND</div>");

            js.append("<div class='ob-bio-sub'>AI FASHION CREATOR</div>");

            js.append("<div class='ob-bio-icon'>👆</div>");

            js.append("<div class='ob-bio-title'>Unlock OBITREND</div>");

            js.append("<div class='ob-bio-text'>");
            js.append("Use your fingerprint, face, or device security to continue.");
            js.append("</div>");

            js.append("<button id='obUseBio' ");
            js.append("class='ob-bio-button' ");
            js.append("type='button'>");
            js.append("USE BIOMETRIC");
            js.append("</button>");

            js.append("<button id='obContinue' ");
            js.append("class='ob-bio-button ob-bio-secondary' ");
            js.append("type='button'>");
            js.append("TRY AGAIN");
            js.append("</button>");

            js.append("<div id='obBioStatus' ");
            js.append("class='ob-bio-status'></div>");

            js.append("</div>\";");

            js.append("document.body.appendChild(gate);");

            js.append("var useButton=");
            js.append("document.getElementById('obUseBio');");

            js.append("var retryButton=");
            js.append("document.getElementById('obContinue');");

            js.append("var status=");
            js.append("document.getElementById('obBioStatus');");

            js.append("function setStatus(text){");
            js.append("if(status)status.textContent=text||'';");
            js.append("}");

            js.append("async function authenticate(){");

            js.append("if(authenticating)return;");

            js.append("authenticating=true;");

            js.append("if(useButton)");
            js.append("useButton.disabled=true;");

            js.append("if(retryButton)");
            js.append("retryButton.disabled=true;");

            js.append("setStatus('Waiting for device authentication…');");

            js.append("var plugin=");
            js.append("window.Capacitor&&");
            js.append("window.Capacitor.Plugins&&");
            js.append("window.Capacitor.Plugins.ObitrendBiometric;");

            js.append("if(!plugin){");

            js.append("authenticating=false;");

            js.append("if(useButton)");
            js.append("useButton.disabled=false;");

            js.append("if(retryButton)");
            js.append("retryButton.disabled=false;");

            js.append("setStatus('');");

            js.append("return;");

            js.append("}");

            js.append("try{");

            js.append("var result=await plugin.authenticate();");

            js.append("if(result&&result.success){");

            js.append("localStorage.setItem(BIO_KEY,'1');");

            js.append("authenticating=false;");

            js.append("removeGate();");

            js.append("return;");

            js.append("}");

            js.append("authenticating=false;");

            js.append("if(useButton)");
            js.append("useButton.disabled=false;");

            js.append("if(retryButton)");
            js.append("retryButton.disabled=false;");

            js.append("setStatus('');");

            js.append("}catch(e){");

            js.append("authenticating=false;");

            js.append("if(useButton)");
            js.append("useButton.disabled=false;");

            js.append("if(retryButton)");
            js.append("retryButton.disabled=false;");

            js.append("setStatus('');");

            js.append("}");

            js.append("}");

            js.append("useButton.addEventListener('click',function(){");
            js.append("authenticate();");
            js.append("});");

            js.append("retryButton.addEventListener('click',function(){");
            js.append("authenticate();");
            js.append("});");

            js.append("setTimeout(function(){");
            js.append("authenticate();");
            js.append("},350);");

            js.append("}");

            js.append("async function processAuthentication(){");

            js.append("var session=await getSession();");

            js.append("if(!session||!session.user){");

            js.append("if(gate)removeGate();");

            js.append("return;");

            js.append("}");

            js.append("var available=await biometricAvailable();");

            js.append("if(!available){");

            js.append("if(gate)removeGate();");

            js.append("return;");

            js.append("}");

            js.append("var enabled=");
            js.append("localStorage.getItem(BIO_KEY)==='1';");

            js.append("if(enabled){");

            js.append("createGate();");

            js.append("return;");

            js.append("}");

            js.append("if(setupAsked)return;");

            js.append("setupAsked=true;");

            js.append("setTimeout(function(){");

            js.append("createGate();");

            js.append("},700);");

            js.append("}");

            js.append("function watchAuthentication(){");

            js.append("var client=getClient();");

            js.append("if(!client||!client.auth)return;");

            js.append("try{");

            js.append("client.auth.onAuthStateChange(function(event,session){");

            js.append("if(session&&session.user){");

            js.append("setTimeout(function(){");

            js.append("processAuthentication();");

            js.append("},300);");

            js.append("}else{");

            js.append("setupAsked=false;");

            js.append("if(gate)removeGate();");

            js.append("}");

            js.append("});");

            js.append("}catch(e){");

            js.append("}");

            js.append("processAuthentication();");

            js.append("}");

            js.append("var attempts=0;");

            js.append("var waitForSupabase=");

            js.append("setInterval(function(){");

            js.append("attempts++;");

            js.append("if(getClient()){");

            js.append("clearInterval(waitForSupabase);");

            js.append("watchAuthentication();");

            js.append("}else if(attempts>=60){");

            js.append("clearInterval(waitForSupabase);");

            js.append("}");

            js.append("},500);");

            js.append("})();");

            String script =
                    js.toString();

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
