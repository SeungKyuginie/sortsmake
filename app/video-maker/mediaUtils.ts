'use client';

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export async function probeMediaSize(
  file: File,
  kind: 'image' | 'video',
): Promise<{ width?: number; height?: number }> {
  try {
    if (kind === 'image') {
      const bmp = await createImageBitmap(file);
      const dim = { width: bmp.width, height: bmp.height };
      bmp.close?.();
      return dim;
    }
    const url = URL.createObjectURL(file);
    try {
      const v = document.createElement('video');
      v.src = url;
      v.preload = 'metadata';
      v.muted = true;
      await new Promise<void>((resolve, reject) => {
        v.addEventListener('loadedmetadata', () => resolve(), { once: true });
        v.addEventListener('error', () => reject(new Error('video probe failed')), { once: true });
      });
      return { width: v.videoWidth, height: v.videoHeight };
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return {};
  }
}
