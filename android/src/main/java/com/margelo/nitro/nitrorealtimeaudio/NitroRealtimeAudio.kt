package com.margelo.nitro.nitrorealtimeaudio
  
import com.facebook.proguard.annotations.DoNotStrip

@DoNotStrip
class NitroRealtimeAudio : HybridNitroRealtimeAudioSpec() {
  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }
}
