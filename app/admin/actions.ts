'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminEmail } from '@/lib/auth/admin';
import { isValidUsername, usernameToEmail } from '@/lib/auth/id';

async function requireAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    throw new Error('관리자 권한이 필요합니다.');
  }
}

export async function createUserAction(input: {
  username: string;
  password: string;
}): Promise<{ error?: string }> {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  const username = input.username.trim().toLowerCase();
  if (!isValidUsername(username)) {
    return { error: '아이디는 영문/숫자/._-, 3~32자만 가능합니다.' };
  }
  if (!input.password || input.password.length < 6) {
    return { error: '비밀번호는 6자 이상이어야 합니다.' };
  }
  try {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.createUser({
      email: usernameToEmail(username),
      password: input.password,
      email_confirm: true,
    });
    if (error) {
      return { error: error.message };
    }
    revalidatePath('/admin');
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteUserAction(
  userId: string,
): Promise<{ error?: string }> {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  try {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      return { error: error.message };
    }
    revalidatePath('/admin');
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function resetPasswordAction(input: {
  userId: string;
  newPassword: string;
}): Promise<{ error?: string }> {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  if (input.newPassword.length < 6) {
    return { error: '비밀번호는 6자 이상이어야 합니다.' };
  }
  try {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(input.userId, {
      password: input.newPassword,
    });
    if (error) {
      return { error: error.message };
    }
    revalidatePath('/admin');
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
