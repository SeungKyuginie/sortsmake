'use client';

export type EncodedImage = {
  base64: string;
  mediaType: 'image/jpeg';
};

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

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('이미지 인코딩 실패'))),
      'image/jpeg',
      quality,
    );
  });

  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return { base64: btoa(binary), mediaType: 'image/jpeg' };
}
