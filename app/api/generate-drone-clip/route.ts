import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

type RequestBody = {
  imageBase64: string;
  mediaType?: string; // 'image/jpeg' | 'image/png' | ...
};

// Stable Video Diffusion (img2vid-xt) — 입력 이미지에서 약 2~4초 분량 영상 생성.
const HF_MODEL =
  'stabilityai/stable-video-diffusion-img2vid-xt';

export async function POST(req: Request) {
  const token = process.env.HUGGINGFACE_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: 'HUGGINGFACE_TOKEN이 설정되지 않았습니다.' },
      { status: 500 },
    );
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  if (!body.imageBase64) {
    return NextResponse.json(
      { error: '이미지 데이터가 없습니다.' },
      { status: 400 },
    );
  }

  const imageBuffer = Buffer.from(body.imageBase64, 'base64');
  const mediaType = body.mediaType ?? 'image/jpeg';

  try {
    const res = await fetch(
      `https://api-inference.huggingface.co/models/${HF_MODEL}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': mediaType,
          'x-wait-for-model': 'true',
        },
        body: new Uint8Array(imageBuffer),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      // 503 = 모델 로딩 중 (cold start). 클라이언트가 재시도할 수 있도록 따로 신호.
      if (res.status === 503) {
        return NextResponse.json(
          {
            error: '모델 로딩 중입니다. 30초 후 다시 시도해 주세요.',
            retryable: true,
          },
          { status: 503 },
        );
      }
      console.error('[HF SVD] non-ok', res.status, errText);
      return NextResponse.json(
        { error: `HuggingFace (${res.status}): ${errText.slice(0, 400)}` },
        { status: 502 },
      );
    }

    const contentType = res.headers.get('content-type') ?? 'video/mp4';
    const video = await res.arrayBuffer();
    return new NextResponse(video, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(video.byteLength),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'HuggingFace 호출 실패';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
