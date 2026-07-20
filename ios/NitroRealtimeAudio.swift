import AVFoundation
import NitroModules

class NitroRealtimeAudio: HybridNitroRealtimeAudioSpec {
  
  private let recorder = AudioRecorder()
  private var audioChunkCallback: ((ArrayBuffer) -> Void)?
  
  public override init() {
    super.init()
    recorder.onChunk = { [weak self] chunk in
      self?.handleChunk(chunk)
    }
  }

  private func handleChunk(_ chunk: AudioChunk) {
    guard let callback = audioChunkCallback else { return }
    let bytesCount = chunk.samples.count * MemoryLayout<Int16>.size
    let arrayBuffer = ArrayBuffer.allocate(size: bytesCount)
    chunk.samples.withUnsafeBytes { rawBufferPointer in
      if let baseAddress = rawBufferPointer.baseAddress {
        memcpy(arrayBuffer.data, baseAddress, bytesCount)
      }
    }
    callback(arrayBuffer)
  }

  public func getPlatformName() throws -> String {
    return "iOS"
  }
  
  public func getNativeSampleRate() throws -> Double {
    return AVAudioSession.sharedInstance().sampleRate
  }
  
  public func getMicrophonePermissionStatus() throws -> MicrophonePermissionStatus {
    switch AVAudioSession.sharedInstance().recordPermission {
    case .granted:
      return .granted
      
    case .denied:
      return .denied
      
    case .undetermined:
      return .undetermined
      
    @unknown default:
      return .undetermined
    }
  }
  
  public func requestMicrophonePermission() throws -> Promise<MicrophonePermissionStatus> {
    return Promise.async {
      let granted = await withCheckedContinuation { continuation in
        AVAudioSession.sharedInstance().requestRecordPermission { granted in
          continuation.resume(returning: granted)
        }
      }
      
      return granted ? MicrophonePermissionStatus.granted : MicrophonePermissionStatus.denied
    }
  }
  
  public func startRecording(config: AudioRecordingConfig) throws {
    let audioConfig = AudioConfig(
      sampleRate: config.sampleRate,
      channels: Int(config.channels),
      chunkDurationMs: config.chunkDurationMs
    )
    
    try recorder.start(config: audioConfig)
  }
  
  public func stopRecording() throws {
    try recorder.stop()
  }
  
  public func isRecording() throws -> Bool {
    recorder.isRecording
  }
  
  public func getCapturedBufferCount() throws -> Double {
    return recorder.capturedBufferCount
  }

  public func onAudioChunk(callback: @escaping (ArrayBuffer) -> Void) throws {
    audioChunkCallback = callback
  }
  
}
