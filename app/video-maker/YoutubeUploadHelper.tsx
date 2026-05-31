'use client';

import { useMemo, useState } from 'react';
import type { ShortsScript } from './types';

type Props = {
  storeName: string;
  script: ShortsScript | null;
  videoBlob: Blob | null;
};

function generateMetadata(input: {
  storeName: string;
  script: ShortsScript;
}): { title: string; description: string; tags: string[] } {
  const { storeName, script } = input;

  // 제목 — Hook을 베이스로 매장명 포함, 100자 이내
  const titleBase = script.hook.replace(/[.!?。]+$/, '').trim();
  const title = `${titleBase} | ${storeName}`.slice(0, 95);

  // 설명 — Hook + 코너들 + CTA, 해시태그 포함
  const segs = script.segments
    .map((s) => `• ${s.text}`)
    .join('\n');
  const description = [
    `📍 ${storeName}`,
    '',
    script.hook,
    '',
    '오늘의 코너:',
    segs,
    '',
    script.cta,
    '',
    '─────────────────',
    `#shorts #쇼츠 #${storeName.replace(/\s/g, '')} #마트 #장보기 #특가`,
  ].join('\n');

  // 태그 — 매장명 + 일반 키워드
  const tags = [
    'shorts',
    '숏츠',
    storeName.replace(/\s/g, ''),
    storeName,
    '마트',
    '장보기',
    '특가',
    '신선식품',
    '동네마트',
  ].filter(Boolean);

  return { title, description, tags };
}

export function YoutubeUploadHelper({ storeName, script, videoBlob }: Props) {
  const meta = useMemo(
    () => (script ? generateMetadata({ storeName, script }) : null),
    [storeName, script],
  );
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!meta || !videoBlob) return null;

  const copy = (key: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    });
  };

  return (
    <section className="card mb-6 border-purple-200 bg-purple-50/50">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-semibold">📺 YouTube 업로드 도우미</h2>
        <span className="rounded bg-purple-500 px-2 py-0.5 text-xs text-white">
          관리자 베타
        </span>
      </div>
      <p className="mb-4 text-sm text-gray-600">
        제목·설명·태그를 자동 생성했어요. 복사한 뒤 YouTube Studio에서
        붙여넣으세요.
      </p>

      <div className="space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-medium text-gray-700">
              제목 ({meta.title.length}/100)
            </label>
            <button
              type="button"
              className="rounded border border-purple-300 bg-white px-2 py-0.5 text-xs text-purple-700 hover:bg-purple-100"
              onClick={() => copy('title', meta.title)}
            >
              {copiedKey === 'title' ? '✓ 복사됨' : '📋 복사'}
            </button>
          </div>
          <input
            className="input w-full"
            value={meta.title}
            readOnly
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-medium text-gray-700">
              설명 ({meta.description.length}자)
            </label>
            <button
              type="button"
              className="rounded border border-purple-300 bg-white px-2 py-0.5 text-xs text-purple-700 hover:bg-purple-100"
              onClick={() => copy('description', meta.description)}
            >
              {copiedKey === 'description' ? '✓ 복사됨' : '📋 복사'}
            </button>
          </div>
          <textarea
            className="input min-h-[140px] w-full"
            value={meta.description}
            readOnly
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-medium text-gray-700">
              태그 ({meta.tags.length}개)
            </label>
            <button
              type="button"
              className="rounded border border-purple-300 bg-white px-2 py-0.5 text-xs text-purple-700 hover:bg-purple-100"
              onClick={() => copy('tags', meta.tags.join(', '))}
            >
              {copiedKey === 'tags' ? '✓ 복사됨' : '📋 복사'}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {meta.tags.map((t) => (
              <span
                key={t}
                className="rounded-full bg-white px-2.5 py-1 text-xs text-purple-700 border border-purple-300"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2 border-t border-purple-200 pt-4 sm:flex-row">
        <a
          href="https://studio.youtube.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700"
        >
          📺 YouTube Studio 열기
        </a>
        <span className="text-xs text-gray-500 sm:self-center">
          영상 다운로드 후 새 창에서 업로드 페이지에 파일 + 위 메타데이터 붙여넣기
        </span>
      </div>
    </section>
  );
}
