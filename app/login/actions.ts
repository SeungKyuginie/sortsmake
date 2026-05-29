'use server';

import { createClient } from '@/lib/supabase/server';

type SignInInput = {
  email: string;
  password: string;
  redirectTo: string;
};

export async function signInAction(
  input: SignInInput,
): Promise<{ error?: string } | undefined> {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });
  if (error) {
    return { error: '아이디 또는 비밀번호가 올바르지 않습니다.' };
  }
}

export async function signOutAction() {
  const supabase = createClient();
  await supabase.auth.signOut();
}
