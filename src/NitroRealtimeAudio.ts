import { NitroModules } from 'react-native-nitro-modules';
import { NativeModules } from 'react-native';
import type {
  AudioRecordingConfig,
  AudioPlaybackConfig,
  MicrophonePermissionStatus,
  NitroRealtimeAudio as NitroRealtimeAudioSpec,
} from './NitroRealtimeAudio.nitro';

const lifecycleModule = NativeModules.NitroRealtimeAudioLifecycle;

if (!lifecycleModule) {
  console.warn('NitroRealtimeAudioLifecycle native module is not available.');
}

export const NitroRealtimeAudio =
  NitroModules.createHybridObject<NitroRealtimeAudioSpec>('NitroRealtimeAudio');

export function getPlatformName(): string {
  return NitroRealtimeAudio.getPlatformName();
}

export function getNativeSampleRate(): number {
  return NitroRealtimeAudio.getNativeSampleRate();
}

export function getMicrophonePermissionStatus(): MicrophonePermissionStatus {
  return NitroRealtimeAudio.getMicrophonePermissionStatus();
}

export function requestMicrophonePermission(): Promise<MicrophonePermissionStatus> {
  return NitroRealtimeAudio.requestMicrophonePermission();
}

export function startRecording(config: AudioRecordingConfig): void {
  NitroRealtimeAudio.startRecording(config);
}

export function stopRecording(): void {
  NitroRealtimeAudio.stopRecording();
}

export function isRecording(): boolean {
  return NitroRealtimeAudio.isRecording();
}

export function getCapturedBufferCount(): number {
  return NitroRealtimeAudio.getCapturedBufferCount();
}

export function onAudioChunk(callback: (buffer: ArrayBuffer) => void): void {
  NitroRealtimeAudio.onAudioChunk(callback);
}

// Audio Player
export function initializePlayer(config: AudioPlaybackConfig): void {
  NitroRealtimeAudio.initializePlayer(config);
}

export function playChunk(buffer: ArrayBuffer): void {
  NitroRealtimeAudio.playChunk(buffer);
}

export function stopPlayback(): void {
  NitroRealtimeAudio.stopPlayback();
}

export function releasePlayer(): void {
  NitroRealtimeAudio.releasePlayer();
}
