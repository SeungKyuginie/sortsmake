'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminEmail } from '@/lib/auth/admin';
import { isValidUsername, usernameToEmail } from '@/lib/auth/id';
import { isValidBusinessType } from '@/lib/auth/businessType';

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
  storeName: string;
  businessType: string;
}): Promise<{ error?: string }> {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  const username = input.username.trim().toLowerCase();
  const storeName = input.storeName.trim();
  const businessType = input.businessType.trim();
  if (!isValidUsername(username)) {
    return { error: '아이디는 영문/숫자/._-, 3~32자만 가능합니다.' };
  }
  if (!input.password || input.password.length < 6) {
    return { error: '비밀번호는 6자 이상이어야 합니다.' };
  }
  if (!storeName) {
    return { error: '매장명을 입력하세요.' };
  }
  if (storeName.length > 60) {
    return { error: '매장명은 60자 이하여야 합니다.' };
  }
  if (!isValidBusinessType(businessType)) {
    return { error: '업종을 선택하세요.' };
  }
  try {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.createUser({
      email: usernameToEmail(username),
      password: input.password,
      email_confirm: true,
      user_metadata: { storeName, businessType },
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

export async function updateBusinessTypeAction(input: {
  userId: string;
  businessType: string;
}): Promise<{ error?: string }> {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  if (!isValidBusinessType(input.businessType)) {
    return { error: '업종을 선택하세요.' };
  }
  try {
    const admin = createAdminClient();
    const { data: cur, error: getErr } = await admin.auth.admin.getUserById(
      input.userId,
    );
    if (getErr) return { error: getErr.message };
    const merged = {
      ...(cur.user?.user_metadata ?? {}),
      businessType: input.businessType,
    };
    const { error } = await admin.auth.admin.updateUserById(input.userId, {
      user_metadata: merged,
    });
    if (error) return { error: error.message };
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

export async function updateStoreNameAction(input: {
  userId: string;
  storeName: string;
}): Promise<{ error?: string }> {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  const storeName = input.storeName.trim();
  if (!storeName) {
    return { error: '매장명을 입력하세요.' };
  }
  if (storeName.length > 60) {
    return { error: '매장명은 60자 이하여야 합니다.' };
  }
  try {
    const admin = createAdminClient();
    // 기존 user_metadata를 보존하면서 storeName만 갱신
    const { data: cur, error: getErr } = await admin.auth.admin.getUserById(
      input.userId,
    );
    if (getErr) return { error: getErr.message };
    const merged = { ...(cur.user?.user_metadata ?? {}), storeName };
    const { error } = await admin.auth.admin.updateUserById(input.userId, {
      user_metadata: merged,
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
