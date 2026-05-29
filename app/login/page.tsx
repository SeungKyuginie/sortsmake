import { redirect } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { LoginForm } from './LoginForm';

type Props = {
  searchParams: Promise<{ from?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const from = params.from || '/video-maker';
  const configured = isSupabaseConfigured();

  if (configured) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      redirect(from);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4">
      <div className="card w-full">
        <h1 className="text-center text-2xl font-bold tracking-tight">
          숏츠 메이커 🎬
        </h1>
        <p className="mt-2 text-center text-sm text-gray-600">
          관리자가 발급한 아이디와 비밀번호로 로그인하세요.
        </p>
        {!configured ? (
          <div className="mt-4 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-xs text-yellow-800">
            Supabase 환경변수가 아직 설정되지 않았습니다 (
            <code>NEXT_PUBLIC_SUPABASE_URL</code>,{' '}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>). Vercel 대시보드에서
            설정 후 재배포하세요.
          </div>
        ) : null}
        <LoginForm redirectTo={from} initialError={params.error} />
        <p className="mt-6 text-center text-xs text-gray-400">
          계정이 필요하면 관리자에게 문의해주세요.
        </p>
      </div>
      <p className="mt-4 text-center text-xs text-gray-500">
        프로그램 제작: 주식회사 인스로드
      </p>
    </main>
  );
}
