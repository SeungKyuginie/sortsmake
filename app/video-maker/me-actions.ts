'use server';

import { createClient } from '@/lib/supabase/server';
import { emailToUsername } from '@/lib/auth/id';

export async function getMyStoreName(): Promise<{
  storeName: string;
  businessType: string;
  username: string;
}> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const storeName =
    user?.user_metadata && typeof user.user_metadata.storeName === 'string'
      ? user.user_metadata.storeName
      : '';
  const businessType =
    user?.user_metadata && typeof user.user_metadata.businessType === 'string'
      ? user.user_metadata.businessType
      : '';
  const username = emailToUsername(user?.email);
  return { storeName, businessType, username };
}
