// Supabase Auth는 email 기반이지만, UI에서는 "아이디"만 노출.
// 내부적으로 아이디 → 가짜 도메인(`@id.local`)으로 변환해 Supabase에 저장.
export const ID_DOMAIN = '@id.local';

// 안전한 아이디 패턴: 영문, 숫자, _ . - (3~32자)
const ID_RE = /^[a-zA-Z0-9._-]{3,32}$/;

export function isValidUsername(username: string): boolean {
  return ID_RE.test(username);
}

export function usernameToEmail(username: string): string {
  return `${username.toLowerCase()}${ID_DOMAIN}`;
}

export function emailToUsername(email: string | null | undefined): string {
  if (!email) return '';
  if (email.toLowerCase().endsWith(ID_DOMAIN)) {
    return email.slice(0, -ID_DOMAIN.length);
  }
  return email;
}
