import { signIn, auth } from '@/auth';
import { redirect } from 'next/navigation';

type Props = {
  searchParams: Promise<{ from?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const session = await auth();
  const params = await searchParams;
  const from = params.from || '/video-maker';

  // 이미 로그인된 경우 원래 가려던 곳으로
  if (session?.user) {
    redirect(from);
  }

  const errorMessage =
    params.error === 'AccessDenied'
      ? '허용되지 않은 이메일입니다. 관리자에게 문의해주세요.'
      : params.error
        ? '로그인에 실패했습니다. 다시 시도해주세요.'
        : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4">
      <div className="card w-full text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          마트 숏츠 메이커 🎬
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          허용된 사용자만 접근할 수 있어요.
          <br />
          Google 계정으로 로그인해주세요.
        </p>

        {errorMessage ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <form
          action={async () => {
            'use server';
            await signIn('google', { redirectTo: from });
          }}
          className="mt-6"
        >
          <button
            type="submit"
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
              <path
                fill="#fbc02d"
                d="M43.6 20.5H42V20H24v8h11.3a12 12 0 1 1-3.4-12.7l5.7-5.7A20 20 0 1 0 44 24c0-1.2-.1-2.4-.4-3.5z"
              />
              <path
                fill="#e53935"
                d="M6.3 14.7l6.6 4.8A12 12 0 0 1 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 0 0 6.3 14.7z"
              />
              <path
                fill="#4caf50"
                d="M24 44a20 20 0 0 0 13.5-5.2l-6.2-5.3a12 12 0 0 1-17.6-6.3l-6.5 5A20 20 0 0 0 24 44z"
              />
              <path
                fill="#1565c0"
                d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.5l6.2 5.3c-.4.4 6.6-4.8 6.6-14.8 0-1.2-.1-2.4-.4-3.5z"
              />
            </svg>
            <span>Google로 계속하기</span>
          </button>
        </form>

        <p className="mt-6 text-xs text-gray-400">
          접근 권한이 필요하면 관리자에게 본인 Google 이메일을 알려주세요.
        </p>
      </div>
    </main>
  );
}
