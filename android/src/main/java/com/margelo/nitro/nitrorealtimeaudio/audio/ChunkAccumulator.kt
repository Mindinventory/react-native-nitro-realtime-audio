package com.margelo.nitro.nitrorealtimeaudio.audio

import com.margelo.nitro.nitrorealtimeaudio.audio.AudioChunk

internal class ChunkAccumulator {

    private var sampleBuffer = ShortArray(0)
    private var sampleBufferCount = 0
    private var samplesPerChunk = 0
    var onChunk: ((AudioChunk) -> Unit)? = null
    var chunkCount = 0L
        private set

    fun configure(samplesPerChunk: Int) {
        this.samplesPerChunk = samplesPerChunk
        this.sampleBuffer = ShortArray(samplesPerChunk * 4)
        this.sampleBufferCount = 0
        this.chunkCount = 0
    }

    fun reset() {
        this.sampleBuffer = ShortArray(0)
        this.sampleBufferCount = 0
        this.samplesPerChunk = 0
        this.chunkCount = 0
    }

    fun append(samples: ShortArray, size: Int = samples.size) {
        if (samplesPerChunk <= 0) return

        // Ensure capacity
        val requiredCapacity = sampleBufferCount + size
        if (requiredCapacity > sampleBuffer.size) {
            val newCapacity = maxOf(sampleBuffer.size * 2, requiredCapacity)
            val newBuffer = ShortArray(newCapacity)
            System.arraycopy(sampleBuffer, 0, newBuffer, 0, sampleBufferCount)
            sampleBuffer = newBuffer
        }

        // Copy new samples to buffer
        System.arraycopy(samples, 0, sampleBuffer, sampleBufferCount, size)
        sampleBufferCount += size

        var readOffset = 0
        while (sampleBufferCount - readOffset >= samplesPerChunk) {
            val chunkSamples = ShortArray(samplesPerChunk)
            System.arraycopy(sampleBuffer, readOffset, chunkSamples, 0, samplesPerChunk)
            onChunk?.invoke(AudioChunk(chunkSamples))
            readOffset += samplesPerChunk
            chunkCount++
        }

        if (readOffset > 0) {
            val remainingSamples = sampleBufferCount - readOffset
            if (remainingSamples > 0) {
                System.arraycopy(sampleBuffer, readOffset, sampleBuffer, 0, remainingSamples)
            }
            sampleBufferCount = remainingSamples
        }
    }
}