'use server';

import { createClient } from '@/lib/supabase/server';

// 클라우드 동기화 대상 텍스트/메타 상태. 사진 파일은 Storage, 메타는 여기서.
export type CloudPhoto = {
  id: string;
  storagePath: string;
  kind: 'image' | 'video';
  description: string;
  cornerName?: string;
  droneShot?: boolean;
  width?: number;
  height?: number;
  originalStoragePath?: string;
  originalKind?: 'image' | 'video';
};

export type CloudState = {
  storeNameOverride?: string;
  duration?: number;
  frameStyle?: 'cover' | 'blur';
  panRatio?: number;
  resolution?: string;
  voiceId?: string;
  voiceVarietyEnabled?: boolean;
  hookVoiceId?: string;
  cornerVoiceId?: string;
  ctaVoiceId?: string;
  bgmId?: string;
  bgmVolume?: number;
  bgmMode?: string;
  script?: unknown;
  photos?: CloudPhoto[];
  renderMode?: 'browser' | 'server';
  useScript?: boolean;
  useVoice?: boolean;
};

function ensureUser() {
  const supabase = createClient();
  return supabase.auth.getUser().then(({ data }) => {
    if (!data.user) throw new Error('로그인이 필요합니다.');
    return { supabase, userId: data.user.id };
  });
}

export async function saveCloudState(
  state: CloudState,
): Promise<{ error?: string }> {
  try {
    const { supabase, userId } = await ensureUser();
    const { error } = await supabase
      .from('user_sessions')
      .upsert(
        { user_id: userId, state, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
    if (error) return { error: error.message };
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function loadCloudState(): Promise<{
  state?: CloudState;
  error?: string;
}> {
  try {
    const { supabase, userId } = await ensureUser();
    const { data, error } = await supabase
      .from('user_sessions')
      .select('state')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return { error: error.message };
    return { state: (data?.state as CloudState | undefined) ?? undefined };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function clearCloudState(): Promise<{ error?: string }> {
  try {
    const { supabase, userId } = await ensureUser();
    const { error } = await supabase
      .from('user_sessions')
      .delete()
      .eq('user_id', userId);
    if (error) return { error: error.message };
    // Storage의 사진/음성도 정리
    await supabase.storage
      .from('user-uploads')
      .remove([`photos/${userId}/`])
      .catch(() => {});
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// 사진 업로드용 signed URL 발급 (브라우저에서 직접 PUT)
export async function getPhotoUploadUrl(input: {
  index: number;
  contentType: string;
  extension: string;
}): Promise<{ uploadUrl?: string; path?: string; error?: string }> {
  try {
    const { supabase, userId } = await ensureUser();
    const safeExt = (input.extension || 'bin').replace(/[^a-z0-9]/gi, '');
    const path = `photos/${userId}/${input.index}.${safeExt}`;
    const { data, error } = await supabase.storage
      .from('user-uploads')
      .createSignedUploadUrl(path);
    if (error || !data) {
      return { error: error?.message ?? '업로드 URL 발급 실패' };
    }
    return { uploadUrl: data.signedUrl, path };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// 사진 다운로드용 signed URL
export async function getPhotoDownloadUrl(
  path: string,
): Promise<{ url?: string; error?: string }> {
  try {
    const { supabase } = await ensureUser();
    const { data, error } = await supabase.storage
      .from('user-uploads')
      .createSignedUrl(path, 60 * 60); // 1시간
    if (error || !data) {
      return { error: error?.message ?? '다운로드 URL 발급 실패' };
    }
    return { url: data.signedUrl };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
