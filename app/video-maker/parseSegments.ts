// 코너 텍스트를 카라오케 자막용 짧은 phrase로 분할.
// 숏츠 전문가 기준: 한 phrase는 6~12자, 한 화면에 한 호흡 길이만.
export function splitPhrases(text: string, targetMaxChars = 11): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // 1) 문장부호 + 줄바꿈으로 1차 청크
  const rough = trimmed
    .split(/(?<=[,.!?，．！？])\s*|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const out: string[] = [];
  for (const chunk of rough) {
    if (chunk.length <= targetMaxChars) {
      out.push(chunk);
      continue;
    }
    // 길면 공백 기준으로 누적해서 target 길이에 맞춰 자르기
    const words = chunk.split(/\s+/);
    let cur = '';
    for (const w of words) {
      const joined = cur ? `${cur} ${w}` : w;
      if (joined.length <= targetMaxChars) {
        cur = joined;
      } else {
        if (cur) out.push(cur);
        // 한 단어가 target보다 길면 그대로 push (예: "9,900원!")
        cur = w;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

// phrase 배열에 대해 각 phrase의 글자수에 비례해 [start, end] 시간을 할당.
// start/end는 offset(seconds) 기준 — 호출자가 절대 시간으로 환산.
export type PhraseTiming = { text: string; start: number; end: number };
export function distributeTimings(
  phrases: string[],
  duration: number,
  offset = 0,
): PhraseTiming[] {
  if (phrases.length === 0 || duration <= 0) return [];
  const weights = phrases.map((p) => Math.max(1, p.length));
  const sum = weights.reduce((a, b) => a + b, 0);
  let t = offset;
  return phrases.map((text, i) => {
    const dur = (weights[i] / sum) * duration;
    const start = t;
    t += dur;
    return { text, start, end: t };
  });
}
