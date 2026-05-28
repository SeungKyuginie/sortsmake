import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY 환경 변수가 설정되지 않았습니다.' },
      { status: 500 },
    );
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
  );
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { error: `ListModels 실패 (${res.status})`, detail: text.slice(0, 1000) },
      { status: 502 },
    );
  }

  const data = (await res.json()) as {
    models?: { name?: string; supportedGenerationMethods?: string[] }[];
  };

  // 이미지 출력 지원하는 모델만 필터 (이름에 image 포함하거나 generateContent 지원)
  const imageModels = (data.models ?? [])
    .filter(
      (m) =>
        m.name?.toLowerCase().includes('image') ||
        m.name?.toLowerCase().includes('flash'),
    )
    .map((m) => ({
      name: m.name,
      methods: m.supportedGenerationMethods,
    }));

  return NextResponse.json({ count: imageModels.length, models: imageModels });
}
