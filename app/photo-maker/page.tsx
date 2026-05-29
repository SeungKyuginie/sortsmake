'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { BgmLibrary } from '../video-maker/BgmLibrary';
import { PhotoUploader } from '../video-maker/PhotoUploader';
import { LogoutButton } from '../video-maker/LogoutButton';
import { getMyStoreName } from '../video-maker/me-actions';
import {
  loadCloudState,
  saveCloudState,
  clearCloudState,
  type CloudState,
  type CloudPhoto,
} from '../video-maker/cloud-actions';
import {
  uploadPhotoToCloud,
  downloadPhotoFromCloud,
  removePhotoFromCloud,
  removeAllMyPhotosFromCloud,
} from '../video-maker/cloud-sync-client';
import { clearAll, loadItem, saveItem } from '../video-maker/storage';
import { renderVideo } from '../video-maker/renderVideo';
import { makeSilentWavBlob } from '../video-maker/silentAudio';
import { probeMediaSize, uid } from '../video-maker/mediaUtils';
import type { CornerPhoto } from '../video-maker/types';

const FIXED_DURATION_SEC = 4;

export default function PhotoMakerPage() {
  const [storeName, setStoreName] = useState('');
  const [storeNameLocked, setStoreNameLocked] = useState(false);
  const [duration, setDuration] = useState(30);
  const [frameStyle] = useState<'cover' | 'blur'>('cover');
  const [resolution] = useState<'1080p' | '720p'>('720p');

  const [photos, setPhotos] = useState<CornerPhoto[]>([]);
  const [bgmFile, setBgmFile] = useState<File | null>(null);
  const [bgmVolume, setBgmVolume] = useState(0.4);
  const bgmUrl = useMemo(
    () => (bgmFile ? URL.createObjectURL(bgmFile) : null),
    [bgmFile],
  );

  const [error, setError] = useState<string | null>(null);
  const [bgmError, setBgmError] = useState<string | null>(null);

  const [rendering, setRendering] = useState(false);
  const [renderRatio, setRenderRatio] = useState(0);
  const [renderMessage, setRenderMessage] = useState('');
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const videoUrl = useMemo(
    () => (videoBlob ? URL.createObjectURL(videoBlob) : null),
    [videoBlob],
  );

  const [hydrated, setHydrated] = useState(false);
  const [cloudHydrated, setCloudHydrated] = useState(false);

  type SerializedPhoto = Omit<
    CornerPhoto,
    'previewUrl' | 'originalPreviewUrl' | 'droneAiStatus' | 'droneAiError'
  >;

  // 1) IndexedDB 하이드레이션
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [sStoreName, sDuration, sPhotos, sBgmFile, sBgmVolume, sVideoBlob] =
        await Promise.all([
          loadItem<string>('ps_storeName'),
          loadItem<number>('ps_duration'),
          loadItem<SerializedPhoto[]>('ps_photos'),
          loadItem<File>('ps_bgmFile'),
          loadItem<number>('ps_bgmVolume'),
          loadItem<Blob>('ps_videoBlob'),
        ]);
      if (cancelled) return;
      if (sStoreName) setStoreName(sStoreName);
      if (typeof sDuration === 'number') setDuration(sDuration);
      if (sPhotos && sPhotos.length) {
        setPhotos(
          sPhotos.map((p) => ({
            ...p,
            previewUrl: URL.createObjectURL(p.file),
            droneAiStatus: 'idle',
          })),
        );
      }
      if (sBgmFile) setBgmFile(sBgmFile);
      if (typeof sBgmVolume === 'number') setBgmVolume(sBgmVolume);
      if (sVideoBlob) setVideoBlob(sVideoBlob);
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 2) 매장명 자동 채우기 + 잠금
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { storeName: s } = await getMyStoreName();
        if (cancelled) return;
        if (s) {
          setStoreName(s);
          setStoreNameLocked(true);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 3) 자동 저장 (IndexedDB)
  useEffect(() => {
    if (hydrated) saveItem('ps_storeName', storeName);
  }, [hydrated, storeName]);
  useEffect(() => {
    if (hydrated) saveItem('ps_duration', duration);
  }, [hydrated, duration]);
  useEffect(() => {
    if (!hydrated) return;
    const serialized: SerializedPhoto[] = photos.map((p) => {
      const { previewUrl: _u, originalPreviewUrl: _u2, droneAiStatus: _s, droneAiError: _e, ...rest } = p;
      void _u; void _u2; void _s; void _e;
      return rest as SerializedPhoto;
    });
    saveItem('ps_photos', serialized);
  }, [hydrated, photos]);
  useEffect(() => {
    if (hydrated) saveItem('ps_bgmFile', bgmFile);
  }, [hydrated, bgmFile]);
  useEffect(() => {
    if (hydrated) saveItem('ps_bgmVolume', bgmVolume);
  }, [hydrated, bgmVolume]);
  useEffect(() => {
    if (hydrated) saveItem('ps_videoBlob', videoBlob);
  }, [hydrated, videoBlob]);

  // 4) 클라우드 동기화 — 로드
  useEffect(() => {
    if (!hydrated || cloudHydrated) return;
    let cancelled = false;
    (async () => {
      try {
        const { state } = await loadCloudState();
        if (cancelled || !state) {
          setCloudHydrated(true);
          return;
        }
        if (!storeNameLocked && state.storeNameOverride !== undefined)
          setStoreName(state.storeNameOverride);
        if (typeof state.duration === 'number') setDuration(state.duration);
        if (typeof state.bgmVolume === 'number') setBgmVolume(state.bgmVolume);

        if (Array.isArray(state.photos) && state.photos.length > 0) {
          const restored = await Promise.all(
            state.photos.map(async (cp): Promise<CornerPhoto | null> => {
              try {
                const file = await downloadPhotoFromCloud(cp.storagePath);
                if (!file) return null;
                const previewUrl = URL.createObjectURL(file);
                return {
                  id: cp.id,
                  file,
                  previewUrl,
                  kind: cp.kind,
                  cornerName: cp.cornerName ?? '',
                  description: cp.description ?? '',
                  width: cp.width,
                  height: cp.height,
                  storagePath: cp.storagePath,
                  fixedDurationSec: cp.fixedDurationSec,
                  effectMode: cp.effectMode,
                  droneAiStatus: 'idle',
                  uploadStatus: 'uploaded',
                };
              } catch {
                return null;
              }
            }),
          );
          const ok = restored.filter((x): x is CornerPhoto => x !== null);
          if (ok.length > 0) {
            setPhotos((prev) => {
              for (const p of prev) {
                if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
              }
              return ok;
            });
          }
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setCloudHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // 5) 클라우드 동기화 — 저장 (500ms 디바운스)
  const latestCloudPayloadRef = useRef<CloudState | null>(null);
  useEffect(() => {
    if (!cloudHydrated) return;
    const cloudPhotos: CloudPhoto[] = photos
      .filter((p) => !!p.storagePath)
      .map((p) => ({
        id: p.id,
        storagePath: p.storagePath as string,
        kind: p.kind,
        description: p.description ?? '',
        cornerName: p.cornerName ?? '',
        width: p.width,
        height: p.height,
        fixedDurationSec: p.fixedDurationSec,
        effectMode: p.effectMode,
      }));
    const payload: CloudState = {
      storeNameOverride: storeNameLocked ? undefined : storeName,
      duration,
      bgmVolume,
      photos: cloudPhotos,
    };
    latestCloudPayloadRef.current = payload;
    const t = setTimeout(() => {
      saveCloudState(payload).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [cloudHydrated, storeName, storeNameLocked, duration, bgmVolume, photos]);

  // 6) 사진 업로드 (Storage)
  useEffect(() => {
    if (!cloudHydrated) return;
    const toUpload = photos.filter(
      (p) => !p.storagePath && p.uploadStatus !== 'uploading',
    );
    if (toUpload.length === 0) return;
    setPhotos((prev) =>
      prev.map((p) =>
        toUpload.find((t) => t.id === p.id)
          ? { ...p, uploadStatus: 'uploading' }
          : p,
      ),
    );
    (async () => {
      for (const p of toUpload) {
        const path = await uploadPhotoToCloud(p.id, p.file);
        if (!path) continue;
        setPhotos((prev) =>
          prev.map((x) =>
            x.id === p.id
              ? { ...x, storagePath: path, uploadStatus: 'uploaded' }
              : x,
          ),
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudHydrated, photos.length, photos.map((p) => p.id).join(',')]);

  // 7) 강제 flush (logout/페이지 이탈)
  useEffect(() => {
    const flush = async () => {
      if (latestCloudPayloadRef.current) {
        await saveCloudState(latestCloudPayloadRef.current).catch(() => {});
      }
    };
    (window as Window & { __flushCloudState?: () => Promise<void> }).__flushCloudState = flush;
    const onHide = () => { flush(); };
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      delete (window as Window & { __flushCloudState?: () => Promise<void> }).__flushCloudState;
    };
  }, []);

  // 임시저장 버튼
  const [manualSaving, setManualSaving] = useState(false);
  const [manualSavedAt, setManualSavedAt] = useState<number | null>(null);
  const photosUploadingCount = photos.filter(
    (p) => p.uploadStatus === 'uploading',
  ).length;
  const handleManualSave = async () => {
    if (manualSaving) return;
    setManualSaving(true);
    try {
      if (latestCloudPayloadRef.current) {
        const res = await saveCloudState(latestCloudPayloadRef.current);
        if (!res?.error) setManualSavedAt(Date.now());
      }
    } finally {
      setManualSaving(false);
    }
  };
  useEffect(() => {
    if (!manualSavedAt) return;
    const t = setTimeout(() => setManualSavedAt(null), 3000);
    return () => clearTimeout(t);
  }, [manualSavedAt]);

  // 사진 핸들러
  const onAdd = async (files: File[]) => {
    const newOnes: CornerPhoto[] = await Promise.all(
      files.map(async (f) => {
        const kind: 'image' | 'video' = f.type.startsWith('video/') ? 'video' : 'image';
        const dim = await probeMediaSize(f, kind);
        return {
          id: uid(),
          file: f,
          previewUrl: URL.createObjectURL(f),
          kind,
          cornerName: '',
          description: '',
          width: dim.width,
          height: dim.height,
        };
      }),
    );
    setPhotos((p) => [...p, ...newOnes]);
  };
  const onUpdate = (id: string, patch: Partial<CornerPhoto>) => {
    setPhotos((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };
  const onRemove = (id: string) => {
    setPhotos((p) => {
      const target = p.find((x) => x.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        if (target.storagePath)
          removePhotoFromCloud(target.storagePath).catch(() => undefined);
      }
      return p.filter((x) => x.id !== id);
    });
  };
  const onReorder = (id: string, direction: -1 | 1) => {
    setPhotos((p) => {
      const idx = p.findIndex((x) => x.id === id);
      const target = idx + direction;
      if (idx < 0 || target < 0 || target >= p.length) return p;
      const copy = [...p];
      [copy[idx], copy[target]] = [copy[target], copy[idx]];
      return copy;
    });
  };

  const handleReset = async () => {
    if (!window.confirm('모든 작업 내용을 삭제할까요?')) return;
    await clearAll();
    clearCloudState().catch(() => {});
    removeAllMyPhotosFromCloud().catch(() => {});
    for (const p of photos) {
      if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
    }
    setStoreName(storeNameLocked ? storeName : '');
    setDuration(30);
    setPhotos([]);
    setBgmFile(null);
    setBgmVolume(0.4);
    setVideoBlob(null);
    setError(null);
  };

  // 렌더링 — 자막 없음, 무음 + BGM
  const handleRender = async () => {
    if (photos.length === 0) {
      setError('사진을 먼저 업로드해주세요.');
      return;
    }
    setError(null);
    setRendering(true);
    setVideoBlob(null);
    setRenderRatio(0);
    setRenderMessage('준비 중…');
    try {
      // width/height 누락된 사진 재측정
      let photosForRender = photos;
      if (photos.some((p) => !p.width || !p.height)) {
        photosForRender = await Promise.all(
          photos.map(async (p) => {
            if (p.width && p.height) return p;
            const dim = await probeMediaSize(p.file, p.kind);
            return { ...p, width: dim.width ?? p.width, height: dim.height ?? p.height };
          }),
        );
        setPhotos(photosForRender);
      }

      const N = photosForRender.length;
      // 고정/유연 분배
      const fixedSum = photosForRender.reduce(
        (acc, p) => acc + (p.fixedDurationSec ?? 0),
        0,
      );
      const flexCount = photosForRender.filter((p) => !p.fixedDurationSec).length;
      const remaining = Math.max(0, duration - fixedSum);
      const each = flexCount > 0 ? remaining / flexCount : 0;
      const itemDurations = photosForRender.map((p) =>
        p.fixedDurationSec ?? (flexCount > 0 ? each : 0),
      );
      const totalDur = itemDurations.reduce((a, b) => a + b, 0);
      const audioBlob = makeSilentWavBlob(Math.max(0.5, totalDur));

      const blob = await renderVideo(
        {
          items: photosForRender.map((p) => ({
            file: p.file,
            kind: p.kind,
            width: p.width,
            height: p.height,
          })),
          itemDurations,
          droneShots: photosForRender.map(() => false),
          effectModes: photosForRender.map((p) => p.effectMode),
          frameStyle,
          panRatio: 1.0,
          resolution,
          phrases: [],
          hookText: '',
          hookStart: 0,
          hookEnd: 0,
          ctaText: '',
          ctaStart: totalDur,
          ctaEnd: totalDur,
          audio: audioBlob,
          audioDurationSec: totalDur,
          bgm: bgmFile,
          bgmVolume,
        },
        ({ ratio, message }) => {
          setRenderRatio(ratio);
          setRenderMessage(message);
        },
      );
      setVideoBlob(blob);
    } catch (e) {
      setError(e instanceof Error ? e.message : '렌더링 실패');
    } finally {
      setRendering(false);
    }
  };

  const handleDownload = () => {
    if (!videoBlob) return;
    const safeStore = (storeName || 'studio').replace(/[^\w가-힣-]/g, '_');
    const dlBlob =
      videoBlob.type === 'video/mp4'
        ? videoBlob
        : new Blob([videoBlob], { type: 'video/mp4' });
    const url = URL.createObjectURL(dlBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeStore}_photo_${Date.now()}.mp4`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 1500);
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">사진관 숏츠 메이커 📸</h1>
          <p className="mt-1 text-sm text-gray-600">
            사진을 업로드하고 BGM을 고르면 9:16 영상이 자동 완성됩니다.
            사진별로 표시 시간과 모션(패닝/줌인/줌아웃)을 선택할 수 있어요.
          </p>
          <p className="mt-1 text-xs text-gray-400">
            작업 내용은 자동 저장됩니다.
          </p>
          <p className="mt-2 text-xs font-medium text-gray-500">
            프로그램 제작: 주식회사 인스로드
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
          <div className="flex flex-wrap items-start gap-2">
            <button
              type="button"
              onClick={handleManualSave}
              disabled={manualSaving}
              className="btn-secondary shrink-0 text-xs sm:text-sm"
            >
              {manualSaving ? '저장 중…' : manualSavedAt ? '✓ 저장됨' : '💾 임시저장'}
            </button>
            <LogoutButton />
            <button
              type="button"
              onClick={handleReset}
              className="btn-secondary shrink-0 text-xs text-red-600 sm:text-sm"
            >
              🔄 초기화
            </button>
          </div>
          {photosUploadingCount > 0 ? (
            <span className="text-xs text-amber-600">
              ⏳ 사진 업로드 중 ({photosUploadingCount}장)
            </span>
          ) : null}
        </div>
      </header>

      {error ? (
        <div className="card mb-6 border-red-200 bg-red-50 text-red-800">
          <pre className="whitespace-pre-wrap break-all text-sm">{error}</pre>
        </div>
      ) : null}

      {/* Step 1 — 매장명/길이 + 사진 업로드 */}
      <section className="card mb-6">
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="label">
              매장명{storeNameLocked ? ' (계정 등록 정보)' : ''}
            </label>
            <input
              className={`input ${storeNameLocked ? 'bg-gray-100 text-gray-700' : ''}`}
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              readOnly={storeNameLocked}
              placeholder="예: 행복사진관"
            />
          </div>
          <div>
            <label className="label">영상 길이</label>
            <select
              className="input"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            >
              {[15, 20, 30, 45, 60].map((d) => (
                <option key={d} value={d}>
                  {d}초
                </option>
              ))}
            </select>
          </div>
        </div>

        <PhotoUploader
          photos={photos}
          onAdd={onAdd}
          onUpdate={onUpdate}
          onRemove={onRemove}
          onReorder={onReorder}
          showFixedDurationButton
          fixedDurationSec={FIXED_DURATION_SEC}
          hideDroneButton
          hideCornerInputs
          showEffectButtons
        />
      </section>

      {/* Step 2 — BGM */}
      <section className="card mb-6">
        {bgmError ? (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            <div className="mb-1 font-semibold">배경음악 처리 오류</div>
            <pre className="whitespace-pre-wrap break-all">{bgmError}</pre>
          </div>
        ) : null}
        <h2 className="mb-2 text-lg font-semibold">2. 배경음악</h2>
        <p className="mb-3 text-sm text-gray-500">
          저작권 무료 라이브러리에서 한 곡 골라주세요.
        </p>
        <BgmLibrary
          currentName={bgmFile?.name}
          onSelect={async (track) => {
            setBgmError(null);
            try {
              const res = await fetch(track.file);
              if (!res.ok) throw new Error(`음악 파일을 찾을 수 없습니다 (${res.status})`);
              const blob = await res.blob();
              if (blob.size === 0) throw new Error('빈 파일이 반환됐습니다.');
              const file = new File([blob], track.id, {
                type: blob.type || 'audio/mpeg',
              });
              setBgmFile(file);
            } catch (e) {
              setBgmError(e instanceof Error ? e.message : String(e));
            }
          }}
        />
        {bgmFile ? (
          <div className="mt-4 space-y-2 border-t border-gray-100 pt-3 text-sm text-gray-700">
            <div className="flex items-center justify-between gap-2">
              <span>
                🎵 {bgmFile.name} · {(bgmFile.size / 1024 / 1024).toFixed(1)} MB
              </span>
              <button
                type="button"
                className="btn-secondary text-xs text-red-600"
                onClick={() => setBgmFile(null)}
              >
                제거
              </button>
            </div>
            {bgmUrl ? <audio className="w-full" controls src={bgmUrl} /> : null}
            <div>
              <label className="text-xs text-gray-500">
                BGM 볼륨 ({Math.round(bgmVolume * 100)}%)
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={bgmVolume}
                onChange={(e) => setBgmVolume(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
        ) : null}
      </section>

      {/* Step 3 — 렌더링 */}
      <section className="card mb-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">3. 영상 만들기</h2>
            <p className="text-sm text-gray-500">
              1080×1920 MP4. 사진 {photos.length}장 · 총 {duration}초 예정.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={handleRender}
            disabled={rendering || photos.length === 0}
          >
            {rendering ? '렌더링 중…' : videoBlob ? '다시 렌더링' : '렌더링 시작'}
          </button>
        </div>
        {rendering ? (
          <div className="mt-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full bg-brand-500 transition-all"
                style={{ width: `${Math.round(renderRatio * 100)}%` }}
              />
            </div>
            <div className="mt-1 text-xs text-gray-600">
              {renderMessage} · {Math.round(renderRatio * 100)}%
            </div>
          </div>
        ) : null}
      </section>

      {/* Step 4 — 완성/다운로드 */}
      {videoBlob && videoUrl ? (
        <section className="card mb-6">
          <h2 className="mb-3 text-lg font-semibold">4. 완성 영상</h2>
          <div className="flex flex-col gap-4 md:flex-row">
            <video
              src={videoUrl}
              controls
              className="aspect-[9/16] w-full max-w-[280px] rounded-lg bg-black"
            />
            <div className="flex-1 space-y-2">
              <p className="text-sm text-gray-600">
                9:16 1080×1920 MP4 · {(videoBlob.size / 1024 / 1024).toFixed(1)} MB
              </p>
              <button className="btn-primary" onClick={handleDownload}>
                ⬇︎ MP4 다운로드
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
