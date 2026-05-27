// 인증 비활성화 동안에는 헤더(로그인 이메일·로그아웃)를 숨김.
// 다시 켜려면 아래 import/JSX 주석 해제.
// import { AuthHeader } from './AuthHeader';

export default function VideoMakerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/*
      <div className="mx-auto max-w-5xl px-4 pt-4">
        <AuthHeader />
      </div>
      */}
      {children}
    </>
  );
}
