# 마트 숏츠 메이커 (sortsmake)

유튜브 숏츠 **전문가 패턴**을 그대로 적용해 마트 홍보용 1080×1920 MP4를 자동 생성하는 Next.js 14 웹앱.

## 적용된 전문가 패턴

| 패턴 | 적용 위치 |
| --- | --- |
| 3초 후킹 (Hook) | `generate-script`가 hook 필드를 별도 생성. 첫 ~3초에 화면 상단 거대 텍스트 오버레이. |
| 단어 단위 카라오케 자막 | 코너 카피를 6~12자 phrase로 자동 분할 후 글자 수 비례 타이밍. |
| 강조어 노란색 | 코너별 `highlight` 단어(가격/할인율)가 포함된 phrase는 노란색 + 더 큰 폰트. |
| 블러 커버 배경 | 9:16 안 맞는 사진/영상은 자체 블러판을 BG로, 컨테인된 FG로 합성 (검은 레터박스 없음). |
| Ken Burns 모션 | 정지 사진에 sine 기반 미세 패닝. |
| 하드 컷 | 슬로우 크로스페이드 제거 — 숏츠 표준 점프컷. |
| 1.1배속 기본 | 발화 속도 기본값 1.1x (숏츠 권장 1.05~1.15). |
| Pretendard Black | 한글 임팩트 + 가독성 위해 ffmpeg drawtext에 폰트 동적 로드. |
| CTA 마무리 | cta 필드 별도 생성, 마지막 ~2초 노란색 거대 오버레이. |
| 안전영역 자막 위치 | 상단 18% (hook/cta), 중단 45% (phrases) — 유튜브 UI 회피. |

## 흐름

1. 사진/영상 업로드 + 코너명/힌트 입력
2. Claude(`claude-sonnet-4-20250514`)가 사진을 비주얼 분석 → `{hook, segments[], cta}` JSON 생성 (직접 편집 가능)
3. Google Cloud TTS (ko-KR WaveNet)가 hook · 각 코너 · cta를 따로 합성해 길이 측정 후 연결
4. 브라우저 `@ffmpeg/ffmpeg` (WASM)가 9:16 MP4로 인코딩 — Ken Burns + 블러 BG + 카라오케 자막 + hook/cta 오버레이 + BGM 믹스
5. MP4 다운로드

## 시작하기

```bash
cp .env.local.example .env.local
# .env.local 에 ANTHROPIC_API_KEY / GOOGLE_TTS_API_KEY 입력
# (선택) ELEVENLABS_API_KEY — BGM AI 자동 생성 시

npm install
npm run dev
# http://localhost:3000/video-maker
```

## 기술 스택

- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- `@anthropic-ai/sdk` — 비전 + 구조화 JSON 생성
- Google Cloud TTS v1 (`texttospeech.googleapis.com`)
- ElevenLabs Music API (선택, BGM 자동 생성)
- `@ffmpeg/ffmpeg` 0.12.x WASM (블러 BG, drawtext, concat, amix)
- Pretendard Black (jsdelivr CDN, 런타임 로드)

## 메모

- `@ffmpeg/ffmpeg`는 `SharedArrayBuffer` 사용 → COOP/COEP 헤더로 cross-origin isolated. `next.config.js`에 설정됨.
- ffmpeg core는 `unpkg.com/@ffmpeg/core@0.12.10` 에서 동적 로드.
- 한글 폰트는 `cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9` 에서 로드. 폰트 로드가 실패하면 자막은 ffmpeg 기본 폰트로 폴백되며 한글이 박스로 보일 수 있음.
- Google TTS는 API 키 인증(`?key=`). GCP Console에서 Text-to-Speech API 활성화 후 키 발급.
- TTS 사용 가능한 한국어 WaveNet: `ko-KR-Wavenet-A/B/C/D`.
