'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { signOutAction } from '../login/actions';
import { clearAll } from './storage';

export function LogoutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="btn-secondary shrink-0 text-sm text-gray-700"
      title="로그아웃 (작업 내용 초기화됨)"
      onClick={() => {
        if (
          !confirm(
            '로그아웃하면 작업 중인 사진/스크립트가 모두 삭제됩니다. 계속할까요?',
          )
        )
          return;
        startTransition(async () => {
          // 클라우드 강제 저장 (디바운스 대기 없이 즉시 동기화)
          const flush = (
            window as Window & { __flushCloudState?: () => Promise<void> }
          ).__flushCloudState;
          if (flush) {
            try {
              await flush();
            } catch {
              // 클라우드 저장 실패해도 로그아웃 진행
            }
          }
          try {
            await clearAll();
          } catch {
            // 로컬 삭제 실패해도 로그아웃 진행
          }
          await signOutAction();
          router.replace('/login');
          router.refresh();
        });
      }}
    >
      {pending ? '로그아웃 중…' : '로그아웃'}
    </button>
  );
}
