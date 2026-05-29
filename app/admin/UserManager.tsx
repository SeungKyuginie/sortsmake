'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createUserAction,
  deleteUserAction,
  resetPasswordAction,
  updateStoreNameAction,
  updateBusinessTypeAction,
} from './actions';
import {
  BUSINESS_TYPES,
  labelOfBusinessType,
} from '@/lib/auth/businessType';

type User = {
  id: string;
  username: string;
  storeName: string;
  businessType: string;
  createdAt: string;
};

type Props = {
  users: User[];
  adminUsername: string;
};

export function UserManager({ users, adminUsername }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [storeTarget, setStoreTarget] = useState<User | null>(null);
  const [businessTarget, setBusinessTarget] = useState<User | null>(null);

  const refresh = () => router.refresh();

  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="text-lg font-semibold">새 사용자 추가</h2>
        <p className="mt-1 text-xs text-gray-500">
          아이디는 영문/숫자/._-, 3~32자. 매장명·업종은 영상 생성 시 자동으로 사용됩니다.
        </p>
        <form
          className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const username = String(fd.get('username') ?? '');
            const password = String(fd.get('password') ?? '');
            const storeName = String(fd.get('storeName') ?? '');
            const businessType = String(fd.get('businessType') ?? '');
            setError(null);
            setInfo(null);
            startTransition(async () => {
              const res = await createUserAction({
                username,
                password,
                storeName,
                businessType,
              });
              if (res?.error) {
                setError(res.error);
                return;
              }
              setInfo(`${username} (${storeName}) 사용자가 추가됐습니다.`);
              (e.target as HTMLFormElement).reset();
              refresh();
            });
          }}
        >
          <input
            name="username"
            type="text"
            required
            minLength={3}
            maxLength={32}
            pattern="[a-zA-Z0-9._\-]{3,32}"
            placeholder="아이디"
            autoComplete="off"
            className="input"
          />
          <input
            name="password"
            type="text"
            required
            placeholder="비밀번호 (6자 이상)"
            autoComplete="off"
            className="input"
          />
          <input
            name="storeName"
            type="text"
            required
            maxLength={60}
            placeholder="매장명 (예: 하나마트 강남점)"
            autoComplete="off"
            className="input"
          />
          <select name="businessType" required defaultValue="" className="input">
            <option value="" disabled>
              업종 선택…
            </option>
            {BUSINESS_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={pending}
            className="btn-primary sm:col-span-2"
          >
            {pending ? '추가 중…' : '추가'}
          </button>
        </form>
      </section>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {info ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {info}
        </div>
      ) : null}

      <section className="card">
        <h2 className="text-lg font-semibold">사용자 목록 ({users.length})</h2>
        <div className="mt-3 divide-y divide-gray-100 border-t border-gray-100">
          {users.length === 0 ? (
            <p className="py-4 text-sm text-gray-500">
              등록된 사용자가 없습니다.
            </p>
          ) : (
            users.map((u) => {
              const isSelf = u.username === adminUsername;
              return (
                <div
                  key={u.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-gray-900">
                      <span className="truncate">{u.username}</span>
                      {isSelf ? (
                        <span className="rounded bg-brand-100 px-2 py-0.5 text-xs text-brand-700">
                          나(관리자)
                        </span>
                      ) : null}
                      {u.businessType ? (
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                          {labelOfBusinessType(u.businessType)}
                        </span>
                      ) : null}
                      <span className="text-xs text-gray-500">
                        {u.storeName ? `· ${u.storeName}` : '· (매장명 없음)'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      가입: {new Date(u.createdAt).toLocaleString('ko-KR')}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      className="btn-secondary text-xs"
                      onClick={() => setStoreTarget(u)}
                    >
                      매장명 변경
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      className="btn-secondary text-xs"
                      onClick={() => setBusinessTarget(u)}
                    >
                      업종 변경
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      className="btn-secondary text-xs"
                      onClick={() => setResetTarget(u)}
                    >
                      비밀번호 재설정
                    </button>
                    <button
                      type="button"
                      disabled={pending || isSelf}
                      className="btn-secondary text-xs text-red-600 disabled:text-gray-400"
                      title={isSelf ? '본인 계정은 삭제할 수 없습니다' : '삭제'}
                      onClick={() => {
                        if (!confirm(`${u.username} 사용자를 삭제할까요?`))
                          return;
                        setError(null);
                        setInfo(null);
                        startTransition(async () => {
                          const res = await deleteUserAction(u.id);
                          if (res?.error) {
                            setError(res.error);
                            return;
                          }
                          setInfo(`${u.username} 사용자를 삭제했습니다.`);
                          refresh();
                        });
                      }}
                    >
                      삭제
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {resetTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setResetTarget(null)}
        >
          <form
            className="card w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const newPassword = String(fd.get('newPassword') ?? '');
              setError(null);
              setInfo(null);
              startTransition(async () => {
                const res = await resetPasswordAction({
                  userId: resetTarget.id,
                  newPassword,
                });
                if (res?.error) {
                  setError(res.error);
                  return;
                }
                setInfo(`${resetTarget.username} 비밀번호가 변경됐습니다.`);
                setResetTarget(null);
                refresh();
              });
            }}
          >
            <h3 className="text-base font-semibold">
              비밀번호 재설정 — {resetTarget.username}
            </h3>
            <input
              name="newPassword"
              type="text"
              required
              minLength={6}
              placeholder="새 비밀번호 (6자 이상)"
              autoComplete="off"
              className="input mt-3"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={() => setResetTarget(null)}
              >
                취소
              </button>
              <button
                type="submit"
                disabled={pending}
                className="btn-primary text-sm"
              >
                {pending ? '변경 중…' : '변경'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {storeTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setStoreTarget(null)}
        >
          <form
            className="card w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const storeName = String(fd.get('storeName') ?? '');
              setError(null);
              setInfo(null);
              startTransition(async () => {
                const res = await updateStoreNameAction({
                  userId: storeTarget.id,
                  storeName,
                });
                if (res?.error) {
                  setError(res.error);
                  return;
                }
                setInfo(`${storeTarget.username} 매장명이 변경됐습니다.`);
                setStoreTarget(null);
                refresh();
              });
            }}
          >
            <h3 className="text-base font-semibold">
              매장명 변경 — {storeTarget.username}
            </h3>
            <input
              name="storeName"
              type="text"
              required
              maxLength={60}
              defaultValue={storeTarget.storeName}
              placeholder="매장명"
              autoComplete="off"
              className="input mt-3"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={() => setStoreTarget(null)}
              >
                취소
              </button>
              <button
                type="submit"
                disabled={pending}
                className="btn-primary text-sm"
              >
                {pending ? '변경 중…' : '변경'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {businessTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setBusinessTarget(null)}
        >
          <form
            className="card w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const businessType = String(fd.get('businessType') ?? '');
              setError(null);
              setInfo(null);
              startTransition(async () => {
                const res = await updateBusinessTypeAction({
                  userId: businessTarget.id,
                  businessType,
                });
                if (res?.error) {
                  setError(res.error);
                  return;
                }
                setInfo(`${businessTarget.username} 업종이 변경됐습니다.`);
                setBusinessTarget(null);
                refresh();
              });
            }}
          >
            <h3 className="text-base font-semibold">
              업종 변경 — {businessTarget.username}
            </h3>
            <select
              name="businessType"
              required
              defaultValue={businessTarget.businessType || ''}
              className="input mt-3"
            >
              <option value="" disabled>
                업종 선택…
              </option>
              {BUSINESS_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={() => setBusinessTarget(null)}
              >
                취소
              </button>
              <button
                type="submit"
                disabled={pending}
                className="btn-primary text-sm"
              >
                {pending ? '변경 중…' : '변경'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
