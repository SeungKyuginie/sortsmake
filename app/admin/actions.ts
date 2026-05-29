'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminEmail } from '@/lib/auth/admin';

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
  email: string;
  password: string;
}): Promise<{ error?: string }> {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  if (!input.email || !input.password) {
    return { error: '이메일과 비밀번호를 입력하세요.' };
  }
  if (input.password.length < 6) {
    return { error: '비밀번호는 6자 이상이어야 합니다.' };
  }
  try {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.createUser({
      email: input.email,
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
