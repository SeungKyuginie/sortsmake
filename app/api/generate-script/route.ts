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
  const perCornerSeconds = Math.max(2, Math.floor(remaining / corners.length));
  const perCornerChars = Math.round(perCornerSeconds * 5.5);

  const userBlocks: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = [];

  userBlocks.push({
    type: 'text',
    text:
      `유튜브 숏츠 전문가 기준으로 ${duration}초짜리 한국어 마트 홍보 숏츠 대본을 만들어주세요.\n\n` +
      `[매장] ${storeName}\n` +
      `[코너 수] ${corners.length}개\n` +
      `[시간 배분] hook 약 ${HOOK_BUDGET_SECONDS}초 + 코너당 약 ${perCornerSeconds}초 + cta 약 ${CTA_BUDGET_SECONDS}초\n\n` +
      `=== 숏츠 전문가 원칙 (반드시 적용) ===\n` +
      `1. HOOK — 첫 3초가 시청 유지율 90%를 결정합니다.\n` +
      `   - 12자 이내. 호기심·문제 제기·충격 숫자·반전 중 하나로 시작.\n` +
      `   - 예시 패턴: "이거 모르면 손해", "이번주 미친 가격", "사과 1.5kg에 9,900원?", "3초만 보고 가세요"\n` +
      `   - "안녕하세요" 같은 평범한 인사는 절대 금지.\n` +
      `2. SEGMENTS — 코너별 핵심 한 가지.\n` +
      `   - 한 코너 = 한 메시지. 군더더기 없이 짧은 문장 2~3개.\n` +
      `   - 코너당 약 ${perCornerChars}자.\n` +
      `   - 가격/할인율은 사진이나 힌트에 명확히 보일 때만 정확히 인용 (없는 숫자 절대 지어내지 말 것).\n` +
      `   - highlight 필드: 그 코너에서 화면 강조할 단어/숫자 1개 (예: "9,900원", "30%", "1+1"). 없으면 빈 문자열.\n` +
      `3. CTA — 마지막 콜투액션.\n` +
      `   - 12자 이내. 행동 동사로 끝내기.\n` +
      `   - 예시: "지금 ${storeName}으로!", "이번주 일요일까지", "오늘만 특가!"\n` +
      `4. 전체 톤 — 친근하고 빠른 구어체. 한 문장 15자 내외. 과장 감탄사("와~", "어머") 자제.\n` +
      `5. 무음 금지 — TTS가 자연스럽게 읽도록 마침표/쉼표 정확히.\n\n` +
      `=== 출력 형식 ===\n` +
      `반드시 다음 JSON 한 덩어리만 출력. 코드펜스(\`\`\`)나 부가 설명 절대 금지.\n` +
      `{\n` +
      `  "hook": "...",\n` +
      `  "segments": [\n` +
      `    {"cornerIndex": 1, "text": "...", "highlight": "9,900원"},\n` +
      `    {"cornerIndex": 2, "text": "...", "highlight": "30% 할인"}\n` +
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
        '당신은 유튜브 숏츠 전문 카피라이터입니다. 1초당 retention을 끌어올리는 후킹·페이싱·CTA 패턴을 정확히 알고, 사진을 시각적으로 분석해 상품과 가격을 정확히 짚어냅니다. 결과는 항상 유효한 JSON 한 덩어리로만 출력하며, 코드펜스나 부가 설명을 절대 붙이지 않습니다.',
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
      highlight?: string;
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

    const hook = typeof parsed.hook === 'string' ? parsed.hook.trim() : '';
    const cta = typeof parsed.cta === 'string' ? parsed.cta.trim() : '';
    const segments = Array.isArray(parsed.segments)
      ? parsed.segments
          .map((s, i) => ({
            cornerIndex:
              typeof s?.cornerIndex === 'number' ? s.cornerIndex : i + 1,
            text: typeof s?.text === 'string' ? s.text.trim() : '',
            highlight:
              typeof s?.highlight === 'string' && s.highlight.trim()
                ? s.highlight.trim()
                : undefined,
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
