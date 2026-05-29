-- =============================================================
-- 마트 숏츠 메이커 — Supabase 1회 셋업 SQL
-- 실행 위치: Supabase 대시보드 → SQL Editor → 새 쿼리 → 전체 붙여넣기 → Run
-- =============================================================

-- 1) 사용자 작업 세션 테이블 (텍스트/메타 상태 JSON)
create table if not exists public.user_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 2) Row Level Security: 본인 데이터만 접근
alter table public.user_sessions enable row level security;

drop policy if exists "user_sessions_select_own" on public.user_sessions;
create policy "user_sessions_select_own"
  on public.user_sessions for select
  using (auth.uid() = user_id);

drop policy if exists "user_sessions_insert_own" on public.user_sessions;
create policy "user_sessions_insert_own"
  on public.user_sessions for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_sessions_update_own" on public.user_sessions;
create policy "user_sessions_update_own"
  on public.user_sessions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_sessions_delete_own" on public.user_sessions;
create policy "user_sessions_delete_own"
  on public.user_sessions for delete
  using (auth.uid() = user_id);

-- 3) Storage 버킷 생성 (사진/음성)
insert into storage.buckets (id, name, public)
values ('user-uploads', 'user-uploads', false)
on conflict (id) do nothing;

-- 4) Storage RLS: 본인 폴더(photos/<auth.uid()>/...) 만 접근
drop policy if exists "user_uploads_select_own" on storage.objects;
create policy "user_uploads_select_own"
  on storage.objects for select
  using (
    bucket_id = 'user-uploads'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "user_uploads_insert_own" on storage.objects;
create policy "user_uploads_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'user-uploads'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "user_uploads_update_own" on storage.objects;
create policy "user_uploads_update_own"
  on storage.objects for update
  using (
    bucket_id = 'user-uploads'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "user_uploads_delete_own" on storage.objects;
create policy "user_uploads_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'user-uploads'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
