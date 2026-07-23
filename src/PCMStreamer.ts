import type { NitroRealtimeAudio } from './NitroRealtimeAudio.nitro';

export interface PCMStreamerOptions {
  sampleRate: number;
  channels: number;
  chunkDurationMs?: number;
}

export class PCMStreamer {
  private readonly queue: ArrayBuffer[] = [];
  private isPlaying = false;
  private readonly chunkDurationMs: number;
  private readonly bytesPerChunk: number;

  constructor(
    private readonly audio: NitroRealtimeAudio,
    options: PCMStreamerOptions
  ) {
    this.chunkDurationMs = options.chunkDurationMs ?? 20;

    const bytesPerSample = 2; // PCM16

    const samplesPerChunk = (options.sampleRate * this.chunkDurationMs) / 1000;

    this.bytesPerChunk = samplesPerChunk * options.channels * bytesPerSample;
  }

  play(buffer: ArrayBuffer): void {
    console.log('play buffer bytes', buffer.byteLength);
    this.stop();
    let offset = 0;
    while (offset < buffer.byteLength) {
      const end = Math.min(offset + this.bytesPerChunk, buffer.byteLength);
      const chunk = buffer.slice(offset, end);
      this.enqueue(chunk);
      offset = end;
    }
    this.finish();
  }

  enqueue(chunk: ArrayBuffer) {
    this.queue.push(chunk);

    if (!this.isPlaying) {
      this.startScheduler();
    }
  }

  private startScheduler() {
    this.isPlaying = true;
    while (this.queue.length > 0) {
      this.audio.playChunk(this.queue.shift()!);
    }
    this.isPlaying = false;
  }

  stop(): void {
    this.queue.length = 0;
    this.isPlaying = false;
    this.audio.stopPlayback();
  }

  finish(): void {
    console.log('finish remaining queue:', this.queue.length);
  }

  get playing(): boolean {
    return this.isPlaying;
  }
}
