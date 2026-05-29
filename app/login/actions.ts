'use server';

import { createClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin';

type SignInInput = {
  email: string;
  password: string;
  redirectTo: string;
};

export async function signInAction(
  input: SignInInput,
): Promise<{ error?: string; redirectTo?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });
  if (error) {
    return { error: '아이디 또는 비밀번호가 올바르지 않습니다.' };
  }
  const email = data.user?.email ?? input.email;
  const redirectTo = isAdminEmail(email) ? '/admin' : input.redirectTo;
  return { redirectTo };
}

export async function signOutAction() {
  const supabase = createClient();
  await supabase.auth.signOut();
}
