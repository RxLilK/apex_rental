-- ============================================================
-- PATCH : table support_messages (contact simple)
-- ============================================================

create table if not exists public.support_messages (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id),
  name text not null,
  email text not null,
  subject text not null,
  message text not null,
  status text not null default 'new' check (status in ('new', 'in_progress', 'resolved')),
  created_at timestamptz not null default now()
);

alter table public.support_messages enable row level security;

create policy "creer un message support" on public.support_messages for insert with check (true);
create policy "staff lit support_messages" on public.support_messages for select using (public.is_staff());
create policy "staff modifie support_messages" on public.support_messages for update using (public.is_staff());
