'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { signInAction } from './actions';

type Props = {
  redirectTo: string;
  initialError?: string;
};

export function LoginForm({ redirectTo, initialError }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="mt-6 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setError(null);
        startTransition(async () => {
          const res = await signInAction({
            email: String(form.get('email') ?? ''),
            password: String(form.get('password') ?? ''),
            redirectTo,
          });
          if (res?.error) {
            setError(res.error);
            return;
          }
          router.replace(redirectTo);
          router.refresh();
        });
      }}
    >
      <div>
        <label className="text-xs font-medium text-gray-600" htmlFor="email">
          아이디 (이메일)
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="input mt-1"
          placeholder="[email protected]"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600" htmlFor="password">
          비밀번호
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="input mt-1"
        />
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? '로그인 중…' : '로그인'}
      </button>
    </form>
  );
}
