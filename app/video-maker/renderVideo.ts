'use client';

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const FFMPEG_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';
const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const FADE_DURATION = 0.5; // seconds

export type RenderItem = {
  file: File;
  kind: 'image' | 'video';
};

export type RenderInput = {
  items: RenderItem[];
  captions: string[]; // per-item caption (optional, may be empty strings)
  audio: Blob;
  audioDurationSec: number;
  // 코너별 음성 길이(초). 항목 수와 맞아야 하고, 합 == audioDurationSec.
  // 미지정 시 audio 길이를 항목 수로 균등 분할.
  perItemDurations?: number[];
  bgm?: Blob | null;
  bgmVolume?: number; // 0..1, default 0.18
  voiceVolume?: number; // 0..1, default 1
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
  items: RenderItem[],
  itemDurations: number[],
  captions: string[],
): string {
  const segments: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const T = itemDurations[i];
    const caption = sanitizeCaption(captions[i] ?? '');
    const isVideo = items[i].kind === 'video';
    const base =
      `[${i}:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,` +
      `pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,` +
      `setsar=1,fps=${FPS},format=yuv420p`;
    // Videos: ensure exactly T seconds (pad last frame, trim). Images are looped
    // via -loop 1 -t T input flag, so they already produce T-second streams.
    const lengthFix = isVideo
      ? `,tpad=stop_mode=clone:stop_duration=${T.toFixed(3)},` +
        `trim=duration=${T.toFixed(3)},setpts=PTS-STARTPTS`
      : '';
    const withText = caption
      ? `${base}${lengthFix},drawtext=text='${caption}':fontcolor=white:fontsize=64:` +
        `box=1:boxcolor=black@0.55:boxborderw=24:` +
        `x=(w-text_w)/2:y=h-380`
      : `${base}${lengthFix}`;
    segments.push(`${withText}[v${i}]`);
  }

  if (items.length === 1) {
    segments.push(
      `[v0]trim=duration=${itemDurations[0].toFixed(3)},setpts=PTS-STARTPTS[vout]`,
    );
    return segments.join(';');
  }

  // Cumulative xfade with per-item durations.
  // After each xfade, combined length = prev_cum + T_i - FADE.
  let prev = 'v0';
  let cum = itemDurations[0];
  for (let i = 1; i < items.length; i++) {
    const offset = cum - FADE_DURATION;
    const out = i === items.length - 1 ? 'vout' : `vx${i}`;
    segments.push(
      `[${prev}][v${i}]xfade=transition=fade:duration=${FADE_DURATION}:offset=${offset.toFixed(3)}[${out}]`,
    );
    prev = out;
    cum += itemDurations[i] - FADE_DURATION;
  }

  return segments.join(';');
}

export async function renderVideo(
  input: RenderInput,
  onProgress: (p: RenderProgress) => void,
): Promise<Blob> {
  const {
    items,
    captions,
    audio,
    audioDurationSec,
    perItemDurations,
    bgm,
    bgmVolume = 0.18,
    voiceVolume = 1.0,
  } = input;
  if (items.length === 0) throw new Error('업로드된 미디어가 없습니다.');
  if (!audioDurationSec || audioDurationSec <= 0)
    throw new Error('오디오 길이를 알 수 없습니다.');

  onProgress({ ratio: 0.02, message: 'FFmpeg 초기화 중…' });
  const ffmpeg = await getFFmpeg();

  // 코너별 길이 결정.
  // - perItemDurations가 주어지면 그 값을 사용 (sync 모드).
  // - 합이 audioDurationSec과 다르면, 합의 비율을 보존해 audioDurationSec에 정규화.
  // - 마지막 클립을 (N-1)*FADE_DURATION 만큼 늘려, xfade로 손실되는 시간만큼 보정.
  let itemDurations: number[];
  if (perItemDurations && perItemDurations.length === items.length) {
    const sum = perItemDurations.reduce((a, b) => a + b, 0);
    const scale = sum > 0 ? audioDurationSec / sum : 1;
    itemDurations = perItemDurations.map((d) => Math.max(0.5, d * scale));
  } else {
    const per = audioDurationSec / items.length;
    itemDurations = Array(items.length).fill(per);
  }
  if (items.length > 1) {
    itemDurations[items.length - 1] += (items.length - 1) * FADE_DURATION;
  }
  const minPer = Math.min(...itemDurations);
  if (minPer <= FADE_DURATION + 0.1 && items.length > 1) {
    onProgress({
      ratio: 0.03,
      message: '경고: 미디어당 시간이 매우 짧습니다.',
    });
  }

  // Hook ffmpeg progress
  ffmpeg.on('progress', ({ progress }) => {
    if (Number.isFinite(progress)) {
      const ratio = 0.2 + Math.min(0.78, Math.max(0, progress) * 0.78);
      onProgress({ ratio, message: `영상 인코딩 중… ${(progress * 100).toFixed(0)}%` });
    }
  });

  onProgress({ ratio: 0.06, message: '미디어 업로드 중…' });
  // Write inputs. Use generic names; ffmpeg detects format from content.
  const inputNames: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const name = items[i].kind === 'video' ? `media${i}.mp4` : `media${i}.jpg`;
    inputNames.push(name);
    const data = await fetchFile(items[i].file);
    await ffmpeg.writeFile(name, data);
  }
  const audioData = await fetchFile(audio);
  await ffmpeg.writeFile('audio.mp3', audioData);

  let bgmFile: string | null = null;
  if (bgm) {
    onProgress({ ratio: 0.1, message: '배경음악 업로드 중…' });
    const bgmData = await fetchFile(bgm);
    // ffmpeg picks the right demuxer from file content; extension is just a label.
    bgmFile = 'bgm.bin';
    await ffmpeg.writeFile(bgmFile, bgmData);
  }

  onProgress({ ratio: 0.18, message: '필터 그래프 구성 중…' });
  const videoFilter = buildFilterGraph(items, itemDurations, captions);

  const voiceIdx = items.length;
  const bgmIdx = items.length + 1;
  const audioMixFilter = bgmFile
    ? `;[${voiceIdx}:a]volume=${voiceVolume}[vc];` +
      `[${bgmIdx}:a]aloop=loop=-1:size=2e9,volume=${bgmVolume},` +
      `afade=t=in:st=0:d=0.6,afade=t=out:st=${Math.max(0, audioDurationSec - 0.8).toFixed(3)}:d=0.8[bg];` +
      `[vc][bg]amix=inputs=2:duration=first:dropout_transition=0[aout]`
    : '';
  const filter = videoFilter + audioMixFilter;
  const audioMap = bgmFile ? '[aout]' : `${voiceIdx}:a`;

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
      // Video: let the filter graph (tpad+trim) handle length, no -t needed.
      args.push('-i', inputNames[i]);
    }
  }
  args.push('-i', 'audio.mp3');
  if (bgmFile) args.push('-i', bgmFile);
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

  // cleanup
  try {
    for (const name of inputNames) {
      await ffmpeg.deleteFile(name);
    }
    await ffmpeg.deleteFile('audio.mp3');
    if (bgmFile) await ffmpeg.deleteFile(bgmFile);
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
  // very rough heuristic for WASM ffmpeg on a typical laptop:
  // ~3x realtime + per-item overhead
  const base = audioDurationSec * 3;
  const overhead = itemCount * 1.5 + 6;
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
