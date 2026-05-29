import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "회사 홈페이지",
  description: "회사 소개 및 서비스 안내",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
