import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

type RequestBody = {
  imageBase64: string;
  mediaType?: string;
  prompt?: string;
  cornerHint?: string;
};

function buildPrompt(cornerHint?: string, override?: string): string {
  if (override?.trim()) return override.trim();
  const subject = cornerHint?.trim() || 'fresh products on a grocery store display';
  return (
    `Cinematic drone shot, slow aerial pull-back ascending above ${subject}. ` +
    `Smooth gimbal motion, no shake, wide angle. Bright clean lighting, ` +
    `vibrant colors, retail showcase. The camera glides slowly upward and back, ` +
    `revealing more of the scene. Photorealistic, 4K, professional cinematography.`
  );
}

// ImgBB에 이미지를 업로드해 공개 URL 확보. expiration 초 후 자동 삭제.
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
  const lumaKey = process.env.LUMAAI_API_KEY?.trim();
  const imgbbKey = process.env.IMGBB_API_KEY?.trim();
  if (!lumaKey) {
    return NextResponse.json(
      { error: 'LUMAAI_API_KEY가 설정되지 않았습니다.' },
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
    // 1) 이미지를 ImgBB에 업로드해 공개 URL 확보 (10분 후 자동 삭제)
    const imageUrl = await uploadToImgBB(imgbbKey, body.imageBase64, 600);

    // 2) Luma Dream Machine API 직접 호출 (SDK 우회로 정확한 에러 노출)
    const lumaRes = await fetch(
      'https://api.lumalabs.ai/dream-machine/v1/generations',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${lumaKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: buildPrompt(body.cornerHint, body.prompt),
          model: 'ray-2',
          resolution: '720p',
          duration: '5s',
          keyframes: {
            frame0: { type: 'image', url: imageUrl },
          },
        }),
      },
    );

    if (!lumaRes.ok) {
      const errText = await lumaRes.text();
      console.error('[Luma] non-ok', lumaRes.status, errText);
      // 키 디버그 힌트 — 앞 13자리/뒤 4자리/길이만 노출
      const keyHint =
        lumaKey.length > 20
          ? `${lumaKey.slice(0, 13)}...${lumaKey.slice(-4)} (len=${lumaKey.length})`
          : `(len=${lumaKey.length})`;
      return NextResponse.json(
        {
          error: `Luma API (${lumaRes.status}): ${errText.slice(0, 200)}`,
          keyHint,
        },
        { status: 502 },
      );
    }

    const generation = (await lumaRes.json()) as { id: string };

    return NextResponse.json({
      generationId: generation.id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Luma API 호출 실패';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
