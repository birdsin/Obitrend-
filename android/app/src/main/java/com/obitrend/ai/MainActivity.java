
package com.obitrend.ai;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(AdMobRewardedPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
