import { auth } from '@/auth';
import { NextResponse } from 'next/server';

// 로그인 없이 접근 가능한 경로: /login, /api/auth/*, 정적 파일
const PUBLIC_PATHS = ['/login'];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Auth.js 자체 라우트와 정적 자원은 통과
  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  // 공개 경로는 통과
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  // 인증 안 된 사용자는 로그인 페이지로
  if (!req.auth) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
