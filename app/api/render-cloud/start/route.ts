import { NextResponse } from 'next/server';
import { getCloudRunIdToken, getCloudRunUrl } from '../_gcp';

export const runtime = 'nodejs';
// Cloud Run 렌더링이 길어질 수 있으므로 충분히 길게 (Vercel Pro 한도)
export const maxDuration = 300;

type RequestBody = {
  photoUrls: string[]; // gs:// 경로들
  audioUrl: string; // gs://
  itemDurations: number[];
  panRatio?: number;
  outputKey: string; // renders/<id>/out.mp4
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
  if (!Array.isArray(body.itemDurations) || body.itemDurations.length !== body.photoUrls.length) {
    return NextResponse.json(
      { error: 'itemDurations 길이가 photoUrls와 같아야 합니다.' },
      { status: 400 },
    );
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
      body: JSON.stringify({
        photoUrls: body.photoUrls,
        audioUrl: body.audioUrl,
        itemDurations: body.itemDurations,
        panRatio: body.panRatio ?? 0.6,
        outputKey: body.outputKey,
      }),
    });

    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: `Cloud Run 응답 파싱 실패: ${text.slice(0, 400)}` };
    }

    if (!res.ok) {
      const msg =
        (typeof data === 'object' && data && 'error' in data && typeof (data as { error?: unknown }).error === 'string'
          ? (data as { error: string }).error
          : `Cloud Run 오류 (${res.status})`) as string;
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    // 정상 응답: { ok, videoUrl, elapsedMs, renderId }
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Cloud Run 호출 실패';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
