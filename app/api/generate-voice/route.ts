import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Segment = {
  text: string;
  voiceName?: string;
};

type RequestBody = {
  // 다중/단일 모두 segments로 통일
  segments?: Segment[];
  // 단일 보이스 모드 호환 (legacy)
  text?: string;
  voiceName?: string;
  // 공통 설정
  speakingRate?: number;
  pitch?: number;
};

const ALLOWED_VOICES = new Set([
  'ko-KR-Wavenet-A',
  'ko-KR-Wavenet-B',
  'ko-KR-Wavenet-C',
  'ko-KR-Wavenet-D',
]);

async function synthesize(
  apiKey: string,
  text: string,
  voiceName: string,
  speakingRate: number,
  pitch: number,
): Promise<Buffer> {
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
    const err = await res.text();
    throw new Error(`Google TTS (${res.status}): ${err}`);
  }
  const data = (await res.json()) as { audioContent?: string };
  if (!data.audioContent) throw new Error('Google TTS 응답에 오디오가 없습니다.');
  return Buffer.from(data.audioContent, 'base64');
}

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

  // segments 우선, 없으면 단일 text를 1개 세그먼트로 처리
  let segments: Segment[] = (body.segments ?? []).filter(
    (s) => s && s.text?.trim(),
  );
  if (segments.length === 0 && body.text?.trim()) {
    segments = [{ text: body.text.trim(), voiceName: body.voiceName }];
  }
  if (segments.length === 0) {
    return NextResponse.json(
      { error: '변환할 텍스트가 비어 있습니다.' },
      { status: 400 },
    );
  }

  const totalLen = segments.reduce((sum, s) => sum + s.text.length, 0);
  if (totalLen > 4500) {
    return NextResponse.json(
      { error: '텍스트가 너무 깁니다 (전체 4500자).' },
      { status: 400 },
    );
  }

  const speakingRate = Math.min(4, Math.max(0.25, body.speakingRate ?? 1.0));
  const pitch = Math.min(20, Math.max(-20, body.pitch ?? 0));

  try {
    const audios: Buffer[] = [];
    for (const seg of segments) {
      const voice =
        seg.voiceName && ALLOWED_VOICES.has(seg.voiceName)
          ? seg.voiceName
          : 'ko-KR-Wavenet-A';
      const audio = await synthesize(
        apiKey,
        seg.text.trim(),
        voice,
        speakingRate,
        pitch,
      );
      audios.push(audio);
    }
    const combined = Buffer.concat(audios);
    return new NextResponse(combined, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(combined.byteLength),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Google TTS 호출 실패';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
