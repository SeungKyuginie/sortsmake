# 마트 숏츠 메이커 (sortsmake)

사진과 코너 설명만으로 마트 홍보용 유튜브 숏츠(9:16, 1080×1920)를 자동 생성하는 Next.js 14 웹앱입니다.

## 흐름

1. 사진 업로드 → 코너명/설명 입력
2. Claude(`claude-sonnet-4-20250514`)로 30초 한국어 나레이션 자동 생성 (수동 수정 가능)
3. 네이버 CLOVA Voice로 한국어 AI 음성 MP3 합성
4. 브라우저에서 `@ffmpeg/ffmpeg` (WASM)로 사진 슬라이드쇼 + 음성 + 자막을 MP4로 렌더링 (페이드 전환)
5. MP4 다운로드

## 시작하기

```bash
cp .env.local.example .env.local
# .env.local 에 ANTHROPIC_API_KEY / CLOVA_CLIENT_ID / CLOVA_CLIENT_SECRET 입력

npm install
npm run dev
# http://localhost:3000/video-maker
```

## 주요 기술 스택

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- `@anthropic-ai/sdk` (서버 API Route)
- 네이버 CLOVA Voice Premium (서버 API Route, CORS 회피)
- `@ffmpeg/ffmpeg`, `@ffmpeg/util` (클라이언트 WASM 인코딩)

## 메모

- `@ffmpeg/ffmpeg`는 `SharedArrayBuffer`를 사용하므로 페이지가 cross-origin isolated 상태여야 합니다. `next.config.js`에서 `Cross-Origin-Opener-Policy: same-origin` 및 `Cross-Origin-Embedder-Policy: require-corp` 헤더를 모든 응답에 부여합니다.
- ffmpeg core는 `unpkg.com/@ffmpeg/core@0.12.10`에서 로드합니다. 오프라인 환경에서 사용하려면 정적 자산으로 가져와 `coreURL`/`wasmURL` 경로만 바꾸면 됩니다.
- CLOVA Voice Premium 사용을 가정합니다 (`https://naveropenapi.apigw.ntruss.com/tts-premium/v1/tts`). 일반 CLOVA Voice 엔드포인트가 필요하면 `app/api/generate-voice/route.ts`에서 URL만 변경하세요.
