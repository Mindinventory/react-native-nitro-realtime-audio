export {
  getPlatformName,
  getNativeSampleRate,
  getMicrophonePermissionStatus,
  requestMicrophonePermission,
  startRecording,
  stopRecording,
  isRecording,
  getCapturedBufferCount,
  onAudioChunk,
  initializePlayer,
  playChunk,
  stopPlayback,
  releasePlayer,
} from './NitroRealtimeAudio';
export { NitroRealtimeAudio } from './NitroRealtimeAudio';
export type { MicrophonePermissionStatus } from './NitroRealtimeAudio.nitro';
export { PCMStreamer } from './PCMStreamer';
