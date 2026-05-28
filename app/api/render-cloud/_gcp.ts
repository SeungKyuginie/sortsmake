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

function getServiceAccountKey(): ServiceAccountKey {
  if (cachedKey) return cachedKey;
  const raw = process.env.GCP_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error('GCP_SERVICE_ACCOUNT_KEY가 설정되지 않았습니다.');
  }
  try {
    cachedKey = JSON.parse(raw) as ServiceAccountKey;
    if (!cachedKey.client_email || !cachedKey.private_key) {
      throw new Error('Invalid SA key shape');
    }
    return cachedKey;
  } catch (err) {
    throw new Error(`GCP_SERVICE_ACCOUNT_KEY 파싱 실패: ${(err as Error).message}`);
  }
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
// Cloud Run은 audience = service URL 이어야 함.
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
