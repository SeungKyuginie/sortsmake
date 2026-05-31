'use server';

import { createClient } from '@/lib/supabase/server';
import { emailToUsername } from '@/lib/auth/id';
import { isAdminUsername } from '@/lib/auth/admin';

export async function getMyStoreName(): Promise<{
  storeName: string;
  businessType: string;
  username: string;
  isAdmin: boolean;
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
  const isAdmin = isAdminUsername(username);
  return { storeName, businessType, username, isAdmin };
}
