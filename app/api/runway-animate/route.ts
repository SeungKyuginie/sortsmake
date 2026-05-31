import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin';

export const runtime = 'nodejs';
export const maxDuration = 300; // 최대 5분

type RequestBody = {
  imageBase64: string;
  mediaType: string;
  prompt?: string;
};

export async function POST(req: Request) {
  // 1) 인증
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  if (!isAdminEmail(user.email)) {
    return NextResponse.json(
      { error: '관리자 전용 기능입니다.' },
      { status: 403 },
    );
  }

  const apiKey = process.env.RUNWAY_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'RUNWAY_API_KEY 환경변수 미설정' },
      { status: 500 },
    );
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 });
  }
  if (!body.imageBase64 || !body.mediaType) {
    return NextResponse.json(
      { error: 'imageBase64 + mediaType 필수' },
      { status: 400 },
    );
  }

  try {
    // 2) Runway에 작업 제출
    const submitRes = await fetch(
      'https://api.dev.runwayml.com/v1/image_to_video',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-Runway-Version': '2024-11-06',
        },
        body: JSON.stringify({
          model: 'gen4_turbo',
          promptImage: `data:${body.mediaType};base64,${body.imageBase64}`,
          promptText:
            body.prompt ||
            'Slow cinematic camera push-in, soft natural lighting, professional commercial style',
          duration: 5,
          ratio: '720:1280',
        }),
      },
    );

    if (!submitRes.ok) {
      const errText = await submitRes.text().catch(() => '');
      return NextResponse.json(
        {
          error: `Runway 제출 실패 (${submitRes.status}): ${errText.slice(0, 400)}`,
        },
        { status: 502 },
      );
    }
    const submitData = (await submitRes.json()) as { id?: string };
    const taskId = submitData.id;
    if (!taskId) {
      return NextResponse.json(
        { error: 'Runway task ID 받지 못함' },
        { status: 502 },
      );
    }

    // 3) 폴링 (최대 5분, 5초 간격)
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const taskRes = await fetch(
        `https://api.dev.runwayml.com/v1/tasks/${taskId}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'X-Runway-Version': '2024-11-06',
          },
        },
      );
      if (!taskRes.ok) continue;
      const taskData = (await taskRes.json()) as {
        status?: string;
        output?: string[];
        failure?: string;
      };
      if (taskData.status === 'SUCCEEDED') {
        const videoUrl = taskData.output?.[0];
        if (!videoUrl) {
          return NextResponse.json(
            { error: 'Runway 응답에 영상 URL 없음' },
            { status: 502 },
          );
        }
        return NextResponse.json({ videoUrl, taskId });
      }
      if (taskData.status === 'FAILED' || taskData.status === 'CANCELED') {
        return NextResponse.json(
          {
            error: `Runway 처리 실패: ${taskData.failure || taskData.status}`,
          },
          { status: 502 },
        );
      }
      // PENDING / RUNNING — 계속 폴링
    }
    return NextResponse.json(
      { error: 'Runway 타임아웃 (5분 초과)' },
      { status: 504 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
