import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

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
  speakerTags?: string[]; // ['A','B'] 같이 주면 다중 화자로 작성
};

const ALLOWED_MEDIA: ReadonlySet<MediaType> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export const maxDuration = 60;

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
    (c) =>
      c &&
      (c.imageBase64?.length || c.name?.trim() || c.description?.trim()),
  );
  if (corners.length === 0) {
    return NextResponse.json(
      { error: '최소 1개의 코너 정보(사진 또는 텍스트)가 필요합니다.' },
      { status: 400 },
    );
  }

  const duration = body.durationSeconds ?? 30;
  const storeName = body.storeName?.trim() || '저희 마트';
  const perCornerSeconds = Math.max(3, Math.floor(duration / corners.length));
  const speakerTags = (body.speakerTags ?? [])
    .map((t) => t.trim().toUpperCase())
    .filter((t) => /^[A-D]$/.test(t));
  const isMultiSpeaker = speakerTags.length >= 2;

  const userBlocks: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = [];

  userBlocks.push({
    type: 'text',
    text:
      `${duration}초 분량의 한국어 마트 홍보 숏츠 나레이션을 작성해 주세요.\n\n` +
      `[마트명] ${storeName}\n` +
      `[코너 수] ${corners.length}개 (코너당 약 ${perCornerSeconds}초)\n` +
      `[전체 길이 가이드] 약 ${duration * 5}~${duration * 6}자\n\n` +
      `아래에 코너별로 사진과 (있다면) 텍스트 힌트를 순서대로 제공합니다.\n` +
      `각 사진을 시각적으로 직접 분석해 어떤 상품이 보이는지, 가격표나 POP가 있으면 어떤 내용인지, 분위기가 어떤지 파악해서 자연스럽게 반영하세요. 텍스트 힌트가 있으면 우선합니다.`,
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

  const multiSpeakerRule = isMultiSpeaker
    ? `\n- 다중 화자 모드: 화자 ${speakerTags.join(', ')} 가 번갈아 말합니다.\n` +
      `  각 발화 앞에 반드시 [${speakerTags[0]}], [${speakerTags[1]}] 같은 태그를 붙이세요. 예: "[A] 안녕하세요 [B] 오늘은 특가의 날!".\n` +
      `  자연스럽게 핑퐁(질문/대답, 소개/반응) 형태로 구성하되, 한 화자가 너무 길게 독점하지 않게 분배하세요.`
    : '';

  userBlocks.push({
    type: 'text',
    text:
      `규칙:\n` +
      `- 도입(2~3초) → 코너별 소개 → 마무리 콜투액션(2~3초) 구조\n` +
      `- 친근하고 활기찬 구어체, 과장된 감탄사는 자제\n` +
      `- 한 문장 25자 내외, 전체 ${duration * 5}~${duration * 6}자\n` +
      `- 가격/특가 표현은 사진이나 힌트에 명확히 보일 때만 인용 (없는 가격을 지어내지 말 것)\n` +
      `- 결과는 나레이션 본문만 평문으로 출력 (제목/머리말/마크다운/따옴표 금지)` +
      multiSpeakerRule,
  });

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system:
        '당신은 마트 홍보 영상 카피를 전문으로 쓰는 한국어 작가이자, 사진 속 상품/가격/분위기를 정확히 읽어내는 비주얼 분석가입니다. 결과는 항상 평문 나레이션만, 부가 설명 없이 출력합니다.',
      messages: [{ role: 'user', content: userBlocks }],
    });

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    if (!text) {
      return NextResponse.json(
        { error: '스크립트 생성 결과가 비어 있습니다.' },
        { status: 502 },
      );
    }

    return NextResponse.json({ script: text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Claude API 호출 실패';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
