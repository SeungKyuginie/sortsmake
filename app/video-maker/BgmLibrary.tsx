'use client';

import { useEffect, useMemo, useState } from 'react';

type Track = {
  id: string;
  name: string;
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
  const [selectedId, setSelectedId] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/bgm-list', { cache: 'no-store' });
        if (!res.ok) throw new Error(`목록 로드 실패 (${res.status})`);
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

  // 이미 선택된 곡이 있으면 드롭다운에 동기화
  useEffect(() => {
    if (currentName && tracks.some((t) => t.id === currentName)) {
      setSelectedId(currentName);
    }
  }, [currentName, tracks]);

  const selectedTrack = useMemo(
    () => tracks.find((t) => t.id === selectedId) ?? null,
    [tracks, selectedId],
  );

  if (loading) {
    return <div className="text-sm text-gray-500">음악 목록을 불러오는 중…</div>;
  }

  if (tracks.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        등록된 음악이 없습니다. public/bgm/ 폴더에 MP3 파일을 업로드해 주세요.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select
          className="input flex-1"
          value={selectedId}
          onChange={async (e) => {
            const id = e.target.value;
            setSelectedId(id);
            const t = tracks.find((x) => x.id === id);
            if (!t) return;
            setBusy(true);
            try {
              await onSelect(t);
            } finally {
              setBusy(false);
            }
          }}
        >
          <option value="">곡을 선택하세요…</option>
          {tracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {busy ? (
          <span className="text-xs text-gray-500">불러오는 중…</span>
        ) : null}
      </div>
      {selectedTrack ? (
        <audio
          key={selectedTrack.id}
          className="w-full"
          controls
          preload="none"
          src={selectedTrack.file}
        />
      ) : null}
      <p className="text-xs text-gray-500">
        모든 곡은 저작권 무료 라이선스입니다.
      </p>
    </div>
  );
}
