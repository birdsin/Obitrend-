
package com.obitrend.ai;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {

        // Exit the launch theme before Capacitor starts
        setTheme(R.style.AppTheme_NoActionBar);

        // Keep both OBITREND native plugins
        registerPlugin(AdMobRewardedPlugin.class);
        registerPlugin(ObitrendBiometricPlugin.class);

        super.onCreate(savedInstanceState);
    }
}
