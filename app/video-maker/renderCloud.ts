'use client';

// Cloud Run 서버 렌더링 흐름 (Phase 2B).
// 풀 기능: 자막, 블러 액자, 드론샷, BGM, 패닝 모두 지원.
// 1) 사진/음성/BGM을 GCS에 직접 업로드 (서명된 PUT URL)
// 2) Vercel API → Cloud Run 호출 (모든 설정 + 자막 타임라인 포함)
// 3) Vercel이 서명한 다운로드 URL로 결과 영상 가져옴

export type CloudRenderPhrase = {
  text: string;
  start: number;
  end: number;
};

export type CloudRenderInput = {
  items: {
    file: File;
    kind: 'image' | 'video';
    width?: number;
    height?: number;
    droneShot?: boolean;
    effectMode?: 'static' | 'pan' | 'zoom_in' | 'zoom_out';
  }[];
  itemDurations: number[];
  frameStyle?: 'cover' | 'blur';
  panRatio?: number;
  resolution?: '1080p' | '720p';
  audio: Blob;
  audioDurationSec: number;
  bgm?: Blob | null;
  bgmVolume?: number;
  hookText?: string;
  hookStart?: number;
  hookEnd?: number;
  ctaText?: string;
  ctaStart?: number;
  ctaEnd?: number;
  phrases?: CloudRenderPhrase[];
  watermarkText?: string;
};

export type CloudRenderProgress = {
  ratio: number;
  message: string;
};

type UploadUrlResponse = {
  renderId: string;
  photoUploads: { uploadUrl: string; gcsPath: string; contentType: string }[];
  audioUpload: { uploadUrl: string; gcsPath: string; contentType: string };
  bgmUpload?: { uploadUrl: string; gcsPath: string; contentType: string } | null;
  outputKey: string;
};

type StartResponse = {
  ok: boolean;
  videoUrl: string;
  elapsedMs?: number;
  renderId?: string;
};

async function putToGcs(url: string, blob: Blob, contentType: string): Promise<void> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GCS 업로드 실패 (${res.status}): ${text.slice(0, 200)}`);
  }
}

export async function renderOnCloud(
  input: CloudRenderInput,
  onProgress: (p: CloudRenderProgress) => void,
): Promise<Blob> {
  const { items, itemDurations, audio, bgm } = input;

  if (items.length === 0) throw new Error('업로드된 미디어가 없습니다.');
  if (items.length !== itemDurations.length) {
    throw new Error('itemDurations 길이가 items와 다릅니다.');
  }

  // 1) 업로드 URL 발급
  onProgress({ ratio: 0.02, message: '서명 URL 발급 중…' });
  const urlRes = await fetch('/api/render-cloud/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      photos: items.map((it) => ({
        mediaType: it.file.type || (it.kind === 'video' ? 'video/mp4' : 'image/jpeg'),
      })),
      audio: { mediaType: 'audio/mpeg' },
      bgm: bgm ? { mediaType: bgm.type || 'audio/mpeg' } : undefined,
    }),
  });
  if (!urlRes.ok) {
    const data = await urlRes.json().catch(() => ({}));
    throw new Error(data.error || `URL 발급 실패 (${urlRes.status})`);
  }
  const urlData = (await urlRes.json()) as UploadUrlResponse;
  if (!urlData.audioUpload) throw new Error('audioUpload 누락');

  // 2) 업로드 (사진 + 음성 + 선택적 BGM, 병렬)
  const N = items.length;
  const totalUploads = N + 1 + (bgm ? 1 : 0);
  let uploaded = 0;
  const updateUploadProgress = () => {
    uploaded += 1;
    const done = uploaded / totalUploads;
    onProgress({
      ratio: 0.05 + done * 0.45,
      message: `업로드 중… ${uploaded}/${totalUploads}`,
    });
  };

  const uploads: Promise<void>[] = [];
  items.forEach((it, i) => {
    const upload = urlData.photoUploads[i];
    uploads.push(
      (async () => {
        await putToGcs(upload.uploadUrl, it.file, upload.contentType);
        updateUploadProgress();
      })(),
    );
  });
  uploads.push(
    (async () => {
      await putToGcs(urlData.audioUpload.uploadUrl, audio, urlData.audioUpload.contentType);
      updateUploadProgress();
    })(),
  );
  if (bgm && urlData.bgmUpload) {
    const bgmUp = urlData.bgmUpload;
    uploads.push(
      (async () => {
        await putToGcs(bgmUp.uploadUrl, bgm, bgmUp.contentType);
        updateUploadProgress();
      })(),
    );
  }
  await Promise.all(uploads);

  // 3) Cloud Run 렌더 시작 — 모든 설정 + 자막 타임라인 전달
  onProgress({ ratio: 0.55, message: '서버 렌더링 시작…' });
  const startRes = await fetch('/api/render-cloud/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      photoUrls: urlData.photoUploads.map((p) => p.gcsPath),
      photoWidths: items.map((it) => it.width ?? 0),
      photoHeights: items.map((it) => it.height ?? 0),
      audioUrl: urlData.audioUpload.gcsPath,
      bgmUrl: urlData.bgmUpload?.gcsPath ?? null,
      itemDurations,
      droneShots: items.map((it) => !!it.droneShot),
      effectModes: items.map((it) => it.effectMode ?? null),
      photoKinds: items.map((it) => it.kind),
      frameStyle: input.frameStyle ?? 'cover',
      panRatio: input.panRatio ?? 0.6,
      resolution: input.resolution ?? '1080p',
      hookText: input.hookText ?? '',
      hookStart: input.hookStart ?? 0,
      hookEnd: input.hookEnd ?? 0,
      ctaText: input.ctaText ?? '',
      ctaStart: input.ctaStart ?? 0,
      ctaEnd: input.ctaEnd ?? 0,
      phrases: input.phrases ?? [],
      watermarkText: input.watermarkText ?? '',
      bgmVolume: input.bgmVolume ?? 0.16,
      audioDurationSec: input.audioDurationSec,
      outputKey: urlData.outputKey,
    }),
  });
  if (!startRes.ok) {
    const data = await startRes.json().catch(() => ({}));
    throw new Error(data.error || `서버 렌더 실패 (${startRes.status})`);
  }
  const startData = (await startRes.json()) as StartResponse;
  if (!startData.videoUrl) throw new Error('videoUrl이 응답에 없습니다.');

  // 4) 결과 영상 다운로드
  onProgress({ ratio: 0.92, message: '영상 다운로드 중…' });
  const videoRes = await fetch(startData.videoUrl);
  if (!videoRes.ok) {
    throw new Error(`영상 다운로드 실패 (${videoRes.status})`);
  }
  const blob = await videoRes.blob();

  onProgress({ ratio: 1, message: '완료' });
  return blob;
}
