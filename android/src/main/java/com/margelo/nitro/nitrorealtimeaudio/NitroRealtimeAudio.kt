package com.margelo.nitro.nitrorealtimeaudio

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import androidx.core.content.ContextCompat
import com.facebook.proguard.annotations.DoNotStrip
import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.Promise
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.concurrent.thread
import kotlin.coroutines.resume
import com.margelo.nitro.nitrorealtimeaudio.audio.AudioConfig
import com.margelo.nitro.nitrorealtimeaudio.audio.AudioPlayerConfig
import com.margelo.nitro.nitrorealtimeaudio.audio.AudioRecorder
import com.margelo.nitro.nitrorealtimeaudio.audio.AudioChunk
import com.margelo.nitro.nitrorealtimeaudio.audio.AudioPlayer
import com.margelo.nitro.core.ArrayBuffer
import java.nio.ByteBuffer
import java.nio.ByteOrder

@DoNotStrip
class NitroRealtimeAudio : HybridNitroRealtimeAudioSpec() {


  private val recorder = AudioRecorder()
  private val audioPlayer = AudioPlayer()
  private var audioChunkCallback:((ArrayBuffer) -> Unit)? = null

  init {
    recorder.onChunk = { chunk ->
      handleChunk(chunk)
    }
  }

  
  override fun getPlatformName(): String {
    return "Android"
  }

  override fun getNativeSampleRate(): Double {
    return AudioTrack.getNativeOutputSampleRate(
      android.media.AudioManager.STREAM_MUSIC
    ).toDouble()
  }

  override fun getMicrophonePermissionStatus(): MicrophonePermissionStatus {
    val context = NitroModules.applicationContext
      ?: throw IllegalStateException(
        "ReactApplicationContext is not initialized."
      )

    return when (
      ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.RECORD_AUDIO
      )
    ) {
      PackageManager.PERMISSION_GRANTED ->
        MicrophonePermissionStatus.GRANTED

      PackageManager.PERMISSION_DENIED ->
        MicrophonePermissionStatus.DENIED

      else ->
        MicrophonePermissionStatus.UNDETERMINED
    }
  }

  override fun requestMicrophonePermission(): Promise<MicrophonePermissionStatus> {
    return Promise.async {
      suspendCancellableCoroutine { continuation ->

        MicrophonePermissionManager.requestPermission { status ->
          if (continuation.isActive) {
            continuation.resume(status)
          }
        }
      }
    }
  }

  override fun startRecording(config: AudioRecordingConfig) {

    val audioConfig = AudioConfig(
      sampleRate = config.sampleRate,
      channels = config.channels.toInt(),
      chunkDurationMs = config.chunkDurationMs
    )

    recorder.start(audioConfig)
  }

  override fun stopRecording() {
    recorder.stop()
  }

  override fun isRecording(): Boolean {
    return recorder.isRecording
  }

  override fun getCapturedBufferCount(): Double {
    return recorder.capturedBufferCount
  }

  override fun onAudioChunk(callback: (buffer: ArrayBuffer) -> Unit) {
    audioChunkCallback = callback
  }

  private fun handleChunk(chunk: AudioChunk) {
    val callback = audioChunkCallback ?: return

    val byteBuffer = ByteBuffer.allocateDirect(chunk.samples.size * 2)

    byteBuffer.order(ByteOrder.LITTLE_ENDIAN)

    for (sample in chunk.samples) {
        byteBuffer.put((sample.toInt() and 0xFF).toByte())
        byteBuffer.put(((sample.toInt() shr 8) and 0xFF).toByte())
    }

    byteBuffer.flip()

    callback(ArrayBuffer.wrap(byteBuffer))
  }

  override fun initializePlayer(config: AudioPlaybackConfig) {
    audioPlayer.initialize(AudioPlayerConfig(
      sampleRate = config.sampleRate.toInt(),
      channels = config.channels.toInt(),
      bufferSize = config.bufferSize.toInt()
    ))
  }

  override fun playChunk(buffer: ArrayBuffer) {
    audioPlayer.playChunk(buffer.toByteArray())
  }

  override fun stopPlayback() {
    audioPlayer.stopPlayback()
  }

  override fun releasePlayer() {
    audioPlayer.releasePlayer()
  }
  
}
