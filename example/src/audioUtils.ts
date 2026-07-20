declare const btoa: (str: string) => string;

export interface ChunkStats {
  byteLength: number;
  samplesCount: number;
  minSample: number;
  maxSample: number;
  rms: number;
  db: number;
}

export function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

export function pcmChunksToWav(
  chunks: Uint8Array[],
  sampleRate: number,
  channels: number
): Uint8Array {
  const dataLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);

  const wav = new Uint8Array(44 + dataLength);
  const view = new DataView(wav.buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');

  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);

  const byteRate = sampleRate * channels * 2;
  const blockAlign = channels * 2;

  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);

  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;

  for (const chunk of chunks) {
    wav.set(chunk, offset);
    offset += chunk.length;
  }

  return wav;
}

export function calculateChunkStats(arrayBuffer: ArrayBuffer): ChunkStats {
  const pcm16 = new Int16Array(arrayBuffer);
  let min = 32767;
  let max = -32768;
  let sumSq = 0;

  for (let i = 0; i < pcm16.length; i++) {
    const sample = pcm16[i] ?? 0;
    if (sample < min) min = sample;
    if (sample > max) max = sample;
    sumSq += sample * sample;
  }

  const rms = Math.sqrt(sumSq / pcm16.length);
  const db = 20 * Math.log10(rms / 32768);

  return {
    byteLength: arrayBuffer.byteLength,
    samplesCount: pcm16.length,
    minSample: min,
    maxSample: max,
    rms: Math.round(rms),
    db: isFinite(db) ? Math.round(db) : -100,
  };
}

export function getWaveformData(
  arrayBuffer: ArrayBuffer,
  pointsCount: number = 40
): number[] {
  const pcm16 = new Int16Array(arrayBuffer);
  if (pcm16.length === 0) {
    return new Array(pointsCount).fill(0);
  }

  const step = pcm16.length / pointsCount;
  const data: number[] = [];

  for (let i = 0; i < pointsCount; i++) {
    let max = 0;
    const start = Math.floor(i * step);
    const end = Math.floor((i + 1) * step);

    // Ensure we look at at least one sample even if step is < 1
    const actualEnd = Math.max(end, start + 1);

    for (let j = start; j < actualEnd && j < pcm16.length; j++) {
      const val = Math.abs(pcm16[j] ?? 0);
      if (val > max) {
        max = val;
      }
    }
    data.push(max / 32768);
  }
  return data;
}
