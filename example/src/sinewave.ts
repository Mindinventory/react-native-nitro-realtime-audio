export function generateSineWavePCM16(
  frequency: number = 440,
  durationMs: number = 5000,
  sampleRate: number = 24000
): ArrayBuffer {
  const sampleCount = Math.floor((sampleRate * durationMs) / 1000);

  const pcm = new Int16Array(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleRate;

    pcm[i] = Math.sin(2 * Math.PI * frequency * t) * 32767;
  }

  return pcm.buffer;
}
