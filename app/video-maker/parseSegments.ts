export type VoiceMap = Record<string, string>; // 'A' -> 'ko-KR-Wavenet-A'

export type SpeechSegment = {
  text: string;
  voiceName: string;
};

// "[A] 안녕하세요 [B] 반갑습니다 [A] 오늘은..."  같은 형식을 세그먼트 배열로 분리.
// 태그 앞 부분(태그 없이 시작하는 텍스트)은 defaultVoice 로 처리.
export function parseScriptSegments(
  script: string,
  voiceMap: VoiceMap,
  defaultVoice: string,
): SpeechSegment[] {
  const re = /\[([A-D])\]/gi;
  const segments: SpeechSegment[] = [];
  let lastIndex = 0;
  let currentVoice = defaultVoice;
  for (const m of script.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > lastIndex) {
      const text = script.slice(lastIndex, idx).trim();
      if (text) segments.push({ text, voiceName: currentVoice });
    }
    const tag = m[1].toUpperCase();
    currentVoice = voiceMap[tag] || defaultVoice;
    lastIndex = idx + m[0].length;
  }
  const tail = script.slice(lastIndex).trim();
  if (tail) segments.push({ text: tail, voiceName: currentVoice });

  // 태그가 하나도 없으면 전체를 단일 세그먼트로
  if (segments.length === 0) {
    const t = script.trim();
    if (t) segments.push({ text: t, voiceName: defaultVoice });
  }
  return segments;
}
