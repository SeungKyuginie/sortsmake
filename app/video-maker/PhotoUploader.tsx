'use client';

import { useRef } from 'react';
import type { CornerPhoto } from './types';

type Props = {
  photos: CornerPhoto[];
  onAdd: (files: File[]) => void;
  onUpdate: (id: string, patch: Partial<CornerPhoto>) => void;
  onRemove: (id: string) => void;
  onReorder: (id: string, direction: -1 | 1) => void;
  onGenerateDrone?: (id: string) => void;
  onCancelDrone?: (id: string) => void;
  // 사진관 등 음성 미사용 모드에서만 노출되는 "N초 고정" 버튼
  showFixedDurationButton?: boolean;
  fixedDurationSec?: number;
  // 드론샷 버튼 숨김 (사진관 등에서 불필요)
  hideDroneButton?: boolean;
  // 코너명·힌트 입력 숨김 (스크립트 미사용 업종)
  hideCornerInputs?: boolean;
};

export function PhotoUploader({
  photos,
  onAdd,
  onUpdate,
  onRemove,
  onReorder,
  onGenerateDrone,
  onCancelDrone,
  showFixedDurationButton = false,
  fixedDurationSec = 4,
  hideDroneButton = false,
  hideCornerInputs = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">1. 사진/영상 업로드 & 코너 설명</h2>
          <p className="text-sm text-gray-500">
            여러 장을 한 번에 추가하세요. 사진과 짧은 영상 클립을 섞어도 됩니다.
            영상은 첫 프레임이 분석에 사용되고, 원본 소리는 사용되지 않습니다 (나레이션이 입혀짐).
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => inputRef.current?.click()}
        >
          + 사진/영상 추가
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,video/*"
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
          업로드된 사진/영상이 없습니다. 우측 상단의 <b>사진/영상 추가</b> 버튼을 눌러 시작하세요.
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {photos.map((p, idx) => (
            <li key={p.id} className="card">
              <div className="flex items-start gap-4">
                {p.kind === 'video' ? (
                  <video
                    src={p.previewUrl}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-28 w-28 shrink-0 rounded-lg bg-black object-cover"
                  />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={p.previewUrl}
                    alt={p.cornerName || `미디어 ${idx + 1}`}
                    className="h-28 w-28 shrink-0 rounded-lg object-cover"
                  />
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-gray-500">
                      #{idx + 1} {p.kind === 'video' ? '🎬 영상' : '🖼 사진'}
                    </span>
                    <div className="flex items-center gap-1">
                      {!hideDroneButton && p.kind === 'image' && !p.droneShot && (
                        <button
                          type="button"
                          title="AI로 항공샷 이미지 생성 후 줌아웃 효과까지 적용"
                          disabled={p.droneAiStatus === 'generating'}
                          className={`px-2 py-1 text-xs rounded border font-medium transition-colors ${
                            p.droneAiStatus === 'generating'
                              ? 'bg-gray-200 text-gray-500 border-gray-300 cursor-wait'
                              : 'btn-secondary'
                          }`}
                          onClick={() => onGenerateDrone?.(p.id)}
                        >
                          {p.droneAiStatus === 'generating'
                            ? '🚁 생성 중…'
                            : '🚁 드론샷'}
                        </button>
                      )}
                      {!hideDroneButton && p.kind === 'image' && p.droneShot && (
                        <button
                          type="button"
                          title="원본 사진으로 되돌리기"
                          className="px-2 py-1 text-xs rounded border font-medium bg-sky-500 text-white border-sky-500"
                          onClick={() => onCancelDrone?.(p.id)}
                        >
                          🚁 드론샷 적용됨
                        </button>
                      )}
                      {showFixedDurationButton && (
                        <button
                          type="button"
                          title={
                            p.fixedDurationSec
                              ? `${p.fixedDurationSec}초 고정 적용됨 (클릭 시 해제)`
                              : `${fixedDurationSec}초 고정으로 표시`
                          }
                          className={`whitespace-nowrap px-2 py-1 text-xs rounded border font-medium ${
                            p.fixedDurationSec
                              ? 'bg-amber-500 text-white border-amber-500'
                              : 'btn-secondary'
                          }`}
                          onClick={() =>
                            onUpdate(p.id, {
                              fixedDurationSec: p.fixedDurationSec
                                ? undefined
                                : fixedDurationSec,
                            })
                          }
                        >
                          ⏱{fixedDurationSec}s
                        </button>
                      )}
                      {p.kind === 'image' && !p.droneShot && (
                        <div
                          className="inline-flex overflow-hidden rounded border border-gray-300"
                          title="이 사진의 모션 효과 선택"
                        >
                          {(
                            [
                              { v: 'pan', l: '↔', t: '패닝' },
                              { v: 'zoom_in', l: '🔍+', t: '줌인' },
                              { v: 'zoom_out', l: '🔍-', t: '줌아웃' },
                            ] as const
                          ).map((opt) => {
                            const active =
                              (p.effectMode ?? 'pan') === opt.v;
                            return (
                              <button
                                key={opt.v}
                                type="button"
                                title={opt.t}
                                className={`whitespace-nowrap px-2 py-1 text-xs font-medium ${
                                  active
                                    ? 'bg-brand-500 text-white'
                                    : 'bg-white text-gray-700 hover:bg-gray-100'
                                }`}
                                onClick={() =>
                                  onUpdate(p.id, { effectMode: opt.v })
                                }
                              >
                                {opt.l}
                              </button>
                            );
                          })}
                        </div>
                      )}
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
                  {!hideCornerInputs && (
                    <>
                      <div>
                        <label className="label">코너명 (선택)</label>
                        <input
                          className="input"
                          value={p.cornerName}
                          placeholder="비우면 사진에서 자동 추정"
                          onChange={(e) =>
                            onUpdate(p.id, { cornerName: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <label className="label">힌트 (선택)</label>
                        <textarea
                          className="input min-h-[64px]"
                          value={p.description}
                          placeholder="강조하고 싶은 가격/문구가 있으면 입력 (예: 1.5kg 9,900원 특가)"
                          onChange={(e) =>
                            onUpdate(p.id, { description: e.target.value })
                          }
                        />
                      </div>
                    </>
                  )}
                  {p.droneAiError ? (
                    <div className="rounded-md bg-red-50 border border-red-200 p-2 text-xs text-red-700">
                      드론샷 생성 실패: {p.droneAiError}
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
