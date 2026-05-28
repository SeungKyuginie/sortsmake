import { NextResponse } from 'next/server';
import { getStorage, getBucketName } from '../_gcp';

export const runtime = 'nodejs';
export const maxDuration = 30;

type RequestBody = {
  // 사진 개수와 각 사진의 MIME 타입
  photos: { mediaType: string; ext?: string }[];
  // 음성 파일 (선택)
  audio?: { mediaType: string };
};

// 브라우저가 GCS에 직접 업로드하기 위한 서명된 PUT URL 발급.
// Vercel 함수 4.5MB 한도를 우회.
export async function POST(req: Request) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  if (!Array.isArray(body.photos) || body.photos.length === 0) {
    return NextResponse.json({ error: 'photos는 최소 1개 이상이어야 합니다.' }, { status: 400 });
  }

  try {
    const storage = getStorage();
    const bucket = storage.bucket(getBucketName());
    // 같은 렌더 잡의 파일들을 하나의 prefix로 묶음
    const renderId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15분

    const photoUploads = await Promise.all(
      body.photos.map(async (p, i) => {
        const ext = p.ext || extFromMediaType(p.mediaType) || 'jpg';
        const key = `renders/${renderId}/photo-${i}.${ext}`;
        const [uploadUrl] = await bucket.file(key).getSignedUrl({
          version: 'v4',
          action: 'write',
          expires: expiresAt,
          contentType: p.mediaType,
        });
        return { uploadUrl, gcsPath: `gs://${bucket.name}/${key}`, contentType: p.mediaType };
      }),
    );

    let audioUpload: {
      uploadUrl: string;
      gcsPath: string;
      contentType: string;
    } | null = null;
    if (body.audio) {
      const ext = extFromMediaType(body.audio.mediaType) || 'mp3';
      const key = `renders/${renderId}/audio.${ext}`;
      const [uploadUrl] = await bucket.file(key).getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: expiresAt,
        contentType: body.audio.mediaType,
      });
      audioUpload = {
        uploadUrl,
        gcsPath: `gs://${bucket.name}/${key}`,
        contentType: body.audio.mediaType,
      };
    }

    return NextResponse.json({
      renderId,
      photoUploads,
      audioUpload,
      outputKey: `renders/${renderId}/out.mp4`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '서명 URL 발급 실패';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

function extFromMediaType(type: string): string | undefined {
  if (type === 'image/jpeg' || type === 'image/jpg') return 'jpg';
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/gif') return 'gif';
  if (type === 'audio/mpeg' || type === 'audio/mp3') return 'mp3';
  if (type === 'audio/wav') return 'wav';
  if (type === 'video/mp4') return 'mp4';
  return undefined;
}
