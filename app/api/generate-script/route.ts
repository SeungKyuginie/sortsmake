import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type CornerInput = {
  name: string;
  description: string;
};

type RequestBody = {
  corners: CornerInput[];
  storeName?: string;
  durationSeconds?: number;
};

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
    (c) => c && (c.name?.trim() || c.description?.trim()),
  );
  if (corners.length === 0) {
    return NextResponse.json(
      { error: '최소 1개의 코너 정보가 필요합니다.' },
      { status: 400 },
    );
  }

  const duration = body.durationSeconds ?? 30;
  const storeName = body.storeName?.trim() || '저희 마트';

  const cornerLines = corners
    .map((c, i) => `${i + 1}. ${c.name || '(이름 없음)'} - ${c.description || ''}`)
    .join('\n');

  const perCornerSeconds = Math.max(3, Math.floor(duration / corners.length));

  const userPrompt = `당신은 마트 홍보 유튜브 숏츠 전문 카피라이터입니다.
아래 코너 정보로 ${duration}초짜리 한국어 나레이션 스크립트를 만들어 주세요.

[마트명] ${storeName}
[코너 목록]
${cornerLines}

요구사항:
- 전체 길이는 ${duration}초 분량(읽기 속도 기준 약 ${duration * 5}~${duration * 6}자)
- 코너 ${corners.length}개를 모두 다루되 각 코너당 약 ${perCornerSeconds}초
- 도입(2~3초) → 코너별 소개 → 마무리 콜투액션(2~3초) 구조
- 친근하고 활기찬 구어체, 과장된 감탄사는 자제
- 가격/특가 표현은 입력된 설명에 있을 때만 사용
- 문장은 짧고 명료하게, 한 문장은 25자 내외
- 결과는 나레이션 본문만 출력 (제목/머리말/마크다운/따옴표 없이 평문)`;

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system:
        '당신은 짧고 임팩트 있는 한국어 광고 카피를 잘 쓰는 베테랑 마트 홍보 작가입니다. 항상 평문으로만, 부가 설명 없이 나레이션만 출력합니다.',
      messages: [{ role: 'user', content: userPrompt }],
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
