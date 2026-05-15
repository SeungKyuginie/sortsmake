'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PhotoUploader } from './PhotoUploader';
import { StepIndicator } from './StepIndicator';
import {
  estimateRenderSeconds,
  probeAudioDuration,
  renderVideo,
} from './renderVideo';
import type { CornerPhoto, StepKey, StepState } from './types';

const SPEAKERS = [
  { id: 'ko-KR-Wavenet-A', label: 'WaveNet A (여성)' },
  { id: 'ko-KR-Wavenet-B', label: 'WaveNet B (여성)' },
  { id: 'ko-KR-Wavenet-C', label: 'WaveNet C (남성)' },
  { id: 'ko-KR-Wavenet-D', label: 'WaveNet D (남성)' },
];

const INITIAL_STEPS: StepState[] = [
  { key: 'upload', label: '사진/코너 입력', status: 'active' },
  { key: 'script', label: '스크립트 생성', status: 'idle' },
  { key: 'voice', label: 'AI 음성 생성', status: 'idle' },
  { key: 'render', label: '영상 렌더링', status: 'idle' },
  { key: 'done', label: '다운로드', status: 'idle' },
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export default function VideoMakerPage() {
  const [storeName, setStoreName] = useState('');
  const [photos, setPhotos] = useState<CornerPhoto[]>([]);
  const [duration, setDuration] = useState(30);

  const [steps, setSteps] = useState<StepState[]>(INITIAL_STEPS);
  const [error, setError] = useState<string | null>(null);

  // script
  const [script, setScript] = useState('');
  const [scriptLoading, setScriptLoading] = useState(false);

  // voice
  const [speaker, setSpeaker] = useState('ko-KR-Wavenet-A');
  const [speakingRate, setSpeakingRate] = useState(1.0);
  const [pitch, setPitch] = useState(0);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const audioUrl = useMemo(
    () => (audioBlob ? URL.createObjectURL(audioBlob) : null),
    [audioBlob],
  );
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  // render
  const [rendering, setRendering] = useState(false);
  const [renderRatio, setRenderRatio] = useState(0);
  const [renderMessage, setRenderMessage] = useState('');
  const [renderStartedAt, setRenderStartedAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(0);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const videoUrl = useMemo(
    () => (videoBlob ? URL.createObjectURL(videoBlob) : null),
    [videoBlob],
  );
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  // tick for ETA
  useEffect(() => {
    if (!rendering) return;
    const id = setInterval(() => setNowTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [rendering]);

  const setStep = (key: StepKey, patch: Partial<StepState>) => {
    setSteps((prev) =>
      prev.map((s) => (s.key === key ? { ...s, ...patch } : s)),
    );
  };

  // photo handlers
  const onAdd = (files: File[]) => {
    const newOnes: CornerPhoto[] = files.map((f) => ({
      id: uid(),
      file: f,
      previewUrl: URL.createObjectURL(f),
      cornerName: '',
      description: '',
    }));
    setPhotos((p) => [...p, ...newOnes]);
  };
  const onUpdate = (id: string, patch: Partial<CornerPhoto>) => {
    setPhotos((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };
  const onRemove = (id: string) => {
    setPhotos((p) => {
      const target = p.find((x) => x.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
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

  const cornersReady = photos.length > 0;

  // step 2: script
  const handleGenerateScript = async () => {
    setError(null);
    setScriptLoading(true);
    setStep('script', { status: 'active', detail: 'Claude로 생성 중…' });
    try {
      const res = await fetch('/api/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName,
          durationSeconds: duration,
          corners: photos.map((p) => ({
            name: p.cornerName,
            description: p.description,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '스크립트 생성 실패');
      setScript(data.script as string);
      setStep('upload', { status: 'complete' });
      setStep('script', { status: 'complete', detail: '수정 가능' });
      setStep('voice', { status: 'active' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '알 수 없는 오류';
      setError(msg);
      setStep('script', { status: 'error', detail: msg });
    } finally {
      setScriptLoading(false);
    }
  };

  // step 3: voice
  const handleGenerateVoice = async () => {
    setError(null);
    setVoiceLoading(true);
    setAudioBlob(null);
    setAudioDuration(0);
    setStep('voice', { status: 'active', detail: 'CLOVA Voice 합성 중…' });
    try {
      const res = await fetch('/api/generate-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: script,
          voiceName: speaker,
          speakingRate,
          pitch,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '음성 생성 실패');
      }
      const blob = await res.blob();
      const dur = await probeAudioDuration(blob);
      setAudioBlob(blob);
      setAudioDuration(dur);
      setStep('voice', {
        status: 'complete',
        detail: `${dur.toFixed(1)}초`,
      });
      setStep('render', { status: 'active' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '알 수 없는 오류';
      setError(msg);
      setStep('voice', { status: 'error', detail: msg });
    } finally {
      setVoiceLoading(false);
    }
  };

  // step 4: render
  const handleRender = async () => {
    if (!audioBlob) return;
    setError(null);
    setRendering(true);
    setVideoBlob(null);
    setRenderRatio(0);
    setRenderMessage('준비 중…');
    setRenderStartedAt(Date.now());
    setStep('render', { status: 'active', detail: '렌더링 시작' });
    try {
      const blob = await renderVideo(
        {
          images: photos.map((p) => p.file),
          captions: photos.map((p) =>
            [p.cornerName, p.description].filter(Boolean).join(' · '),
          ),
          audio: audioBlob,
          audioDurationSec: audioDuration,
        },
        ({ ratio, message }) => {
          setRenderRatio(ratio);
          setRenderMessage(message);
        },
      );
      setVideoBlob(blob);
      setStep('render', {
        status: 'complete',
        detail: `${(blob.size / 1024 / 1024).toFixed(1)} MB`,
      });
      setStep('done', { status: 'complete', detail: '다운로드 준비됨' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '렌더링 실패';
      setError(msg);
      setStep('render', { status: 'error', detail: msg });
    } finally {
      setRendering(false);
    }
  };

  const handleDownload = () => {
    if (!videoBlob) return;
    const a = document.createElement('a');
    const url = URL.createObjectURL(videoBlob);
    a.href = url;
    const safeStore = (storeName || 'mart').replace(/[^\w가-힣-]/g, '_');
    a.download = `${safeStore}_shorts_${Date.now()}.mp4`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const estTotal = audioDuration
    ? estimateRenderSeconds(photos.length, audioDuration)
    : 0;
  const elapsed = renderStartedAt ? (Date.now() - renderStartedAt) / 1000 : 0;
  const etaRemain = (() => {
    if (!rendering || !renderStartedAt) return null;
    if (renderRatio > 0.05) {
      const projectedTotal = elapsed / renderRatio;
      return Math.max(1, Math.ceil(projectedTotal - elapsed));
    }
    return Math.max(1, estTotal - Math.floor(elapsed));
  })();
  // intentional read of nowTick so it triggers re-render for ETA
  void nowTick;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">
          마트 숏츠 메이커 🎬
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          사진과 코너 설명만 입력하면 Claude가 스크립트를, CLOVA가 음성을, FFmpeg WASM이
          1080×1920 숏츠 영상을 만들어 드립니다.
        </p>
      </header>

      <section className="card mb-6">
        <StepIndicator steps={steps} />
      </section>

      {error ? (
        <div className="card mb-6 border-red-200 bg-red-50 text-sm text-red-700">
          ❌ {error}
        </div>
      ) : null}

      {/* Step 1: photos */}
      <section className="card mb-6">
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="label">마트명 (선택)</label>
            <input
              className="input"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="예: 행복마트 강남점"
            />
          </div>
          <div>
            <label className="label">영상 길이(초)</label>
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
        />
      </section>

      {/* Step 2: script */}
      <section className="card mb-6">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">2. 스크립트 생성</h2>
            <p className="text-sm text-gray-500">
              자동 생성 후 자유롭게 수정할 수 있습니다.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={!cornersReady || scriptLoading}
            onClick={handleGenerateScript}
          >
            {scriptLoading ? '생성 중…' : script ? '다시 생성' : '스크립트 자동 생성'}
          </button>
        </div>
        <textarea
          className="input min-h-[160px]"
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder="Claude가 작성한 나레이션이 여기에 표시됩니다. 직접 입력/수정도 가능합니다."
        />
        <div className="mt-1 text-right text-xs text-gray-500">
          {script.length}자 · 예상 {(script.length / 5.5).toFixed(0)}초
        </div>
      </section>

      {/* Step 3: voice */}
      <section className="card mb-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">3. AI 음성 생성</h2>
            <p className="text-sm text-gray-500">
              Google Cloud TTS (ko-KR WaveNet)로 한국어 나레이션 MP3를 만듭니다.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={!script.trim() || voiceLoading}
            onClick={handleGenerateVoice}
          >
            {voiceLoading ? '합성 중…' : audioBlob ? '다시 생성' : '음성 생성'}
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="label">보이스</label>
            <select
              className="input"
              value={speaker}
              onChange={(e) => setSpeaker(e.target.value)}
            >
              {SPEAKERS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">속도 ({speakingRate.toFixed(2)}x)</label>
            <input
              type="range"
              min={0.5}
              max={1.5}
              step={0.05}
              value={speakingRate}
              onChange={(e) => setSpeakingRate(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div>
            <label className="label">피치 ({pitch})</label>
            <input
              type="range"
              min={-10}
              max={10}
              step={1}
              value={pitch}
              onChange={(e) => setPitch(Number(e.target.value))}
              className="w-full"
            />
          </div>
        </div>
        {audioUrl ? (
          <audio className="mt-4 w-full" controls src={audioUrl} />
        ) : null}
      </section>

      {/* Step 4: render */}
      <section className="card mb-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">4. 영상 렌더링</h2>
            <p className="text-sm text-gray-500">
              브라우저에서 직접 1080×1920 MP4로 인코딩합니다 (FFmpeg WASM).
              {audioDuration ? (
                <>
                  {' '}
                  예상 렌더링 시간 약 <b>{estTotal}초</b> · 음성 길이{' '}
                  {audioDuration.toFixed(1)}초.
                </>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={!audioBlob || rendering || photos.length === 0}
            onClick={handleRender}
          >
            {rendering ? '렌더링 중…' : videoBlob ? '다시 렌더링' : '영상 렌더링 시작'}
          </button>
        </div>

        {rendering || renderRatio > 0 ? (
          <div className="space-y-2">
            <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full bg-brand-600 transition-all"
                style={{ width: `${(renderRatio * 100).toFixed(1)}%` }}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600">
              <span>{renderMessage}</span>
              <span>
                {(renderRatio * 100).toFixed(0)}% ·{' '}
                {rendering
                  ? `경과 ${Math.floor(elapsed)}s${
                      etaRemain != null ? ` · 남은 시간 ~${etaRemain}s` : ''
                    }`
                  : '완료'}
              </span>
            </div>
          </div>
        ) : null}
      </section>

      {/* Step 5: download */}
      {videoBlob && videoUrl ? (
        <section className="card mb-6">
          <h2 className="mb-3 text-lg font-semibold">5. 완성 영상</h2>
          <div className="flex flex-col gap-4 md:flex-row">
            <video
              src={videoUrl}
              controls
              className="aspect-[9/16] w-full max-w-[280px] rounded-lg bg-black"
            />
            <div className="flex-1 space-y-2">
              <p className="text-sm text-gray-600">
                9:16 1080×1920 MP4 · {(videoBlob.size / 1024 / 1024).toFixed(1)} MB ·
                길이 {audioDuration.toFixed(1)}초
              </p>
              <button className="btn-primary" onClick={handleDownload}>
                ⬇︎ MP4 다운로드
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <footer className="mt-10 text-center text-xs text-gray-400">
        ffmpeg.wasm은 브라우저에서 동작합니다. 페이지가 cross-origin isolated 모드로
        제공되어야 합니다 (next.config.js의 COOP/COEP 설정).
      </footer>
    </main>
  );
}
