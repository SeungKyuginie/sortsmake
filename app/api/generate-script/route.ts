import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

type MediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

type CornerInput = {
  name?: string;
  description?: string;
  imageBase64?: string;
  mediaType?: MediaType;
};

type RequestBody = {
  corners: CornerInput[];
  storeName?: string;
  durationSeconds?: number;
};

const ALLOWED_MEDIA: ReadonlySet<MediaType> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const HOOK_BUDGET_SECONDS = 3;
const CTA_BUDGET_SECONDS = 2;

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' },
      { status: 500 },
    );
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  const corners = (body.corners ?? []).filter(
    (c) => c && (c.imageBase64?.length || c.name?.trim() || c.description?.trim()),
  );
  if (corners.length === 0) {
    return NextResponse.json(
      { error: '최소 1개의 코너 정보(사진 또는 텍스트)가 필요합니다.' },
      { status: 400 },
    );
  }

  const duration = Math.max(15, Math.min(60, body.durationSeconds ?? 30));
  const storeName = body.storeName?.trim() || '저희 마트';
  const remaining = Math.max(
    8,
    duration - HOOK_BUDGET_SECONDS - CTA_BUDGET_SECONDS,
  );
  const perCornerSeconds = Math.max(3, Math.floor(remaining / corners.length));
  const perCornerChars = Math.round(perCornerSeconds * 7);

  const userBlocks: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = [];

  userBlocks.push({
    type: 'text',
    text:
      `${duration}초짜리 한국어 마트 홍보 숏츠 대본을 자연스럽게 작성해 주세요.\n\n` +
      `[매장] ${storeName}\n` +
      `[코너 수] ${corners.length}개\n` +
      `[시간 배분] hook 약 ${HOOK_BUDGET_SECONDS}초 + 코너당 약 ${perCornerSeconds}초 + cta 약 ${CTA_BUDGET_SECONDS}초\n\n` +
      `=== 핵심 원칙 ===\n` +
      `1. HOOK (첫 2~3초) — 시청자를 멈춰 세우는 한 마디.\n` +
      `   - 15~25자 정도. 너무 짧게 끊지 말고 자연스러운 문장으로.\n` +
      `   - **매번 다른 톤**으로 — 같은 패턴 반복 금지. 다음 중에서 매번 다르게 고르거나, 직접 창의적으로 작성:\n` +
      `     · 의외성/공감: "장 보러 갔다가 깜짝 놀랐어요", "이번주 ${storeName} 가격표 한번 보세요"\n` +
      `     · 상황 묘사: "오늘 새벽에 들어온 ${storeName} 신선식품, 직접 보고 왔습니다"\n` +
      `     · 정보 제공: "${storeName}에서 이번 주말 진행하는 행사 정리해드릴게요"\n` +
      `     · 자랑/추천: "단골들이 ${storeName} 자주 가는 진짜 이유"\n` +
      `     · 의문/대화체: "요즘 사과 한 봉지에 얼마인지 아세요?"\n` +
      `   - 절대 금지: "이 가격 진짜예요?", "놀라운 가격!", "와~", "어머", "안녕하세요 여러분~" 같은 클리셰.\n` +
      `2. SEGMENTS — 코너별 자연스러운 설명체.\n` +
      `   - 코너당 ${perCornerChars}~${Math.round(perCornerChars * 1.4)}자. 충분히 길게 써서 정보를 제대로 전달.\n` +
      `   - 한 코너에 자연스럽게 흐르는 1~2문장 (짧게 끊지 말 것).\n` +
      `   - 일상 한국어 톤. "이번주 사과 1.5kg에 9,900원으로 들어와 있어요" 같은 친구가 알려주는 듯한 말투.\n` +
      `   - **마트 광고 클리셰는 자제** — "시간특가", "타임세일", "조기품절 주의", "한정수량" 같은 자극적 단어는 꼭 필요할 때만, 한 영상에 1~2번 이내.\n` +
      `   - 가격/할인율은 사진이나 힌트에 명확히 보일 때만 정확히 인용. 없는 숫자 절대 지어내지 말 것.\n` +
      `   - 코너마다 다른 시작어/구조로 — "이번엔", "다음은", "그리고" 같은 단조로운 연결어 반복 금지.\n` +
      `3. CTA (마지막 2초) — 자연스러운 마무리.\n` +
      `   - 15~20자 정도. 단순 "지금 오세요"보다 구체적으로.\n` +
      `   - **매번 다른 형태**:\n` +
      `     · 시간 안내: "이번 행사 일요일 저녁 8시까지예요"\n` +
      `     · 위치 안내: "퇴근길에 ${storeName} 한 번 들러보세요"\n` +
      `     · 상품 강조: "특히 한우는 오늘 들어온 거니까 서두르세요"\n` +
      `     · 친근한 권유: "장보기 부담스러우셨다면 이번주가 기회예요"\n` +
      `4. 전체 톤 — 친근한 단골 매장 직원이 알려주는 느낌. 너무 광고 같지 않게.\n` +
      `5. 다양성 — 같은 단어/표현/문장구조를 영상 안에서 반복 사용 금지.\n` +
      `6. **구두점 규칙 (필수)** — 쉼표(,)는 절대 사용하지 마세요. 문장 구분은 모두 마침표(.)로 하세요. ` +
      `숫자/가격도 쉼표 없이 붙여 쓰세요. 예: "9900원" (O), "9,900원" (X). "1500원 사과 한 봉지" (O).\n` +
      `7. TTS 친화 — 마침표 정확하게. 자연스러운 끊김.\n\n` +
      `=== 출력 형식 ===\n` +
      `반드시 다음 JSON 한 덩어리만 출력. 코드펜스(\`\`\`)나 부가 설명 절대 금지.\n` +
      `{\n` +
      `  "hook": "...",\n` +
      `  "segments": [\n` +
      `    {"cornerIndex": 1, "text": "..."},\n` +
      `    {"cornerIndex": 2, "text": "..."}\n` +
      `  ],\n` +
      `  "cta": "..."\n` +
      `}\n\n` +
      `아래에 코너별 사진/힌트를 ${corners.length}개 순서대로 줍니다. 사진을 직접 분석해 어떤 상품인지, 가격표/POP가 있다면 어떤 내용인지 정확히 파악하세요. 텍스트 힌트가 우선합니다.`,
  });

  for (let i = 0; i < corners.length; i++) {
    const c = corners[i];
    const hint =
      [c.name?.trim(), c.description?.trim()].filter(Boolean).join(' / ') ||
      '(텍스트 힌트 없음)';
    userBlocks.push({
      type: 'text',
      text: `[코너 ${i + 1}] 힌트: ${hint}`,
    });
    if (c.imageBase64 && c.mediaType && ALLOWED_MEDIA.has(c.mediaType)) {
      userBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: c.mediaType,
          data: c.imageBase64,
        },
      });
    }
  }

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system:
        '당신은 한국 마트 단골 직원의 입장에서 친근하게 말하는 카피라이터입니다. ' +
        '광고처럼 자극적이지 않고, 친구가 옆에서 알려주는 듯한 자연스러운 일상 한국어로 씁니다. ' +
        '"시간특가", "조기품절", "놀라운 가격" 같은 광고 클리셰를 절대 남발하지 않고, 같은 영상 안에서 같은 표현이나 문장 구조를 반복하지 않습니다. ' +
        '사진을 시각적으로 분석해 상품과 가격을 정확히 짚어내며, 없는 숫자는 절대 지어내지 않습니다. ' +
        '결과는 항상 유효한 JSON 한 덩어리로만 출력하며, 코드펜스나 부가 설명을 절대 붙이지 않습니다.',
      messages: [{ role: 'user', content: userBlocks }],
    });

    const raw = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    if (!raw) {
      return NextResponse.json(
        { error: '스크립트 생성 결과가 비어 있습니다.' },
        { status: 502 },
      );
    }

    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) {
      return NextResponse.json(
        { error: 'JSON 본체를 찾을 수 없습니다.', raw: raw.slice(0, 400) },
        { status: 502 },
      );
    }

    type ParsedSegment = {
      cornerIndex?: number;
      text?: string;
    };
    type Parsed = {
      hook?: string;
      cta?: string;
      segments?: ParsedSegment[];
    };

    let parsed: Parsed;
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1)) as Parsed;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'JSON 파싱 실패';
      return NextResponse.json(
        { error: msg, raw: raw.slice(0, 400) },
        { status: 502 },
      );
    }

    // 쉼표 후처리:
    // 1) 숫자 사이 쉼표 제거 (가격 등): "9,900원" → "9900원"
    // 2) 나머지 쉼표 → 마침표 + 공백
    // 3) 중복 마침표/공백 정리
    const sanitize = (s: string): string => {
      if (!s) return s;
      let t = s;
      let prev: string;
      do {
        prev = t;
        t = t.replace(/(\d),(\d)/g, '$1$2');
      } while (prev !== t);
      t = t.replace(/\s*,\s*/g, '. ');
      t = t.replace(/\.\s*\./g, '.');
      t = t.replace(/\s{2,}/g, ' ');
      return t.trim();
    };

    const hook = typeof parsed.hook === 'string' ? sanitize(parsed.hook) : '';
    const cta = typeof parsed.cta === 'string' ? sanitize(parsed.cta) : '';
    const segments = Array.isArray(parsed.segments)
      ? parsed.segments
          .map((s, i) => ({
            cornerIndex:
              typeof s?.cornerIndex === 'number' ? s.cornerIndex : i + 1,
            text: typeof s?.text === 'string' ? sanitize(s.text) : '',
          }))
          .filter((s) => s.text)
      : [];

    if (!hook || segments.length === 0) {
      return NextResponse.json(
        {
          error: 'hook 또는 segments가 비어 있습니다.',
          raw: raw.slice(0, 500),
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ hook, segments, cta });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Claude API 호출 실패';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
