package com.obitrend.ai;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;

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

        handler.postDelayed(injectRunnable, 250);
        handler.postDelayed(injectRunnable, 750);
        handler.postDelayed(injectRunnable, 1500);
        handler.postDelayed(injectRunnable, 2500);
        handler.postDelayed(injectRunnable, 4000);
        handler.postDelayed(injectRunnable, 6000);
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

            JSObject response = new JSObject();

            response.put(
                    "available",
                    result == BiometricManager.BIOMETRIC_SUCCESS
            );

            call.resolve(response);

        } catch (Exception ignored) {

            JSObject response = new JSObject();

            response.put("available", false);

            call.resolve(response);
        }
    }

    @PluginMethod
    public void authenticate(PluginCall call) {

        Activity activity = getActivity();

        if (activity == null) {

            JSObject response = new JSObject();

            response.put("success", false);

            call.resolve(response);

            return;
        }

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

                            + "if(document.getElementById('obitrendBiometricGate'))return;"

                            + "if(!document.getElementById('signInBtn')){return;}"

                            + "var style=document.createElement('style');"

                            + "style.id='obitrendBiometricGateStyle';"

                            + "style.textContent=`"

                            + "#obitrendBiometricGate{"
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

                            + "#obitrendBiometricGate *{box-sizing:border-box;}"

                            + ".ob-lock-card{"
                            + "width:min(430px,100%);"
                            + "padding:28px 22px;"
                            + "border-radius:30px;"
                            + "background:linear-gradient(145deg,rgba(20,17,29,.98),rgba(7,7,12,.98));"
                            + "border:1px solid rgba(244,211,106,.28);"
                            + "box-shadow:0 30px 90px rgba(0,0,0,.72),0 0 70px rgba(139,77,255,.08);"
                            + "text-align:center;"
                            + "}"

                            + ".ob-lock-logo{"
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

                            + ".ob-lock-brand{"
                            + "font-size:22px;"
                            + "font-weight:950;"
                            + "letter-spacing:5px;"
                            + "}"

                            + ".ob-lock-sub{"
                            + "margin-top:5px;"
                            + "font-size:9px;"
                            + "letter-spacing:3px;"
                            + "color:#aaa5b4;"
                            + "text-transform:uppercase;"
                            + "}"

                            + ".ob-lock-title{"
                            + "margin-top:24px;"
                            + "font-size:22px;"
                            + "font-weight:900;"
                            + "}"

                            + ".ob-lock-text{"
                            + "margin:8px 0 18px;"
                            + "color:#a9a5b5;"
                            + "font-size:12px;"
                            + "line-height:1.65;"
                            + "}"

                            + ".ob-lock-input{"
                            + "width:100%;"
                            + "height:50px;"
                            + "margin-top:9px;"
                            + "padding:0 14px;"
                            + "border-radius:14px;"
                            + "border:1px solid rgba(255,255,255,.12);"
                            + "background:rgba(255,255,255,.045);"
                            + "color:#fff;"
                            + "outline:none;"
                            + "}"

                            + ".ob-lock-input:focus{"
                            + "border-color:rgba(139,77,255,.75);"
                            + "box-shadow:0 0 0 3px rgba(139,77,255,.10);"
                            + "}"

                            + ".ob-lock-btn{"
                            + "width:100%;"
                            + "min-height:50px;"
                            + "margin-top:11px;"
                            + "border-radius:14px;"
                            + "border:0;"
                            + "font-weight:900;"
                            + "font-size:13px;"
                            + "}"

                            + ".ob-lock-primary{"
                            + "background:linear-gradient(135deg,#f5dc70,#a87b1e);"
                            + "color:#080704;"
                            + "}"

                            + ".ob-lock-secondary{"
                            + "background:rgba(255,255,255,.07);"
                            + "color:#fff;"
                            + "border:1px solid rgba(255,255,255,.10);"
                            + "}"

                            + ".ob-lock-bio{"
                            + "width:92px;"
                            + "height:92px;"
                            + "margin:18px auto 4px;"
                            + "display:grid;"
                            + "place-items:center;"
                            + "border-radius:50%;"
                            + "font-size:42px;"
                            + "background:radial-gradient(circle,rgba(244,211,106,.18),rgba(139,77,255,.12));"
                            + "border:1px solid rgba(244,211,106,.28);"
                            + "}"

                            + ".ob-lock-status{"
                            + "min-height:22px;"
                            + "margin-top:12px;"
                            + "color:#9e99a9;"
                            + "font-size:11px;"
                            + "line-height:1.5;"
                            + "}"

                            + ".ob-lock-hidden{display:none!important;}"

                            + "`;"

                            + "document.head.appendChild(style);"

                            + "var gate=document.createElement('div');"

                            + "gate.id='obitrendBiometricGate';"

                            + "gate.innerHTML=`"

                            + "<div class='ob-lock-card'>"

                            + "<div class='ob-lock-logo'>👑</div>"

                            + "<div class='ob-lock-brand'>OBITREND</div>"

                            + "<div class='ob-lock-sub'>AI FASHION CREATOR</div>"

                            + "<div id='obLockPasswordPanel'>"

                            + "<div class='ob-lock-title'>Sign in to continue</div>"

                            + "<div class='ob-lock-text'>"
                            + "Your existing OBITREND account is required before the studio can be used."
                            + "</div>"

                            + "<input id='obLockEmail' class='ob-lock-input' type='email' placeholder='Email address' autocomplete='email'>"

                            + "<input id='obLockPassword' class='ob-lock-input' type='password' placeholder='Password' autocomplete='current-password'>"

                            + "<button id='obLockSignIn' class='ob-lock-btn ob-lock-primary' type='button'>🔐 SIGN IN</button>"

                            + "<button id='obLockSignUp' class='ob-lock-btn ob-lock-secondary' type='button'>✨ CREATE ACCOUNT</button>"

                            + "</div>"

                            + "<div id='obLockBioPanel' class='ob-lock-hidden'>"

                            + "<div class='ob-lock-bio'>👆</div>"

                            + "<div class='ob-lock-title'>Unlock OBITREND</div>"

                            + "<div id='obLockBioText' class='ob-lock-text'>"
                            + "Use your fingerprint, face, or device security to continue."
                            + "</div>"

                            + "<button id='obLockBioButton' class='ob-lock-btn ob-lock-primary' type='button'>"
                            + "🔓 USE BIOMETRIC"
                            + "</button>"

                            + "<button id='obLockPasswordButton' class='ob-lock-btn ob-lock-secondary' type='button'>"
                            + "USE ACCOUNT PASSWORD"
                            + "</button>"

                            + "</div>"

                            + "<div id='obLockStatus' class='ob-lock-status'></div>"

                            + "</div>`

                            + "document.body.appendChild(gate);"

                            + "var passwordPanel=document.getElementById('obLockPasswordPanel');"

                            + "var bioPanel=document.getElementById('obLockBioPanel');"

                            + "var emailInput=document.getElementById('obLockEmail');"

                            + "var passwordInput=document.getElementById('obLockPassword');"

                            + "var signIn=document.getElementById('obLockSignIn');"

                            + "var signUp=document.getElementById('obLockSignUp');"

                            + "var bioButton=document.getElementById('obLockBioButton');"

                            + "var passwordButton=document.getElementById('obLockPasswordButton');"

                            + "var status=document.getElementById('obLockStatus');"

                            + "var passwordVerified=false;"

                            + "var checking=false;"

                            + "function setStatus(text){status.textContent=text||'';}"

                            + "function isSignedIn(){"

                            + "var button=document.getElementById('signOutBtn');"

                            + "if(!button)return false;"

                            + "var computed=window.getComputedStyle(button);"

                            + "return computed.display!=='none'&&computed.visibility!=='hidden'&&button.offsetParent!==null;"

                            + "}"

                            + "function currentEmail(){"

                            + "var field=document.getElementById('authEmail');"

                            + "return field&&field.value?field.value.trim():'';"

                            + "}"

                            + "function showPassword(message){"

                            + "passwordPanel.classList.remove('ob-lock-hidden');"

                            + "bioPanel.classList.add('ob-lock-hidden');"

                            + "if(message)setStatus(message);"

                            + "emailInput.focus();"

                            + "}"

                            + "function showBio(message){"

                            + "passwordPanel.classList.add('ob-lock-hidden');"

                            + "bioPanel.classList.remove('ob-lock-hidden');"

                            + "if(message)setStatus(message);"

                            + "}"

                            + "function unlock(){"

                            + "gate.remove();"

                            + "var splash=document.getElementById('startupScreen');"

                            + "if(splash)splash.classList.add('hide');"

                            + "document.body.style.overflow='';"

                            + "}"

                            + "function rememberBiometric(){"

                            + "var email=emailInput.value.trim()||currentEmail();"

                            + "if(email)localStorage.setItem('obitrend_biometric_email',email);"

                            + "}"

                            + "async function biometricAvailable(){"

                            + "var plugin=window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.ObitrendBiometric;"

                            + "if(!plugin)return false;"

                            + "try{"

                            + "var result=await plugin.isAvailable();"

                            + "return !!(result&&result.available);"

                            + "}catch(e){return false;}"

                            + "}"

                            + "async function biometricUnlock(){"

                            + "var plugin=window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.ObitrendBiometric;"

                            + "if(!plugin){"

                            + "showPassword('Continue with your account password.');"

                            + "return;"

                            + "}"

                            + "bioButton.disabled=true;"

                            + "setStatus('Waiting for device authentication…');"

                            + "try{"

                            + "var result=await plugin.authenticate();"

                            + "bioButton.disabled=false;"

                            + "if(result&&result.success){"

                            + "rememberBiometric();"

                            + "unlock();"

                            + "}else{"

                            + "setStatus('Authentication was not completed.');"

                            + "}"

                            + "}catch(e){"

                            + "bioButton.disabled=false;"

                            + "setStatus('Authentication was not completed.');"

                            + "}"

                            + "}"

                            + "async function continueAfterLogin(){"

                            + "if(!isSignedIn())return;"

                            + "passwordVerified=true;"

                            + "var available=await biometricAvailable();"

                            + "if(!available){"

                            + "rememberBiometric();"

                            + "unlock();"

                            + "return;"

                            + "}"

                            + "showBio('Use your fingerprint or face to unlock OBITREND.');"

                            + "await biometricUnlock();"

                            + "if(passwordVerified&&document.getElementById('obitrendBiometricGate')){"

                            + "passwordButton.textContent='CONTINUE WITH ACCOUNT PASSWORD';"

                            + "}"

                            + "}"

                            + "function checkLogin(){"

                            + "if(checking)return;"

                            + "checking=true;"

                            + "var started=Date.now();"

                            + "var timer=setInterval(function(){"

                            + "if(isSignedIn()){"

                            + "clearInterval(timer);"

                            + "checking=false;"

                            + "continueAfterLogin();"

                            + "return;"

                            + "}"

                            + "if(Date.now()-started>12000){"

                            + "clearInterval(timer);"

                            + "checking=false;"

                            + "setStatus('Please check your email and password and try again.');"

                            + "}"

                            + "},250);"

                            + "}"

                            + "function submit(mode){"

                            + "var email=emailInput.value.trim();"

                            + "var password=passwordInput.value;"

                            + "if(!email||!password){"

                            + "setStatus('Enter your email and password to continue.');"

                            + "return;"

                            + "}"

                            + "var realEmail=document.getElementById('authEmail');"

                            + "var realPassword=document.getElementById('authPassword');"

                            + "var realButton=mode==='signup'"

                            + "?document.getElementById('signUpBtn')"

                            + ":document.getElementById('signInBtn');"

                            + "if(!realEmail||!realPassword||!realButton)return;"

                            + "realEmail.value=email;"

                            + "realPassword.value=password;"

                            + "realEmail.dispatchEvent(new Event('input',{bubbles:true}));"

                            + "realPassword.dispatchEvent(new Event('input',{bubbles:true}));"

                            + "setStatus(mode==='signup'?'Creating your account…':'Signing in securely…');"

                            + "realButton.click();"

                            + "checkLogin();"

                            + "}"

                            + "signIn.onclick=function(){submit('signin');};"

                            + "signUp.onclick=function(){submit('signup');};"

                            + "bioButton.onclick=function(){biometricUnlock();};"

                            + "passwordButton.onclick=function(){"

                            + "if(passwordVerified){"

                            + "unlock();"

                            + "}else{"

                            + "emailInput.value=currentEmail()||emailInput.value;"

                            + "showPassword('Enter your account password to continue.');"

                            + "}"

                            + "};"

                            + "passwordInput.addEventListener('keydown',function(event){"

                            + "if(event.key==='Enter')submit('signin');"

                            + "});"

                            + "emailInput.addEventListener('keydown',function(event){"

                            + "if(event.key==='Enter')passwordInput.focus();"

                            + "});"

                            + "var existingEmail=currentEmail();"

                            + "if(existingEmail)emailInput.value=existingEmail;"

                            + "async function start(){"

                            + "if(isSignedIn()){"

                            + "emailInput.value=currentEmail()||localStorage.getItem('obitrend_biometric_email')||'';"

                            + "showBio('Unlock OBITREND to continue.');"

                            + "var available=await biometricAvailable();"

                            + "if(available){"

                            + "setTimeout(function(){biometricUnlock();},350);"

                            + "}else{"

                            + "showPassword('Biometric unlock is not available on this device.');"

                            + "}"

                            + "}else{"

                            + "showPassword('Sign in to unlock your fashion studio.');"

                            + "}"

                            + "}"

                            + "start();"

                            + "})();";

            webView.evaluateJavascript(
                    script,
                    null
            );

        } catch (Exception ignored) {
        }
    }

    @Override
    protected void handleOnDestroy() {

        handler.removeCallbacks(injectRunnable);

        super.handleOnDestroy();
    }
}
