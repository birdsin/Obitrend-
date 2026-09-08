package com.obitrend.ai;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
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

    private static final long BACKGROUND_LOCK_DELAY = 6000L;

    private final Handler handler =
            new Handler(Looper.getMainLooper());

    private boolean authenticationRunning = false;
    private boolean appLocked = false;
    private boolean appWasPaused = false;

    private Runnable lockRunnable;

    @Override
    public void load() {

        super.load();

        lockRunnable = () -> {

            if (appWasPaused) {

                appLocked = true;

                hideWebView();

            }
        };

        handler.postDelayed(
                this::installJavaScriptBridge,
                500
        );

        handler.postDelayed(
                this::installJavaScriptBridge,
                1200
        );

        handler.postDelayed(
                this::installJavaScriptBridge,
                2000
        );

        handler.postDelayed(
                this::installJavaScriptBridge,
                3500
        );

        handler.postDelayed(
                this::installJavaScriptBridge,
                5000
        );

        handler.postDelayed(
                this::installJavaScriptBridge,
                8000
        );
    }

    @Override
    protected void handleOnPause() {

        super.handleOnPause();

        appWasPaused = true;

        handler.removeCallbacks(lockRunnable);

        handler.postDelayed(
                lockRunnable,
                BACKGROUND_LOCK_DELAY
        );
    }

    @Override
    protected void handleOnResume() {

        super.handleOnResume();

        appWasPaused = false;

        handler.removeCallbacks(lockRunnable);

        if (appLocked) {

            hideWebView();

            handler.postDelayed(
                    this::requestUnlockFromJavaScript,
                    250
            );
        }
    }

    @Override
    protected void handleOnDestroy() {

        handler.removeCallbacks(lockRunnable);

        authenticationRunning = false;

        super.handleOnDestroy();
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

        authenticateNative(
                call,
                true
        );
    }

    private void authenticateNative(
            PluginCall call,
            boolean unlockWebView
    ) {

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
                    BiometricManager.from(
                            activity
                    );

            int authenticators =
                    BiometricManager.Authenticators.BIOMETRIC_WEAK
                            |
                    BiometricManager.Authenticators.DEVICE_CREDENTIAL;

            int availability =
                    manager.canAuthenticate(
                            authenticators
                    );

            if (
                    availability !=
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

                            if (unlockWebView) {

                                appLocked = false;

                                showWebView();
                            }

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

                            /*
                             * The Android system keeps the biometric
                             * interaction available for another attempt.
                             *
                             * No custom error is returned here.
                             */
                        }

                        @Override
                        public void onAuthenticationError(
                                int errorCode,
                                @NonNull
                                CharSequence errString
                        ) {

                            authenticationRunning = false;

                            if (unlockWebView) {

                                appLocked = true;

                                hideWebView();
                            }

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
                                    "Authenticate to continue to OBITREND."
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

            if (unlockWebView) {

                appLocked = true;

                hideWebView();
            }

            JSObject response =
                    new JSObject();

            response.put(
                    "success",
                    false
            );

            call.resolve(response);
        }
    }

    private void installJavaScriptBridge() {

        try {

            WebView webView =
                    getBridge().getWebView();

            if (webView == null) {
                return;
            }

            String script = """
                    (function () {

                        if (window.__obitrendNativeBiometric) {
                            return;
                        }

                        window.__obitrendNativeBiometric = true;

                        function getPlugin() {

                            if (
                                !window.Capacitor ||
                                !window.Capacitor.Plugins
                            ) {
                                return null;
                            }

                            return (
                                window.Capacitor.Plugins
                                    .ObitrendBiometric
                            ) || null;
                        }

                        async function getSession() {

                            try {

                                var client =
                                    window.obitrendSupabase;

                                if (
                                    !client ||
                                    !client.auth
                                ) {
                                    return null;
                                }

                                var result =
                                    await client.auth.getSession();

                                return (
                                    result &&
                                    result.data &&
                                    result.data.session
                                )
                                    ? result.data.session
                                    : null;

                            } catch (e) {

                                return null;
                            }
                        }

                        async function authenticateIfSignedIn() {

                            var session =
                                await getSession();

                            if (
                                !session ||
                                !session.user
                            ) {

                                return;
                            }

                            var plugin =
                                getPlugin();

                            if (!plugin) {
                                return;
                            }

                            try {

                                await plugin.authenticate();

                            } catch (e) {
                            }
                        }

                        window.__obitrendAuthenticate =
                            authenticateIfSignedIn;

                        var client =
                            window.obitrendSupabase;

                        if (
                            client &&
                            client.auth
                        ) {

                            try {

                                client.auth.onAuthStateChange(
                                    function (
                                        event,
                                        session
                                    ) {

                                        if (
                                            event ===
                                            "SIGNED_IN" &&
                                            session &&
                                            session.user
                                        ) {

                                            setTimeout(
                                                function () {

                                                    var plugin =
                                                        getPlugin();

                                                    if (!plugin) {
                                                        return;
                                                    }

                                                    plugin.authenticate()
                                                        .catch(
                                                            function () {}
                                                        );

                                                },
                                                300
                                            );
                                        }

                                    }
                                );

                            } catch (e) {
                            }

                            setTimeout(
                                authenticateIfSignedIn,
                                500
                            );
                        }

                    })();
                    """;

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

    private void requestUnlockFromJavaScript() {

        try {

            WebView webView =
                    getBridge().getWebView();

            if (webView == null) {
                return;
            }

            String script =
                    "(function(){"
                            + "try{"
                            + "if(window.__obitrendAuthenticate){"
                            + "window.__obitrendAuthenticate();"
                            + "}"
                            + "}catch(e){}"
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

    private void hideWebView() {

        try {

            WebView webView =
                    getBridge().getWebView();

            if (webView == null) {
                return;
            }

            webView.post(
                    () ->
                            webView.setVisibility(
                                    View.INVISIBLE
                            )
            );

        } catch (Exception ignored) {
        }
    }

    private void showWebView() {

        try {

            WebView webView =
                    getBridge().getWebView();

            if (webView == null) {
                return;
            }

            webView.post(
                    () ->
                            webView.setVisibility(
                                    View.VISIBLE
                            )
            );

        } catch (Exception ignored) {
        }
    }
}
