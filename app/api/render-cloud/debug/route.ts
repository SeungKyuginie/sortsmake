import { NextResponse } from 'next/server';
import { getServiceAccountKey, getBucketName, getCloudRunUrl } from '../_gcp';

export const runtime = 'nodejs';

// 환경 변수 설정 상태 점검용. 민감 정보는 마스킹.
export async function GET() {
  const report: Record<string, unknown> = {
    GCP_BUCKET_NAME: process.env.GCP_BUCKET_NAME ? 'set' : 'missing',
    CLOUD_RUN_URL: process.env.CLOUD_RUN_URL ? 'set' : 'missing',
    GCP_SERVICE_ACCOUNT_KEY: process.env.GCP_SERVICE_ACCOUNT_KEY
      ? 'set'
      : 'missing',
  };

  try {
    if (process.env.GCP_SERVICE_ACCOUNT_KEY) {
      const key = getServiceAccountKey();
      report.parsedKey = {
        client_email: key.client_email,
        project_id: key.project_id,
        type: key.type,
        private_key_length: key.private_key.length,
        private_key_starts_with: key.private_key.slice(0, 30),
        private_key_ends_with: key.private_key.slice(-30),
        has_begin_marker: key.private_key.includes('BEGIN PRIVATE KEY'),
        has_end_marker: key.private_key.includes('END PRIVATE KEY'),
        has_real_newlines: key.private_key.includes('\n'),
        has_literal_backslash_n: key.private_key.includes('\\n'),
      };
    }
  } catch (err) {
    report.parseError = err instanceof Error ? err.message : String(err);
  }

  try {
    report.bucketName = getBucketName();
  } catch (err) {
    report.bucketError = err instanceof Error ? err.message : String(err);
  }

  try {
    report.cloudRunUrl = getCloudRunUrl();
  } catch (err) {
    report.cloudRunError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json(report);
}
