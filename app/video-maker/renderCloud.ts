'use client';

// Cloud Run 서버 렌더링 흐름.
// 1) 사진/음성을 GCS에 직접 업로드 (서명된 PUT URL 사용)
// 2) Vercel API 통해 Cloud Run 호출
// 3) Cloud Run이 반환한 영상 URL에서 fetch해서 Blob으로 돌려줌
//
// Phase 2A: cover 모드 패닝 + panRatio 만 지원. 자막/블러/드론/BGM은 Phase 2B에서 포팅.

export type CloudRenderInput = {
  items: { file: File; kind: 'image' | 'video' }[];
  itemDurations: number[];
  audio: Blob;
  panRatio: number;
};

export type CloudRenderProgress = {
  ratio: number; // 0..1
  message: string;
};

type UploadUrlResponse = {
  renderId: string;
  photoUploads: { uploadUrl: string; gcsPath: string; contentType: string }[];
  audioUpload: { uploadUrl: string; gcsPath: string; contentType: string };
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
  const { items, itemDurations, audio, panRatio } = input;

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
    }),
  });
  if (!urlRes.ok) {
    const data = await urlRes.json().catch(() => ({}));
    throw new Error(data.error || `URL 발급 실패 (${urlRes.status})`);
  }
  const urlData = (await urlRes.json()) as UploadUrlResponse;
  if (!urlData.audioUpload) throw new Error('audioUpload 누락');

  // 2) 사진 + 음성을 GCS에 PUT (병렬)
  const N = items.length;
  let uploaded = 0;
  const updateUploadProgress = () => {
    uploaded += 1;
    const done = uploaded / (N + 1);
    onProgress({
      ratio: 0.05 + done * 0.45,
      message: `업로드 중… ${uploaded}/${N + 1}`,
    });
  };

  await Promise.all([
    ...items.map(async (it, i) => {
      const upload = urlData.photoUploads[i];
      await putToGcs(upload.uploadUrl, it.file, upload.contentType);
      updateUploadProgress();
    }),
    (async () => {
      await putToGcs(urlData.audioUpload.uploadUrl, audio, urlData.audioUpload.contentType);
      updateUploadProgress();
    })(),
  ]);

  // 3) Cloud Run 렌더 시작
  onProgress({ ratio: 0.55, message: '서버 렌더링 시작…' });
  const startRes = await fetch('/api/render-cloud/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      photoUrls: urlData.photoUploads.map((p) => p.gcsPath),
      audioUrl: urlData.audioUpload.gcsPath,
      itemDurations,
      panRatio,
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
