import { auth, signOut } from '@/auth';

export async function AuthHeader() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;

  return (
    <div className="mb-2 flex items-center justify-end gap-3 text-xs text-gray-500">
      <span>👤 {email}</span>
      <form
        action={async () => {
          'use server';
          await signOut({ redirectTo: '/login' });
        }}
      >
        <button
          type="submit"
          className="rounded border border-gray-200 px-2 py-1 hover:bg-gray-50"
        >
          로그아웃
        </button>
      </form>
    </div>
  );
}
