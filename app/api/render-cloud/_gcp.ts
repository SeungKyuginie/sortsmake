// Vercel API 라우트에서 GCP 자원에 접근하기 위한 공통 헬퍼.
// 서비스 계정 JSON은 환경 변수 GCP_SERVICE_ACCOUNT_KEY에 평문 JSON으로 저장.

import { Storage } from '@google-cloud/storage';
import { GoogleAuth } from 'google-auth-library';

type ServiceAccountKey = {
  client_email: string;
  private_key: string;
  project_id: string;
  type: string;
};

let cachedKey: ServiceAccountKey | null = null;

function normalizePrivateKey(pk: string): string {
  // Vercel 환경 변수에서 JSON으로 보낸 후 private_key의 줄바꿈이
  // 리터럴 "\n" 으로 들어오면 실제 줄바꿈으로 치환.
  if (pk.includes('\\n')) {
    pk = pk.replace(/\\n/g, '\n');
  }
  return pk.trim();
}

export function getServiceAccountKey(): ServiceAccountKey {
  if (cachedKey) return cachedKey;
  const raw = process.env.GCP_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error('GCP_SERVICE_ACCOUNT_KEY가 설정되지 않았습니다.');
  }
  let parsed: ServiceAccountKey;
  try {
    parsed = JSON.parse(raw) as ServiceAccountKey;
  } catch (err) {
    throw new Error(`GCP_SERVICE_ACCOUNT_KEY 파싱 실패: ${(err as Error).message}`);
  }
  if (!parsed.client_email) {
    throw new Error('서비스 계정 키에 client_email 누락');
  }
  if (!parsed.private_key) {
    throw new Error('서비스 계정 키에 private_key 누락');
  }
  parsed.private_key = normalizePrivateKey(parsed.private_key);
  if (!parsed.private_key.includes('BEGIN PRIVATE KEY')) {
    throw new Error('private_key가 유효한 PEM 형식이 아닙니다 (BEGIN PRIVATE KEY 마커 없음)');
  }
  if (!parsed.private_key.includes('END PRIVATE KEY')) {
    throw new Error('private_key가 잘려 있습니다 (END PRIVATE KEY 마커 없음)');
  }
  cachedKey = parsed;
  return parsed;
}

let cachedStorage: Storage | null = null;
export function getStorage(): Storage {
  if (cachedStorage) return cachedStorage;
  const key = getServiceAccountKey();
  cachedStorage = new Storage({
    projectId: key.project_id,
    credentials: {
      client_email: key.client_email,
      private_key: key.private_key,
    },
  });
  return cachedStorage;
}

export function getBucketName(): string {
  const name = process.env.GCP_BUCKET_NAME;
  if (!name) throw new Error('GCP_BUCKET_NAME이 설정되지 않았습니다.');
  return name;
}

export function getCloudRunUrl(): string {
  const url = process.env.CLOUD_RUN_URL;
  if (!url) throw new Error('CLOUD_RUN_URL이 설정되지 않았습니다.');
  return url.replace(/\/$/, '');
}

// Cloud Run에 인증된 요청을 보내기 위한 OIDC 토큰 발급.
export async function getCloudRunIdToken(targetUrl: string): Promise<string> {
  const key = getServiceAccountKey();
  const auth = new GoogleAuth({
    credentials: {
      client_email: key.client_email,
      private_key: key.private_key,
    },
  });
  const client = await auth.getIdTokenClient(targetUrl);
  const headers = await client.getRequestHeaders();
  const authHeader = headers.get('Authorization');
  const m = /^Bearer\s+(.+)$/.exec(authHeader || '');
  if (!m) throw new Error('OIDC 토큰 발급 실패');
  return m[1];
}
