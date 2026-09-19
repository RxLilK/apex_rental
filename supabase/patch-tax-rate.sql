-- ============================================================
-- PATCH : taux d'imposition configurable (% du CA)
-- Une seule ligne (singleton) — modifiable par le Directeur/admin,
-- lisible par tout le staff.
-- ============================================================

create table if not exists public.finance_settings (
  id int primary key default 1,
  tax_rate numeric not null default 0,
  updated_at timestamptz not null default now(),
  constraint finance_settings_singleton check (id = 1)
);

insert into public.finance_settings (id, tax_rate) values (1, 0)
on conflict (id) do nothing;

alter table public.finance_settings enable row level security;

drop policy if exists "staff lit finance_settings" on public.finance_settings;
drop policy if exists "directeur ou admin modifie finance_settings" on public.finance_settings;
drop policy if exists "directeur ou admin insere finance_settings" on public.finance_settings;

create policy "staff lit finance_settings" on public.finance_settings for select
  using (public.is_staff());
create policy "directeur ou admin modifie finance_settings" on public.finance_settings for update
  using (public.is_admin_or_director());
create policy "directeur ou admin insere finance_settings" on public.finance_settings for insert
  with check (public.is_admin_or_director());
