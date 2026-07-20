import AVFoundation

final class AudioRecorder {
  
  private let audioEngine = AVAudioEngine()
  private let chunkAccumulator = ChunkAccumulator()
  private var recording = false
  
  private var audioConverter: AVAudioConverter?
  private var outputFormat: AVAudioFormat?
  
  private var inputFormat: AVAudioFormat?
  private var tapBufferFrames: AVAudioFrameCount = 0

  var onChunk: ((AudioChunk) -> Void)?

  var capturedBufferCount: Double {
    Double(chunkAccumulator.chunkCount)
  }

  init() {
    chunkAccumulator.onChunk = {
        [weak self] chunk in
        self?.onChunk?(chunk)
    }
  }
  
  func start(config: AudioConfig) throws {
    guard !recording else {
      return
    }

    try validatePermission()
    try configureAudioSession(config: config)
    try prepareConverter(config: config)
    try installInputTap(config: config)
    try startAudioEngine()
  }
  
  private func validatePermission() throws {
    guard AVAudioSession.sharedInstance().recordPermission == .granted else {
      throw NSError(
        domain: "NitroRealtimeAudio",
        code: 1,
        userInfo: [
          NSLocalizedDescriptionKey:
            "Microphone permission has not been granted."
        ]
      )
    }
  }
  
  private func configureAudioSession(
    config: AudioConfig
  ) throws {
    let sampleRate = config.sampleRate
    let channels = AVAudioChannelCount(config.channels)
    let chunkDurationMs = config.chunkDurationMs
    
    guard sampleRate > 0 else {
      throw NSError(
        domain: "NitroRealtimeAudio",
        code: 2,
        userInfo: [
          NSLocalizedDescriptionKey:
            "Sample rate must be greater than zero."
        ]
      )
    }
    
    guard channels == 1 || channels == 2 else {
      throw NSError(
        domain: "NitroRealtimeAudio",
        code: 3,
        userInfo: [
          NSLocalizedDescriptionKey:
            "Only mono and stereo recording are currently supported."
        ]
      )
    }
    
    guard chunkDurationMs > 0 else {
      throw NSError(
        domain: "NitroRealtimeAudio",
        code: 4,
        userInfo: [
          NSLocalizedDescriptionKey:
            "Chunk duration must be greater than zero."
        ]
      )
    }
    
    let audioSession = AVAudioSession.sharedInstance()
    
    try audioSession.setCategory(
      .playAndRecord,
      mode: .voiceChat,
      options: [
        .defaultToSpeaker,
        .allowBluetoothHFP
      ]
    )
    
    try audioSession.setPreferredSampleRate(sampleRate)
    try audioSession.setActive(true)
  }
  
  private func prepareConverter(
    config: AudioConfig
  ) throws {
    let node = audioEngine.inputNode
    let format = node.inputFormat(forBus: 0)

    inputFormat = format
    
    guard format.sampleRate > 0,
          format.channelCount > 0 else {
      throw NSError(
        domain: "NitroRealtimeAudio",
        code: 5,
        userInfo: [
          NSLocalizedDescriptionKey:
            "Invalid microphone input format."
        ]
      )
    }
    
    guard let targetFormat = AVAudioFormat(
      commonFormat: .pcmFormatInt16,
      sampleRate: config.sampleRate,
      channels: AVAudioChannelCount(config.channels),
      interleaved: true
    ) else {
      throw NSError(
        domain: "NitroRealtimeAudio",
        code: 6,
        userInfo: [
          NSLocalizedDescriptionKey:
            "Failed to create target PCM16 audio format."
        ]
      )
    }
    
    guard let converter = AVAudioConverter(
      from: format,
      to: targetFormat
    ) else {
      throw NSError(
        domain: "NitroRealtimeAudio",
        code: 7,
        userInfo: [
          NSLocalizedDescriptionKey:
            "Failed to create AVAudioConverter."
        ]
      )
    }
    
    let requestedFrames = Int(
      config.sampleRate * config.chunkDurationMs / 1000.0
    )
    
    let requestedSamples =
      requestedFrames * config.channels
    
    guard requestedSamples > 0 else {
      throw NSError(
        domain: "NitroRealtimeAudio",
        code: 8,
        userInfo: [
          NSLocalizedDescriptionKey:
            "Calculated chunk size must be greater than zero."
        ]
      )
    }
    
    audioConverter = converter
    outputFormat = targetFormat
    chunkAccumulator.configure(
        samplesPerChunk: requestedSamples
    ) 
    
    tapBufferFrames = AVAudioFrameCount(
      format.sampleRate * config.chunkDurationMs / 1000.0
    )
  }
  
  private func installInputTap(
    config: AudioConfig
  ) throws {
    let inputNode = audioEngine.inputNode
    
    inputNode.installTap(
      onBus: 0,
      bufferSize: tapBufferFrames,
      format: inputFormat
    ) { [weak self] buffer, _ in
      self?.processInputBuffer(buffer)
    }
  }
  
  private func startAudioEngine() throws {
    audioEngine.prepare()
    recording = true
    let inputNode = audioEngine.inputNode
    do {
      try audioEngine.start()
    } catch {
      inputNode.removeTap(onBus: 0)
      recording = false
      audioConverter = nil
      outputFormat = nil
      chunkAccumulator.reset()
      throw error
    }
  }
  
  private func processInputBuffer(_ inputBuffer: AVAudioPCMBuffer) {
    guard recording,
          let converter = audioConverter,
          let outputFormat = outputFormat else {
      return
    }
    
    let ratio =
      outputFormat.sampleRate / inputBuffer.format.sampleRate
    
    let estimatedOutputFrames = AVAudioFrameCount(
      ceil(Double(inputBuffer.frameLength) * ratio) + 32
    )
    
    guard estimatedOutputFrames > 0 else {
      return
    }
    
    guard let convertedBuffer = AVAudioPCMBuffer(
      pcmFormat: outputFormat,
      frameCapacity: estimatedOutputFrames
    ) else {
      return
    }
    
    var hasProvidedInput = false
    var conversionError: NSError?
    
    let status = converter.convert(
      to: convertedBuffer,
      error: &conversionError
    ) { _, outStatus in
      
      if hasProvidedInput {
        outStatus.pointee = .noDataNow
        return nil
      }
      
      hasProvidedInput = true
      outStatus.pointee = .haveData
      
      return inputBuffer
    }
    
    guard conversionError == nil else {
      return
    }
    
    guard status == .haveData || status == .inputRanDry else {
      return
    }
    
    let frameLength = Int(convertedBuffer.frameLength)
    
    guard frameLength > 0 else {
      return
    }
    
    guard let int16ChannelData = convertedBuffer.int16ChannelData else {
      return
    }
    
    let channelCount = Int(convertedBuffer.format.channelCount)
    let totalSamples = frameLength * channelCount
    let samples: [Int16]
    
    if convertedBuffer.format.isInterleaved {
      let pointer = int16ChannelData[0]
      let bufferPointer = UnsafeBufferPointer(start: pointer, count: totalSamples)
      samples = Array(bufferPointer)
    } else {
      var extractedSamples = [Int16]()
      extractedSamples.reserveCapacity(totalSamples)
      for frame in 0..<frameLength {
        for channel in 0..<channelCount {
          extractedSamples.append(int16ChannelData[channel][frame])
        }
      }
      samples = extractedSamples
    }
    
    chunkAccumulator.append(samples: samples)
  }
  
  
  
  func stop() throws {
    guard recording else {
      return
    }
    recording = false
    audioEngine.inputNode.removeTap(onBus: 0)
    audioEngine.stop()
    reset()
  }
  
  private func reset() {
    audioConverter = nil
    outputFormat = nil
    chunkAccumulator.reset()
    inputFormat = nil
    tapBufferFrames = 0
  }
  
  var isRecording: Bool {
    return recording
  }

  private func handleChunk(_ chunk: AudioChunk) {
    // Temporary

    print(
        "Chunk:",
        chunk.samples.count
    )
  }
  
}
