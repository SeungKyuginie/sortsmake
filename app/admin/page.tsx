import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminEmail } from '@/lib/auth/admin';
import { emailToUsername } from '@/lib/auth/id';
import { UserManager } from './UserManager';
import { AdminLogoutButton } from './AdminLogoutButton';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  if (!isSupabaseConfigured()) {
    redirect('/login');
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?from=/admin');
  }
  if (!isAdminEmail(user.email)) {
    redirect('/video-maker');
  }

  let userList: Array<{
    id: string;
    username: string;
    storeName: string;
    businessType: string;
    createdAt: string;
    renderCount: number;
    lastRenderAt: string | null;
  }> = [];
  let listError: string | null = null;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
    if (error) throw error;

    // 사용자별 렌더 카운트 집계 (service_role 키로 RLS 우회)
    const renderCountByUser = new Map<string, { count: number; last: string | null }>();
    try {
      const { data: renders } = await admin
        .from('user_renders')
        .select('user_id, created_at')
        .order('created_at', { ascending: false });
      if (Array.isArray(renders)) {
        for (const r of renders) {
          const cur = renderCountByUser.get(r.user_id) ?? { count: 0, last: null };
          cur.count += 1;
          if (!cur.last) cur.last = r.created_at;
          renderCountByUser.set(r.user_id, cur);
        }
      }
    } catch {
      // 테이블이 아직 없으면 카운트만 0으로
    }

    userList = data.users.map((u) => {
      const stats = renderCountByUser.get(u.id) ?? { count: 0, last: null };
      return {
        id: u.id,
        username: emailToUsername(u.email) || '(이름 없음)',
        storeName:
          typeof u.user_metadata?.storeName === 'string'
            ? u.user_metadata.storeName
            : '',
        businessType:
          typeof u.user_metadata?.businessType === 'string'
            ? u.user_metadata.businessType
            : '',
        createdAt: u.created_at,
        renderCount: stats.count,
        lastRenderAt: stats.last,
      };
    });
  } catch (e) {
    listError = e instanceof Error ? e.message : String(e);
  }

  const adminUsername = emailToUsername(user.email);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">사용자 관리</h1>
          <p className="mt-1 text-sm text-gray-600">
            관리자({adminUsername})만 접근할 수 있는 페이지입니다.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link href="/video-maker" className="btn-secondary text-sm">
            제작 페이지로
          </Link>
          <AdminLogoutButton />
        </div>
      </header>

      {listError ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          사용자 목록 로드 실패: {listError}
        </div>
      ) : null}

      <UserManager users={userList} adminUsername={adminUsername} />
    </main>
  );
}
