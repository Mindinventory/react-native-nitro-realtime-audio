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
} from './NitroRealtimeAudio';
export type { MicrophonePermissionStatus } from './NitroRealtimeAudio.nitro';
