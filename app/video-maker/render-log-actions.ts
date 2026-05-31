'use server';

import { createClient } from '@/lib/supabase/server';

export async function recordRender(input: {
  kind?: 'mart' | 'photo_studio';
  durationSec?: number;
  sizeBytes?: number;
  storeName?: string;
}): Promise<{ error?: string }> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: '로그인이 필요합니다.' };
    const { error } = await supabase.from('user_renders').insert({
      user_id: user.id,
      kind: input.kind ?? null,
      duration_sec: Math.round(input.durationSec ?? 0) || null,
      size_bytes: input.sizeBytes ?? null,
      store_name: input.storeName ?? null,
    });
    if (error) return { error: error.message };
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
