import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '마트 숏츠 메이커',
  description: '사진과 코너 설명만으로 마트 홍보용 유튜브 숏츠를 자동 생성합니다.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
