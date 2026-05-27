// ⚠️ 인증 일시 비활성화 (사용자 요청).
// 다시 켜려면 아래 주석 블록을 활성화하고 export 부분을 교체하세요.
import { NextResponse } from 'next/server';

export function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

/* ───── 활성화 시 사용할 인증 미들웨어 ─────
import { auth } from '@/auth';

const PUBLIC_PATHS = ['/login'];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  if (!req.auth) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});
─────────────────────────────────────────── */
