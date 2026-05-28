import { NextResponse } from 'next/server';
import { getServiceAccountKey, getBucketName } from '../_gcp';
import { signV4PutUrl } from '../_signing';

export const runtime = 'nodejs';
export const maxDuration = 30;

type RequestBody = {
  photos: { mediaType: string; ext?: string }[];
  audio?: { mediaType: string };
  bgm?: { mediaType: string };
};

// 브라우저가 GCS에 직접 업로드하기 위한 서명된 PUT URL 발급.
// @google-cloud/storage의 IAM signBlob 의존성을 피하기 위해 private_key로 직접 서명.
export async function POST(req: Request) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  if (!Array.isArray(body.photos) || body.photos.length === 0) {
    return NextResponse.json(
      { error: 'photos는 최소 1개 이상이어야 합니다.' },
      { status: 400 },
    );
  }

  try {
    const key = getServiceAccountKey();
    const bucket = getBucketName();
    const renderId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const expiresSec = 15 * 60; // 15분

    const photoUploads = body.photos.map((p, i) => {
      const ext = p.ext || extFromMediaType(p.mediaType) || 'jpg';
      const objectKey = `renders/${renderId}/photo-${i}.${ext}`;
      const uploadUrl = signV4PutUrl({
        bucket,
        objectKey,
        clientEmail: key.client_email,
        privateKey: key.private_key,
        expiresInSeconds: expiresSec,
        contentType: p.mediaType,
      });
      return {
        uploadUrl,
        gcsPath: `gs://${bucket}/${objectKey}`,
        contentType: p.mediaType,
      };
    });

    let audioUpload: {
      uploadUrl: string;
      gcsPath: string;
      contentType: string;
    } | null = null;
    if (body.audio) {
      const ext = extFromMediaType(body.audio.mediaType) || 'mp3';
      const objectKey = `renders/${renderId}/audio.${ext}`;
      const uploadUrl = signV4PutUrl({
        bucket,
        objectKey,
        clientEmail: key.client_email,
        privateKey: key.private_key,
        expiresInSeconds: expiresSec,
        contentType: body.audio.mediaType,
      });
      audioUpload = {
        uploadUrl,
        gcsPath: `gs://${bucket}/${objectKey}`,
        contentType: body.audio.mediaType,
      };
    }

    let bgmUpload: {
      uploadUrl: string;
      gcsPath: string;
      contentType: string;
    } | null = null;
    if (body.bgm) {
      const ext = extFromMediaType(body.bgm.mediaType) || 'mp3';
      const objectKey = `renders/${renderId}/bgm.${ext}`;
      const uploadUrl = signV4PutUrl({
        bucket,
        objectKey,
        clientEmail: key.client_email,
        privateKey: key.private_key,
        expiresInSeconds: expiresSec,
        contentType: body.bgm.mediaType,
      });
      bgmUpload = {
        uploadUrl,
        gcsPath: `gs://${bucket}/${objectKey}`,
        contentType: body.bgm.mediaType,
      };
    }

    return NextResponse.json({
      renderId,
      photoUploads,
      audioUpload,
      bgmUpload,
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
