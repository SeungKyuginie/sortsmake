'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { signOutAction } from '../login/actions';

export function LogoutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="btn-secondary shrink-0 text-sm text-gray-700"
      title="로그아웃"
      onClick={() => {
        startTransition(async () => {
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
