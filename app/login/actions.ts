'use server';

import { createClient } from '@/lib/supabase/server';
import { isAdminUsername } from '@/lib/auth/admin';
import { isValidUsername, usernameToEmail } from '@/lib/auth/id';

type SignInInput = {
  username: string;
  password: string;
  redirectTo: string;
};

export async function signInAction(
  input: SignInInput,
): Promise<{ error?: string; redirectTo?: string }> {
  const username = input.username.trim().toLowerCase();
  if (!isValidUsername(username)) {
    return { error: '아이디 형식이 올바르지 않습니다.' };
  }
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password: input.password,
  });
  if (error) {
    return { error: '아이디 또는 비밀번호가 올바르지 않습니다.' };
  }
  const redirectTo = isAdminUsername(username) ? '/admin' : input.redirectTo;
  return { redirectTo };
}

export async function signOutAction() {
  const supabase = createClient();
  await supabase.auth.signOut();
}
