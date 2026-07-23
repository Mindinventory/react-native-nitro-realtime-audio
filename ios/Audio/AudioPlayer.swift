//
//  AudioPlayer.swift
//

import Foundation
import AVFoundation

final class AudioPlayer {

    // MARK: Configuration

    private let config: AudioPlayerConfig

    // MARK: Engine

    private let engine = AVAudioEngine()

    private let playerNode = AVAudioPlayerNode()

    private var audioFormat: AVAudioFormat!

    // MARK: Buffer

    private let ringBuffer: AudioRingBuffer

    // MARK: Playback

    private var playbackThread: Thread?

    private var isPlaying = false

    private var endOfStream = false

    // MARK: Constants

    private let CHUNK_DURATION_MS = 20

    private let START_BUFFER_CHUNKS = 5

    private let BUFFER_DURATION_MS = 2000

    private let bytesPerSample = 2

    private var bytesPerFrame: Int {
        config.channels * bytesPerSample
    }

    private var chunkBytes: Int {
        config.sampleRate *
        bytesPerFrame *
        CHUNK_DURATION_MS / 1000
    }

    private var startBufferBytes: Int {
        chunkBytes * START_BUFFER_CHUNKS
    }

    private let scheduledBufferSemaphore =
        DispatchSemaphore(value: 5) 

    // MARK: Init

    init(config: AudioPlayerConfig) {
        self.config = config
        let bytesPerSample = 2
        let bufferBytes =
            config.sampleRate *
            config.channels *
            bytesPerSample *
            BUFFER_DURATION_MS / 1000
        self.ringBuffer = AudioRingBuffer(
            capacity: bufferBytes
        )
    }

    func initialize() throws {
        print("AudioPlayer initialize")
        audioFormat = AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: Double(config.sampleRate),
            channels: AVAudioChannelCount(config.channels),
            interleaved: true
        )
        guard let audioFormat else {
            throw NSError(
                domain: "AudioPlayer",
                code: -1,
                userInfo: [
                    NSLocalizedDescriptionKey:
                        "Failed to create audio format"
                ]
            )
        }
        engine.attach(playerNode)
        engine.connect(
            playerNode,
            to: engine.mainMixerNode,
            format: audioFormat
        )
        try engine.start()
        playerNode.play()
        print("AVAudioEngine started")
    }

    func playChunk(_ data: [UInt8]) {
        ringBuffer.write(data)
    }

    func startPlayback() {
        guard !isPlaying else {
            return
        }
        print("Starting playback thread")
        isPlaying = true
        endOfStream = false
        playbackThread = Thread {
            self.playbackLoop()
        }
        playbackThread?.start()
    }

    func stopPlayback() {
        print("Stopping playback")
        isPlaying = false
        endOfStream = false
        ringBuffer.clear()
        ringBuffer.wakeUp()
        playerNode.stop()
    }

    func finish() {
        print("End of stream")
        endOfStream = true
        ringBuffer.wakeUp()
    }

    func release() {
        stopPlayback()
        engine.stop()
        engine.detach(playerNode)
        print("Released AudioPlayer")
    }

    private func waitForInitialBuffer() {
        print("Waiting for initial buffer...")
        while isPlaying &&
            ringBuffer.availableBytes() < startBufferBytes {
            Thread.sleep(forTimeInterval: 0.005)
        }
        print("Initial buffer ready")
    }

    private func playbackLoop() {

    waitForInitialBuffer()

    var pcmBytes = Array(
        repeating: UInt8(0),
        count: chunkBytes
    )

    while isPlaying {

        autoreleasepool {

            let bytesRead =
                ringBuffer.blockingRead(
                    into: &pcmBytes
                ) { [weak self] in

                    self?.isPlaying ?? false
                }

            if bytesRead == 0 {

                if endOfStream &&
                    ringBuffer.isEmpty() {

                    print("Playback thread exiting")

                    isPlaying = false
                }

                return
            }

            guard let buffer =
                    createPCMBuffer(
                        from: pcmBytes,
                        length: bytesRead
                    )
            else {

                print("Failed to create PCM buffer")

                return
            }

            scheduleBuffer(buffer)
        }
    }

    print("Playback thread stopped")
}

    private func createPCMBuffer(from bytes: [UInt8],length: Int) -> AVAudioPCMBuffer? {

        let frameCount = AVAudioFrameCount(length / bytesPerFrame)

        guard let pcmBuffer = AVAudioPCMBuffer(
            pcmFormat: audioFormat,
            frameCapacity: frameCount
        ) else {
            return nil
        }

        pcmBuffer.frameLength = frameCount

        guard let audioBufferList = pcmBuffer.mutableAudioBufferList else {
            return nil
        }

        let audioBuffer = audioBufferList.pointee.mBuffers

        guard let destination = audioBuffer.mData else {
            return nil
        }

        memcpy(destination, bytes, length)

        audioBuffer.mDataByteSize = UInt32(length)

        return pcmBuffer
    }

    private func scheduleBuffer(_ buffer: AVAudioPCMBuffer) {

    playerNode.scheduleBuffer(
        buffer,
        completionCallbackType: .dataPlayedBack
        ) { [weak self] _ in

            guard let self else { return }

            print("Buffer played")

            if self.endOfStream &&
                self.ringBuffer.isEmpty() {

                print("Playback finished")

                self.isPlaying = false
            }
        }
    }
}