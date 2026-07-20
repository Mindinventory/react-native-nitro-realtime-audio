import type { HybridObject } from 'react-native-nitro-modules';

export type MicrophonePermissionStatus = 'granted' | 'denied' | 'undetermined';

export interface AudioRecordingConfig {
  sampleRate: number;
  channels: number;
  chunkDurationMs: number;
}

export interface NitroRealtimeAudio extends HybridObject<{
  ios: 'swift';
  android: 'kotlin';
}> {
  getPlatformName(): string;
  getNativeSampleRate(): number;
  getMicrophonePermissionStatus(): MicrophonePermissionStatus;
  requestMicrophonePermission(): Promise<MicrophonePermissionStatus>;
  startRecording(config: AudioRecordingConfig): void;
  stopRecording(): void;
  isRecording(): boolean;
  getCapturedBufferCount(): number;
  onAudioChunk(callback: (buffer: ArrayBuffer) => void): void;
}
