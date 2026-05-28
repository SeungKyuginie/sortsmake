# sortsmake server

Cloud Run에서 동작하는 마트 숏츠 렌더링 서버.

브라우저에서 ffmpeg.wasm 대신 서버의 네이티브 ffmpeg를 사용해 영상을 만들어
폰에서도 빠르게 렌더링 가능.

## 엔드포인트

- `GET /health` — 헬스 체크
- `GET /test` — FFmpeg 동작 확인 (5초 테스트 영상 반환)
- `POST /render` — 실제 렌더링 (Phase 1: cover 모드만)

## 환경 변수

- `PORT` — Cloud Run이 자동 주입
- `BUCKET_NAME` — Cloud Storage 버킷 이름 (사진/영상 저장용)

## Cloud Run 배포

[루트 README](../README.md) 참조.
