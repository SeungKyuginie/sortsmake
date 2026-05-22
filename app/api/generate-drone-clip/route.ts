import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

type RequestBody = {
  imageBase64: string;
  mediaType?: string;
  prompt?: string;
  cornerHint?: string;
};

// Replicate에서 사용할 image-to-video 모델.
// minimax/video-01: 이미지 + 프롬프트 → 6초 비디오, $0.30/clip, 안정적
const REPLICATE_MODEL = 'minimax/video-01';

function buildPrompt(cornerHint?: string, override?: string): string {
  if (override?.trim()) return override.trim();
  const subject = cornerHint?.trim() || 'fresh products on a grocery store display';
  return (
    `Cinematic aerial drone shot, slow pull-back ascending above ${subject}. ` +
    `Smooth gimbal motion, no shake, wide angle. Bright clean lighting, vibrant colors.`
  );
}

async function uploadToImgBB(
  apiKey: string,
  base64: string,
  expirationSec = 600,
): Promise<string> {
  const form = new URLSearchParams();
  form.append('image', base64);

  const res = await fetch(
    `https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}&expiration=${expirationSec}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ImgBB 업로드 실패 (${res.status}): ${err.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    success?: boolean;
    data?: { url?: string; display_url?: string };
    error?: { message?: string };
  };
  const url = data?.data?.url || data?.data?.display_url;
  if (!data.success || !url) {
    throw new Error(data.error?.message || 'ImgBB 응답에 URL이 없습니다.');
  }
  return url;
}

export async function POST(req: Request) {
  const replicateToken = process.env.REPLICATE_API_TOKEN?.trim();
  const imgbbKey = process.env.IMGBB_API_KEY?.trim();
  if (!replicateToken) {
    return NextResponse.json(
      { error: 'REPLICATE_API_TOKEN이 설정되지 않았습니다.' },
      { status: 500 },
    );
  }
  if (!imgbbKey) {
    return NextResponse.json(
      { error: 'IMGBB_API_KEY가 설정되지 않았습니다.' },
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

  try {
    // 1) 이미지 → ImgBB 공개 URL
    const imageUrl = await uploadToImgBB(imgbbKey, body.imageBase64, 600);

    // 2) Replicate API 호출
    const res = await fetch(
      `https://api.replicate.com/v1/models/${REPLICATE_MODEL}/predictions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${replicateToken}`,
          'Content-Type': 'application/json',
          Prefer: 'wait=0', // async — 즉시 prediction id 반환
        },
        body: JSON.stringify({
          input: {
            prompt: buildPrompt(body.cornerHint, body.prompt),
            first_frame_image: imageUrl,
          },
        }),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error('[Replicate] non-ok', res.status, errText);
      return NextResponse.json(
        { error: `Replicate API (${res.status}): ${errText.slice(0, 300)}` },
        { status: 502 },
      );
    }

    const prediction = (await res.json()) as {
      id: string;
      status: string;
      urls?: { get?: string };
    };

    return NextResponse.json({
      generationId: prediction.id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Replicate API 호출 실패';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
