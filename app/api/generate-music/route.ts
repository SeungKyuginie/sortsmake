import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

type RequestBody = {
  prompt: string;
  lengthMs?: number;
  forceInstrumental?: boolean;
};

export async function POST(req: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ELEVENLABS_API_KEY가 설정되지 않았습니다.' },
      { status: 500 },
    );
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  const prompt = body.prompt?.trim();
  if (!prompt) {
    return NextResponse.json(
      { error: '음악 프롬프트가 비어 있습니다.' },
      { status: 400 },
    );
  }

  // ElevenLabs accepts 3,000 ~ 600,000 ms
  const lengthMs = Math.min(600_000, Math.max(3_000, body.lengthMs ?? 30_000));
  const forceInstrumental = body.forceInstrumental ?? true;

  try {
    const res = await fetch('https://api.elevenlabs.io/v1/music', {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        prompt,
        music_length_ms: lengthMs,
        model_id: 'music_v1',
        force_instrumental: forceInstrumental,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      // 서버 콘솔에도 그대로 찍어 두면 디버깅이 쉬워집니다.
      console.error('[ElevenLabs Music] non-ok response', res.status, errText);
      return NextResponse.json(
        { error: `ElevenLabs Music 오류 (${res.status}): ${errText}` },
        { status: 502 },
      );
    }

    const audio = await res.arrayBuffer();
    return new NextResponse(audio, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audio.byteLength),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ElevenLabs Music 호출 실패';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
