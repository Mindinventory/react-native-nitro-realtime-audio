import { NitroModules } from 'react-native-nitro-modules';
import type { NitroRealtimeAudio } from './NitroRealtimeAudio.nitro';

const NitroRealtimeAudioHybridObject =
  NitroModules.createHybridObject<NitroRealtimeAudio>('NitroRealtimeAudio');

export function multiply(a: number, b: number): number {
  return NitroRealtimeAudioHybridObject.multiply(a, b);
}
