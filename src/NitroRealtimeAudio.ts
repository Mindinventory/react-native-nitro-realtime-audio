import { NitroModules } from 'react-native-nitro-modules';
import { NativeModules } from 'react-native';
import type {
  AudioRecordingConfig,
  MicrophonePermissionStatus,
  NitroRealtimeAudio as NitroRealtimeAudioSpec,
} from './NitroRealtimeAudio.nitro';

const lifecycleModule = NativeModules.NitroRealtimeAudioLifecycle;

if (!lifecycleModule) {
  console.warn('NitroRealtimeAudioLifecycle native module is not available.');
}

const NitroRealtimeAudioHybridObject =
  NitroModules.createHybridObject<NitroRealtimeAudioSpec>('NitroRealtimeAudio');

export function getPlatformName(): string {
  return NitroRealtimeAudioHybridObject.getPlatformName();
}

export function getNativeSampleRate(): number {
  return NitroRealtimeAudioHybridObject.getNativeSampleRate();
}

export function getMicrophonePermissionStatus(): MicrophonePermissionStatus {
  return NitroRealtimeAudioHybridObject.getMicrophonePermissionStatus();
}

export function requestMicrophonePermission(): Promise<MicrophonePermissionStatus> {
  return NitroRealtimeAudioHybridObject.requestMicrophonePermission();
}

export function startRecording(config: AudioRecordingConfig): void {
  NitroRealtimeAudioHybridObject.startRecording(config);
}

export function stopRecording(): void {
  NitroRealtimeAudioHybridObject.stopRecording();
}

export function isRecording(): boolean {
  return NitroRealtimeAudioHybridObject.isRecording();
}

export function getCapturedBufferCount(): number {
  return NitroRealtimeAudioHybridObject.getCapturedBufferCount();
}

export function onAudioChunk(callback: (buffer: ArrayBuffer) => void): void {
  NitroRealtimeAudioHybridObject.onAudioChunk(callback);
}
