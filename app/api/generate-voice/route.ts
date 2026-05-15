import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type RequestBody = {
  text: string;
  voiceName?: string;
  speakingRate?: number;
  pitch?: number;
};

const ALLOWED_VOICES = new Set([
  'ko-KR-Wavenet-A',
  'ko-KR-Wavenet-B',
  'ko-KR-Wavenet-C',
  'ko-KR-Wavenet-D',
]);

export async function POST(req: Request) {
  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GOOGLE_TTS_API_KEY가 설정되지 않았습니다.' },
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
  // Google TTS 단일 요청 한도(5000자) 보호
  if (text.length > 4500) {
    return NextResponse.json(
      { error: '텍스트가 너무 깁니다 (최대 4500자).' },
      { status: 400 },
    );
  }

  const voiceName =
    body.voiceName && ALLOWED_VOICES.has(body.voiceName)
      ? body.voiceName
      : 'ko-KR-Wavenet-A';
  const speakingRate = Math.min(4, Math.max(0.25, body.speakingRate ?? 1.0));
  const pitch = Math.min(20, Math.max(-20, body.pitch ?? 0));

  try {
    const res = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: 'ko-KR', name: voiceName },
          audioConfig: {
            audioEncoding: 'MP3',
            speakingRate,
            pitch,
            sampleRateHertz: 24000,
          },
        }),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `Google TTS 오류 (${res.status}): ${errText}` },
        { status: 502 },
      );
    }

    const data = (await res.json()) as { audioContent?: string };
    if (!data.audioContent) {
      return NextResponse.json(
        { error: 'Google TTS 응답에 오디오가 없습니다.' },
        { status: 502 },
      );
    }

    const audio = Buffer.from(data.audioContent, 'base64');
    return new NextResponse(audio, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audio.byteLength),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Google TTS 호출 실패';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
