import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type RequestBody = {
  text: string;
  speaker?: string;
  speed?: number;
  volume?: number;
  pitch?: number;
  emotion?: number;
  format?: 'mp3' | 'wav';
};

export async function POST(req: Request) {
  const clientId = process.env.CLOVA_CLIENT_ID;
  const clientSecret = process.env.CLOVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'CLOVA_CLIENT_ID / CLOVA_CLIENT_SECRET가 설정되지 않았습니다.' },
      { status: 500 },
    );
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: '변환할 텍스트가 비어 있습니다.' }, { status: 400 });
  }
  // CLOVA Voice Premium API 최대 길이 보호
  if (text.length > 2000) {
    return NextResponse.json(
      { error: '텍스트가 너무 깁니다 (최대 2000자).' },
      { status: 400 },
    );
  }

  const params = new URLSearchParams({
    speaker: body.speaker ?? 'nara',
    speed: String(body.speed ?? 0),
    volume: String(body.volume ?? 0),
    pitch: String(body.pitch ?? 0),
    emotion: String(body.emotion ?? 0),
    format: body.format ?? 'mp3',
    text,
  });

  try {
    const res = await fetch(
      'https://naveropenapi.apigw.ntruss.com/tts-premium/v1/tts',
      {
        method: 'POST',
        headers: {
          'X-NCP-APIGW-API-KEY-ID': clientId,
          'X-NCP-APIGW-API-KEY': clientSecret,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `CLOVA Voice 오류 (${res.status}): ${errText}` },
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
    const msg = err instanceof Error ? err.message : 'CLOVA Voice 호출 실패';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
