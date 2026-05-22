import { NextResponse } from 'next/server';
import LumaAI from 'lumaai';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(req: Request) {
  const lumaKey = process.env.LUMAAI_API_KEY;
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
    const client = new LumaAI({ authToken: lumaKey });
    const gen = await client.generations.get(id);

    // state: queued | dreaming | completed | failed
    const state = gen.state ?? 'queued';
    const videoUrl = gen.assets?.video ?? null;
    const failureReason = gen.failure_reason ?? null;

    return NextResponse.json({
      id: gen.id,
      state,
      videoUrl,
      failureReason,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Luma 상태 조회 실패';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
