import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

type RequestBody = {
  imageBase64: string;
  mediaType?: string;
};

const MODEL = 'gemini-2.5-flash-image';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const DRONE_PROMPT =
  '이 사진을 드론으로 40m 상공에서 비스듬히 내려다본 항공샷으로 변환해줘. ' +
  '매장 건물 전경, 주차장, 주변 환경이 한눈에 들어오게. ' +
  '간판/로고/주요 텍스트는 그대로 유지. 자연스러운 햇빛, 선명한 색감, 영화 같은 분위기. ' +
  '9:16 세로 비율로 생성해줘.';

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY 환경 변수가 설정되지 않았습니다.' },
        { status: 500 },
      );
    }

    const body = (await req.json()) as RequestBody;
    if (!body.imageBase64) {
      return NextResponse.json({ error: 'imageBase64 누락' }, { status: 400 });
    }
    const mimeType = body.mediaType || 'image/jpeg';

    const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: DRONE_PROMPT },
              { inline_data: { mime_type: mimeType, data: body.imageBase64 } },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ['IMAGE'],
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json(
        {
          error: `Gemini API 실패 (${res.status})`,
          detail: text.slice(0, 500),
        },
        { status: 502 },
      );
    }

    const data = (await res.json()) as {
      candidates?: {
        content?: {
          parts?: { inlineData?: { mimeType?: string; data?: string } }[];
        };
      }[];
    };

    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const imgPart = parts.find((p) => p.inlineData?.data);
    if (!imgPart?.inlineData?.data) {
      return NextResponse.json(
        { error: 'Gemini 응답에 이미지가 없습니다.', detail: JSON.stringify(data).slice(0, 500) },
        { status: 502 },
      );
    }

    return NextResponse.json({
      imageBase64: imgPart.inlineData.data,
      mediaType: imgPart.inlineData.mimeType || 'image/png',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
