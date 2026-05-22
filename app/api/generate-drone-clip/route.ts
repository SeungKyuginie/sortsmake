import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import LumaAI from 'lumaai';

export const runtime = 'nodejs';
export const maxDuration = 60;

type RequestBody = {
  imageBase64: string;
  mediaType?: string;
  prompt?: string; // 사용자가 별도 프롬프트를 줄 경우
  cornerHint?: string; // 코너명 + 힌트 → 자동 프롬프트 생성용
};

// 마트 사진을 드론 항공샷으로 변환하기 위한 기본 프롬프트.
// 매번 비슷한 톤·움직임을 내기 위해 동일 템플릿 사용.
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

export async function POST(req: Request) {
  const lumaKey = process.env.LUMAAI_API_KEY;
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!lumaKey) {
    return NextResponse.json(
      { error: 'LUMAAI_API_KEY가 설정되지 않았습니다.' },
      { status: 500 },
    );
  }
  if (!blobToken) {
    return NextResponse.json(
      { error: 'BLOB_READ_WRITE_TOKEN이 설정되지 않았습니다.' },
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
  const ext =
    mediaType === 'image/png'
      ? 'png'
      : mediaType === 'image/webp'
        ? 'webp'
        : 'jpg';

  try {
    // 1) 이미지를 Vercel Blob에 업로드해 공개 URL 확보 (Luma는 URL만 받음)
    const blobName = `drone-input/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const blob = await put(blobName, imageBuffer, {
      access: 'public',
      contentType: mediaType,
      token: blobToken,
    });

    // 2) Luma Dream Machine API로 영상 생성 요청
    const client = new LumaAI({ authToken: lumaKey });
    const generation = await client.generations.create({
      prompt: buildPrompt(body.cornerHint, body.prompt),
      model: 'ray-2',
      resolution: '720p',
      duration: '5s',
      keyframes: {
        frame0: {
          type: 'image',
          url: blob.url,
        },
      },
    });

    return NextResponse.json({
      generationId: generation.id,
      blobUrl: blob.url, // 클라이언트가 나중에 정리 가능
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Luma API 호출 실패';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
