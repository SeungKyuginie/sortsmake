'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { encodeImageForClaude, encodeVideoFirstFrame } from './encodeImage';
import { BgmLibrary } from './BgmLibrary';
import { PhotoUploader } from './PhotoUploader';
import { LogoutButton } from './LogoutButton';
import { getMyStoreName } from './me-actions';
import {
  loadCloudState,
  saveCloudState,
  clearCloudState,
  type CloudState,
} from './cloud-actions';
import { StepIndicator } from './StepIndicator';
import { VoicePreviewButton } from './VoicePreviewButton';
import { clearAll, loadItem, saveItem } from './storage';
import {
  estimateRenderSeconds,
  probeAudioDuration,
  renderVideo,
  type RenderPhrase,
} from './renderVideo';
import { renderOnCloud } from './renderCloud';
import type {
  CornerPhoto,
  ScriptSegment,
  ShortsScript,
  StepKey,
  StepState,
} from './types';

// Google TTS Chirp3-HD (2024 신모델) — WaveNet보다 표현력·활기 톤이 훨씬 강함.
// 숏츠 retention에 유리하므로 Chirp3-HD를 기본 권장.
type SpeakerOption = { id: string; label: string };
type SpeakerGroup = { group: string; voices: SpeakerOption[] };

const SPEAKER_GROUPS: SpeakerGroup[] = [
  {
    group: '📺 Neural2 (아나운서 톤, 또박또박)',
    voices: [
      { id: 'ko-KR-Neural2-A', label: 'Neural2 A (여성, 아나운서)' },
      { id: 'ko-KR-Neural2-B', label: 'Neural2 B (여성, 차분 진행자)' },
      { id: 'ko-KR-Neural2-C', label: 'Neural2 C (남성, 뉴스 앵커)' },
    ],
  },
  {
    group: '🔥 Chirp3-HD 여성 (발랄·표현력)',
    voices: [
      { id: 'ko-KR-Chirp3-HD-Aoede', label: 'Aoede (명랑)' },
      { id: 'ko-KR-Chirp3-HD-Kore', label: 'Kore (밝음)' },
      { id: 'ko-KR-Chirp3-HD-Leda', label: 'Leda (발랄/소녀)' },
      { id: 'ko-KR-Chirp3-HD-Zephyr', label: 'Zephyr (청량)' },
      { id: 'ko-KR-Chirp3-HD-Achernar', label: 'Achernar (부드러움)' },
      { id: 'ko-KR-Chirp3-HD-Autonoe', label: 'Autonoe (따뜻)' },
      { id: 'ko-KR-Chirp3-HD-Callirrhoe', label: 'Callirrhoe (차분)' },
      { id: 'ko-KR-Chirp3-HD-Despina', label: 'Despina (또렷)' },
      { id: 'ko-KR-Chirp3-HD-Erinome', label: 'Erinome (가벼움)' },
      { id: 'ko-KR-Chirp3-HD-Gacrux', label: 'Gacrux (성숙)' },
      { id: 'ko-KR-Chirp3-HD-Laomedeia', label: 'Laomedeia (활기)' },
      { id: 'ko-KR-Chirp3-HD-Pulcherrima', label: 'Pulcherrima (감성)' },
      { id: 'ko-KR-Chirp3-HD-Sulafat', label: 'Sulafat (안정)' },
      { id: 'ko-KR-Chirp3-HD-Vindemiatrix', label: 'Vindemiatrix (성숙)' },
    ],
  },
  {
    group: '🔥 Chirp3-HD 남성 (다양한 톤)',
    voices: [
      { id: 'ko-KR-Chirp3-HD-Charon', label: 'Charon (활기)' },
      { id: 'ko-KR-Chirp3-HD-Fenrir', label: 'Fenrir (강한 톤)' },
      { id: 'ko-KR-Chirp3-HD-Puck', label: 'Puck (장난기)' },
      { id: 'ko-KR-Chirp3-HD-Orus', label: 'Orus (안정)' },
      { id: 'ko-KR-Chirp3-HD-Achird', label: 'Achird (또렷)' },
      { id: 'ko-KR-Chirp3-HD-Algenib', label: 'Algenib (낮음)' },
      { id: 'ko-KR-Chirp3-HD-Algieba', label: 'Algieba (중후)' },
      { id: 'ko-KR-Chirp3-HD-Alnilam', label: 'Alnilam (부드러움)' },
      { id: 'ko-KR-Chirp3-HD-Enceladus', label: 'Enceladus (성숙)' },
      { id: 'ko-KR-Chirp3-HD-Iapetus', label: 'Iapetus (깊음)' },
      { id: 'ko-KR-Chirp3-HD-Rasalgethi', label: 'Rasalgethi (명료)' },
      { id: 'ko-KR-Chirp3-HD-Sadachbia', label: 'Sadachbia (밝음)' },
      { id: 'ko-KR-Chirp3-HD-Sadaltager', label: 'Sadaltager (차분)' },
      { id: 'ko-KR-Chirp3-HD-Schedar', label: 'Schedar (안정)' },
      { id: 'ko-KR-Chirp3-HD-Umbriel', label: 'Umbriel (저음)' },
      { id: 'ko-KR-Chirp3-HD-Zubenelgenubi', label: 'Zubenelgenubi (선명)' },
    ],
  },
  {
    group: '🎙 WaveNet (안정, 차분)',
    voices: [
      { id: 'ko-KR-Wavenet-A', label: 'WaveNet A (여성, 차분)' },
      { id: 'ko-KR-Wavenet-B', label: 'WaveNet B (여성, 보통)' },
      { id: 'ko-KR-Wavenet-C', label: 'WaveNet C (남성, 차분)' },
      { id: 'ko-KR-Wavenet-D', label: 'WaveNet D (남성, 보통)' },
    ],
  },
  {
    group: '📦 Standard (저비용 기본 음성)',
    voices: [
      { id: 'ko-KR-Standard-A', label: 'Standard A (여성)' },
      { id: 'ko-KR-Standard-B', label: 'Standard B (여성)' },
      { id: 'ko-KR-Standard-C', label: 'Standard C (남성)' },
      { id: 'ko-KR-Standard-D', label: 'Standard D (남성)' },
    ],
  },
];

const ALL_SPEAKERS: SpeakerOption[] = SPEAKER_GROUPS.flatMap((g) => g.voices);
const isChirpVoice = (id: string) => id.includes('Chirp');

const INITIAL_STEPS: StepState[] = [
  { key: 'upload', label: '사진/코너 입력', status: 'active' },
  { key: 'script', label: '숏츠 스크립트', status: 'idle' },
  { key: 'voice', label: '음성 생성', status: 'idle' },
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
  const [storeNameLocked, setStoreNameLocked] = useState(false);
  const [photos, setPhotos] = useState<CornerPhoto[]>([]);
  const [duration, setDuration] = useState(30);
  // 프레임 스타일: cover(꽉 채우기, 현재 동작) / blur(블러 액자 + 풀 가로 패닝)
  const [frameStyle, setFrameStyle] = useState<'cover' | 'blur'>('cover');
  // 패닝 속도: 0(정적) ~ 1(최대) — cover/blur 모드 공통
  const [panRatio, setPanRatio] = useState(0.6);
  // 출력 해상도: 720p 기본 (모바일 시청 충분 + 빠른 렌더링). 1080p는 옵션.
  const [resolution, setResolution] = useState<'1080p' | '720p'>('720p');
  // 렌더링 모드: browser(브라우저 ffmpeg.wasm) / server(Cloud Run, 폰에서도 빠름)
  // Phase 2A: server 모드는 자막/블러/드론/BGM 미지원 (cover 모드만).
  const [renderMode, setRenderMode] = useState<'browser' | 'server'>('browser');

  // common voice — Chirp3-HD Leda(발랄/소녀)를 기본값으로
  const [speaker, setSpeaker] = useState('ko-KR-Chirp3-HD-Leda');
  const [speakingRate, setSpeakingRate] = useState(1.1);
  const [pitch, setPitch] = useState(0);

  // 보이스 다양화 모드: hook · 각 코너 · cta마다 다른 보이스 지정
  const [multiVoice, setMultiVoice] = useState(false);
  const [hookVoice, setHookVoice] = useState<string | undefined>(undefined);
  const [ctaVoice, setCtaVoice] = useState<string | undefined>(undefined);
  const [cornerVoices, setCornerVoices] = useState<(string | undefined)[]>([]);

  const resolveVoice = (override: string | undefined) =>
    override && override.trim() ? override : speaker;

  const updateCornerVoice = (i: number, v: string | undefined) =>
    setCornerVoices((prev) => {
      const next = [...prev];
      while (next.length <= i) next.push(undefined);
      next[i] = v;
      return next;
    });

  const renderVoiceOptions = () =>
    SPEAKER_GROUPS.map((g) => (
      <optgroup key={g.group} label={g.group}>
        {g.voices.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </optgroup>
    ));

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
  const [bgmMode, setBgmMode] = useState<'library' | 'upload' | 'ai'>('library');
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

  // ---------- 작업 상태 저장/복원 (IndexedDB) ----------
  // 페이지 새로고침해도 작업이 유지됨. 초기화 버튼으로만 삭제.
  type SerializedPhoto = {
    id: string;
    file: File;
    kind: 'image' | 'video';
    cornerName: string;
    description: string;
    droneShot?: boolean;
    originalFile?: File;
    originalKind?: 'image' | 'video';
  };

  const [hydrated, setHydrated] = useState(false);

  // 마운트 시: 모든 상태를 IndexedDB에서 복원
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [
        sStoreName, sDuration, sFrameStyle, sPanRatio, sResolution, sRenderMode, sPhotos,
        sSpeaker, sRate, sPitch,
        sMultiVoice, sHookVoice, sCtaVoice, sCornerVoices,
        sScript, sVoice,
        sBgmMode, sBgmFile, sBgmVolume, sBgmPrompt,
        sVideoBlob,
      ] = await Promise.all([
        loadItem<string>('storeName'),
        loadItem<number>('duration'),
        loadItem<'cover' | 'blur'>('frameStyle'),
        loadItem<number>('panRatio'),
        loadItem<'1080p' | '720p'>('resolution'),
        loadItem<'browser' | 'server'>('renderMode'),
        loadItem<SerializedPhoto[]>('photos'),
        loadItem<string>('speaker'),
        loadItem<number>('speakingRate'),
        loadItem<number>('pitch'),
        loadItem<boolean>('multiVoice'),
        loadItem<string | null>('hookVoice'),
        loadItem<string | null>('ctaVoice'),
        loadItem<(string | undefined)[]>('cornerVoices'),
        loadItem<ShortsScript>('script'),
        loadItem<VoiceTimeline>('voice'),
        loadItem<'library' | 'upload' | 'ai'>('bgmMode'),
        loadItem<File>('bgmFile'),
        loadItem<number>('bgmVolume'),
        loadItem<string>('bgmPrompt'),
        loadItem<Blob>('videoBlob'),
      ]);
      if (cancelled) return;

      if (sStoreName) setStoreName(sStoreName);
      if (typeof sDuration === 'number') setDuration(sDuration);
      if (sFrameStyle === 'cover' || sFrameStyle === 'blur') setFrameStyle(sFrameStyle);
      if (typeof sPanRatio === 'number' && sPanRatio >= 0 && sPanRatio <= 1) setPanRatio(sPanRatio);
      if (sResolution === '1080p' || sResolution === '720p') setResolution(sResolution);
      if (sRenderMode === 'browser' || sRenderMode === 'server') setRenderMode(sRenderMode);
      if (sPhotos && sPhotos.length) {
        setPhotos(
          sPhotos.map((p) => ({
            ...p,
            previewUrl: URL.createObjectURL(p.file),
            originalPreviewUrl: p.originalFile
              ? URL.createObjectURL(p.originalFile)
              : undefined,
            droneAiStatus: p.droneShot ? 'ready' : 'idle',
          })),
        );
      }
      if (sSpeaker) setSpeaker(sSpeaker);
      if (typeof sRate === 'number') setSpeakingRate(sRate);
      if (typeof sPitch === 'number') setPitch(sPitch);
      if (typeof sMultiVoice === 'boolean') setMultiVoice(sMultiVoice);
      if (sHookVoice) setHookVoice(sHookVoice);
      if (sCtaVoice) setCtaVoice(sCtaVoice);
      if (sCornerVoices) setCornerVoices(sCornerVoices);
      if (sScript) setScript(sScript);
      if (sVoice) setVoice(sVoice);
      if (sBgmMode) setBgmMode(sBgmMode);
      if (sBgmFile) setBgmFile(sBgmFile);
      if (typeof sBgmVolume === 'number') setBgmVolume(sBgmVolume);
      if (sBgmPrompt) setBgmPrompt(sBgmPrompt);
      if (sVideoBlob) setVideoBlob(sVideoBlob);

      // 단계 표시 자동 복원 — 어디까지 진행됐는지 추론
      const nextSteps = [...INITIAL_STEPS];
      if (sPhotos && sPhotos.length) nextSteps[0] = { ...nextSteps[0], status: 'complete' };
      if (sScript) nextSteps[1] = { ...nextSteps[1], status: 'complete', detail: '편집 가능' };
      if (sVoice) nextSteps[2] = { ...nextSteps[2], status: 'complete', detail: `${sVoice.totalDur.toFixed(1)}초` };
      if (sVideoBlob) {
        nextSteps[3] = { ...nextSteps[3], status: 'complete' };
        nextSteps[4] = { ...nextSteps[4], status: 'complete', detail: '다운로드 준비됨' };
      }
      // 가장 최근 미완료 단계를 active로
      const firstIdle = nextSteps.findIndex((s) => s.status === 'idle');
      if (firstIdle >= 0) nextSteps[firstIdle].status = 'active';
      setSteps(nextSteps);

      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 로그인 사용자의 매장명을 Supabase 메타데이터에서 가져와 자동 채우기 (덮어쓰기 + 잠금)
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
        // 비로그인/오류 시 잠금 없이 사용 가능
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 클라우드 동기화 1회 로드 (디바이스 이동 지원). IndexedDB 하이드레이션 이후 1회.
  const [cloudHydrated, setCloudHydrated] = useState(false);
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
        // 텍스트/메타만 복원. 사진/음성 blob은 향후 단계에서 처리.
        if (
          state.storeNameOverride !== undefined &&
          !storeNameLocked
        )
          setStoreName(state.storeNameOverride);
        if (state.duration !== undefined) setDuration(state.duration);
        if (
          state.frameStyle === 'cover' ||
          state.frameStyle === 'blur'
        )
          setFrameStyle(state.frameStyle);
        if (state.panRatio !== undefined) setPanRatio(state.panRatio);
        if (state.resolution === '720p' || state.resolution === '1080p')
          setResolution(state.resolution);
        if (state.renderMode === 'browser' || state.renderMode === 'server')
          setRenderMode(state.renderMode);
        if (state.voiceId) setSpeaker(state.voiceId);
        if (state.voiceVarietyEnabled !== undefined)
          setMultiVoice(state.voiceVarietyEnabled);
        if (state.hookVoiceId !== undefined) setHookVoice(state.hookVoiceId);
        if (state.ctaVoiceId !== undefined) setCtaVoice(state.ctaVoiceId);
        if (state.bgmVolume !== undefined) setBgmVolume(state.bgmVolume);
        if (
          state.bgmMode === 'library' ||
          state.bgmMode === 'upload' ||
          state.bgmMode === 'ai'
        )
          setBgmMode(state.bgmMode);
        if (state.script) setScript(state.script as ShortsScript);
      } catch {
        // 동기화 실패 시 IndexedDB 로컬 데이터로 폴백
      } finally {
        if (!cancelled) setCloudHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // 텍스트 상태 변경 시 클라우드에 디바운스 저장 (500ms)
  const latestCloudPayloadRef = useRef<CloudState | null>(null);
  useEffect(() => {
    if (!cloudHydrated) return;
    const payload: CloudState = {
      storeNameOverride: storeNameLocked ? undefined : storeName,
      duration,
      frameStyle,
      panRatio,
      resolution,
      renderMode,
      voiceId: speaker,
      voiceVarietyEnabled: multiVoice,
      hookVoiceId: hookVoice,
      ctaVoiceId: ctaVoice,
      bgmVolume,
      bgmMode,
      script: script ?? undefined,
    };
    latestCloudPayloadRef.current = payload;
    const t = setTimeout(() => {
      saveCloudState(payload).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [
    cloudHydrated,
    storeName,
    storeNameLocked,
    duration,
    frameStyle,
    panRatio,
    resolution,
    renderMode,
    speaker,
    multiVoice,
    hookVoice,
    ctaVoice,
    bgmVolume,
    bgmMode,
    script,
  ]);

  // 로그아웃/페이지 이탈 직전 강제 flush. LogoutButton/beforeunload에서 호출.
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

  // 상태 변화 시 자동 저장 (하이드레이션 이후만)
  useEffect(() => { if (hydrated) saveItem('storeName', storeName); }, [hydrated, storeName]);
  useEffect(() => { if (hydrated) saveItem('duration', duration); }, [hydrated, duration]);
  useEffect(() => { if (hydrated) saveItem('frameStyle', frameStyle); }, [hydrated, frameStyle]);
  useEffect(() => { if (hydrated) saveItem('panRatio', panRatio); }, [hydrated, panRatio]);
  useEffect(() => { if (hydrated) saveItem('resolution', resolution); }, [hydrated, resolution]);
  useEffect(() => { if (hydrated) saveItem('renderMode', renderMode); }, [hydrated, renderMode]);
  useEffect(() => {
    if (!hydrated) return;
    const toSave: SerializedPhoto[] = photos.map((p) => ({
      id: p.id,
      file: p.file,
      kind: p.kind,
      cornerName: p.cornerName,
      description: p.description,
      droneShot: p.droneShot,
      originalFile: p.originalFile,
      originalKind: p.originalKind,
    }));
    saveItem('photos', toSave);
  }, [hydrated, photos]);
  useEffect(() => { if (hydrated) saveItem('speaker', speaker); }, [hydrated, speaker]);
  useEffect(() => { if (hydrated) saveItem('speakingRate', speakingRate); }, [hydrated, speakingRate]);
  useEffect(() => { if (hydrated) saveItem('pitch', pitch); }, [hydrated, pitch]);
  useEffect(() => { if (hydrated) saveItem('multiVoice', multiVoice); }, [hydrated, multiVoice]);
  useEffect(() => { if (hydrated) saveItem('hookVoice', hookVoice ?? null); }, [hydrated, hookVoice]);
  useEffect(() => { if (hydrated) saveItem('ctaVoice', ctaVoice ?? null); }, [hydrated, ctaVoice]);
  useEffect(() => { if (hydrated) saveItem('cornerVoices', cornerVoices); }, [hydrated, cornerVoices]);
  useEffect(() => { if (hydrated) saveItem('script', script); }, [hydrated, script]);
  useEffect(() => { if (hydrated) saveItem('voice', voice); }, [hydrated, voice]);
  useEffect(() => { if (hydrated) saveItem('bgmMode', bgmMode); }, [hydrated, bgmMode]);
  useEffect(() => { if (hydrated) saveItem('bgmFile', bgmFile); }, [hydrated, bgmFile]);
  useEffect(() => { if (hydrated) saveItem('bgmVolume', bgmVolume); }, [hydrated, bgmVolume]);
  useEffect(() => { if (hydrated) saveItem('bgmPrompt', bgmPrompt); }, [hydrated, bgmPrompt]);
  useEffect(() => { if (hydrated) saveItem('videoBlob', videoBlob); }, [hydrated, videoBlob]);

  // 초기화: 모든 작업 상태 삭제 후 기본값으로 리셋
  const handleReset = async () => {
    if (!window.confirm('지금까지 작업한 모든 내용(사진·스크립트·음성·배경음악·영상)을 삭제하시겠습니까?')) {
      return;
    }
    await clearAll();
    clearCloudState().catch(() => {});
    // 블롭 URL 정리
    for (const p of photos) {
      if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      if (p.originalPreviewUrl) URL.revokeObjectURL(p.originalPreviewUrl);
    }
    // 상태 리셋
    setStoreName('');
    setDuration(30);
    setFrameStyle('cover');
    setPanRatio(0.6);
    setResolution('720p');
    setRenderMode('browser');
    setPhotos([]);
    setSpeaker('ko-KR-Chirp3-HD-Leda');
    setSpeakingRate(1.1);
    setPitch(0);
    setMultiVoice(false);
    setHookVoice(undefined);
    setCtaVoice(undefined);
    setCornerVoices([]);
    setScript(null);
    setVoice(null);
    setBgmMode('upload');
    setBgmFile(null);
    setBgmVolume(0.16);
    setBgmPrompt(
      'Upbeat, cheerful Korean retail store background music. Light percussion, bright marimba, friendly and energetic. Instrumental only.',
    );
    setVideoBlob(null);
    setSteps(INITIAL_STEPS);
    setError(null);
  };

  const setStep = (key: StepKey, patch: Partial<StepState>) => {
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  };

  // ---------- 사진 핸들러 ----------
  const probeMediaSize = async (
    file: File,
    kind: 'image' | 'video',
  ): Promise<{ width?: number; height?: number }> => {
    try {
      if (kind === 'image') {
        const bmp = await createImageBitmap(file);
        const dim = { width: bmp.width, height: bmp.height };
        bmp.close?.();
        return dim;
      }
      // video — load metadata to read videoWidth/videoHeight
      const url = URL.createObjectURL(file);
      try {
        const v = document.createElement('video');
        v.src = url;
        v.preload = 'metadata';
        v.muted = true;
        await new Promise<void>((resolve, reject) => {
          v.addEventListener('loadedmetadata', () => resolve(), { once: true });
          v.addEventListener('error', () => reject(new Error('video probe failed')), { once: true });
        });
        return { width: v.videoWidth, height: v.videoHeight };
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      return {};
    }
  };

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

  // 드론샷 생성 — Gemini가 사진을 항공 시점으로 변환 + ffmpeg 줌아웃 효과
  const onGenerateDrone = async (id: string) => {
    const target = photos.find((p) => p.id === id);
    if (!target || target.kind !== 'image') return;

    setPhotos((p) =>
      p.map((x) =>
        x.id === id
          ? { ...x, droneAiStatus: 'generating', droneAiError: undefined }
          : x,
      ),
    );

    try {
      const { base64, mediaType } = await encodeImageForClaude(target.file);

      const res = await fetch('/api/generate-drone-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `드론샷 생성 실패 (${res.status})`);
      }
      const data = (await res.json()) as {
        imageBase64: string;
        mediaType: string;
      };

      // base64 → File
      const binary = atob(data.imageBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const ext = data.mediaType === 'image/jpeg' ? 'jpg' : 'png';
      const newFile = new File(
        [bytes],
        `drone-${target.id}-${Date.now()}.${ext}`,
        { type: data.mediaType },
      );
      const localUrl = URL.createObjectURL(newFile);

      setPhotos((p) =>
        p.map((x) =>
          x.id === id
            ? {
                ...x,
                originalFile: x.originalFile ?? x.file,
                originalPreviewUrl: x.originalPreviewUrl ?? x.previewUrl,
                originalKind: x.originalKind ?? x.kind,
                file: newFile,
                previewUrl: localUrl,
                kind: 'image',
                droneShot: true,
                droneAiStatus: 'ready',
                droneAiError: undefined,
              }
            : x,
        ),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : '드론샷 생성 실패';
      setPhotos((p) =>
        p.map((x) =>
          x.id === id
            ? { ...x, droneAiStatus: 'error', droneAiError: msg }
            : x,
        ),
      );
    }
  };

  // 드론샷 취소 — 원본 사진으로 되돌리기
  const onCancelDrone = (id: string) => {
    setPhotos((p) =>
      p.map((x) => {
        if (x.id !== id) return x;
        if (!x.originalFile || !x.originalPreviewUrl) {
          // 원본이 없으면 그냥 플래그만 끄기 (예외 케이스)
          return { ...x, droneShot: false, droneAiStatus: 'idle', droneAiError: undefined };
        }
        if (x.previewUrl !== x.originalPreviewUrl) {
          URL.revokeObjectURL(x.previewUrl);
        }
        return {
          ...x,
          file: x.originalFile,
          previewUrl: x.originalPreviewUrl,
          kind: x.originalKind ?? 'image',
          droneShot: false,
          droneAiStatus: 'idle',
          droneAiError: undefined,
          originalFile: undefined,
          originalPreviewUrl: undefined,
          originalKind: undefined,
        };
      }),
    );
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
      setStep('script', { status: 'active', detail: '이미지 분석 + 카피 작성 중…' });
      const res = await fetch('/api/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName,
          durationSeconds: duration,
          speakingRate,
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
  const synthesize = async (
    text: string,
    voiceName: string = speaker,
  ): Promise<{ blob: Blob; dur: number }> => {
    const t = text.trim();
    if (!t) return { blob: new Blob([], { type: 'audio/mpeg' }), dur: 0 };
    const res = await fetch('/api/generate-voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        segments: [{ text: t, voiceName }],
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
      const useMulti = multiVoice;
      const hookV = useMulti ? resolveVoice(hookVoice) : speaker;
      const ctaV = useMulti ? resolveVoice(ctaVoice) : speaker;
      const hookResult = await synthesize(script.hook, hookV);
      blobs.push(hookResult.blob);
      const cornerDurs: number[] = [];
      for (let i = 0; i < script.segments.length; i++) {
        setStep('voice', {
          status: 'active',
          detail: `코너 ${i + 1}/${script.segments.length} 합성…`,
        });
        const cornerV = useMulti
          ? resolveVoice(cornerVoices[i])
          : speaker;
        const { blob, dur } = await synthesize(script.segments[i].text, cornerV);
        blobs.push(blob);
        cornerDurs.push(dur);
      }
      setStep('voice', { status: 'active', detail: 'CTA 합성…' });
      const ctaResult = await synthesize(script.cta, ctaV);
      blobs.push(ctaResult.blob);

      const audioBlob = new Blob(blobs, { type: 'audio/mpeg' });
      const summedDur =
        hookResult.dur + cornerDurs.reduce((a, b) => a + b, 0) + ctaResult.dur;
      // MP3 단순 concat 시 합본 길이가 개별 합보다 살짝 길어질 수 있음.
      // 실제 길이를 다시 측정해 누락분을 ctaDur에 흡수 → 영상이 음성보다 먼저 끝나는 문제 방지.
      let totalDur = summedDur;
      let ctaDur = ctaResult.dur;
      try {
        const actualTotal = await probeAudioDuration(audioBlob);
        if (actualTotal > summedDur + 0.001) {
          ctaDur += actualTotal - summedDur;
          totalDur = actualTotal;
        }
      } catch {
        /* probe 실패 시 summed 값 사용 */
      }

      setVoice({
        audioBlob,
        totalDur,
        hookDur: hookResult.dur,
        cornerDurs,
        ctaDur,
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
      const text = (seg?.text ?? '').trim();
      // 코너 자막은 전체를 한 블록으로 — 코너 길이 동안 통째로 표시.
      // (예전엔 글자수 비례로 phrase를 잘랐는데 TTS 발음 속도와 어긋남)
      if (text) {
        phrases.push({
          text,
          start: cursor,
          end: cursor + cornerDurs[i],
          highlight: false,
        });
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

      // 렌더링 직전에 width/height 누락된 사진은 다시 측정 (블러 조건 보장)
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

      let blob: Blob;
      if (renderMode === 'server') {
        // 서버 렌더링 (Cloud Run) — 풀 기능: 자막/블러/드론/BGM 모두 지원
        blob = await renderOnCloud(
          {
            items: photosForRender.map((p) => ({
              file: p.file,
              kind: p.kind,
              width: p.width,
              height: p.height,
              droneShot: p.droneShot,
            })),
            itemDurations,
            frameStyle,
            panRatio,
            resolution,
            audio: voice.audioBlob,
            audioDurationSec: voice.totalDur,
            bgm: bgmFile,
            bgmVolume,
            hookText: script.hook,
            hookStart,
            hookEnd,
            ctaText: script.cta,
            ctaStart,
            ctaEnd,
            phrases,
          },
          ({ ratio, message }) => {
            setRenderRatio(ratio);
            setRenderMessage(message);
          },
        );
      } else {
        // 브라우저 렌더링 (ffmpeg.wasm) — 모든 기능 사용 가능
        blob = await renderVideo(
          {
            items: photosForRender.map((p) => ({
              file: p.file,
              kind: p.kind,
              width: p.width,
              height: p.height,
            })),
            itemDurations,
            droneShots: photosForRender.map((p) => p.droneShot ?? false),
            frameStyle,
            panRatio,
            resolution,
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
      }
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
    const safeStore = (storeName || 'mart').replace(/[^\w가-힣-]/g, '_');
    const filename = `${safeStore}_shorts_${Date.now()}.mp4`;
    // type이 누락된 blob은 다운로드가 막힐 수 있으므로 video/mp4로 재포장
    const dlBlob =
      videoBlob.type === 'video/mp4'
        ? videoBlob
        : new Blob([videoBlob], { type: 'video/mp4' });
    const url = URL.createObjectURL(dlBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 1500);
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
    // 인코딩이 실제로 시작된 이후(>=0.22)에만 ETA 계산. 그 전 단계의 ratio는
    // 임의 값이라 ETA가 misleading 함.
    if (renderRatio >= 0.22) {
      const projected = elapsed / renderRatio;
      return Math.max(1, Math.ceil(projected - elapsed));
    }
    return Math.max(1, estTotal - Math.floor(elapsed));
  })();
  void nowTick;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            마트 숏츠 메이커 🎬
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            유튜브 숏츠 전문가 패턴 — 3초 후킹 · 카라오케 자막 · 블러 커버 · CTA — 으로 1080×1920 MP4를 자동 생성합니다.
          </p>
          <p className="mt-1 text-xs text-gray-400">
            작업한 내용은 자동 저장됩니다 (브라우저 새로고침해도 유지). 새로 시작하려면 우측 초기화 버튼을 눌러주세요.
          </p>
          <p className="mt-2 text-xs font-medium text-gray-500">
            프로그램 제작: 주식회사 인스로드
          </p>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <LogoutButton />
          <button
            type="button"
            onClick={handleReset}
            className="btn-secondary shrink-0 text-sm text-red-600"
            title="모든 작업 내용 삭제"
          >
            🔄 초기화
          </button>
        </div>
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
            <label className="label">
              매장명{storeNameLocked ? ' (계정 등록 정보)' : ' (선택)'}
            </label>
            <input
              className={`input ${storeNameLocked ? 'bg-gray-100 text-gray-700' : ''}`}
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              readOnly={storeNameLocked}
              placeholder="예: 행복마트 강남점"
              title={
                storeNameLocked
                  ? '매장명은 관리자가 등록한 값으로 고정됩니다. 변경하려면 관리자에게 문의하세요.'
                  : undefined
              }
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
            <label className="label">프레임 스타일</label>
            <select
              className="input"
              value={frameStyle}
              onChange={(e) => setFrameStyle(e.target.value as 'cover' | 'blur')}
            >
              <option value="cover">꽉 채우기 (좌우 패닝 + 확대)</option>
              <option value="blur">블러 액자 (사진 보존 + 풀 패닝)</option>
            </select>
          </div>
          <div>
            <label className="label">패닝 속도</label>
            <select
              className="input"
              value={panRatio}
              onChange={(e) => setPanRatio(Number(e.target.value))}
            >
              <option value={0}>정적 (움직임 없음)</option>
              <option value={0.3}>매우 느림</option>
              <option value={0.45}>느림</option>
              <option value={0.6}>보통 (기본)</option>
              <option value={0.8}>빠름</option>
              <option value={1}>매우 빠름 (사진 양끝까지)</option>
            </select>
          </div>
          <div>
            <label className="label">출력 해상도</label>
            <select
              className="input"
              value={resolution}
              onChange={(e) => setResolution(e.target.value as '1080p' | '720p')}
            >
              <option value="720p">720p (빠름, 권장)</option>
              <option value="1080p">1080p (풀 HD)</option>
            </select>
          </div>
          <div>
            <label className="label">렌더링 모드</label>
            <select
              className="input"
              value={renderMode}
              onChange={(e) => setRenderMode(e.target.value as 'browser' | 'server')}
            >
              <option value="browser">브라우저 (PC 권장)</option>
              <option value="server">서버 (폰에서도 빠름 · 풀 기능)</option>
            </select>
          </div>
          <div>
            <label className="label">기본 보이스</label>
            <div className="flex items-center gap-2">
              <select
                className="input flex-1"
                value={speaker}
                onChange={(e) => setSpeaker(e.target.value)}
              >
                {SPEAKER_GROUPS.map((g) => (
                  <optgroup key={g.group} label={g.group}>
                    {g.voices.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <VoicePreviewButton voiceId={speaker} />
            </div>
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
          onGenerateDrone={onGenerateDrone}
          onCancelDrone={onCancelDrone}
        />
      </section>

      {/* Step 2: 스크립트 (구조화 편집) */}
      <section className="card mb-6">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">2. 숏츠 스크립트</h2>
            <p className="text-sm text-gray-500">
              사진을 분석해 <b>hook · 코너 카피 · CTA</b>를 자동으로 작성합니다. 각각 직접 수정 가능.
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
                <div key={i}>
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
            <h2 className="text-lg font-semibold">3. 음성 생성</h2>
            <p className="text-sm text-gray-500">
              hook · 코너 · cta를 각자 합성해 길이 측정 후 연결합니다.
              {isChirpVoice(speaker) ? ' · Chirp3-HD는 피치 슬라이더 무시됩니다.' : ''}
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

        {script ? (
          <div className="mb-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-900">
              <input
                type="checkbox"
                checked={multiVoice}
                onChange={(e) => setMultiVoice(e.target.checked)}
                className="h-4 w-4"
              />
              🎭 보이스 다양화 — hook · 코너 · CTA에 다른 보이스 사용
            </label>
            {multiVoice ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="label">🪝 Hook 보이스</label>
                  <div className="flex items-center gap-2">
                    <select
                      className="input flex-1"
                      value={hookVoice ?? ''}
                      onChange={(e) =>
                        setHookVoice(e.target.value || undefined)
                      }
                    >
                      <option value="">기본 사용</option>
                      {renderVoiceOptions()}
                    </select>
                    <VoicePreviewButton voiceId={resolveVoice(hookVoice)} />
                  </div>
                </div>
                {script.segments.map((_, i) => (
                  <div key={i}>
                    <label className="label">🎬 코너 {i + 1} 보이스</label>
                    <div className="flex items-center gap-2">
                      <select
                        className="input flex-1"
                        value={cornerVoices[i] ?? ''}
                        onChange={(e) =>
                          updateCornerVoice(i, e.target.value || undefined)
                        }
                      >
                        <option value="">기본 사용</option>
                        {renderVoiceOptions()}
                      </select>
                      <VoicePreviewButton
                        voiceId={resolveVoice(cornerVoices[i])}
                      />
                    </div>
                  </div>
                ))}
                <div>
                  <label className="label">📣 CTA 보이스</label>
                  <div className="flex items-center gap-2">
                    <select
                      className="input flex-1"
                      value={ctaVoice ?? ''}
                      onChange={(e) =>
                        setCtaVoice(e.target.value || undefined)
                      }
                    >
                      <option value="">기본 사용</option>
                      {renderVoiceOptions()}
                    </select>
                    <VoicePreviewButton voiceId={resolveVoice(ctaVoice)} />
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-500">
                예시 조합 — Hook은 발랄(Leda) · 코너는 활기(Puck/Aoede 번갈아) · CTA는 강조(Fenrir/Kore). 변화가 retention을 끌어올립니다.
              </p>
            )}
          </div>
        ) : null}

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
              className={`rounded-md px-3 py-1.5 font-medium ${bgmMode === 'library' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
              onClick={() => setBgmMode('library')}
            >
              🎵 라이브러리
            </button>
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

        {bgmError ? (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            <div className="mb-1 font-semibold">배경음악 처리 오류</div>
            <pre className="whitespace-pre-wrap break-all">{bgmError}</pre>
          </div>
        ) : null}

        {bgmMode === 'library' ? (
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
        ) : bgmMode === 'upload' ? (
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
                ? '음악 생성 중… (20~40초)'
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
                {/* 인코딩 실제 시작 전(<0.22)에는 % 표시 숨김 — 가짜 진행률이라 misleading */}
                {renderRatio >= 0.22
                  ? `${(renderRatio * 100).toFixed(0)}% · `
                  : ''}
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
        <div className="font-medium text-gray-500">
          프로그램 제작: 주식회사 인스로드
        </div>
        <div className="mt-1">
          ffmpeg.wasm은 브라우저에서 동작합니다 · COOP/COEP cross-origin isolated 필요 (next.config.js 설정됨)
        </div>
      </footer>
    </main>
  );
}
