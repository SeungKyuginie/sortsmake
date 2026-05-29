import { emailToUsername } from './id';

// 관리자 아이디 화이트리스트. 환경변수 ADMIN_IDS에 콤마 구분으로 등록.
const ADMIN_IDS = new Set(
  (process.env.ADMIN_IDS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

export function isAdminUsername(username: string | null | undefined): boolean {
  if (!username) return false;
  return ADMIN_IDS.has(username.toLowerCase());
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return isAdminUsername(emailToUsername(email));
}
