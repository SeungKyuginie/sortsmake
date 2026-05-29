import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin';

export default async function Home() {
  // 이미 로그인된 사용자는 본인 작업/관리 페이지로 바로 이동
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      redirect(isAdminEmail(user.email) ? '/admin' : '/video-maker');
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-4 py-12">
      <div className="w-full text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          숏츠 메이커 🎬
        </h1>
        <p className="mt-4 text-base text-gray-600 sm:text-lg">
          매장 사진 11장으로 30초 유튜브 숏츠를 자동 제작합니다.
        </p>
        <p className="mt-2 text-sm text-gray-500">
          자동 스크립트 · 카라오케 자막 · 음성 합성 · 배경음악 · 1080×1920 MP4
        </p>

        <div className="mt-10 grid grid-cols-1 gap-4 text-left sm:grid-cols-3">
          <div className="card">
            <div className="text-2xl">📸</div>
            <div className="mt-2 font-semibold">사진만 올리면 끝</div>
            <p className="mt-1 text-sm text-gray-600">
              매장 코너별 사진 11장만 준비하면 AI가 자동으로 흥미로운 스크립트를 작성합니다.
            </p>
          </div>
          <div className="card">
            <div className="text-2xl">🎙️</div>
            <div className="mt-2 font-semibold">자연스러운 음성</div>
            <p className="mt-1 text-sm text-gray-600">
              Google Chirp3-HD 보이스로 한국어 나레이션 자동 합성. Hook · 코너 · CTA 별도 보이스 가능.
            </p>
          </div>
          <div className="card">
            <div className="text-2xl">⚡</div>
            <div className="mt-2 font-semibold">바로 업로드</div>
            <p className="mt-1 text-sm text-gray-600">
              유튜브 숏츠 · 인스타 릴스 · 틱톡 규격에 딱 맞는 9:16 MP4로 출력.
            </p>
          </div>
        </div>

        <div className="mt-10">
          <Link
            href="/login"
            className="btn-primary inline-block px-8 py-3 text-base"
          >
            로그인하기
          </Link>
          <p className="mt-3 text-xs text-gray-500">
            계정이 필요하면 관리자에게 문의해주세요.
          </p>
        </div>
      </div>

      <footer className="mt-16 text-center text-xs text-gray-400">
        <div>프로그램 제작: 주식회사 인스로드</div>
        <div className="mt-2 flex justify-center gap-3">
          <Link href="/terms" className="hover:text-gray-600">
            이용약관
          </Link>
          <span>·</span>
          <Link href="/privacy" className="hover:text-gray-600">
            개인정보처리방침
          </Link>
        </div>
      </footer>
    </main>
  );
}
