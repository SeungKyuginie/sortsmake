'use client';

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const FFMPEG_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';
const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const FADE_DURATION = 0.5; // seconds

export type RenderInput = {
  images: File[];
  captions: string[]; // per-image caption (optional, may be empty strings)
  audio: Blob;
  audioDurationSec: number;
};

export type RenderProgress = {
  ratio: number; // 0..1
  message: string;
};

let ffmpegSingleton: FFmpeg | null = null;

async function getFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpegSingleton) return ffmpegSingleton;
  const ffmpeg = new FFmpeg();
  if (onLog) {
    ffmpeg.on('log', ({ message }) => onLog(message));
  }
  await ffmpeg.load({
    coreURL: await toBlobURL(`${FFMPEG_BASE}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(
      `${FFMPEG_BASE}/ffmpeg-core.wasm`,
      'application/wasm',
    ),
  });
  ffmpegSingleton = ffmpeg;
  return ffmpeg;
}

function sanitizeCaption(text: string): string {
  // ffmpeg drawtext escaping for : ' \ ,
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "’")
    .replace(/,/g, '\\,')
    .replace(/\n/g, ' ');
}

function buildFilterGraph(
  imageCount: number,
  perImageDuration: number,
  captions: string[],
): string {
  // Each input image is looped to its duration, scaled & padded to 1080x1920, then concatenated with xfade.
  const segments: string[] = [];
  for (let i = 0; i < imageCount; i++) {
    const caption = sanitizeCaption(captions[i] ?? '');
    // scale to cover, then pad to canvas, set sar, set fps, then drawtext
    const base =
      `[${i}:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,` +
      `pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,` +
      `setsar=1,fps=${FPS},format=yuv420p`;
    const withText = caption
      ? `${base},drawtext=text='${caption}':fontcolor=white:fontsize=64:` +
        `box=1:boxcolor=black@0.55:boxborderw=24:` +
        `x=(w-text_w)/2:y=h-380`
      : base;
    segments.push(`${withText}[v${i}]`);
  }

  if (imageCount === 1) {
    segments.push(`[v0]trim=duration=${perImageDuration},setpts=PTS-STARTPTS[vout]`);
    return segments.join(';');
  }

  // Chain xfade transitions
  let prev = 'v0';
  for (let i = 1; i < imageCount; i++) {
    const offset = perImageDuration * i - FADE_DURATION;
    const out = i === imageCount - 1 ? 'vout' : `vx${i}`;
    segments.push(
      `[${prev}][v${i}]xfade=transition=fade:duration=${FADE_DURATION}:offset=${offset.toFixed(3)}[${out}]`,
    );
    prev = out;
  }

  return segments.join(';');
}

export async function renderVideo(
  input: RenderInput,
  onProgress: (p: RenderProgress) => void,
): Promise<Blob> {
  const { images, captions, audio, audioDurationSec } = input;
  if (images.length === 0) throw new Error('이미지가 없습니다.');
  if (!audioDurationSec || audioDurationSec <= 0)
    throw new Error('오디오 길이를 알 수 없습니다.');

  onProgress({ ratio: 0.02, message: 'FFmpeg 초기화 중…' });
  const ffmpeg = await getFFmpeg();

  // total duration matches audio; each image gets equal share
  const totalDuration = audioDurationSec;
  const perImageDuration = totalDuration / images.length;
  if (perImageDuration <= FADE_DURATION + 0.1 && images.length > 1) {
    // very short per-image times still work but warn via message
    onProgress({
      ratio: 0.03,
      message: '경고: 이미지당 시간이 매우 짧습니다.',
    });
  }

  // Hook ffmpeg progress
  ffmpeg.on('progress', ({ progress }) => {
    if (Number.isFinite(progress)) {
      const ratio = 0.2 + Math.min(0.78, Math.max(0, progress) * 0.78);
      onProgress({ ratio, message: `영상 인코딩 중… ${(progress * 100).toFixed(0)}%` });
    }
  });

  onProgress({ ratio: 0.06, message: '이미지 업로드 중…' });
  // Write inputs
  for (let i = 0; i < images.length; i++) {
    const data = await fetchFile(images[i]);
    await ffmpeg.writeFile(`img${i}.jpg`, data);
  }
  const audioData = await fetchFile(audio);
  await ffmpeg.writeFile('audio.mp3', audioData);

  onProgress({ ratio: 0.18, message: '필터 그래프 구성 중…' });
  const filter = buildFilterGraph(images.length, perImageDuration, captions);

  const args: string[] = [];
  for (let i = 0; i < images.length; i++) {
    args.push('-loop', '1', '-t', String(perImageDuration), '-i', `img${i}.jpg`);
  }
  args.push('-i', 'audio.mp3');
  args.push(
    '-filter_complex',
    filter,
    '-map',
    '[vout]',
    '-map',
    `${images.length}:a`,
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

  // cleanup
  try {
    for (let i = 0; i < images.length; i++) {
      await ffmpeg.deleteFile(`img${i}.jpg`);
    }
    await ffmpeg.deleteFile('audio.mp3');
    await ffmpeg.deleteFile('out.mp4');
  } catch {
    /* noop */
  }

  onProgress({ ratio: 1, message: '완료' });
  return blob;
}

export function estimateRenderSeconds(
  imageCount: number,
  audioDurationSec: number,
): number {
  // very rough heuristic for WASM ffmpeg on a typical laptop:
  // ~3x realtime + per-image overhead
  const base = audioDurationSec * 3;
  const overhead = imageCount * 1.5 + 6;
  return Math.ceil(base + overhead);
}

export async function probeAudioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const d = audio.duration;
      URL.revokeObjectURL(url);
      if (!Number.isFinite(d) || d <= 0) {
        reject(new Error('오디오 길이를 측정할 수 없습니다.'));
      } else {
        resolve(d);
      }
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('오디오 로딩 실패'));
    };
    audio.src = url;
  });
}
