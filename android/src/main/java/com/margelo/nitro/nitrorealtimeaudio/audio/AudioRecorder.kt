package com.margelo.nitro.nitrorealtimeaudio.audio

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
import android.util.Log

internal class AudioRecorder {

  private companion object {
        const val TAG = "AudioRecorder"
  }

  private var recording = false
  private var audioRecord: AudioRecord? = null
  private var samplesPerChunk = 0
  private var bytesPerChunk = 0
  private val chunkAccumulator = ChunkAccumulator()
  private var recordingThread: Thread? = null
  val capturedBufferCount: Double
    get() = chunkAccumulator.chunkCount.toDouble()

  var onChunk: ((AudioChunk) -> Unit)? = null

  init {
     chunkAccumulator.onChunk = { chunk ->
        onChunk?.invoke(chunk)
      } 
    }

  val isRecording: Boolean
    get() = recording

  fun start(config: AudioConfig) {

    if (recording) return

    validatePermission()

    createAudioRecord(config)

    prepareChunkAccumulator(config)

    startRecordingThread()
  }

  private fun validatePermission() {

    val context = NitroModules.applicationContext
      ?: throw IllegalStateException(
        "ReactApplicationContext is not initialized."
      )

    val hasPermission = ContextCompat.checkSelfPermission(
      context,
      Manifest.permission.RECORD_AUDIO
    ) == PackageManager.PERMISSION_GRANTED

    if (!hasPermission) {
      throw IllegalStateException(
        "Microphone permission has not been granted."
      )
    }
  }

  private fun createAudioRecord(config : AudioConfig){
    val sampleRate = config.sampleRate.toInt()
    val channels = config.channels.toInt()

    validateRecordingConfig(
      sampleRate = sampleRate,
      channels = channels,
      chunkDurationMs = config.chunkDurationMs
    )

    val channelConfig = when (channels) {
      1 -> AudioFormat.CHANNEL_IN_MONO
      2 -> AudioFormat.CHANNEL_IN_STEREO

      else -> throw IllegalArgumentException(
        "Only mono and stereo recording are currently supported."
      )
    }

    val audioFormat = AudioFormat.ENCODING_PCM_16BIT

    val minimumBufferSize = AudioRecord.getMinBufferSize(
      sampleRate,
      channelConfig,
      audioFormat
    )

    if (minimumBufferSize <= 0) {
      throw IllegalStateException(
        "Failed to get valid minimum buffer size: $minimumBufferSize"
      )
    }

    val requestedFrames = (
      sampleRate * config.chunkDurationMs / 1000.0
      ).toInt()

    val samplesPerChunk = requestedFrames * channels

    bytesPerChunk =
      samplesPerChunk * Short.SIZE_BYTES

    val nativeBufferSizeBytes = maxOf(
      minimumBufferSize,
      bytesPerChunk
    )

    val record = AudioRecord(
      MediaRecorder.AudioSource.MIC,
      sampleRate,
      channelConfig,
      audioFormat,
      nativeBufferSizeBytes
    )

    if (record.state != AudioRecord.STATE_INITIALIZED) {
      record.release()

      throw IllegalStateException(
        "Failed to initialize AudioRecord."
      )
    }

    audioRecord = record

    try {
      record.startRecording()
      recording = true
    } catch (error: Exception) {
      recording = false
      audioRecord = null
      record.release()

      throw error
    }
  }

  private fun startRecordingThread() {

    recordingThread = thread(
      start = true,
      name = "NitroRealtimeAudioRecorder"
    ) {

      recordingLoop()

    }

  }

  private fun prepareChunkAccumulator(
    config: AudioConfig
  ) {
    val requestedFrames =
      (config.sampleRate * config.chunkDurationMs / 1000.0).toInt()

    samplesPerChunk =
      requestedFrames * config.channels

    chunkAccumulator.configure(samplesPerChunk)
  }

  private fun recordingLoop(){
    val record = audioRecord ?: return
    val readBuffer = ShortArray(samplesPerChunk)

    while (recording) {
      val samplesRead = record.read(
        readBuffer,
        0,
        readBuffer.size,
        AudioRecord.READ_BLOCKING
      )

      if (samplesRead <= 0) {
        if (samplesRead < 0) {
          break
        }

        continue
      }

      chunkAccumulator.append(readBuffer, samplesRead)
    }
  }


  private fun validateRecordingConfig(
    sampleRate: Int,
    channels: Int,
    chunkDurationMs: Double
  ) {
    if (sampleRate <= 0) {
      throw IllegalArgumentException(
        "Sample rate must be greater than zero."
      )
    }

    if (channels !in 1..2) {
      throw IllegalArgumentException(
        "Only mono and stereo recording are currently supported."
      )
    }

    if (chunkDurationMs <= 0) {
      throw IllegalArgumentException(
        "Chunk duration must be greater than zero."
      )
    }
  }

  fun stop() {
    if (!recording) {
      return
    }

    recording = false

    val record = audioRecord
    audioRecord = null
    try {
      record?.stop()
    } catch (_: IllegalStateException) {
      // Already stopped
    }
    try {
      recordingThread?.join(1000)
    } catch (_: InterruptedException) {
      Thread.currentThread().interrupt()
    }
    reset(record)
  }

  private fun reset(record: AudioRecord?) {
    audioRecord = null
    recordingThread = null
    record?.release()
    chunkAccumulator.reset()
  }


}
