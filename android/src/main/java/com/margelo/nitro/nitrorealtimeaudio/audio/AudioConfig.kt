package com.margelo.nitro.nitrorealtimeaudio.audio

data class AudioConfig(
  val sampleRate: Double,
  val channels: Int,
  val chunkDurationMs: Double
)
