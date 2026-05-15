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

// "안녕하세요 [#1] 사과 코너 [#2] 정육 코너 [#3] 안녕히 가세요" 같은 스크립트를
// expectedCount 개의 문자열 배열로 분리. [#1] 앞 텍스트는 첫 코너에 붙이고
// 누락된 마커가 있으면 빈 문자열 대신 짧은 멘트("...")를 채워 음성 길이를 확보.
export function parseCornerSegments(
  script: string,
  expectedCount: number,
): string[] {
  if (expectedCount <= 0) return [];
  if (expectedCount === 1) return [script.trim()];

  const re = /\[#(\d+)\]/g;
  const matches = [...script.matchAll(re)];

  if (matches.length === 0) {
    // Claude가 마커를 안 박았거나 사용자가 다 지운 경우: 문장 단위로 균등 분배.
    return distributeBySentences(script, expectedCount);
  }

  const result: string[] = Array(expectedCount).fill('');
  const preText = script.slice(0, matches[0].index ?? 0).trim();

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const num = parseInt(m[1], 10);
    const idx = num - 1;
    if (idx < 0 || idx >= expectedCount) continue;

    const start = (m.index ?? 0) + m[0].length;
    const end =
      i + 1 < matches.length ? (matches[i + 1].index ?? script.length) : script.length;
    let text = script.slice(start, end).trim();
    if (i === 0 && preText) {
      text = `${preText} ${text}`.trim();
    }
    result[idx] = text;
  }

  // 마커가 누락된 코너는 무음 대신 아주 짧은 멘트로 채워 슬라이드 길이 확보
  for (let i = 0; i < result.length; i++) {
    if (!result[i].trim()) result[i] = '...';
  }
  return result;
}

function distributeBySentences(script: string, n: number): string[] {
  const sentences = script
    .split(/(?<=[.!?。!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length === 0) return Array(n).fill(script.trim() || '...');
  const result: string[] = [];
  const per = Math.max(1, Math.ceil(sentences.length / n));
  for (let i = 0; i < n; i++) {
    const slice = sentences.slice(i * per, (i + 1) * per).join(' ');
    result.push(slice || '...');
  }
  return result;
}
