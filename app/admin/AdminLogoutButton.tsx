'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { signOutAction } from '../login/actions';

export function AdminLogoutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="btn-secondary text-sm text-gray-700"
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
