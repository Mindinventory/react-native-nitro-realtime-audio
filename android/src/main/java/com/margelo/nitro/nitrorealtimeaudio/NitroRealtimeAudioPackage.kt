package com.margelo.nitro.nitrorealtimeaudio

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.module.model.ReactModuleInfo

class NitroRealtimeAudioPackage : BaseReactPackage() {
     override fun getModule(
        name: String,
        reactContext: ReactApplicationContext
    ): NativeModule? {
        return when (name) {
            NitroRealtimeAudioLifecycleModule.NAME ->
                NitroRealtimeAudioLifecycleModule(reactContext)

            else -> null
        }
    }

   override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
        return ReactModuleInfoProvider {
            mapOf(
                NitroRealtimeAudioLifecycleModule.NAME to ReactModuleInfo(
                    name = NitroRealtimeAudioLifecycleModule.NAME,
                    className = NitroRealtimeAudioLifecycleModule.NAME,
                    canOverrideExistingModule = false,
                    needsEagerInit = true,
                    isCxxModule = false,
                    isTurboModule = false
                )
            )
        }
    }

    companion object {
        init {
            System.loadLibrary("nitrorealtimeaudio")
        }
    }
}
