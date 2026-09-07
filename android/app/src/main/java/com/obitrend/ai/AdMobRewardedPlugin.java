package com.obitrend.ai;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.WebView;

import androidx.annotation.NonNull;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.rewarded.RewardItem;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;
import com.google.android.gms.ads.rewarded.ServerSideVerificationOptions;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "AdMobRewarded")
public class AdMobRewardedPlugin extends Plugin {
    private static final String TAG = "OBITREND_ADMOB";
    private static final String TEST_AD_UNIT_ID =
            "ca-app-pub-3940256099942544/5224354917";
    private static final String LIVE_AD_UNIT_ID =
            "ca-app-pub-8192823890419581/9241324486";
    private static final String REWARD_ENDPOINT =
            "https://obitrend.vercel.app/api/ad-reward";

    private RewardedAd rewardedAd;
    private boolean loading;
    private boolean rewardEarned;
    private PluginCall pendingCall;
    private String pendingUserId = "";
    private String pendingAccessToken = "";

    private final ExecutorService networkExecutor =
            Executors.newSingleThreadExecutor();
    private final Handler mainHandler =
            new Handler(Looper.getMainLooper());

    @Override
    public void load() {
        super.load();

        MobileAds.initialize(getContext(), status ->
                mainHandler.post(this::loadRewardedAd));

        mainHandler.postDelayed(this::injectRewardButton, 1500);
        mainHandler.postDelayed(this::injectRewardButton, 3500);
        mainHandler.postDelayed(this::injectRewardButton, 6500);
    }

    private String getAdUnitId() {
        return BuildConfig.DEBUG ? TEST_AD_UNIT_ID : LIVE_AD_UNIT_ID;
    }

    private void loadRewardedAd() {
        if (loading || rewardedAd != null || getActivity() == null) {
            return;
        }

        loading = true;

        RewardedAd.load(
                getActivity(),
                getAdUnitId(),
                new AdRequest.Builder().build(),
                new RewardedAdLoadCallback() {
                    @Override
                    public void onAdLoaded(@NonNull RewardedAd ad) {
                        loading = false;
                        rewardedAd = ad;
                        Log.d(TAG, "Rewarded ad loaded.");
                    }

                    @Override
                    public void onAdFailedToLoad(@NonNull LoadAdError error) {
                        loading = false;
                        rewardedAd = null;
                        Log.e(TAG, "Rewarded ad failed: " + error.getMessage());
                    }
                });
    }

    @PluginMethod
    public void isReady(PluginCall call) {
        JSObject result = new JSObject();
        result.put("ready", rewardedAd != null);
        result.put("testMode", BuildConfig.DEBUG);
        call.resolve(result);
    }

    @PluginMethod
    public void show(PluginCall call) {
        Activity activity = getActivity();

        if (activity == null) {
            call.reject("OBITREND Android activity is unavailable.");
            return;
        }

        String userId = call.getString("userId", "");
        String accessToken = call.getString("accessToken", "");

        if (userId == null || userId.trim().isEmpty()) {
            call.reject("Please sign in before watching a rewarded ad.");
            return;
        }

        if (accessToken == null || accessToken.trim().isEmpty()) {
            call.reject("Your login session is unavailable. Please sign in again.");
            return;
        }

        if (pendingCall != null) {
            call.reject("A rewarded ad is already being processed.");
            return;
        }

        if (rewardedAd == null) {
            loadRewardedAd();
            call.reject("The reward ad is still loading. Please try again in a few seconds.");
            return;
        }

        pendingCall = call;
        pendingUserId = userId.trim();
        pendingAccessToken = accessToken.trim();
        rewardEarned = false;

        RewardedAd ad = rewardedAd;
        rewardedAd = null;

        try {
            ServerSideVerificationOptions options =
                    new ServerSideVerificationOptions.Builder()
                            .setCustomData(pendingUserId)
                            .build();
            ad.setServerSideVerificationOptions(options);
        } catch (Exception error) {
            Log.w(TAG, "Unable to set SSV custom data: " + error.getMessage());
        }

        ad.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override
            public void onAdDismissedFullScreenContent() {
                if (!rewardEarned && pendingCall != null) {
                    PluginCall failedCall = pendingCall;
                    clearPending();
                    failedCall.reject("The ad was closed before the reward was earned.");
                }
                loadRewardedAd();
            }

            @Override
            public void onAdFailedToShowFullScreenContent(@NonNull AdError adError) {
                if (pendingCall != null) {
                    PluginCall failedCall = pendingCall;
                    clearPending();
                    failedCall.reject("The reward ad could not be shown.");
                }
                loadRewardedAd();
            }
        });

        ad.show(activity, rewardItem -> {
            rewardEarned = true;
            int amount = Math.max(1, rewardItem.getAmount());
            submitReward(amount);
        });
    }

    private void submitReward(int amount) {
        final PluginCall call = pendingCall;
        final String userId = pendingUserId;
        final String accessToken = pendingAccessToken;

        if (call == null) return;

        networkExecutor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                URL url = new URL(REWARD_ENDPOINT);
                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(15000);
                connection.setDoOutput(true);
                connection.setRequestProperty(
                        "Content-Type", "application/json; charset=UTF-8");
                connection.setRequestProperty("Accept", "application/json");
                connection.setRequestProperty(
                        "Authorization", "Bearer " + accessToken);

                String safeUserId = userId
                        .replace("\\", "\\\\")
                        .replace("\"", "\\\"");
                String body = "{\"userId\":\"" + safeUserId +
                        "\",\"amount\":" + amount + "}";

                byte[] bodyBytes = body.getBytes(StandardCharsets.UTF_8);
                connection.setFixedLengthStreamingMode(bodyBytes.length);

                try (OutputStream output = connection.getOutputStream()) {
                    output.write(bodyBytes);
                }

                int status = connection.getResponseCode();
                InputStream stream = status >= 200 && status < 400
                        ? connection.getInputStream()
                        : connection.getErrorStream();
                String responseBody = readBody(stream);

                if (status < 200 || status >= 300) {
                    throw new Exception(
                            "Reward server HTTP " + status + ": " + responseBody);
                }

                JSObject result = new JSObject();
                result.put("rewarded", true);
                result.put("amount", amount);
                result.put("server", true);
                result.put("response", responseBody);

                mainHandler.post(() -> {
                    if (pendingCall == call) {
                        clearPending();
                        call.resolve(result);
                    }
                });
            } catch (Exception error) {
                Log.e(TAG, "Reward server request failed", error);
                mainHandler.post(() -> {
                    if (pendingCall == call) {
                        clearPending();
                        call.reject(
                                "The ad reward could not be added. Please try again.");
                    }
                });
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    private String readBody(InputStream input) {
        if (input == null) return "";
        StringBuilder out = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(input, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) out.append(line);
        } catch (Exception ignored) {
        }
        return out.toString();
    }

    private void clearPending() {
        pendingCall = null;
        pendingUserId = "";
        pendingAccessToken = "";
        rewardEarned = false;
    }

    private void injectRewardButton() {
        try {
            WebView webView = getBridge().getWebView();
            if (webView == null) return;

            String script =
                    "(function(){" +
                    "if(document.getElementById('obitrendAdRewardCard'))return;" +
                    "var c=document.getElementById('creditsCard');if(!c)return;" +
                    "var card=document.createElement('section');" +
                    "card.id='obitrendAdRewardCard';card.className='card';" +
                    "card.style.cssText='border-color:rgba(244,211,106,.28);background:linear-gradient(145deg,rgba(25,20,8,.96),rgba(10,8,14,.94));';" +
                    "card.innerHTML='<h3>🎁 Earn 1 Free Credit</h3>'+" +
                    "'<p style=\"color:#aaa5b1;font-size:11px;line-height:1.6;margin-bottom:14px\">Watch a rewarded ad and receive 1 OBITREND credit.</p>'+" +
                    "'<button id=\"obitrendWatchAd\" type=\"button\" style=\"width:100%;min-height:48px;border-radius:14px;background:linear-gradient(135deg,#f5dc70,#a87b1e);color:#080704;font-weight:950;border:0;\">▶ WATCH AD • +1 CREDIT</button>'+" +
                    "'<div id=\"obitrendAdStatus\" style=\"min-height:20px;margin-top:9px;text-align:center;color:#8f8a99;font-size:11px\"></div>';" +
                    "c.parentNode.insertBefore(card,c.nextSibling);" +
                    "var b=document.getElementById('obitrendWatchAd'),s=document.getElementById('obitrendAdStatus');" +
                    "b.onclick=async function(){" +
                    "var p=window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.AdMobRewarded;" +
                    "if(!p){s.textContent='Rewarded ads are available in the Android app build.';return;}" +
                    "var token='';" +
                    "for(var i=0;i<localStorage.length;i++){" +
                    "var k=localStorage.key(i)||'',v=localStorage.getItem(k)||'';" +
                    "if(k.indexOf('auth-token')>-1){" +
                    "try{var j=JSON.parse(v);if(j&&j.access_token){token=j.access_token;break;}}" +
                    "catch(e){}" +
                    "}" +
                    "}" +
                    "if(!token){s.textContent='Please sign in again before watching an ad.';return;}" +
                    "var parts=token.split('.'),uid='';" +
                    "try{var x=parts[1].replace(/-/g,'+').replace(/_/g,'/');uid=JSON.parse(decodeURIComponent(escape(atob(x)))).sub||'';}catch(e){}" +
                    "if(!uid){s.textContent='Your login session is unavailable.';return;}" +
                    "b.disabled=true;b.textContent='⏳ LOADING REWARDED AD…';" +
                    "s.textContent='Please complete the ad to receive your credit.';" +
                    "try{await p.show({userId:uid,accessToken:token});" +
                    "b.textContent='✅ CREDIT ADDED';s.textContent='🎉 1 OBITREND credit added successfully.';" +
                    "setTimeout(function(){location.reload();},900);" +
                    "}catch(e){" +
                    "b.disabled=false;b.textContent='▶ WATCH AD • +1 CREDIT';" +
                    "s.textContent=(e&&e.message)||'The rewarded ad could not be completed.';" +
                    "}" +
                    "};" +
                    "})();";

            webView.evaluateJavascript(script, null);
        } catch (Exception error) {
            Log.w(TAG, "Reward button injection failed: " + error.getMessage());
        }
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        networkExecutor.shutdownNow();
    }
}
