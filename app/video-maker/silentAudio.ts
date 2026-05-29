// 음성 미사용 시 ffmpeg에 넘길 무음 WAV blob 생성 (16kHz mono PCM)
export function makeSilentWavBlob(durationSec: number): Blob {
  const sampleRate = 16000;
  const numSamples = Math.max(1, Math.round(durationSec * sampleRate));
  const dataSize = numSamples * 2; // 16-bit
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  let off = 0;
  const writeStr = (s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off++, s.charCodeAt(i));
  };
  const writeU32 = (n: number) => {
    view.setUint32(off, n, true);
    off += 4;
  };
  const writeU16 = (n: number) => {
    view.setUint16(off, n, true);
    off += 2;
  };
  writeStr('RIFF');
  writeU32(36 + dataSize);
  writeStr('WAVE');
  writeStr('fmt ');
  writeU32(16);
  writeU16(1); // PCM
  writeU16(1); // mono
  writeU32(sampleRate);
  writeU32(sampleRate * 2); // byte rate
  writeU16(2); // block align
  writeU16(16); // bits per sample
  writeStr('data');
  writeU32(dataSize);
  // payload is already zero-filled
  return new Blob([buffer], { type: 'audio/wav' });
}
