'use client';

import { useEffect, useMemo, useState } from 'react';
import { encodeImageForClaude, encodeVideoFirstFrame } from './encodeImage';
import { distributeTimings, splitPhrases } from './parseSegments';
import { PhotoUploader } from './PhotoUploader';
import { StepIndicator } from './StepIndicator';
import {
  estimateRenderSeconds,
  probeAudioDuration,
  renderVideo,
  type RenderPhrase,
} from './renderVideo';
import type {
  CornerPhoto,
  ScriptSegment,
  ShortsScript,
  StepKey,
  StepState,
} from './types';

const SPEAKERS = [
  { id: 'ko-KR-Wavenet-A', label: 'WaveNet A (여성, 차분)' },
  { id: 'ko-KR-Wavenet-B', label: 'WaveNet B (여성, 발랄)' },
  { id: 'ko-KR-Wavenet-C', label: 'WaveNet C (남성, 차분)' },
  { id: 'ko-KR-Wavenet-D', label: 'WaveNet D (남성, 활기)' },
];

const INITIAL_STEPS: StepState[] = [
  { key: 'upload', label: '사진/코너 입력', status: 'active' },
  { key: 'script', label: '숏츠 스크립트', status: 'idle' },
  { key: 'voice', label: 'AI 음성', status: 'idle' },
  { key: 'render', label: '영상 렌더링', status: 'idle' },
  { key: 'done', label: '다운로드', status: 'idle' },
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

type VoiceTimeline = {
  audioBlob: Blob;
  totalDur: number;
  hookDur: number;
  cornerDurs: number[];
  ctaDur: number;
};

export default function VideoMakerPage() {
  // step 1
  const [storeName, setStoreName] = useState('');
  const [photos, setPhotos] = useState<CornerPhoto[]>([]);
  const [duration, setDuration] = useState(30);

  // common voice
  const [speaker, setSpeaker] = useState('ko-KR-Wavenet-B');
  const [speakingRate, setSpeakingRate] = useState(1.1);
  const [pitch, setPitch] = useState(0);

  // step indicator
  const [steps, setSteps] = useState<StepState[]>(INITIAL_STEPS);
  const [error, setError] = useState<string | null>(null);

  // step 2: script
  const [script, setScript] = useState<ShortsScript | null>(null);
  const [scriptLoading, setScriptLoading] = useState(false);

  // step 3: voice
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voice, setVoice] = useState<VoiceTimeline | null>(null);
  const audioUrl = useMemo(
    () => (voice ? URL.createObjectURL(voice.audioBlob) : null),
    [voice],
  );
  useEffect(
    () => () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    },
    [audioUrl],
  );

  // step 3-2: BGM
  const [bgmMode, setBgmMode] = useState<'upload' | 'ai'>('upload');
  const [bgmFile, setBgmFile] = useState<File | null>(null);
  const [bgmVolume, setBgmVolume] = useState(0.16);
  const [bgmPrompt, setBgmPrompt] = useState(
    'Upbeat Korean retail store background music. Light percussion, bright marimba, friendly and energetic. Instrumental only. Suitable for a 30-second mart promotional shorts video.',
  );
  const [bgmGenLoading, setBgmGenLoading] = useState(false);
  const [bgmError, setBgmError] = useState<string | null>(null);
  const bgmUrl = useMemo(
    () => (bgmFile ? URL.createObjectURL(bgmFile) : null),
    [bgmFile],
  );
  useEffect(
    () => () => {
      if (bgmUrl) URL.revokeObjectURL(bgmUrl);
    },
    [bgmUrl],
  );

  // step 4: render
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
  useEffect(
    () => () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    },
    [videoUrl],
  );
  useEffect(() => {
    if (!rendering) return;
    const id = setInterval(() => setNowTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [rendering]);

  const setStep = (key: StepKey, patch: Partial<StepState>) => {
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  };

  // ---------- 사진 핸들러 ----------
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

  // ---------- Step 2: 스크립트 자동 생성 ----------
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
      setStep('script', { status: 'active', detail: 'Claude가 분석 + 카피 작성 중…' });
      const res = await fetch('/api/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName,
          durationSeconds: duration,
          corners: encoded,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '스크립트 생성 실패');

      const segmentsRaw = (data.segments ?? []) as ScriptSegment[];
      // 코너 수와 segments 수 정렬
      const aligned: ScriptSegment[] = photos.map((_, i) => {
        const found =
          segmentsRaw.find((s) => s.cornerIndex === i + 1) ??
          segmentsRaw[i] ??
          ({} as ScriptSegment);
        return {
          cornerIndex: i + 1,
          text: (found.text ?? '').toString(),
          highlight: found.highlight ? String(found.highlight) : undefined,
        };
      });

      setScript({
        hook: String(data.hook ?? ''),
        cta: String(data.cta ?? ''),
        segments: aligned,
      });
      // 음성/렌더 무효화
      setVoice(null);
      setVideoBlob(null);

      setStep('upload', { status: 'complete' });
      setStep('script', { status: 'complete', detail: '편집 가능' });
      setStep('voice', { status: 'active' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '알 수 없는 오류';
      setError(msg);
      setStep('script', { status: 'error', detail: msg });
    } finally {
      setScriptLoading(false);
    }
  };

  // ---------- Step 3: AI 음성 ----------
  // hook → segments[i] → cta 순으로 따로 합성해 각자 길이 측정 후 연결.
  const synthesize = async (text: string): Promise<{ blob: Blob; dur: number }> => {
    const t = text.trim();
    if (!t) return { blob: new Blob([], { type: 'audio/mpeg' }), dur: 0 };
    const res = await fetch('/api/generate-voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        segments: [{ text: t, voiceName: speaker }],
        speakingRate,
        pitch,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || '음성 합성 실패');
    }
    const blob = await res.blob();
    const dur = await probeAudioDuration(blob);
    return { blob, dur };
  };

  const handleGenerateVoice = async () => {
    if (!script) return;
    setError(null);
    setVoiceLoading(true);
    setVoice(null);
    setStep('voice', { status: 'active', detail: 'Hook 합성…' });
    try {
      const blobs: Blob[] = [];
      const hookResult = await synthesize(script.hook);
      blobs.push(hookResult.blob);
      const cornerDurs: number[] = [];
      for (let i = 0; i < script.segments.length; i++) {
        setStep('voice', {
          status: 'active',
          detail: `코너 ${i + 1}/${script.segments.length} 합성…`,
        });
        const { blob, dur } = await synthesize(script.segments[i].text);
        blobs.push(blob);
        cornerDurs.push(dur);
      }
      setStep('voice', { status: 'active', detail: 'CTA 합성…' });
      const ctaResult = await synthesize(script.cta);
      blobs.push(ctaResult.blob);

      const audioBlob = new Blob(blobs, { type: 'audio/mpeg' });
      const totalDur =
        hookResult.dur + cornerDurs.reduce((a, b) => a + b, 0) + ctaResult.dur;

      setVoice({
        audioBlob,
        totalDur,
        hookDur: hookResult.dur,
        cornerDurs,
        ctaDur: ctaResult.dur,
      });
      setVideoBlob(null);
      setStep('voice', {
        status: 'complete',
        detail: `${totalDur.toFixed(1)}초 (hook ${hookResult.dur.toFixed(1)} · cta ${ctaResult.dur.toFixed(1)})`,
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

  // ---------- Step 3-2: BGM 자동 생성 ----------
  const handleGenerateBgm = async () => {
    setError(null);
    setBgmError(null);
    setBgmGenLoading(true);
    try {
      const lengthMs = Math.round(
        (voice ? voice.totalDur : duration) * 1000,
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

  // ---------- Step 4: 렌더 ----------
  // 타임라인 빌더: hook + segments + cta → itemDurations + 절대 시간 phrases.
  const buildRenderTimeline = () => {
    if (!script || !voice) throw new Error('스크립트 또는 음성이 없습니다.');
    const N = photos.length;
    if (N === 0) throw new Error('사진이 없습니다.');
    const cornerDurs = voice.cornerDurs.slice();
    // 코너 수 != 사진 수면 균등 분배로 보정
    if (cornerDurs.length !== N) {
      const remaining = Math.max(
        0.5,
        voice.totalDur - voice.hookDur - voice.ctaDur,
      );
      while (cornerDurs.length < N) cornerDurs.push(remaining / N);
      cornerDurs.length = N;
    }

    const itemDurations = new Array(N).fill(0).map((_, i) => cornerDurs[i]);
    // photo[0]에 hook을 얹고, photo[N-1]에 cta를 얹음
    itemDurations[0] += voice.hookDur;
    itemDurations[N - 1] += voice.ctaDur;

    // 절대 시간 기준 phrase 큐
    const phrases: RenderPhrase[] = [];
    let cursor = voice.hookDur; // 코너 시작점
    for (let i = 0; i < N; i++) {
      const seg = script.segments[i];
      const text = seg?.text ?? '';
      const highlight = seg?.highlight;
      const phraseTexts = splitPhrases(text);
      if (phraseTexts.length === 0) {
        cursor += cornerDurs[i];
        continue;
      }
      const timed = distributeTimings(phraseTexts, cornerDurs[i], cursor);
      // 하이라이트 단어가 포함된 첫 phrase에 highlight 플래그
      let highlighted = !highlight;
      for (const t of timed) {
        const isHi =
          !highlighted && highlight ? t.text.includes(highlight) : false;
        if (isHi) highlighted = true;
        phrases.push({ ...t, highlight: isHi });
      }
      cursor += cornerDurs[i];
    }

    const hookStart = 0;
    const hookEnd = voice.hookDur;
    const ctaEnd = voice.totalDur;
    const ctaStart = voice.totalDur - voice.ctaDur;

    return {
      itemDurations,
      phrases,
      hookStart,
      hookEnd,
      ctaStart,
      ctaEnd,
    };
  };

  const handleRender = async () => {
    if (!voice || !script) return;
    setError(null);
    setRendering(true);
    setVideoBlob(null);
    setRenderRatio(0);
    setRenderMessage('준비 중…');
    setRenderStartedAt(Date.now());
    setStep('render', { status: 'active', detail: '렌더링 시작' });
    try {
      const { itemDurations, phrases, hookStart, hookEnd, ctaStart, ctaEnd } =
        buildRenderTimeline();
      const blob = await renderVideo(
        {
          items: photos.map((p) => ({ file: p.file, kind: p.kind })),
          itemDurations,
          phrases,
          hookText: script.hook,
          hookStart,
          hookEnd,
          ctaText: script.cta,
          ctaStart,
          ctaEnd,
          audio: voice.audioBlob,
          audioDurationSec: voice.totalDur,
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

  // 스크립트 수정
  const updateHook = (v: string) =>
    setScript((s) => (s ? { ...s, hook: v } : s));
  const updateCta = (v: string) =>
    setScript((s) => (s ? { ...s, cta: v } : s));
  const updateSegment = (i: number, patch: Partial<ScriptSegment>) =>
    setScript((s) =>
      s
        ? {
            ...s,
            segments: s.segments.map((seg, idx) =>
              idx === i ? { ...seg, ...patch } : seg,
            ),
          }
        : s,
    );

  const estTotal = voice
    ? estimateRenderSeconds(photos.length, voice.totalDur)
    : 0;
  const elapsed = renderStartedAt ? (Date.now() - renderStartedAt) / 1000 : 0;
  const etaRemain = (() => {
    if (!rendering || !renderStartedAt) return null;
    if (renderRatio > 0.05) {
      const projected = elapsed / renderRatio;
      return Math.max(1, Math.ceil(projected - elapsed));
    }
    return Math.max(1, estTotal - Math.floor(elapsed));
  })();
  void nowTick;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">
          마트 숏츠 메이커 🎬
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          유튜브 숏츠 전문가 패턴 — 3초 후킹 · 카라오케 자막 · 블러 커버 · CTA — 으로 1080×1920 MP4를 자동 생성합니다.
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

      {/* Step 1 */}
      <section className="card mb-6">
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="label">매장명 (선택)</label>
            <input
              className="input"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="예: 행복마트 강남점"
            />
          </div>
          <div>
            <label className="label">길이</label>
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
        </div>
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="label">
              발화 속도 ({speakingRate.toFixed(2)}x · 숏츠 권장 1.05~1.15)
            </label>
            <input
              type="range"
              min={0.8}
              max={1.4}
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
        <PhotoUploader
          photos={photos}
          onAdd={onAdd}
          onUpdate={onUpdate}
          onRemove={onRemove}
          onReorder={onReorder}
        />
      </section>

      {/* Step 2: 스크립트 (구조화 편집) */}
      <section className="card mb-6">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">2. 숏츠 스크립트</h2>
            <p className="text-sm text-gray-500">
              Claude가 사진을 분석해 <b>hook · 코너 카피 · CTA</b>를 짚어줍니다. 각각 직접 수정 가능.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={!cornersReady || scriptLoading}
            onClick={handleGenerateScript}
          >
            {scriptLoading ? '생성 중…' : script ? '다시 생성' : '자동 생성'}
          </button>
        </div>

        {script ? (
          <div className="space-y-4">
            <div>
              <label className="label">
                🪝 HOOK (첫 ~3초, 12자 이내 권장)
              </label>
              <input
                className="input text-base font-semibold"
                value={script.hook}
                onChange={(e) => updateHook(e.target.value)}
                placeholder="이거 모르면 손해예요"
              />
              <div className="mt-1 text-right text-xs text-gray-500">
                {script.hook.length}자
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-gray-100 p-3">
              <div className="text-sm font-semibold text-gray-700">
                🎬 코너 ({script.segments.length}개)
              </div>
              {script.segments.map((seg, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_180px]">
                  <div>
                    <label className="label">
                      코너 {i + 1} 카피
                    </label>
                    <textarea
                      className="input min-h-[64px]"
                      value={seg.text}
                      onChange={(e) =>
                        updateSegment(i, { text: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="label">강조어 (노란색)</label>
                    <input
                      className="input"
                      value={seg.highlight ?? ''}
                      onChange={(e) =>
                        updateSegment(i, {
                          highlight: e.target.value.trim() || undefined,
                        })
                      }
                      placeholder="예: 9,900원"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div>
              <label className="label">
                📣 CTA (마지막 ~2초, 12자 이내 권장)
              </label>
              <input
                className="input text-base font-semibold"
                value={script.cta}
                onChange={(e) => updateCta(e.target.value)}
                placeholder="지금 행복마트로!"
              />
              <div className="mt-1 text-right text-xs text-gray-500">
                {script.cta.length}자
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
            먼저 사진을 추가하고 <b>자동 생성</b> 버튼을 눌러주세요.
          </div>
        )}
      </section>

      {/* Step 3: 음성 */}
      <section className="card mb-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">3. AI 음성</h2>
            <p className="text-sm text-gray-500">
              hook · 코너 · cta를 각자 합성해 길이 측정 후 연결합니다.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={!script || voiceLoading}
            onClick={handleGenerateVoice}
          >
            {voiceLoading ? '합성 중…' : voice ? '다시 합성' : '음성 합성'}
          </button>
        </div>
        {voice ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-xs text-gray-700">
              <div className="rounded bg-gray-50 px-2 py-1">
                hook · <b>{voice.hookDur.toFixed(2)}s</b>
              </div>
              <div className="rounded bg-gray-50 px-2 py-1">
                코너 ({voice.cornerDurs.length}) ·{' '}
                <b>
                  {voice.cornerDurs.reduce((a, b) => a + b, 0).toFixed(2)}s
                </b>
              </div>
              <div className="rounded bg-gray-50 px-2 py-1">
                cta · <b>{voice.ctaDur.toFixed(2)}s</b>
              </div>
            </div>
            {audioUrl ? (
              <audio className="w-full" controls src={audioUrl} />
            ) : null}
          </div>
        ) : null}
      </section>

      {/* Step 3-2: BGM */}
      <section className="card mb-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">3-2. 배경음악 (선택)</h2>
            <p className="text-sm text-gray-500">
              음성에 자동 믹스 · 음성 길이에 맞춰 루프 + 페이드 인/아웃.
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
              ✨ AI 생성
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
                저작권 무료:{' '}
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
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="label">음악 프롬프트 (영어가 좋음)</label>
              <textarea
                className="input min-h-[88px]"
                value={bgmPrompt}
                onChange={(e) => setBgmPrompt(e.target.value)}
              />
              <div className="mt-1 text-xs text-gray-500">
                길이는 합성된 음성 길이에 맞춰 자동 요청. ElevenLabs API 키가 필요합니다.
              </div>
            </div>
            <button
              type="button"
              className="btn-primary"
              disabled={!bgmPrompt.trim() || bgmGenLoading}
              onClick={handleGenerateBgm}
            >
              {bgmGenLoading
                ? 'AI 음악 생성 중… (20~40초)'
                : bgmFile
                  ? '다시 생성'
                  : '음악 생성하기'}
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
                BGM 볼륨 ({Math.round(bgmVolume * 100)}%)
              </label>
              <input
                type="range"
                min={0}
                max={0.5}
                step={0.02}
                value={bgmVolume}
                onChange={(e) => setBgmVolume(Number(e.target.value))}
                className="w-full"
              />
              <div className="mt-1 text-xs text-gray-500">
                숏츠 권장: 12~18%. 그 이상이면 나레이션이 묻힙니다.
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500">
            배경음악 없이도 영상 생성 가능.
          </div>
        )}
      </section>

      {/* Step 4: 렌더 */}
      <section className="card mb-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">4. 영상 렌더링</h2>
            <p className="text-sm text-gray-500">
              FFmpeg WASM이 브라우저에서 1080×1920 MP4를 인코딩합니다.
              {voice ? (
                <>
                  {' '}
                  · 예상 약 <b>{estTotal}초</b> · 음성 {voice.totalDur.toFixed(1)}초
                </>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={!voice || rendering || photos.length === 0}
            onClick={handleRender}
          >
            {rendering ? '렌더링 중…' : videoBlob ? '다시 렌더링' : '렌더링 시작'}
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
                  ? `경과 ${Math.floor(elapsed)}s${etaRemain != null ? ` · 남은 ~${etaRemain}s` : ''}`
                  : '완료'}
              </span>
            </div>
          </div>
        ) : null}
      </section>

      {/* Step 5: 다운로드 */}
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
                9:16 1080×1920 MP4 · {(videoBlob.size / 1024 / 1024).toFixed(1)} MB ·{' '}
                {voice?.totalDur.toFixed(1)}초
              </p>
              <button className="btn-primary" onClick={handleDownload}>
                ⬇︎ MP4 다운로드
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <footer className="mt-10 text-center text-xs text-gray-400">
        ffmpeg.wasm은 브라우저에서 동작합니다 · COOP/COEP cross-origin isolated 필요 (next.config.js 설정됨)
      </footer>
    </main>
  );
}
