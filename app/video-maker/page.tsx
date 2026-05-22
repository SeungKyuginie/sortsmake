'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { encodeImageForClaude, encodeVideoFirstFrame } from './encodeImage';
import { parseCornerSegments, parseScriptSegments } from './parseSegments';
import { PhotoUploader } from './PhotoUploader';
import { StepIndicator } from './StepIndicator';
import {
  estimateRenderSeconds,
  probeAudioDuration,
  renderVideo,
} from './renderVideo';
import type { CornerPhoto, StepKey, StepState } from './types';

const SPEAKERS = [
  { id: 'ko-KR-Wavenet-A', label: '여성 A' },
  { id: 'ko-KR-Wavenet-B', label: '여성 B' },
  { id: 'ko-KR-Wavenet-C', label: '남성 A' },
  { id: 'ko-KR-Wavenet-D', label: '남성 B' },
];

const INITIAL_STEPS: StepState[] = [
  { key: 'upload', label: '사진/코너 입력', status: 'active' },
  { key: 'script', label: '스크립트 생성', status: 'idle' },
  { key: 'voice', label: '음성 생성', status: 'idle' },
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
  const [voiceMode, setVoiceMode] = useState<'single' | 'multi'>('single');
  const [speaker, setSpeaker] = useState('ko-KR-Wavenet-A');
  const [multiVoices, setMultiVoices] = useState<Record<string, string>>({
    A: 'ko-KR-Wavenet-A',
    B: 'ko-KR-Wavenet-C',
  });
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

  // bgm
  const [bgmMode, setBgmMode] = useState<'upload' | 'ai'>('upload');
  const [bgmFile, setBgmFile] = useState<File | null>(null);
  const [bgmVolume, setBgmVolume] = useState(0.18);
  const [bgmPrompt, setBgmPrompt] = useState(
    'Upbeat, cheerful Korean retail store background music. Light percussion, bright marimba, friendly and energetic. Instrumental only. Suitable for a 30-second mart promotional shorts video.',
  );
  const [bgmGenLoading, setBgmGenLoading] = useState(false);
  const [bgmError, setBgmError] = useState<string | null>(null);
  const bgmUrl = useMemo(
    () => (bgmFile ? URL.createObjectURL(bgmFile) : null),
    [bgmFile],
  );
  useEffect(() => {
    return () => {
      if (bgmUrl) URL.revokeObjectURL(bgmUrl);
    };
  }, [bgmUrl]);

  const handleGenerateBgm = async () => {
    setError(null);
    setBgmError(null);
    setBgmGenLoading(true);
    try {
      // 음성 길이가 있으면 그에 맞춰 생성, 없으면 영상 길이 사용
      const lengthMs = Math.round(
        (audioDuration > 0 ? audioDuration : duration) * 1000,
      );
      const res = await fetch('/api/generate-music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: bgmPrompt,
          lengthMs,
          forceInstrumental: true,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'BGM 생성 실패');
      }
      const blob = await res.blob();
      const file = new File([blob], `ai-bgm-${Date.now()}.mp3`, {
        type: 'audio/mpeg',
      });
      setBgmFile(file);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'BGM 생성 실패';
      setError(msg);
      setBgmError(msg);
    } finally {
      setBgmGenLoading(false);
    }
  };

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
      kind: f.type.startsWith('video/') ? 'video' : 'image',
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
    setStep('script', { status: 'active', detail: '이미지 분석 준비 중…' });
    try {
      const encoded = await Promise.all(
        photos.map(async (p) => {
          const { base64, mediaType } =
            p.kind === 'video'
              ? await encodeVideoFirstFrame(p.file)
              : await encodeImageForClaude(p.file);
          return {
            name: p.cornerName,
            description: p.description,
            imageBase64: base64,
            mediaType,
          };
        }),
      );
      setStep('script', { status: 'active', detail: '이미지 분석 중…' });
      const speakerTags =
        voiceMode === 'multi' ? Object.keys(multiVoices) : undefined;
      const res = await fetch('/api/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName,
          durationSeconds: duration,
          corners: encoded,
          speakerTags,
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

  // step 3: voice — 코너별로 따로 합성해 음성 길이를 측정한 뒤 하나로 합칩니다.
  const [cornerDurations, setCornerDurations] = useState<number[]>([]);

  const handleGenerateVoice = async () => {
    setError(null);
    setVoiceLoading(true);
    setAudioBlob(null);
    setAudioDuration(0);
    setCornerDurations([]);
    setStep('voice', { status: 'active', detail: '코너별 음성 합성 중…' });
    try {
      const cornerCount = photos.length || 1;
      const cornerTexts = parseCornerSegments(script, cornerCount);

      const cornerBlobs: Blob[] = [];
      const cornerDurs: number[] = [];

      for (let i = 0; i < cornerTexts.length; i++) {
        setStep('voice', {
          status: 'active',
          detail: `코너 ${i + 1}/${cornerTexts.length} 합성 중…`,
        });
        const text = cornerTexts[i];
        const segments =
          voiceMode === 'multi'
            ? parseScriptSegments(text, multiVoices, speaker)
            : [{ text, voiceName: speaker }];

        const res = await fetch('/api/generate-voice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ segments, speakingRate, pitch }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `코너 ${i + 1} 음성 생성 실패`);
        }
        const blob = await res.blob();
        const dur = await probeAudioDuration(blob);
        cornerBlobs.push(blob);
        cornerDurs.push(dur);
      }

      const combined = new Blob(cornerBlobs, { type: 'audio/mpeg' });
      const totalDur = cornerDurs.reduce((a, b) => a + b, 0);
      setAudioBlob(combined);
      setAudioDuration(totalDur);
      setCornerDurations(cornerDurs);
      setStep('voice', {
        status: 'complete',
        detail: `${totalDur.toFixed(1)}초 · 코너 ${cornerDurs.length}개`,
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
          items: photos.map((p) => ({ file: p.file, kind: p.kind })),
          captions: photos.map((p) =>
            [p.cornerName, p.description].filter(Boolean).join(' · '),
          ),
          droneShots: photos.map((p) => p.droneShot ?? false),
          audio: audioBlob,
          audioDurationSec: audioDuration,
          perItemDurations:
            cornerDurations.length === photos.length
              ? cornerDurations
              : undefined,
          bgm: bgmFile,
          bgmVolume,
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
          사진을 업로드하면 자동으로 스크립트와 음성, 배경음악을 입혀
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
          placeholder="자동 생성된 나레이션이 여기에 표시됩니다. 직접 입력/수정도 가능합니다."
        />
        <div className="mt-1 text-right text-xs text-gray-500">
          {script.length}자 · 예상 {(script.length / 5.5).toFixed(0)}초
        </div>
      </section>

      {/* Step 3: voice */}
      <section className="card mb-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">3. 음성 생성</h2>
            <p className="text-sm text-gray-500">
              한국어 나레이션 음성을 자동으로 만들어 줍니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 text-xs">
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 font-medium ${voiceMode === 'single' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
                onClick={() => setVoiceMode('single')}
              >
                🎙 단일
              </button>
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 font-medium ${voiceMode === 'multi' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
                onClick={() => setVoiceMode('multi')}
              >
                👥 다중
              </button>
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
        </div>

        {voiceMode === 'single' ? (
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
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              💡 다중 보이스 모드: 스크립트에{' '}
              <code className="rounded bg-white px-1">[A]</code>{' '}
              <code className="rounded bg-white px-1">[B]</code> 같은 태그를 넣으면
              해당 화자 보이스로 읽힙니다.
              {script && !/\[[A-D]\]/.test(script) ? (
                <>
                  {' '}
                  현재 스크립트에 화자 태그가 없어요 — <b>2. 스크립트 다시 생성</b>을
                  눌러주세요. (이미 다중 모드로 토글된 상태니까 자동으로 박아줍니다.)
                </>
              ) : (
                <> 스크립트를 새로 생성하면 자동으로 화자를 분배해 줘요.</>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {Object.keys(multiVoices).map((tag) => (
                <div key={tag}>
                  <label className="label">
                    화자 [{tag}]
                  </label>
                  <select
                    className="input"
                    value={multiVoices[tag]}
                    onChange={(e) =>
                      setMultiVoices((v) => ({ ...v, [tag]: e.target.value }))
                    }
                  >
                    {SPEAKERS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <div className="flex items-end gap-2">
                {Object.keys(multiVoices).length < 4 ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      const used = new Set(Object.keys(multiVoices));
                      const next = ['A', 'B', 'C', 'D'].find((t) => !used.has(t));
                      if (next) {
                        setMultiVoices((v) => ({
                          ...v,
                          [next]: 'ko-KR-Wavenet-B',
                        }));
                      }
                    }}
                  >
                    + 화자 추가
                  </button>
                ) : null}
                {Object.keys(multiVoices).length > 2 ? (
                  <button
                    type="button"
                    className="btn-secondary text-red-600"
                    onClick={() => {
                      const keys = Object.keys(multiVoices);
                      const last = keys[keys.length - 1];
                      setMultiVoices((v) => {
                        const cp = { ...v };
                        delete cp[last];
                        return cp;
                      });
                    }}
                  >
                    − 마지막 제거
                  </button>
                ) : null}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="label">
                  공통 속도 ({speakingRate.toFixed(2)}x)
                </label>
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
                <label className="label">공통 피치 ({pitch})</label>
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
          </div>
        )}
        {audioUrl ? (
          <audio className="mt-4 w-full" controls src={audioUrl} />
        ) : null}
      </section>

      {/* Step 3-2: BGM */}
      <section className="card mb-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">3-2. 배경음악 (선택)</h2>
            <p className="text-sm text-gray-500">
              음성과 자동으로 믹스되고, 음성 길이에 맞춰 루프 + 시작/끝 페이드가 들어갑니다.
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 text-xs">
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 font-medium ${bgmMode === 'upload' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
              onClick={() => setBgmMode('upload')}
            >
              📁 업로드
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 font-medium ${bgmMode === 'ai' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
              onClick={() => setBgmMode('ai')}
            >
              ✨ 자동 생성
            </button>
          </div>
        </div>

        {bgmMode === 'upload' ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <label className="btn-secondary cursor-pointer">
                {bgmFile ? '음악 교체' : '음악 업로드'}
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setBgmFile(f);
                    e.target.value = '';
                  }}
                />
              </label>
              <span className="text-xs text-gray-500">
                저작권 무료 음원은{' '}
                <a
                  href="https://pixabay.com/music/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-600 underline"
                >
                  Pixabay Music
                </a>
                ,{' '}
                <a
                  href="https://studio.youtube.com/channel/UC/music"
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-600 underline"
                >
                  YouTube Audio Library
                </a>
                에서 받을 수 있어요.
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="label">
                음악 프롬프트 (영어로 작성하면 결과가 더 좋음)
              </label>
              <textarea
                className="input min-h-[88px]"
                value={bgmPrompt}
                onChange={(e) => setBgmPrompt(e.target.value)}
                placeholder="Upbeat Korean retail store BGM, light percussion, bright, instrumental..."
              />
              <div className="mt-1 text-xs text-gray-500">
                길이는 음성 길이(없으면 영상 길이)에 맞춰 자동으로 요청됩니다.
              </div>
            </div>
            <button
              type="button"
              className="btn-primary"
              disabled={!bgmPrompt.trim() || bgmGenLoading}
              onClick={handleGenerateBgm}
            >
              {bgmGenLoading ? '음악 생성 중… (보통 20~40초)' : bgmFile ? '다시 생성' : '음악 생성하기'}
            </button>
            {bgmError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                <div className="mb-1 font-semibold">음악 생성 실패</div>
                <pre className="whitespace-pre-wrap break-all">{bgmError}</pre>
              </div>
            ) : null}
          </div>
        )}

        {bgmFile ? (
          <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between gap-2 text-sm text-gray-700">
              <span>
                🎵 {bgmFile.name} · {(bgmFile.size / 1024 / 1024).toFixed(1)} MB
              </span>
              <button
                type="button"
                className="btn-secondary text-red-600"
                onClick={() => setBgmFile(null)}
              >
                제거
              </button>
            </div>
            {bgmUrl ? <audio className="w-full" controls src={bgmUrl} /> : null}
            <div>
              <label className="label">
                BGM 볼륨 ({Math.round(bgmVolume * 100)}% — 음성 대비)
              </label>
              <input
                type="range"
                min={0}
                max={0.6}
                step={0.02}
                value={bgmVolume}
                onChange={(e) => setBgmVolume(Number(e.target.value))}
                className="w-full"
              />
              <div className="mt-1 text-xs text-gray-500">
                권장: 15~25%. 너무 크면 나레이션이 묻힙니다.
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500">
            배경음악 없이도 영상 생성은 가능합니다.
          </div>
        )}
      </section>

      {/* Step 4: render */}
      <section className="card mb-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">4. 영상 렌더링</h2>
            <p className="text-sm text-gray-500">
              브라우저에서 직접 1080×1920 MP4로 인코딩합니다.
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
        영상 인코딩은 브라우저에서 직접 처리됩니다.
      </footer>
    </main>
  );
}
