import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

// 허용된 이메일 목록 (Vercel 환경 변수 ALLOWED_EMAILS)
// 콤마로 구분: "[email protected],[email protected]"
const ALLOWED_EMAILS = new Set(
  (process.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

export const { auth, handlers, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    async signIn({ profile }) {
      const email = profile?.email?.toLowerCase();
      if (!email) return false;
      // 화이트리스트가 비어 있으면 무조건 거부 (안전 기본값)
      if (ALLOWED_EMAILS.size === 0) return false;
      return ALLOWED_EMAILS.has(email);
    },
    async session({ session, token }) {
      if (session.user && token.email) {
        session.user.email = token.email as string;
      }
      return session;
    },
  },
  session: { strategy: 'jwt' },
  trustHost: true,
});
