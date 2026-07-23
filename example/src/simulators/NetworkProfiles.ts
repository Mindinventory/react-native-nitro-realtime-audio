import type { StreamingOptions } from './types';

export const NETWORK_PROFILES: Record<string, StreamingOptions> = {
  normal: {
    baseDelayMs: 20,
    jitterMs: 0,
    burstChance: 0,
    maxBurstSize: 1,
    packetLoss: 0,
  },

  jitter: {
    baseDelayMs: 20,
    jitterMs: 10,
    burstChance: 0,
    maxBurstSize: 1,
    packetLoss: 0,
  },

  burst: {
    baseDelayMs: 20,
    jitterMs: 5,
    burstChance: 0.4,
    maxBurstSize: 5,
    packetLoss: 0,
  },

  packetLoss: {
    baseDelayMs: 20,
    jitterMs: 5,
    burstChance: 0,
    maxBurstSize: 1,
    packetLoss: 0.05,
  },

  random: {
    baseDelayMs: 20,
    jitterMs: 15,
    burstChance: 0.3,
    maxBurstSize: 6,
    packetLoss: 0.03,
  },
};
