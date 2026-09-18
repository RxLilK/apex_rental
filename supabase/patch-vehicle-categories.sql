-- ============================================================
-- PATCH : catégories de véhicules en base (dynamiques)
-- Permet au Directeur (grade 10) / admin d'ajouter de nouvelles
-- catégories directement depuis le site, au lieu d'une liste figée
-- dans le code.
-- ============================================================

create table if not exists public.vehicle_categories (
  code text primary key,
  label text not null,
  price_4h numeric not null default 0,
  price_24h numeric not null default 0,
  price_7d numeric not null default 0,
  deposit_min numeric not null default 0,
  deposit_max numeric not null default 0,
  created_at timestamptz not null default now()
);

insert into public.vehicle_categories (code, label, price_4h, price_24h, price_7d, deposit_min, deposit_max) values
  ('CITY', 'Apex City', 500, 1200, 5500, 500, 1000),
  ('BUSINESS', 'Apex Business', 1000, 2500, 11000, 1500, 3000),
  ('FAMILY', 'Apex Family', 1200, 3000, 13000, 2000, 4000),
  ('SPORT', 'Apex Sport', 2500, 6000, 27000, 5000, 15000),
  ('PRESTIGE', 'Apex Prestige', 7500, 18000, 80000, 20000, 100000),
  ('EVENT', 'Apex Event', 0, 0, 0, 0, 0),
  ('UTILITY', 'Apex Utility', 500, 1200, 5500, 500, 1000)
on conflict (code) do nothing;

alter table public.vehicle_categories enable row level security;

drop policy if exists "categories visibles par tous" on public.vehicle_categories;
drop policy if exists "directeur ou admin ajoute categories" on public.vehicle_categories;
drop policy if exists "directeur ou admin modifie categories" on public.vehicle_categories;

create policy "categories visibles par tous" on public.vehicle_categories for select using (true);
create policy "directeur ou admin ajoute categories" on public.vehicle_categories for insert
  with check (public.is_admin_or_director());
create policy "directeur ou admin modifie categories" on public.vehicle_categories for update
  using (public.is_admin_or_director());
