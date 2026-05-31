'use client';

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

// 싱글 스레드 빌드 — 복잡한 필터 그래프(블러 액자 + 많은 코너)에서는
// 멀티 스레드의 워커 초기화/필터 분배 비용이 인코딩 이득보다 커서 더 느림.
const FFMPEG_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';
// 한글 지원 + 임팩트가 큰 Pretendard Black. ffmpeg drawtext에 직접 로드.
const FONT_URL =
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Black.otf';

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;

// 숏츠 안전영역(1080×1920 기준 상단 180 / 하단 390 / 좌우 60 픽셀 회피).
// — 출처: Kreatli, Opus.pro safe-zone 가이드.
// 자막은 하단(72%)에 배치 — 시청자 시선이 자연스럽게 흐름. hook/cta는 상단 18%.
const PHRASE_Y = Math.round(HEIGHT * 0.85);
const HOOK_Y = Math.round(HEIGHT * 0.18);
const CTA_Y = Math.round(HEIGHT * 0.18);

// 한국 숏츠 자막 트렌드: 굵고 큼. 검은고딕/도현/어그로체 수준 임팩트.
const FONT_BASE = 80;
const FONT_HIGHLIGHT = 106;
const FONT_HOOK = 103;
const FONT_HOOK_SLAM = 129; // 첫 0~0.35초 text slam (pattern interrupt)
const FONT_CTA = 106;

// 첫 0~0.8초가 50~60% drop-off 구간 (Opus.pro). 그 안에 text slam.
const HOOK_SLAM_DURATION = 0.35;

export type RenderItem = {
  file: File;
  kind: 'image' | 'video';
  // 원본 픽셀 크기 (blur 액자 모드 fit 계산용)
  width?: number;
  height?: number;
};

export type RenderPhrase = {
  text: string;
  start: number; // absolute seconds in the final timeline
  end: number;
  highlight?: boolean; // true면 노란색 + 더 큰 폰트
};

export type RenderInput = {
  items: RenderItem[];
  itemDurations: number[]; // sum === audioDurationSec
  droneShots?: boolean[]; // per-item drone shot flag (images only)
  effectModes?: (('static' | 'pan' | 'zoom_in' | 'zoom_out') | undefined)[]; // per-item motion effect (undefined = default panRatio)
  // 'cover': 사진을 화면에 꽉 채움 (현재 동작, 가로 사진 좌우 패닝)
  // 'blur': 사진을 살짝만 확대 + 위아래 블러 + 전체 가로 풀 패닝
  frameStyle?: 'cover' | 'blur';
  // 패닝 범위 비율 (0=정적, 1=양끝까지). cover/blur 모두에 적용.
  panRatio?: number;
  // 출력 해상도: '1080p' = 1080×1920 (기본), '720p' = 720×1280 (빠른 인코딩 + 작은 파일)
  resolution?: '1080p' | '720p';
  phrases: RenderPhrase[]; // 절대 시간 기준 자막 큐
  hookText: string;
  hookStart: number;
  hookEnd: number;
  ctaText: string;
  ctaStart: number;
  ctaEnd: number;
  audio: Blob;
  audioDurationSec: number;
  watermarkText?: string; // 영상 전체에 노출 (브랜드/매장명/데모표시)
  watermarkPosition?: 'top' | 'bottom'; // top=중앙 상단, bottom=좌하단 (기본)
  watermarkSize?: number; // 폰트 크기 (기본 40)
  bgm?: Blob | null;
  bgmVolume?: number; // 0..1, default 0.16
  voiceVolume?: number; // default 1.0
};

export type RenderProgress = { ratio: number; message: string };

let ffmpegSingleton: FFmpeg | null = null;
let fontLoaded = false;

async function getFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpegSingleton) return ffmpegSingleton;
  const ffmpeg = new FFmpeg();
  if (onLog) ffmpeg.on('log', ({ message }) => onLog(message));
  await ffmpeg.load({
    coreURL: await toBlobURL(`${FFMPEG_BASE}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${FFMPEG_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
  });
  ffmpegSingleton = ffmpeg;
  return ffmpeg;
}

async function ensureFont(ff: FFmpeg): Promise<string | null> {
  if (fontLoaded) return 'font.otf';
  try {
    const r = await fetch(FONT_URL);
    if (!r.ok) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    await ff.writeFile('font.otf', buf);
    fontLoaded = true;
    return 'font.otf';
  } catch {
    return null;
  }
}

// ffmpeg drawtext 이스케이프: : ' \ , % 한 줄 만들기 위해 줄바꿈 공백 치환
function esc(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, '’')
    .replace(/,/g, '\\,')
    .replace(/%/g, '\\%')
    .replace(/\n/g, ' ')
    .trim();
}

type DrawTextOpts = {
  text: string;
  start: number;
  end: number;
  fontSize: number;
  y: number;
  color: string;       // hex like 0xffd60a 또는 named color
  fontFile: string | null;
  box?: boolean;
  borderw?: number;
};

// 한글 텍스트를 maxChars 길이로 자동 줄바꿈 (공백 기준 토큰화).
// 토큰이 max보다 길면 그대로 한 줄에 둠 (강제 분리 안 함).
function wrapKoreanText(text: string, maxCharsPerLine: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const tokens = trimmed.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const tok of tokens) {
    if (!cur) {
      cur = tok;
      continue;
    }
    const next = `${cur} ${tok}`;
    if (next.length > maxCharsPerLine) {
      lines.push(cur);
      cur = tok;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// fontSize 기준 한 줄에 안전하게 들어갈 한글 글자 수 추정.
// 1080 폭에 좌우 60px 안전여백 → 사용 가능 폭 ≈ 960px.
// 한글 한 글자 폭은 보통 fontSize × 0.95 정도 (Pretendard 기준).
function maxCharsForFont(fontSize: number, usableWidth = 960): number {
  const charWidth = fontSize * 0.95;
  return Math.max(4, Math.floor(usableWidth / charWidth));
}

// 다중 라인 텍스트를 여러 drawtext 노드로 분해. 각 줄은 lineHeight만큼 아래로.
function drawWrappedTextNodes(
  text: string,
  baseOpts: Omit<DrawTextOpts, 'text' | 'y'> & { y: number },
): string[] {
  const maxChars = maxCharsForFont(baseOpts.fontSize);
  const lines = wrapKoreanText(text, maxChars);
  if (lines.length === 0) return [];
  const lineHeight = Math.round(baseOpts.fontSize * 1.15);
  return lines.map((line, i) =>
    drawTextNode({
      ...baseOpts,
      text: line,
      y: baseOpts.y + i * lineHeight,
    }),
  );
}

function drawTextNode(opts: DrawTextOpts): string {
  const {
    text,
    start,
    end,
    fontSize,
    y,
    color,
    fontFile,
    box = true,
    borderw = 7,
  } = opts;
  const parts: string[] = [];
  parts.push(`text='${esc(text)}'`);
  if (fontFile) parts.push(`fontfile=${fontFile}`);
  parts.push(`fontcolor=${color}`);
  parts.push(`fontsize=${fontSize}`);
  parts.push(`borderw=${borderw}`);
  parts.push(`bordercolor=black@0.95`);
  parts.push(`shadowcolor=black@0.6`);
  parts.push(`shadowx=2`);
  parts.push(`shadowy=4`);
  if (box) {
    parts.push(`box=1`);
    parts.push(`boxcolor=black@0.32`);
    parts.push(`boxborderw=28`);
  }
  parts.push(`x=(w-text_w)/2`);
  parts.push(`y=${y}`);
  parts.push(
    `enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'`,
  );
  return `drawtext=${parts.join(':')}`;
}

// 한 항목용 비디오 체인 — 절대 시간 정확히 T초, 1080×1920 yuv420p 출력.
// 이미지: 블러 커버 BG + 컨테인 FG + 한 방향 선형 드리프트 (어지럽지 않은 글라이드).
// 이미지(드론샷): 블러 커버 BG + 1.3x → 1.0x 풀백 줌아웃 + 미세 드리프트.
// 비디오: 블러 커버 BG + 컨테인 FG (원본 모션 보존).
function buildItemChain(
  idx: number,
  T: number,
  isVideo: boolean,
  droneShot = false,
  frameStyle: 'cover' | 'blur' = 'cover',
  srcWidth?: number,
  srcHeight?: number,
  panRatio = 0.6,
  effectMode: 'static' | 'pan' | 'zoom_in' | 'zoom_out' | undefined = undefined,
): string {
  const Tstr = T.toFixed(3);

  if (isVideo) {
    return (
      `[${idx}:v]split=2[bg${idx}][fg${idx}];` +
      `[bg${idx}]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,` +
      `crop=${WIDTH}:${HEIGHT},boxblur=24:4,setsar=1[bgX${idx}];` +
      `[fg${idx}]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,setsar=1[fgX${idx}];` +
      `[bgX${idx}][fgX${idx}]overlay=(W-w)/2:(H-h)/2,` +
      `tpad=stop_mode=clone:stop_duration=${Tstr},trim=duration=${Tstr},setpts=PTS-STARTPTS,` +
      `fps=${FPS},format=yuv420p[v${idx}]`
    );
  }

  if (droneShot) {
    // 드론샷: 건드리지 말 것 (사용자 지시)
    const droneFrames = Math.max(2, Math.round(T * FPS));
    const wOver = Math.round(WIDTH * 1.6);
    const hOver = Math.round(HEIGHT * 1.6);

    return (
      `[${idx}:v]split=2[bg${idx}][fg${idx}];` +
      `[bg${idx}]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,` +
      `crop=${WIDTH}:${HEIGHT},boxblur=24:4,setsar=1[bgX${idx}];` +
      `[fg${idx}]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,` +
      `crop=${WIDTH}:${HEIGHT},` +
      `scale=${wOver}:${hOver},setsar=1,` +
      `trim=end_frame=1,setpts=PTS-STARTPTS,` +
      `zoompan=z='if(eq(on,1),1.6,max(1.0,zoom-${(0.6 / (droneFrames - 1)).toFixed(6)}))':` +
      `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
      `d=${droneFrames}:s=${WIDTH}x${HEIGHT}:fps=${FPS}[fgX${idx}];` +
      `[bgX${idx}][fgX${idx}]overlay=(W-w)/2:(H-h)/2,` +
      `fps=${FPS},format=yuv420p,setpts=PTS-STARTPTS[v${idx}]`
    );
  }

  // 블러 액자 모드: 사진을 화면 높이의 90%까지만 확대 → 위아래 5% 블러 여백 +
  // 가로 여유분 전체를 좌→우 풀 패닝으로 보여줌 (사진의 모든 가로 컨텐츠 노출).
  // 가로 비율(iw/ih > 9/16)일 때만 의미 있음 — 세로/정사각형은 패닝 폭이 0이라
  // 단순 fit으로 처리 (위아래 큰 블러 액자).
  // 블러: 메타 정보가 있을 때만 정상 동작 (없으면 cover로 폴백).
  if (frameStyle === 'blur' && srcWidth && srcHeight) {
    const aspect = srcWidth / srcHeight;
    const canvasAspect = WIDTH / HEIGHT; // 0.5625
    const fillRatio = 0.9; // 화면 높이의 90%만 사용 → 5% 위, 5% 아래 블러
    const photoH = Math.round((HEIGHT * fillRatio) / 2) * 2; // 짝수
    const photoW = Math.round((photoH * aspect) / 2) * 2;
    const dir = idx % 2 === 0 ? 1 : -1;

    // 가로 사진: photoW > WIDTH → 패닝 가능
    if (aspect > canvasAspect && photoW > WIDTH) {
      const panRange = photoW - WIDTH;
      // panRatio (0~1) 만큼만 사용 (나머지는 양쪽 여백)
      const usedRange = Math.round(panRange * panRatio);
      const startOffset = Math.round((panRange - usedRange) / 2);
      // dir=1: startOffset → startOffset+usedRange (왼쪽에서 오른쪽으로)
      // dir=-1: 반대 방향
      const xExpr =
        dir === 1
          ? `${startOffset} + ${usedRange}*(t/${Tstr})`
          : `${startOffset + usedRange} - ${usedRange}*(t/${Tstr})`;
      const yBlur = Math.round((HEIGHT - photoH) / 2);
      return (
        `[${idx}:v]split=2[bg${idx}][fg${idx}];` +
        `[bg${idx}]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,` +
        `crop=${WIDTH}:${HEIGHT},boxblur=12:2,setsar=1[bgX${idx}];` +
        // FG: 사진을 photoW×photoH로 확대 후 가로 crop으로 패닝
        `[fg${idx}]scale=${photoW}:${photoH},setsar=1,` +
        `crop=${WIDTH}:${photoH}:'${xExpr}':0[fgX${idx}];` +
        // FG를 BG 위에 세로 중앙(yBlur)으로 overlay
        `[bgX${idx}][fgX${idx}]overlay=0:${yBlur},` +
        `fps=${FPS},format=yuv420p,setpts=PTS-STARTPTS[v${idx}]`
      );
    }

    // 세로/정사각형 또는 메타 정보 없음: 패닝 불가, fit + 블러 액자 (정적)
    return (
      `[${idx}:v]split=2[bg${idx}][fg${idx}];` +
      `[bg${idx}]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,` +
      `crop=${WIDTH}:${HEIGHT},boxblur=12:2,setsar=1[bgX${idx}];` +
      `[fg${idx}]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,setsar=1[fgX${idx}];` +
      `[bgX${idx}][fgX${idx}]overlay=(W-w)/2:(H-h)/2,` +
      `fps=${FPS},format=yuv420p,setpts=PTS-STARTPTS[v${idx}]`
    );
  }

  // 정지 효과: 모션 없이 사진을 화면에 꽉 채워 표시 (사진관 4초 고정).
  if (!isVideo && effectMode === 'static') {
    return (
      `[${idx}:v]split=2[bg${idx}][fg${idx}];` +
      `[bg${idx}]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,` +
      `crop=${WIDTH}:${HEIGHT},boxblur=24:4,setsar=1[bgX${idx}];` +
      `[fg${idx}]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,setsar=1[fgX${idx}];` +
      `[bgX${idx}][fgX${idx}]overlay=(W-w)/2:(H-h)/2,` +
      `fps=${FPS},format=yuv420p,setpts=PTS-STARTPTS[v${idx}]`
    );
  }

  // 줌인/줌아웃 효과 (이미지 전용). 부드럽게:
  // 1) 선형 z 보간 (on/(d-1))으로 누적 오차 제거
  // 2) 사전 2배 확대 + lanczos로 픽셀 정렬 흔들림 감소
  // 3) 사진 비율에 맞춰 fg 출력 크기 계산 (왜곡 방지)
  if (!isVideo && (effectMode === 'zoom_in' || effectMode === 'zoom_out')) {
    const frames = Math.max(2, Math.round(T * FPS));
    const zoomFrom = effectMode === 'zoom_in' ? 1.0 : 1.3;
    const zoomTo = effectMode === 'zoom_in' ? 1.3 : 1.0;
    const delta = (zoomTo - zoomFrom).toFixed(3);
    const zExpr = `${zoomFrom.toFixed(3)}${(zoomTo - zoomFrom) >= 0 ? '+' : ''}${delta}*on/(d-1)`;

    // 사진 비율에 맞춰 fg 크기 산출 (왜곡 방지)
    let fgW = WIDTH;
    let fgH = HEIGHT;
    if (srcWidth && srcHeight) {
      const srcAspect = srcWidth / srcHeight;
      const canvasAspect = WIDTH / HEIGHT;
      if (srcAspect > canvasAspect) {
        fgW = WIDTH;
        fgH = Math.max(2, Math.round((WIDTH / srcAspect) / 2) * 2);
      } else {
        fgH = HEIGHT;
        fgW = Math.max(2, Math.round((HEIGHT * srcAspect) / 2) * 2);
      }
    }
    const upFgW = fgW * 2;
    const upFgH = fgH * 2;

    return (
      `[${idx}:v]split=2[bg${idx}][fg${idx}];` +
      `[bg${idx}]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,` +
      `crop=${WIDTH}:${HEIGHT},boxblur=24:4,setsar=1[bgX${idx}];` +
      `[fg${idx}]scale=${upFgW}:${upFgH}:flags=lanczos,setsar=1,` +
      `trim=end_frame=1,setpts=PTS-STARTPTS,` +
      `zoompan=z='${zExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
      `d=${frames}:s=${fgW}x${fgH}:fps=${FPS}[fgX${idx}];` +
      `[bgX${idx}][fgX${idx}]overlay=(W-w)/2:(H-h)/2,` +
      `fps=${FPS},format=yuv420p,setpts=PTS-STARTPTS[v${idx}]`
    );
  }

  // 'cover' 모드 (기본): 가로 사진을 화면에 꽉 채우고 좌우 panRatio 만큼 패닝.
  // effectMode === 'pan'으로 명시된 경우(사진관)는 끝~끝(0.5) 풀 패닝.
  // undefined면 기존 panRatio 동작 유지 (마트 영향 없음).
  const dir = idx % 2 === 0 ? 1 : -1;
  const effectivePan = effectMode === 'pan' ? 1.0 : panRatio;
  const halfAmp = (effectivePan / 2).toFixed(4);
  const xExpr = `(in_w-${WIDTH})*0.5 + (in_w-${WIDTH})*${halfAmp}*${dir}*(2*t/${Tstr}-1)`;
  const yExpr = `(in_h-${HEIGHT})/2`;
  // aspect threshold = WIDTH/HEIGHT = 0.5625 (9:16)
  // 콤마는 expression 안에서 \, 로 escape
  const aspectThreshold = (WIDTH / HEIGHT).toFixed(6);
  const scaleW = `if(gt(iw/ih\\,${aspectThreshold})\\,iw*${HEIGHT}/ih\\,${WIDTH})`;
  const scaleH = `if(gt(iw/ih\\,${aspectThreshold})\\,${HEIGHT}\\,ih*${WIDTH}/iw)`;

  return (
    `[${idx}:v]split=2[bg${idx}][fg${idx}];` +
    `[bg${idx}]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,` +
    `crop=${WIDTH}:${HEIGHT},boxblur=24:4,setsar=1[bgX${idx}];` +
    // FG: 가로면 높이 매칭(가로 여유 확보), 세로면 너비 매칭 후 좌우 crop 패닝
    `[fg${idx}]scale=w='${scaleW}':h='${scaleH}',setsar=1,` +
    `crop=${WIDTH}:${HEIGHT}:'${xExpr}':'${yExpr}'[fgX${idx}];` +
    `[bgX${idx}][fgX${idx}]overlay=(W-w)/2:(H-h)/2,` +
    `fps=${FPS},format=yuv420p,setpts=PTS-STARTPTS[v${idx}]`
  );
}

export async function renderVideo(
  input: RenderInput,
  onProgress: (p: RenderProgress) => void,
): Promise<Blob> {
  const {
    items,
    itemDurations: rawItemDurations,
    droneShots,
    effectModes,
    frameStyle = 'cover',
    panRatio = 0.6,
    resolution = '1080p',
    phrases,
    hookText,
    hookStart,
    hookEnd,
    ctaText,
    ctaStart,
    ctaEnd,
    audio,
    audioDurationSec,
    watermarkText,
    watermarkPosition = 'bottom',
    watermarkSize = 40,
    bgm,
    bgmVolume = 0.16,
    voiceVolume = 1.0,
  } = input;

  if (items.length === 0) throw new Error('업로드된 미디어가 없습니다.');
  if (items.length !== rawItemDurations.length)
    throw new Error('itemDurations 길이가 items와 다릅니다.');
  if (!audioDurationSec || audioDurationSec <= 0)
    throw new Error('오디오 길이를 알 수 없습니다.');

  // 마지막 아이템에 0.3초 안전 버퍼 — frame 양자화/MP3 concat 오차로 영상이 음성보다
  // 먼저 끝나는 것 방지. -shortest 옵션이 음성 길이에 맞춰 다시 잘라줌.
  const itemDurations = rawItemDurations.map((d, i) =>
    i === rawItemDurations.length - 1 ? d + 0.3 : d,
  );

  onProgress({ ratio: 0.02, message: 'FFmpeg 초기화 중…' });
  const ffmpeg = await getFFmpeg();

  onProgress({ ratio: 0.05, message: '한글 폰트 로딩 중…' });
  const fontFile = await ensureFont(ffmpeg);

  // encodingStarted: 첫 frame progress 이벤트가 발생하면 true. 그 전까지는
  // setupTimer가 "준비 중" 메시지를 띄움. 첫 progress 후엔 timer 무효화.
  let encodingStarted = false;
  ffmpeg.on('progress', ({ progress }) => {
    if (Number.isFinite(progress)) {
      encodingStarted = true;
      const ratio = 0.22 + Math.min(0.76, Math.max(0, progress) * 0.76);
      onProgress({
        ratio,
        message: `영상 인코딩 중… ${(progress * 100).toFixed(0)}%`,
      });
    }
  });

  onProgress({ ratio: 0.08, message: '미디어 업로드 중…' });
  const inputNames: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const name = items[i].kind === 'video' ? `media${i}.mp4` : `media${i}.jpg`;
    inputNames.push(name);
    const data = await fetchFile(items[i].file);
    await ffmpeg.writeFile(name, data);
  }
  const audioData = await fetchFile(audio);
  await ffmpeg.writeFile('audio.mp3', audioData);

  let bgmFileName: string | null = null;
  if (bgm) {
    onProgress({ ratio: 0.12, message: '배경음악 업로드 중…' });
    const bgmData = await fetchFile(bgm);
    bgmFileName = 'bgm.bin';
    await ffmpeg.writeFile(bgmFileName, bgmData);
  }

  onProgress({ ratio: 0.18, message: '필터 그래프 구성 중…' });

  // panRatio 안전 범위 [0, 1]
  const safePan = Math.min(1, Math.max(0, panRatio));

  // 1) 각 항목 체인
  const itemChains = items.map((it, i) =>
    buildItemChain(
      i,
      itemDurations[i],
      it.kind === 'video',
      droneShots?.[i] ?? false,
      frameStyle,
      it.width,
      it.height,
      safePan,
      effectModes?.[i] ?? 'pan',
    ),
  );

  // 2) 모두 [concated]으로 concat
  const concatInputs = items.map((_, i) => `[v${i}]`).join('');
  const concatStep =
    items.length > 1
      ? `${concatInputs}concat=n=${items.length}:v=1:a=0[concat0]`
      : `[v0]null[concat0]`;

  // 3) drawtext 오버레이 — phrases + hook + cta
  const drawNodes: string[] = [];

  // Hook 오버레이 — 첫 0~SLAM초는 거대 노랑(text slam, pattern interrupt),
  // 그 후엔 표준 흰색 hook. 긴 텍스트는 자동 줄바꿈으로 화면 안에.
  if (hookText.trim() && hookEnd > hookStart) {
    const slamEnd = Math.min(hookStart + HOOK_SLAM_DURATION, hookEnd);
    if (slamEnd > hookStart) {
      drawNodes.push(
        ...drawWrappedTextNodes(hookText, {
          start: hookStart,
          end: slamEnd,
          fontSize: FONT_HOOK_SLAM,
          y: HOOK_Y - 20,
          color: '0xffd60a',
          fontFile,
          box: true,
          borderw: 12,
        }),
      );
    }
    if (hookEnd > slamEnd) {
      drawNodes.push(
        ...drawWrappedTextNodes(hookText, {
          start: slamEnd,
          end: hookEnd,
          fontSize: FONT_HOOK,
          y: HOOK_Y,
          color: 'white',
          fontFile,
          box: true,
          borderw: 9,
        }),
      );
    }
  }

  // Phrase 오버레이 — 코너당 한 블록으로 통째로 표시. 자동 줄바꿈.
  // 여러 줄로 늘어나면 PHRASE_Y에서 위로 살짝 올려 화면 중앙에 균형.
  for (const p of phrases) {
    if (!p.text.trim() || p.end <= p.start) continue;
    const maxChars = maxCharsForFont(FONT_BASE);
    const lineCount = wrapKoreanText(p.text, maxChars).length || 1;
    const lineHeight = Math.round(FONT_BASE * 1.15);
    const yOffset = Math.round(((lineCount - 1) * lineHeight) / 2);
    drawNodes.push(
      ...drawWrappedTextNodes(p.text, {
        start: p.start,
        end: p.end,
        fontSize: FONT_BASE,
        y: PHRASE_Y - yOffset,
        color: 'white',
        fontFile,
      }),
    );
  }

  // CTA 오버레이 (상단, hook과 동일 위치 — 시간이 안 겹쳐서 안전)
  // 긴 CTA 텍스트도 자동 줄바꿈
  if (ctaText.trim() && ctaEnd > ctaStart) {
    drawNodes.push(
      ...drawWrappedTextNodes(ctaText, {
        start: ctaStart,
        end: ctaEnd,
        fontSize: FONT_CTA,
        y: CTA_Y,
        color: '0xffd60a',
        fontFile,
        box: true,
        borderw: 9,
      }),
    );
  }

  // 워터마크 — 영상 전체 노출. 위치/크기 옵션.
  if (watermarkText && watermarkText.trim()) {
    const wmText = esc(watermarkText.trim());
    const wmFont = fontFile ? `fontfile=${fontFile}:` : '';
    const wmSize = Math.max(20, Math.min(200, Math.round(watermarkSize)));
    const wmX = watermarkPosition === 'top' ? '(w-text_w)/2' : '60';
    const wmY = watermarkPosition === 'top' ? '80' : `${HEIGHT - 90}`;
    drawNodes.push(
      `drawtext=text='${wmText}':${wmFont}fontcolor=white@0.95:fontsize=${wmSize}:shadowcolor=black@0.8:shadowx=2:shadowy=2:borderw=4:bordercolor=black@0.7:x=${wmX}:y=${wmY}`,
    );
  }

  const textChain =
    drawNodes.length > 0
      ? `[concat0]${drawNodes.join(',')}[vout]`
      : `[concat0]null[vout]`;

  // 4) 오디오 믹스
  const voiceIdx = items.length;
  const bgmIdx = items.length + 1;
  const audioMix = bgmFileName
    ? `;[${voiceIdx}:a]volume=${voiceVolume}[vc];` +
      `[${bgmIdx}:a]aloop=loop=-1:size=2e9,volume=${bgmVolume},` +
      `afade=t=in:st=0:d=0.6,afade=t=out:st=${Math.max(0, audioDurationSec - 0.8).toFixed(3)}:d=0.8[bg];` +
      `[vc][bg]amix=inputs=2:duration=first:dropout_transition=0[aout]`
    : '';
  const audioMap = bgmFileName ? '[aout]' : `${voiceIdx}:a`;

  const filter = [
    itemChains.join(';'),
    concatStep,
    textChain,
  ].join(';') + audioMix;

  // 5) ffmpeg 인자
  const args: string[] = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].kind === 'image') {
      args.push(
        '-loop',
        '1',
        '-t',
        itemDurations[i].toFixed(3),
        '-i',
        inputNames[i],
      );
    } else {
      args.push('-i', inputNames[i]);
    }
  }
  args.push('-i', 'audio.mp3');
  if (bgmFileName) args.push('-i', bgmFileName);
  args.push(
    '-filter_complex',
    filter,
    '-map',
    '[vout]',
    '-map',
    audioMap,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(FPS),
  );
  // 720p 선택 시 출력 해상도 강제 다운스케일 → 인코딩 속도 ↑ + 파일 크기 ↓.
  // 필터는 1080×1920에서 처리되고 마지막 출력만 720×1280으로 줄임.
  if (resolution === '720p') {
    args.push('-s', '720x1280');
  }
  args.push(
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-shortest',
    '-movflags',
    '+faststart',
    '-preset',
    'ultrafast',
    '-y',
    'out.mp4',
  );

  // ffmpeg.exec 중 progress 이벤트가 첫 프레임 처리 후에야 발생.
  // 가짜 진행률은 보여주지 않고, 경과 시간만 정직하게 카운팅.
  // ratio는 그대로 0.20에 묶어 두어 진행 바가 가짜로 늘어나지 않게 함.
  onProgress({
    ratio: 0.20,
    message: '인코더 초기화 중… 첫 프레임 인코딩 시작 대기',
  });
  const startedAt = Date.now();
  const setupTimer = setInterval(() => {
    if (encodingStarted) return; // 첫 프레임 인코딩 시작 후엔 정식 진행률에 양보
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    onProgress({
      ratio: 0.20, // 진행 바는 그대로 — 가짜 % 표시 금지
      message: `인코더 초기화 중… (${elapsed}s 경과, 곧 인코딩 시작)`,
    });
  }, 1000);

  try {
    await ffmpeg.exec(args);
  } finally {
    clearInterval(setupTimer);
  }

  onProgress({ ratio: 0.98, message: '파일 마무리 중…' });
  const data = (await ffmpeg.readFile('out.mp4')) as Uint8Array;
  const bytes = new Uint8Array(data);
  const blob = new Blob([bytes], { type: 'video/mp4' });

  try {
    for (const name of inputNames) await ffmpeg.deleteFile(name);
    await ffmpeg.deleteFile('audio.mp3');
    if (bgmFileName) await ffmpeg.deleteFile(bgmFileName);
    await ffmpeg.deleteFile('out.mp4');
  } catch {
    /* noop */
  }

  onProgress({ ratio: 1, message: '완료' });
  return blob;
}

export function estimateRenderSeconds(
  itemCount: number,
  audioDurationSec: number,
): number {
  const base = audioDurationSec * 3.2;
  const overhead = itemCount * 1.8 + 8;
  return Math.ceil(base + overhead);
}

export async function probeAudioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('audio');
    a.preload = 'metadata';
    a.onloadedmetadata = () => {
      const d = a.duration;
      URL.revokeObjectURL(url);
      if (!Number.isFinite(d) || d <= 0) {
        reject(new Error('오디오 길이를 측정할 수 없습니다.'));
      } else {
        resolve(d);
      }
    };
    a.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('오디오 로딩 실패'));
    };
    a.src = url;
  });
}
