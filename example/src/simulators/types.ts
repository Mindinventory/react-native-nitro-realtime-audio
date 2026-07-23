export type NetworkProfile =
  'normal' | 'jitter' | 'burst' | 'packetLoss' | 'random';

export interface StreamingOptions {
  /**
   * Average time between chunks.
   * Normally 20ms for 20ms PCM packets.
   */
  baseDelayMs: number;

  /**
   * Random delay added/subtracted.
   * Example:
   * baseDelay=20
   * jitter=10
   *
   * -> 10~30ms
   */
  jitterMs: number;

  /**
   * Chance (0~1) to send multiple chunks together.
   */
  burstChance: number;

  /**
   * Maximum number of chunks in one burst.
   */
  maxBurstSize: number;

  /**
   * Chance (0~1) to completely drop a packet.
   */
  packetLoss: number;
}

export interface StreamingStats {
  sentChunks: number;
  droppedChunks: number;
  burstCount: number;
  currentDelayMs: number;
}
