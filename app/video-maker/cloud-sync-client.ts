'use client';

import { createClient } from '@/lib/supabase/client';

const BUCKET = 'user-uploads';

function safeExt(filename: string, fallback = 'bin'): string {
  const m = /\.([a-zA-Z0-9]+)$/.exec(filename);
  if (!m) return fallback;
  return m[1].toLowerCase().slice(0, 8);
}

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 64);
}

export async function uploadPhotoToCloud(
  photoId: string,
  file: File,
  options: { isOriginal?: boolean } = {},
): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const ext = safeExt(file.name);
  const suffix = options.isOriginal ? '.original' : '';
  const path = `photos/${user.id}/${safeId(photoId)}${suffix}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || undefined });
  if (error) return null;
  return path;
}

export async function downloadPhotoFromCloud(
  path: string,
): Promise<File | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  const filename = path.split('/').pop() ?? 'photo';
  return new File([data], filename, {
    type: data.type || 'application/octet-stream',
  });
}

export async function removePhotoFromCloud(path: string): Promise<void> {
  const supabase = createClient();
  await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
}

// 본인 사진 폴더 전체 삭제 (초기화/로그아웃 시)
export async function removeAllMyPhotosFromCloud(): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const folder = `photos/${user.id}`;
  const { data } = await supabase.storage.from(BUCKET).list(folder);
  if (!data || data.length === 0) return;
  const paths = data.map((f) => `${folder}/${f.name}`);
  await supabase.storage.from(BUCKET).remove(paths).catch(() => undefined);
}
