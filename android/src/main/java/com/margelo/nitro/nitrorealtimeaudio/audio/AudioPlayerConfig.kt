package com.margelo.nitro.nitrorealtimeaudio.audio

data class AudioPlayerConfig(
    val sampleRate: Int,
    val channels: Int,
    val bufferSize: Int
)