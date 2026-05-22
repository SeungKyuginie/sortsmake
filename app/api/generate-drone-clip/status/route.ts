import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(req: Request) {
  const replicateToken = process.env.REPLICATE_API_TOKEN?.trim();
  if (!replicateToken) {
    return NextResponse.json(
      { error: 'REPLICATE_API_TOKEN이 설정되지 않았습니다.' },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json(
      { error: 'prediction id 가 필요합니다.' },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(
      `https://api.replicate.com/v1/predictions/${encodeURIComponent(id)}`,
      {
        headers: {
          Authorization: `Token ${replicateToken}`,
        },
      },
    );
    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `Replicate API (${res.status}): ${errText.slice(0, 200)}` },
        { status: 502 },
      );
    }

    const pred = (await res.json()) as {
      id: string;
      status: string; // starting | processing | succeeded | failed | canceled
      output?: string | string[] | null;
      error?: string | null;
    };

    // Replicate status → Luma-style state로 매핑 (클라이언트 코드 호환)
    const stateMap: Record<string, string> = {
      starting: 'queued',
      processing: 'dreaming',
      succeeded: 'completed',
      failed: 'failed',
      canceled: 'failed',
    };
    const state = stateMap[pred.status] ?? 'queued';

    // 출력은 string 또는 string[] 일 수 있음 — 첫 번째 URL 사용
    const output = pred.output;
    const videoUrl = Array.isArray(output) ? output[0] : output ?? null;

    return NextResponse.json({
      id: pred.id,
      state,
      videoUrl,
      failureReason: pred.error ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Replicate 상태 조회 실패';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
