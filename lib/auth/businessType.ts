// 사용자(매장) 업종 분류. 자동 스크립트 톤·구성에 활용 가능.
export const BUSINESS_TYPES = [
  { value: 'mart', label: '마트' },
  { value: 'photo_studio', label: '사진관' },
  { value: 'skincare', label: '피부관리샾' },
  { value: 'restaurant', label: '음식점' },
  { value: 'cafe', label: '카페' },
  { value: 'salon', label: '미용실' },
  { value: 'etc', label: '기타' },
] as const;

export type BusinessTypeValue = (typeof BUSINESS_TYPES)[number]['value'];

export function isValidBusinessType(v: string): v is BusinessTypeValue {
  return BUSINESS_TYPES.some((t) => t.value === v);
}

export function labelOfBusinessType(v: string | undefined | null): string {
  if (!v) return '';
  return BUSINESS_TYPES.find((t) => t.value === v)?.label ?? '';
}
