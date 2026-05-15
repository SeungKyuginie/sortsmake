'use client';

import { useRef } from 'react';
import type { CornerPhoto } from './types';

type Props = {
  photos: CornerPhoto[];
  onAdd: (files: File[]) => void;
  onUpdate: (id: string, patch: Partial<CornerPhoto>) => void;
  onRemove: (id: string) => void;
  onReorder: (id: string, direction: -1 | 1) => void;
};

export function PhotoUploader({
  photos,
  onAdd,
  onUpdate,
  onRemove,
  onReorder,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">1. 사진 업로드 & 코너 설명</h2>
          <p className="text-sm text-gray-500">
            여러 장을 한 번에 추가하고, 각 사진의 코너명/설명을 입력하세요.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => inputRef.current?.click()}
        >
          + 사진 추가
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) onAdd(files);
            e.target.value = '';
          }}
        />
      </div>

      {photos.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-300 p-10 text-center text-gray-500">
          업로드된 사진이 없습니다. 우측 상단의 <b>사진 추가</b> 버튼을 눌러 시작하세요.
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {photos.map((p, idx) => (
            <li key={p.id} className="card">
              <div className="flex items-start gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.previewUrl}
                  alt={p.cornerName || `사진 ${idx + 1}`}
                  className="h-28 w-28 shrink-0 rounded-lg object-cover"
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-gray-500">
                      #{idx + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="btn-secondary px-2 py-1 text-xs"
                        onClick={() => onReorder(p.id, -1)}
                        disabled={idx === 0}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn-secondary px-2 py-1 text-xs"
                        onClick={() => onReorder(p.id, 1)}
                        disabled={idx === photos.length - 1}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="btn-secondary px-2 py-1 text-xs text-red-600"
                        onClick={() => onRemove(p.id)}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="label">코너명</label>
                    <input
                      className="input"
                      value={p.cornerName}
                      placeholder="예: 신선과일 코너"
                      onChange={(e) =>
                        onUpdate(p.id, { cornerName: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="label">설명</label>
                    <textarea
                      className="input min-h-[64px]"
                      value={p.description}
                      placeholder="예: 햇사과 1.5kg 9,900원 특가, 산지직송"
                      onChange={(e) =>
                        onUpdate(p.id, { description: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
