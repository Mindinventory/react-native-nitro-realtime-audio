package com.margelo.nitro.nitrorealtimeaudio

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule

class NitroRealtimeAudioLifecycleModule(
    reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    init {
        MicrophonePermissionManager.initialize(reactContext)
    }

    override fun getName(): String {
        return NAME
    }

    companion object {
        const val NAME = "NitroRealtimeAudioLifecycle"
    }
}