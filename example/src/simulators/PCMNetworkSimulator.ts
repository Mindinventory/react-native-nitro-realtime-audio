import type { StreamingOptions, StreamingStats } from './types';

export class PCMNetworkSimulator {
  private chunks: Uint8Array[] = [];

  private currentIndex = 0;

  private timer: ReturnType<typeof setTimeout> | null = null;

  private running = false;

  private stats: StreamingStats = {
    sentChunks: 0,
    droppedChunks: 0,
    burstCount: 0,
    currentDelayMs: 0,
  };

  private nextExpectedTime = 0;

  constructor(private readonly options: StreamingOptions) {}

  start(chunks: Uint8Array[], onChunk: (chunk: Uint8Array) => void) {
    if (this.running) {
      this.stop();
    }

    this.running = true;

    this.chunks = chunks;
    this.currentIndex = 0;
    this.nextExpectedTime = Date.now();

    this.stats = {
      sentChunks: 0,
      droppedChunks: 0,
      burstCount: 0,
      currentDelayMs: 0,
    };

    this.scheduleNext(onChunk);
  }

  private scheduleNext(onChunk: (chunk: Uint8Array) => void) {
    if (!this.running) {
      return;
    }

    if (this.currentIndex >= this.chunks.length) {
      this.stop();
      return;
    }

    const now = Date.now();
    this.nextExpectedTime += this.options.baseDelayMs;
    const delay = Math.max(0, this.nextExpectedTime - now);

    this.stats.currentDelayMs = delay;

    this.timer = setTimeout(() => {
      const chunk = this.chunks[this.currentIndex++];

      if (chunk) {
        onChunk(chunk);
      }

      this.stats.sentChunks++;

      this.scheduleNext(onChunk);
    }, delay);
  }

  stop() {
    this.running = false;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  getStats(): StreamingStats {
    return { ...this.stats };
  }
}
