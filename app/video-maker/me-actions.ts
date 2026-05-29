'use server';

import { createClient } from '@/lib/supabase/server';

export async function getMyStoreName(): Promise<{ storeName: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const storeName =
    user?.user_metadata && typeof user.user_metadata.storeName === 'string'
      ? user.user_metadata.storeName
      : '';
  return { storeName };
}
