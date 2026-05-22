'use client';

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const FFMPEG_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';
// 한글 지원 + 임팩트가 큰 Pretendard Black. ffmpeg drawtext에 직접 로드.
const FONT_URL =
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Black.otf';

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;

// 숏츠 안전영역(1080×1920 기준 상단 180 / 하단 390 / 좌우 60 픽셀 회피).
// — 출처: Kreatli, Opus.pro safe-zone 가이드.
// 자막은 중앙(50%)이 retention 표준. hook/cta는 상단 18%에 두어 시선 잡기.
const PHRASE_Y = Math.round(HEIGHT * 0.50);
const HOOK_Y = Math.round(HEIGHT * 0.18);
const CTA_Y = Math.round(HEIGHT * 0.18);

// 한국 숏츠 자막 트렌드: 굵고 큼. 검은고딕/도현/어그로체 수준 임팩트.
const FONT_BASE = 84;
const FONT_HIGHLIGHT = 112;
const FONT_HOOK = 108;
const FONT_HOOK_SLAM = 136; // 첫 0~0.35초 text slam (pattern interrupt)
const FONT_CTA = 112;

// 첫 0~0.8초가 50~60% drop-off 구간 (Opus.pro). 그 안에 text slam.
const HOOK_SLAM_DURATION = 0.35;

export type RenderItem = { file: File; kind: 'image' | 'video' };

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
  phrases: RenderPhrase[]; // 절대 시간 기준 자막 큐
  hookText: string;
  hookStart: number;
  hookEnd: number;
  ctaText: string;
  ctaStart: number;
  ctaEnd: number;
  audio: Blob;
  audioDurationSec: number;
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
function buildItemChain(idx: number, T: number, isVideo: boolean, droneShot = false): string {
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
    // 드론샷(항공): 1.3x → 1.0x 줌아웃 + 좌→우 미세 드리프트 (드론 상승 + 글라이드)
    const droneFrames = Math.max(2, Math.round(T * FPS));
    const wOver = Math.round(WIDTH * 1.3);
    const hOver = Math.round(HEIGHT * 1.3);
    const xExpr = `iw/2-(iw/zoom/2)+iw*0.03*(on/${droneFrames}-0.5)`;
    const yExpr = `ih/2-(ih/zoom/2)`;

    return (
      `[${idx}:v]split=2[bg${idx}][fg${idx}];` +
      `[bg${idx}]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,` +
      `crop=${WIDTH}:${HEIGHT},boxblur=24:4,setsar=1[bgX${idx}];` +
      `[fg${idx}]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,` +
      `pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2,` +
      `scale=${wOver}:${hOver},setsar=1,` +
      `trim=end_frame=1,setpts=PTS-STARTPTS,` +
      `zoompan=z='if(eq(on,1),1.3,max(1.0,zoom-${(0.3 / (droneFrames - 1)).toFixed(6)}))':` +
      `x='${xExpr}':y='${yExpr}':` +
      `d=${droneFrames}:s=${WIDTH}x${HEIGHT}:fps=${FPS}[fgX${idx}];` +
      `[bgX${idx}][fgX${idx}]overlay=(W-w)/2:(H-h)/2,` +
      `fps=${FPS},format=yuv420p,setpts=PTS-STARTPTS[v${idx}]`
    );
  }

  // 기본 이미지: 부드러운 슬로우 줌인 (1.0 → 1.05, push-in 영화 효과)
  // crop 정수 픽셀 문제 회피 — zoompan은 서브픽셀 정밀도로 매끄럽게 처리.
  const imgFrames = Math.max(2, Math.round(T * FPS));
  const wOver = Math.round(WIDTH * 1.1);
  const hOver = Math.round(HEIGHT * 1.1);

  return (
    `[${idx}:v]split=2[bg${idx}][fg${idx}];` +
    `[bg${idx}]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,` +
    `crop=${WIDTH}:${HEIGHT},boxblur=24:4,setsar=1[bgX${idx}];` +
    // FG: 1080x1920 컨테인 + 패드 → 1.1x 확대 → 1프레임만 골라 zoompan 줌인
    `[fg${idx}]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,` +
    `pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2,` +
    `scale=${wOver}:${hOver},setsar=1,` +
    `trim=end_frame=1,setpts=PTS-STARTPTS,` +
    `zoompan=z='min(1.05,1.0+${(0.05 / (imgFrames - 1)).toFixed(6)}*on)':` +
    `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
    `d=${imgFrames}:s=${WIDTH}x${HEIGHT}:fps=${FPS}[fgX${idx}];` +
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
    itemDurations,
    droneShots,
    phrases,
    hookText,
    hookStart,
    hookEnd,
    ctaText,
    ctaStart,
    ctaEnd,
    audio,
    audioDurationSec,
    bgm,
    bgmVolume = 0.16,
    voiceVolume = 1.0,
  } = input;

  if (items.length === 0) throw new Error('업로드된 미디어가 없습니다.');
  if (items.length !== itemDurations.length)
    throw new Error('itemDurations 길이가 items와 다릅니다.');
  if (!audioDurationSec || audioDurationSec <= 0)
    throw new Error('오디오 길이를 알 수 없습니다.');

  onProgress({ ratio: 0.02, message: 'FFmpeg 초기화 중…' });
  const ffmpeg = await getFFmpeg();

  onProgress({ ratio: 0.05, message: '한글 폰트 로딩 중…' });
  const fontFile = await ensureFont(ffmpeg);

  ffmpeg.on('progress', ({ progress }) => {
    if (Number.isFinite(progress)) {
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

  // 1) 각 항목 체인
  const itemChains = items.map((it, i) =>
    buildItemChain(i, itemDurations[i], it.kind === 'video', droneShots?.[i] ?? false),
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
  // 그 후엔 표준 흰색 hook. drop-off 구간(첫 0.8초)에 강제 시선 고정.
  if (hookText.trim() && hookEnd > hookStart) {
    const slamEnd = Math.min(hookStart + HOOK_SLAM_DURATION, hookEnd);
    if (slamEnd > hookStart) {
      drawNodes.push(
        drawTextNode({
          text: hookText,
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
        drawTextNode({
          text: hookText,
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

  // Phrase 오버레이 — 중간 라인
  for (const p of phrases) {
    if (!p.text.trim() || p.end <= p.start) continue;
    if (p.highlight) {
      drawNodes.push(
        drawTextNode({
          text: p.text,
          start: p.start,
          end: p.end,
          fontSize: FONT_HIGHLIGHT,
          y: PHRASE_Y,
          color: '0xffd60a', // 노란색 강조
          fontFile,
          box: true,
          borderw: 8,
        }),
      );
    } else {
      drawNodes.push(
        drawTextNode({
          text: p.text,
          start: p.start,
          end: p.end,
          fontSize: FONT_BASE,
          y: PHRASE_Y,
          color: 'white',
          fontFile,
        }),
      );
    }
  }

  // CTA 오버레이 (상단, hook과 동일 위치 — 시간이 안 겹쳐서 안전)
  if (ctaText.trim() && ctaEnd > ctaStart) {
    drawNodes.push(
      drawTextNode({
        text: ctaText,
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
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-shortest',
    '-movflags',
    '+faststart',
    '-preset',
    'veryfast',
    '-y',
    'out.mp4',
  );

  await ffmpeg.exec(args);

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
