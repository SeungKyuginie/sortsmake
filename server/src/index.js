'use strict';

// Cloud Run에서 동작하는 마트 숏츠 렌더링 서버 (Phase 1).
// 사진 + 음성을 받아 1080×1920 MP4로 합성해 돌려줌.
// 현재 구현: cover 모드 + 자막 + 패닝까지. Phase 2에서 블러 액자/드론샷/BGM 추가 예정.

const express = require('express');
const { spawn } = require('child_process');
const { promises: fs } = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { Storage } = require('@google-cloud/storage');

const app = express();
app.use(express.json({ limit: '100mb' }));

const PORT = process.env.PORT || 8080;
const BUCKET_NAME = process.env.BUCKET_NAME || '';
const storage = BUCKET_NAME ? new Storage() : null;

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;

// ───────────────────────── 헬퍼 ─────────────────────────

function uid() {
  return crypto.randomBytes(6).toString('hex');
}

async function downloadFromGcs(gcsUrl, destPath) {
  // gs://bucket/path/to/file → local destPath
  const m = /^gs:\/\/([^/]+)\/(.+)$/.exec(gcsUrl);
  if (!m) throw new Error(`invalid gcs url: ${gcsUrl}`);
  const [, bucket, key] = m;
  await storage.bucket(bucket).file(key).download({ destination: destPath });
}

async function uploadToGcs(localPath, key, contentType = 'video/mp4') {
  if (!storage || !BUCKET_NAME) throw new Error('BUCKET_NAME env not set');
  await storage.bucket(BUCKET_NAME).upload(localPath, {
    destination: key,
    metadata: { contentType, cacheControl: 'private, max-age=3600' },
  });
  // 1시간짜리 서명된 URL 발급 (브라우저에서 직접 다운로드 가능)
  const [signed] = await storage.bucket(BUCKET_NAME).file(key).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + 60 * 60 * 1000,
  });
  return signed;
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
      else reject(new Error(`ffmpeg exit ${code}: ${lastErr.slice(-1000)}`));
    });
    ff.on('error', reject);
  });
}

// ───────────────────────── 필터 그래프 빌더 ─────────────────────────
// 클라이언트 renderVideo.ts의 cover 모드 로직을 그대로 포팅.

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

function buildItemChain(idx, T, panRatio) {
  const Tstr = T.toFixed(3);
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

// FFmpeg 자체 동작 확인용 — 색깔 그라데이션 5초 생성해서 돌려줌
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

// 실제 렌더링 엔드포인트
// 요청 body 예:
// {
//   "photoUrls": ["gs://bucket/render-id/photo-0.jpg", ...],
//   "audioUrl": "gs://bucket/render-id/audio.mp3",
//   "itemDurations": [4.2, 4.2, ...],
//   "panRatio": 0.6,
//   "outputKey": "render-id/out.mp4"
// }
app.post('/render', async (req, res) => {
  const renderId = uid();
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `sm-${renderId}-`));
  const startedAt = Date.now();

  try {
    const {
      photoUrls,
      audioUrl,
      itemDurations,
      panRatio = 0.6,
      outputKey,
    } = req.body || {};

    if (!Array.isArray(photoUrls) || photoUrls.length === 0) {
      return res.status(400).json({ error: 'photoUrls required' });
    }
    if (!audioUrl) return res.status(400).json({ error: 'audioUrl required' });
    if (!Array.isArray(itemDurations) || itemDurations.length !== photoUrls.length) {
      return res.status(400).json({ error: 'itemDurations length must match photoUrls' });
    }
    if (!outputKey) return res.status(400).json({ error: 'outputKey required' });
    if (!storage) return res.status(500).json({ error: 'BUCKET_NAME not configured' });

    // 1) GCS에서 사진/음성 다운로드
    const photoFiles = [];
    for (let i = 0; i < photoUrls.length; i++) {
      const local = path.join(tmp, `photo${i}.jpg`);
      await downloadFromGcs(photoUrls[i], local);
      photoFiles.push(local);
    }
    const audioFile = path.join(tmp, 'audio.mp3');
    await downloadFromGcs(audioUrl, audioFile);

    // 2) FFmpeg 명령 구성
    const args = [];
    for (let i = 0; i < photoFiles.length; i++) {
      args.push(
        '-loop', '1',
        '-t', itemDurations[i].toFixed(3),
        '-i', photoFiles[i],
      );
    }
    args.push('-i', audioFile);

    const itemChains = photoFiles.map((_, i) =>
      buildItemChain(i, itemDurations[i], panRatio),
    );
    const concatIn = photoFiles.map((_, i) => `[v${i}]`).join('');
    const concatStep =
      photoFiles.length > 1
        ? `${concatIn}concat=n=${photoFiles.length}:v=1:a=0[vout]`
        : `[v0]null[vout]`;
    const filter = `${itemChains.join(';')};${concatStep}`;

    const outLocal = path.join(tmp, 'out.mp4');
    args.push(
      '-filter_complex', filter,
      '-map', '[vout]',
      '-map', `${photoFiles.length}:a`,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-r', String(FPS),
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest',
      '-movflags', '+faststart',
      '-preset', 'veryfast',
      '-y', outLocal,
    );

    // 3) 실행
    await runFfmpeg(args, (log) => {
      // 무거운 로그는 보내지 않음 — 마지막만 메모리에 보관
    });

    // 4) 결과물 GCS 업로드 후 서명된 URL 반환
    const signedUrl = await uploadToGcs(outLocal, outputKey, 'video/mp4');

    const elapsedMs = Date.now() - startedAt;
    res.json({
      ok: true,
      videoUrl: signedUrl,
      elapsedMs,
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
