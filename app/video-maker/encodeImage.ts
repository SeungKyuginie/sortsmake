'use client';

export type EncodedImage = {
  base64: string;
  mediaType: 'image/jpeg';
};

async function blobToBase64Jpeg(blob: Blob): Promise<EncodedImage> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return { base64: btoa(binary), mediaType: 'image/jpeg' };
}

async function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('이미지 인코딩 실패'))),
      'image/jpeg',
      quality,
    );
  });
}

// Downscale a File to a JPEG base64 string (no `data:` prefix) suitable for
// the Anthropic Messages API. We cap the longest edge so the request body stays
// small enough for a typical photo set.
export async function encodeImageForClaude(
  file: File,
  maxEdge = 1280,
  quality = 0.82,
): Promise<EncodedImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2D 컨텍스트를 가져올 수 없습니다.');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob = await canvasToJpegBlob(canvas, quality);
  return blobToBase64Jpeg(blob);
}

// 동영상의 첫 프레임(혹은 0.1초 지점)을 캡처해서 Claude vision에 넘길 수 있는
// 다운스케일된 JPEG base64로 반환.
export async function encodeVideoFirstFrame(
  file: File,
  maxEdge = 1280,
  quality = 0.82,
): Promise<EncodedImage> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => resolve();
      const onErr = () => reject(new Error('비디오 메타데이터 로드 실패'));
      video.addEventListener('loadeddata', onLoaded, { once: true });
      video.addEventListener('error', onErr, { once: true });
    });

    // 검은 프레임 방지를 위해 살짝 안쪽으로 seek
    const target = Math.min(0.1, Math.max(0, (video.duration || 1) / 2));
    if (Number.isFinite(target) && target > 0) {
      await new Promise<void>((resolve) => {
        video.addEventListener('seeked', () => resolve(), { once: true });
        video.currentTime = target;
      });
    }

    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    const scale = Math.min(1, maxEdge / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2D 컨텍스트를 가져올 수 없습니다.');
    ctx.drawImage(video, 0, 0, cw, ch);

    const blob = await canvasToJpegBlob(canvas, quality);
    return blobToBase64Jpeg(blob);
  } finally {
    URL.revokeObjectURL(url);
  }
}
