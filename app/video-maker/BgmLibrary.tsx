'use client';

import { useEffect, useState } from 'react';

type Track = {
  id: string;
  name: string;
  category: string;
  file: string;
};

type Manifest = { tracks: Track[] };

type Props = {
  currentName?: string;
  onSelect: (track: Track) => void | Promise<void>;
};

export function BgmLibrary({ currentName, onSelect }: Props) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/bgm/manifest.json', { cache: 'no-store' });
        if (!res.ok) throw new Error(`manifest 로드 실패 (${res.status})`);
        const data = (await res.json()) as Manifest;
        if (!cancelled) setTracks(data.tracks ?? []);
      } catch {
        if (!cancelled) setTracks([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="text-sm text-gray-500">음악 목록을 불러오는 중…</div>;
  }

  if (tracks.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        등록된 음악이 없습니다. public/bgm/ 폴더에 MP3 파일을 업로드하고 manifest.json에 등록해 주세요.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">
        미리 듣기 후 선택하세요. 모든 곡은 저작권 무료 라이선스입니다.
      </p>
      <ul className="space-y-2">
        {tracks.map((t) => {
          const isCurrent =
            currentName && currentName.startsWith(t.id);
          return (
            <li
              key={t.id}
              className={`flex items-center gap-3 rounded-lg border p-3 ${
                isCurrent
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  {t.name}
                </div>
                <div className="text-xs text-gray-500">{t.category}</div>
                <audio
                  className="mt-2 w-full"
                  controls
                  preload="none"
                  src={t.file}
                />
              </div>
              <button
                type="button"
                disabled={loadingId === t.id}
                className={`shrink-0 ${
                  isCurrent ? 'btn-secondary' : 'btn-primary'
                } px-3 py-1.5 text-xs`}
                onClick={async () => {
                  setLoadingId(t.id);
                  try {
                    await onSelect(t);
                  } finally {
                    setLoadingId(null);
                  }
                }}
              >
                {loadingId === t.id
                  ? '불러오는 중…'
                  : isCurrent
                    ? '선택됨'
                    : '선택'}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
