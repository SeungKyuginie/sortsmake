'use strict';

// Cloud Run 마트 숏츠 렌더링 서버 (Phase 2B).
// renderVideo.ts(브라우저 ffmpeg.wasm)의 모든 기능을 네이티브 ffmpeg로 포팅.
// 지원: cover/blur 프레임 스타일, 드론샷 zoompan, hook/phrase/CTA 자막
//       (자동 줄바꿈 + 슬램), BGM 믹스(루프+페이드), 1080p/720p 출력.

const express = require('express');
const { spawn } = require('child_process');
const { promises: fs } = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const https = require('https');
const { Storage } = require('@google-cloud/storage');

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 8080;
const BUCKET_NAME = process.env.BUCKET_NAME || '';
const storage = BUCKET_NAME ? new Storage() : null;

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const PHRASE_Y = Math.round(HEIGHT * 0.5);
const HOOK_Y = Math.round(HEIGHT * 0.18);
const CTA_Y = Math.round(HEIGHT * 0.18);
const FONT_BASE = 84;
const FONT_HOOK = 108;
const FONT_HOOK_SLAM = 136;
const FONT_CTA = 112;
const HOOK_SLAM_DURATION = 0.35;

const FONT_URL =
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Black.otf';

// ───────────────────────── 헬퍼 ─────────────────────────

function uid() {
  return crypto.randomBytes(6).toString('hex');
}

async function downloadFromGcs(gcsUrl, destPath) {
  const m = /^gs:\/\/([^/]+)\/(.+)$/.exec(gcsUrl);
  if (!m) throw new Error(`invalid gcs url: ${gcsUrl}`);
  const [, bucket, key] = m;
  await storage.bucket(bucket).file(key).download({ destination: destPath });
}

async function uploadOnly(localPath, key, contentType = 'video/mp4') {
  if (!storage || !BUCKET_NAME) throw new Error('BUCKET_NAME env not set');
  await storage.bucket(BUCKET_NAME).upload(localPath, {
    destination: key,
    metadata: { contentType, cacheControl: 'private, max-age=3600' },
  });
  return `gs://${BUCKET_NAME}/${key}`;
}

function runFfmpeg(args, onLog) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', args);
    let lastErr = '';
    ff.stderr.on('data', (d) => {
      const s = d.toString();
      lastErr = s;
      if (onLog) onLog(s);
    });
    ff.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${lastErr.slice(-1500)}`));
    });
    ff.on('error', reject);
  });
}

// 폰트 파일 한 번만 다운로드해서 캐시 (컨테이너 lifetime 동안 유지)
let cachedFontPath = null;
async function ensureFont() {
  if (cachedFontPath) return cachedFontPath;
  const dest = path.join(os.tmpdir(), 'pretendard-black.otf');
  try {
    await fs.access(dest);
    cachedFontPath = dest;
    return dest;
  } catch {
    /* not yet */
  }
  await new Promise((resolve, reject) => {
    const file = require('fs').createWriteStream(dest);
    https
      .get(FONT_URL, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // follow one redirect
          https
            .get(res.headers.location, (res2) => {
              res2.pipe(file);
              file.on('finish', () => file.close(resolve));
            })
            .on('error', reject);
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
      })
      .on('error', reject);
  });
  cachedFontPath = dest;
  return dest;
}

// ───────────────────────── 텍스트 ─────────────────────────

function escText(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, '’')
    .replace(/,/g, '\\,')
    .replace(/%/g, '\\%')
    .replace(/\n/g, ' ')
    .trim();
}

function wrapKoreanText(text, maxCharsPerLine) {
  const trimmed = (text || '').trim();
  if (!trimmed) return [];
  const tokens = trimmed.split(/\s+/);
  const lines = [];
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

function maxCharsForFont(fontSize, usableWidth = 960) {
  const charWidth = fontSize * 0.95;
  return Math.max(4, Math.floor(usableWidth / charWidth));
}

function drawTextNode(opts) {
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
  const parts = [];
  parts.push(`text='${escText(text)}'`);
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

function drawWrappedTextNodes(text, baseOpts) {
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

// ───────────────────────── 필터 그래프 ─────────────────────────

function buildItemChain(idx, T, opts) {
  const { droneShot = false, frameStyle = 'cover', panRatio = 0.6, srcWidth, srcHeight } = opts;
  const Tstr = T.toFixed(3);

  if (droneShot) {
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

  if (frameStyle === 'blur' && srcWidth && srcHeight) {
    const aspect = srcWidth / srcHeight;
    const canvasAspect = WIDTH / HEIGHT;
    const fillRatio = 0.9;
    const photoH = Math.round((HEIGHT * fillRatio) / 2) * 2;
    const photoW = Math.round((photoH * aspect) / 2) * 2;
    const dir = idx % 2 === 0 ? 1 : -1;

    if (aspect > canvasAspect && photoW > WIDTH) {
      const panRange = photoW - WIDTH;
      const usedRange = Math.round(panRange * panRatio);
      const startOffset = Math.round((panRange - usedRange) / 2);
      const xExpr =
        dir === 1
          ? `${startOffset} + ${usedRange}*(t/${Tstr})`
          : `${startOffset + usedRange} - ${usedRange}*(t/${Tstr})`;
      const yBlur = Math.round((HEIGHT - photoH) / 2);
      return (
        `[${idx}:v]split=2[bg${idx}][fg${idx}];` +
        `[bg${idx}]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,` +
        `crop=${WIDTH}:${HEIGHT},boxblur=12:2,setsar=1[bgX${idx}];` +
        `[fg${idx}]scale=${photoW}:${photoH},setsar=1,` +
        `crop=${WIDTH}:${photoH}:'${xExpr}':0[fgX${idx}];` +
        `[bgX${idx}][fgX${idx}]overlay=0:${yBlur},` +
        `fps=${FPS},format=yuv420p,setpts=PTS-STARTPTS[v${idx}]`
      );
    }

    return (
      `[${idx}:v]split=2[bg${idx}][fg${idx}];` +
      `[bg${idx}]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,` +
      `crop=${WIDTH}:${HEIGHT},boxblur=12:2,setsar=1[bgX${idx}];` +
      `[fg${idx}]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,setsar=1[fgX${idx}];` +
      `[bgX${idx}][fgX${idx}]overlay=(W-w)/2:(H-h)/2,` +
      `fps=${FPS},format=yuv420p,setpts=PTS-STARTPTS[v${idx}]`
    );
  }

  // cover (기본)
  const dir = idx % 2 === 0 ? 1 : -1;
  const halfAmp = (panRatio / 2).toFixed(4);
  const xExpr = `(in_w-${WIDTH})*0.5 + (in_w-${WIDTH})*${halfAmp}*${dir}*(2*t/${Tstr}-1)`;
  const yExpr = `(in_h-${HEIGHT})/2`;
  const aspectThreshold = (WIDTH / HEIGHT).toFixed(6);
  const scaleW = `if(gt(iw/ih\\,${aspectThreshold})\\,iw*${HEIGHT}/ih\\,${WIDTH})`;
  const scaleH = `if(gt(iw/ih\\,${aspectThreshold})\\,${HEIGHT}\\,ih*${WIDTH}/iw)`;

  return (
    `[${idx}:v]split=2[bg${idx}][fg${idx}];` +
    `[bg${idx}]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,` +
    `crop=${WIDTH}:${HEIGHT},boxblur=24:4,setsar=1[bgX${idx}];` +
    `[fg${idx}]scale=w='${scaleW}':h='${scaleH}',setsar=1,` +
    `crop=${WIDTH}:${HEIGHT}:'${xExpr}':'${yExpr}'[fgX${idx}];` +
    `[bgX${idx}][fgX${idx}]overlay=(W-w)/2:(H-h)/2,` +
    `fps=${FPS},format=yuv420p,setpts=PTS-STARTPTS[v${idx}]`
  );
}

// ───────────────────────── 엔드포인트 ─────────────────────────

app.get('/health', (_req, res) => {
  res.json({ ok: true, ffmpeg: 'ready', bucket: BUCKET_NAME || null });
});

app.get('/test', async (_req, res) => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-test-'));
  const out = path.join(tmp, 'test.mp4');
  try {
    await runFfmpeg([
      '-f', 'lavfi',
      '-i', 'color=c=blue:s=720x1280:d=5:r=30',
      '-vf', 'drawtext=text=\'sortsmake server OK\':fontcolor=white:fontsize=60:x=(w-text_w)/2:y=(h-text_h)/2',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-y', out,
    ]);
    const buf = await fs.readFile(out);
    res.set('Content-Type', 'video/mp4');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
});

// 풀 기능 렌더링
// body 형식 (renderVideo.ts RenderInput과 거의 동일):
// {
//   photoUrls: string[],        // gs:// paths
//   photoWidths: number[],      // src 픽셀 (blur fit 계산용, 옵션)
//   photoHeights: number[],
//   audioUrl: string,           // gs://
//   bgmUrl?: string,            // gs:// (선택)
//   itemDurations: number[],
//   droneShots?: boolean[],
//   frameStyle?: 'cover' | 'blur',
//   panRatio?: number,
//   resolution?: '1080p' | '720p',
//   hookText?: string,
//   hookStart?: number,
//   hookEnd?: number,
//   ctaText?: string,
//   ctaStart?: number,
//   ctaEnd?: number,
//   phrases?: { text, start, end }[],
//   bgmVolume?: number,
//   audioDurationSec: number,
//   outputKey: string,
// }
app.post('/render', async (req, res) => {
  const renderId = uid();
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `sm-${renderId}-`));
  const startedAt = Date.now();

  try {
    const b = req.body || {};
    if (!Array.isArray(b.photoUrls) || b.photoUrls.length === 0) {
      return res.status(400).json({ error: 'photoUrls required' });
    }
    if (!b.audioUrl) return res.status(400).json({ error: 'audioUrl required' });
    if (!Array.isArray(b.itemDurations) || b.itemDurations.length !== b.photoUrls.length) {
      return res.status(400).json({ error: 'itemDurations length must match photoUrls' });
    }
    if (!b.outputKey) return res.status(400).json({ error: 'outputKey required' });
    if (!storage) return res.status(500).json({ error: 'BUCKET_NAME not configured' });

    const N = b.photoUrls.length;
    const frameStyle = b.frameStyle === 'blur' ? 'blur' : 'cover';
    const panRatio = Math.min(1, Math.max(0, Number(b.panRatio ?? 0.6)));
    const resolution = b.resolution === '720p' ? '720p' : '1080p';

    // 1) 사진/음성/BGM 다운로드
    const photoFiles = [];
    for (let i = 0; i < N; i++) {
      const local = path.join(tmp, `photo${i}.jpg`);
      await downloadFromGcs(b.photoUrls[i], local);
      photoFiles.push(local);
    }
    const audioFile = path.join(tmp, 'audio.mp3');
    await downloadFromGcs(b.audioUrl, audioFile);
    let bgmFile = null;
    if (b.bgmUrl) {
      bgmFile = path.join(tmp, 'bgm.bin');
      await downloadFromGcs(b.bgmUrl, bgmFile);
    }

    // 2) 폰트 준비
    const fontFile = await ensureFont();

    // 3) 마지막 아이템에 0.3초 안전 버퍼 (음성 길이 ≥ 영상 길이 보장)
    const rawDurs = b.itemDurations.slice();
    const itemDurations = rawDurs.map((d, i) => (i === N - 1 ? d + 0.3 : d));

    // 4) 비디오 필터 체인
    const itemChains = itemDurations.map((d, i) =>
      buildItemChain(i, d, {
        droneShot: Array.isArray(b.droneShots) ? !!b.droneShots[i] : false,
        frameStyle,
        panRatio,
        srcWidth: Array.isArray(b.photoWidths) ? b.photoWidths[i] : undefined,
        srcHeight: Array.isArray(b.photoHeights) ? b.photoHeights[i] : undefined,
      }),
    );

    const concatIn = photoFiles.map((_, i) => `[v${i}]`).join('');
    const concatStep =
      N > 1
        ? `${concatIn}concat=n=${N}:v=1:a=0[concat0]`
        : `[v0]null[concat0]`;

    // 5) 자막 (hook + slam + phrases + cta)
    const drawNodes = [];
    if (b.hookText && b.hookText.trim() && Number.isFinite(b.hookStart) && Number.isFinite(b.hookEnd) && b.hookEnd > b.hookStart) {
      const slamEnd = Math.min(b.hookStart + HOOK_SLAM_DURATION, b.hookEnd);
      if (slamEnd > b.hookStart) {
        drawNodes.push(
          ...drawWrappedTextNodes(b.hookText, {
            start: b.hookStart,
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
      if (b.hookEnd > slamEnd) {
        drawNodes.push(
          ...drawWrappedTextNodes(b.hookText, {
            start: slamEnd,
            end: b.hookEnd,
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

    if (Array.isArray(b.phrases)) {
      for (const p of b.phrases) {
        if (!p || typeof p.text !== 'string' || !p.text.trim()) continue;
        if (!(p.end > p.start)) continue;
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

    if (b.ctaText && b.ctaText.trim() && Number.isFinite(b.ctaStart) && Number.isFinite(b.ctaEnd) && b.ctaEnd > b.ctaStart) {
      drawNodes.push(
        ...drawWrappedTextNodes(b.ctaText, {
          start: b.ctaStart,
          end: b.ctaEnd,
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

    // 6) 오디오 믹스 (음성 + 선택적 BGM)
    const voiceIdx = N;
    const bgmIdx = N + 1;
    const bgmVolume = Math.min(0.6, Math.max(0, Number(b.bgmVolume ?? 0.16)));
    const voiceVolume = 1.0;
    const audioDurationSec = Number(b.audioDurationSec) || itemDurations.reduce((a, c) => a + c, 0);

    let audioMixFilter = '';
    let audioMap = `${voiceIdx}:a`;
    if (bgmFile) {
      audioMixFilter =
        `;[${voiceIdx}:a]volume=${voiceVolume}[vc];` +
        `[${bgmIdx}:a]aloop=loop=-1:size=2e9,volume=${bgmVolume},` +
        `afade=t=in:st=0:d=0.6,afade=t=out:st=${Math.max(0, audioDurationSec - 0.8).toFixed(3)}:d=0.8[bg];` +
        `[vc][bg]amix=inputs=2:duration=first:dropout_transition=0[aout]`;
      audioMap = '[aout]';
    }

    const filter = `${itemChains.join(';')};${concatStep};${textChain}${audioMixFilter}`;

    // 7) ffmpeg args
    const args = [];
    for (let i = 0; i < N; i++) {
      args.push('-loop', '1', '-t', itemDurations[i].toFixed(3), '-i', photoFiles[i]);
    }
    args.push('-i', audioFile);
    if (bgmFile) args.push('-i', bgmFile);

    args.push(
      '-filter_complex', filter,
      '-map', '[vout]',
      '-map', audioMap,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-r', String(FPS),
    );
    if (resolution === '720p') {
      args.push('-s', '720x1280');
    }
    args.push(
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest',
      '-movflags', '+faststart',
      '-preset', 'veryfast',
      '-y',
    );

    const outLocal = path.join(tmp, 'out.mp4');
    args.push(outLocal);

    await runFfmpeg(args);

    // 8) 결과 업로드 (서명 URL은 Vercel에서 발급)
    const gcsPath = await uploadOnly(outLocal, b.outputKey, 'video/mp4');

    res.json({
      ok: true,
      gcsPath,
      outputKey: b.outputKey,
      elapsedMs: Date.now() - startedAt,
      renderId,
    });
  } catch (err) {
    console.error('[render] error:', err);
    res.status(500).json({ error: err.message || String(err) });
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
});

app.listen(PORT, () => {
  console.log(`sortsmake server listening on :${PORT}`);
});
