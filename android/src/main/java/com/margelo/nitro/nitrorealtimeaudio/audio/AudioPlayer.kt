package com.margelo.nitro.nitrorealtimeaudio.audio

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.util.Log

class AudioPlayer {

    private companion object {
        const val TAG = "AudioPlayer"
        private const val CHUNK_DURATION_MS = 20
        private const val START_BUFFER_CHUNKS = 5
        private const val BUFFER_DURATION_MS = 2000

    }
    private var playChunkCalls = 0
    private var audioTrack: AudioTrack? = null

    private lateinit var config: AudioPlayerConfig

    private lateinit var ringBuffer: AudioRingBuffer

    private var playbackThread: Thread? = null
    private var totalPlayedBytes = 0L
    @Volatile
    private var isInitialized = false

    @Volatile
    private var isPlaying = false

    private var outputBufferSize = 0

    private var bytesPerChunk = 0

    private var startBufferBytes = 0
    private var endOfStream = false
    fun initialize(config: AudioPlayerConfig) {
        this.config = config
        isInitialized = true
        Log.d(TAG, "AudioTrack initialized")
        bytesPerChunk =
            config.sampleRate *
            config.channels *
            2 *
            CHUNK_DURATION_MS / 1000

        startBufferBytes = bytesPerChunk * START_BUFFER_CHUNKS
        val capacity =
            config.sampleRate *
            config.channels *
            2 *      // PCM16
            BUFFER_DURATION_MS / 1000        // 2 seconds

        ringBuffer = AudioRingBuffer(capacity)
    }

    private fun createAudioTrack() {
        audioTrack?.let {
            try {
                it.release()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to release existing AudioTrack: ${e.message}")
            }
        }
        audioTrack = null

        val channelMask =
            if (config.channels == 1)
                AudioFormat.CHANNEL_OUT_MONO
            else
                AudioFormat.CHANNEL_OUT_STEREO

        val minBufferSize = AudioTrack.getMinBufferSize(
            config.sampleRate,
            channelMask,
            AudioFormat.ENCODING_PCM_16BIT
        )

        outputBufferSize = minBufferSize * 2

        if (minBufferSize == AudioTrack.ERROR ||
            minBufferSize == AudioTrack.ERROR_BAD_VALUE
        ) {
            throw IllegalStateException(
                "Unable to determine AudioTrack buffer size."
            )
        }

        val attributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build()

        val format = AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(config.sampleRate)
            .setChannelMask(channelMask)
            .build()     
            
        audioTrack = AudioTrack.Builder()
            .setAudioAttributes(attributes)
            .setAudioFormat(format)
            .setBufferSizeInBytes(outputBufferSize)
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build()    

        if (audioTrack?.state != AudioTrack.STATE_INITIALIZED) {
            audioTrack?.release()
            audioTrack = null

            throw IllegalStateException(
                "Failed to initialize AudioTrack."
            )
        }    
        Log.d(
            TAG,
            "requested=${config.sampleRate}, actual=${audioTrack?.sampleRate}"
        )
    }
    private var totalReceivedBytes = 0L
    fun playChunk(data: ByteArray) {
        check(isInitialized) {
            "AudioPlayer is not initialized."
        }
        playChunkCalls++
        totalReceivedBytes += data.size
        if (playChunkCalls % 25 == 0) {
            Log.d(TAG, "playChunkCalls=$playChunkCalls")
        }
        enqueueChunk(data)
        // Log.d(TAG, "playChunk ${data.size}")
    }
    
    private var enqueueCalls = 0
    fun enqueueChunk(data: ByteArray) {
        enqueueCalls++

        if (enqueueCalls % 25 == 0) {
            Log.d(
                TAG,
                "enqueueCalls=$enqueueCalls size=${data.size}"
            )
        }
        val written = ringBuffer.write(data)

        if (written != data.size) {
            Log.e(
            TAG,
            "WRITE FAILED written=$written expected=${data.size}"
        )
        }

        if (!isPlaying && ringBuffer.availableBytes() >= startBufferBytes) {
            ensurePlaybackStarted()
        }

        Log.d(TAG,"available=${ringBuffer.availableBytes()} threshold=$startBufferBytes")
    }

    @Synchronized
    private fun ensurePlaybackStarted() {
        if (isPlaying) return
        createAudioTrack()
        startPlayback()
    }

    private fun startPlayback() {
        if(isPlaying) return
        val track = audioTrack
        ?: throw IllegalStateException("AudioTrack is null.")
        track.play()
        check(track?.playState == AudioTrack.PLAYSTATE_PLAYING) {
            "Failed to start AudioTrack playback."
        }
        isPlaying = true
        startPlaybackThread()
        Log.d(TAG, "Playback started")
    }

    private fun startPlaybackThread() {
        playbackThread = Thread(::playbackLoop, "NitroRealtimeAudioPlayback")
        playbackThread?.start()
    }

    private fun playbackLoop() {
        Log.d(TAG, "Playback thread started")
        val track = audioTrack ?: return
        var isBuffering = false
        try {
            val temp = ByteArray(bytesPerChunk)
            while (isPlaying) {
                Log.d(TAG,"playState=${track.playState}")
                
                val available = ringBuffer.availableBytes()
                if (available < bytesPerChunk) {
                    isBuffering = true
                }

                val read = if (isBuffering) {
                    ringBuffer.blockingReadThreshold(temp, 0, temp.size, startBufferBytes) {
                        isPlaying
                    }
                } else {
                    ringBuffer.blockingRead(temp) {
                        isPlaying
                    }
                }

                isBuffering = false

                Log.d(TAG, "blockingRead read=$read")

                if (read <= 0) {
                    if (!isPlaying) {
                        break
                    }

                    continue
                }
            
                val written = track.write(
                    temp,
                    0,
                    read,
                    AudioTrack.WRITE_BLOCKING
                )
                if (written < 0) {
                    Log.e(TAG, "AudioTrack.write failed: $written")
                    break
                }
                totalPlayedBytes += written
                Log.d(
                    TAG,
                    "requested=$read written=$written playState=${track.playState} totalPlayedBytes=$totalPlayedBytes"
                )
                if (endOfStream && ringBuffer.isEmpty()) {
                    break
                }
            }
            Log.d(TAG, "Playback thread finished")
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
        }
    }   

    @Synchronized
    fun stopPlayback() {
        Log.e(
            TAG,
            "stopPlayback() CALLED",
            Throwable()
        )
        if (!isPlaying) {
            return
        }
        isPlaying = false

        // 1. Stop the track to unblock track.write()
        audioTrack?.let { track ->
            try {
                track.stop()
            } catch (e: Exception) {
                Log.e(TAG, "Error stopping AudioTrack: ${e.message}")
            }
        }

        // 2. Terminate the playback thread
        ringBuffer.clear()
        ringBuffer.wakeUp()
        playbackThread?.interrupt()
        try {
            playbackThread?.join(1000)
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
        }
        playbackThread = null

        // 3. Flush and release the track
        audioTrack?.let { track ->
            try {
                track.flush()
                track.release()
            } catch (e: Exception) {
                Log.e(TAG, "Error releasing AudioTrack: ${e.message}")
            }
        }
        audioTrack = null
    }

    @Synchronized
    fun releasePlayer() {
        stopPlayback()
        isInitialized = false
        Log.d(TAG, "FINAL playChunkCalls=$playChunkCalls")
    }

    fun finish() {
        endOfStream = true
        ringBuffer.wakeUp()
    }
}