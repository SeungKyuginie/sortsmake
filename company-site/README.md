# company-site

회사 홈페이지 (메인 한 페이지) — Next.js 14 + TypeScript + Tailwind CSS.

## 로컬 실행

```bash
cd company-site
npm install
npm run dev
# http://localhost:3000
```

## 구조

- `app/layout.tsx` — 루트 레이아웃 + 메타데이터
- `app/page.tsx` — 메인 페이지 (히어로 / 회사 소개 / 서비스 / 문의)
- `app/globals.css` — Tailwind 진입점
- `tailwind.config.ts` — `brand` 컬러 토큰 정의

## 다음 단계

- 회사명, 카피, 컬러를 실제 브랜드에 맞게 수정
- 로고/이미지 자산 추가 (`public/` 폴더)
- 필요 시 `/about`, `/services`, `/contact` 등 별도 페이지 분리
