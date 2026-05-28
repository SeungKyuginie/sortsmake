// @google-cloud/storage v7의 getSignedUrl이 일부 환경에서 IAM signBlob API를
// 호출해버려 권한이 부족하면 실패함. private_key가 있을 때 로컬에서 직접
// V4 서명을 만들어 signBlob 의존성을 없앰.

import crypto from 'crypto';

type SignOpts = {
  bucket: string;
  objectKey: string;
  clientEmail: string;
  privateKey: string;
  expiresInSeconds: number;
  contentType: string;
};

function pad(n: number, size: number): string {
  return String(n).padStart(size, '0');
}

function nowUtcParts(): { datetime: string; date: string } {
  const d = new Date();
  const y = d.getUTCFullYear();
  const mo = pad(d.getUTCMonth() + 1, 2);
  const dd = pad(d.getUTCDate(), 2);
  const h = pad(d.getUTCHours(), 2);
  const mi = pad(d.getUTCMinutes(), 2);
  const s = pad(d.getUTCSeconds(), 2);
  return {
    datetime: `${y}${mo}${dd}T${h}${mi}${s}Z`,
    date: `${y}${mo}${dd}`,
  };
}

function rfc3986EncodeUri(s: string): string {
  // RFC3986: encodeURIComponent + 추가 문자
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

// 경로용: '/'는 인코딩하지 않음 (GCS object key의 구조 유지)
function encodeObjectKeyForCanonicalUri(key: string): string {
  return key
    .split('/')
    .map((seg) => rfc3986EncodeUri(seg))
    .join('/');
}

export function signV4PutUrl(opts: SignOpts): string {
  const { datetime, date } = nowUtcParts();
  const credentialScope = `${date}/auto/storage/goog4_request`;
  const credential = `${opts.clientEmail}/${credentialScope}`;
  const host = 'storage.googleapis.com';
  const canonicalUri = `/${opts.bucket}/${encodeObjectKeyForCanonicalUri(opts.objectKey)}`;

  const queryParams: Record<string, string> = {
    'X-Goog-Algorithm': 'GOOG4-RSA-SHA256',
    'X-Goog-Credential': credential,
    'X-Goog-Date': datetime,
    'X-Goog-Expires': String(opts.expiresInSeconds),
    'X-Goog-SignedHeaders': 'content-type;host',
  };

  const canonicalQuery = Object.keys(queryParams)
    .sort()
    .map((k) => `${rfc3986EncodeUri(k)}=${rfc3986EncodeUri(queryParams[k])}`)
    .join('&');

  const canonicalHeaders = `content-type:${opts.contentType}\nhost:${host}\n`;
  const signedHeaders = 'content-type;host';
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const hashedCanonicalRequest = crypto
    .createHash('sha256')
    .update(canonicalRequest)
    .digest('hex');

  const stringToSign = [
    'GOOG4-RSA-SHA256',
    datetime,
    credentialScope,
    hashedCanonicalRequest,
  ].join('\n');

  const signature = crypto
    .createSign('RSA-SHA256')
    .update(stringToSign)
    .sign(opts.privateKey, 'hex');

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Goog-Signature=${signature}`;
}
