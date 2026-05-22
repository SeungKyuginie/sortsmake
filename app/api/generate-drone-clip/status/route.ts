import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(req: Request) {
  const lumaKey = process.env.LUMAAI_API_KEY?.trim();
  if (!lumaKey) {
    return NextResponse.json(
      { error: 'LUMAAI_API_KEY가 설정되지 않았습니다.' },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json(
      { error: 'generation id 가 필요합니다.' },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(
      `https://api.lumalabs.ai/dream-machine/v1/generations/${encodeURIComponent(id)}`,
      {
        headers: {
          Authorization: `Bearer ${lumaKey}`,
        },
      },
    );
    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `Luma API (${res.status}): ${errText.slice(0, 200)}` },
        { status: 502 },
      );
    }

    const gen = (await res.json()) as {
      id: string;
      state?: string;
      assets?: { video?: string };
      failure_reason?: string;
    };

    return NextResponse.json({
      id: gen.id,
      state: gen.state ?? 'queued',
      videoUrl: gen.assets?.video ?? null,
      failureReason: gen.failure_reason ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Luma 상태 조회 실패';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
