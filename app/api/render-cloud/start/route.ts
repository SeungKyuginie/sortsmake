import { NextResponse } from 'next/server';
import {
  getCloudRunIdToken,
  getCloudRunUrl,
  getServiceAccountKey,
  getBucketName,
} from '../_gcp';
import { signV4GetUrl } from '../_signing';

export const runtime = 'nodejs';
export const maxDuration = 300;

type Phrase = { text: string; start: number; end: number };

type RequestBody = {
  photoUrls: string[];
  photoWidths?: number[];
  photoHeights?: number[];
  audioUrl: string;
  bgmUrl?: string | null;
  itemDurations: number[];
  droneShots?: boolean[];
  frameStyle?: 'cover' | 'blur';
  panRatio?: number;
  resolution?: '1080p' | '720p';
  hookText?: string;
  hookStart?: number;
  hookEnd?: number;
  ctaText?: string;
  ctaStart?: number;
  ctaEnd?: number;
  phrases?: Phrase[];
  bgmVolume?: number;
  audioDurationSec: number;
  outputKey: string;
};

export async function POST(req: Request) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  if (!Array.isArray(body.photoUrls) || body.photoUrls.length === 0) {
    return NextResponse.json({ error: 'photoUrls 필수' }, { status: 400 });
  }
  if (!body.audioUrl) {
    return NextResponse.json({ error: 'audioUrl 필수' }, { status: 400 });
  }
  if (!body.outputKey) {
    return NextResponse.json({ error: 'outputKey 필수' }, { status: 400 });
  }

  try {
    const cloudRunUrl = getCloudRunUrl();
    const token = await getCloudRunIdToken(cloudRunUrl);

    const res = await fetch(`${cloudRunUrl}/render`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = { error: `Cloud Run 응답 파싱 실패: ${text.slice(0, 400)}` };
    }

    if (!res.ok) {
      const errMsg = typeof data.error === 'string' ? data.error : `Cloud Run 오류 (${res.status})`;
      return NextResponse.json({ error: errMsg }, { status: 502 });
    }

    // Cloud Run이 outputKey 경로로 업로드 완료.
    // 다운로드 URL을 Vercel에서 직접 서명해서 반환 (Cloud Run signBlob 의존 제거).
    const key = getServiceAccountKey();
    const bucket = getBucketName();
    const downloadUrl = signV4GetUrl({
      bucket,
      objectKey: body.outputKey,
      clientEmail: key.client_email,
      privateKey: key.private_key,
      expiresInSeconds: 60 * 60,
    });

    return NextResponse.json({
      ok: true,
      videoUrl: downloadUrl,
      elapsedMs: data.elapsedMs,
      renderId: data.renderId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Cloud Run 호출 실패';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
