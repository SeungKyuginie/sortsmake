FROM node:20-slim

# FFmpeg + 한글 폰트 설치
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    fontconfig \
    fonts-noto-cjk \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 의존성 먼저 (캐시 활용)
COPY package*.json ./
RUN npm install --omit=dev

# 소스
COPY src/ ./src/

# Cloud Run은 PORT 환경 변수 사용
ENV PORT=8080
EXPOSE 8080

CMD ["node", "src/index.js"]
