-- ============================================================
-- APEX RENTAL — SCHÉMA SUPABASE
-- À coller dans Supabase > SQL Editor > New query > Run
-- ============================================================

-- ------------------------------------------------------------
-- 0. NETTOYAGE (rend ce script rejouable en toute sécurité)
-- ------------------------------------------------------------
-- Si une version précédente du schéma existe déjà sur ce projet
-- (ex: un essai antérieur), on la retire avant de tout recréer.
-- ⚠️ Ceci efface les données de ces tables si elles existent déjà.
drop table if exists public.finance_entries cascade;
drop table if exists public.accounting_entries cascade;
drop table if exists public.club_tier_config cascade;
drop table if exists public.grade_permissions cascade;
drop table if exists public.client_grades cascade;
drop table if exists public.media_requests cascade;
drop table if exists public.business_requests cascade;
drop table if exists public.incidents cascade;
drop table if exists public.reservations cascade;
drop table if exists public.vehicles cascade;
drop table if exists public.vehicle_categories cascade;
drop table if exists public.profiles cascade;
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_auth_user();
drop function if exists public.generate_reservation_reference();
drop function if exists public.current_role();
drop function if exists public.is_staff();
drop sequence if exists reservation_seq;
drop sequence if exists incident_seq;

create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------
-- 1. PROFILS (1:1 avec auth.users)
-- ------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  username text unique,
  first_name text not null default '',
  last_name text not null default '',
  phone text default '',
  role text not null default 'client' check (role in ('client', 'employee', 'admin')),
  grade_code text,                         -- grade employé (director, trainee, etc.)
  club_tier text not null default 'none' check (club_tier in ('none', 'apex-club', 'apex-black', 'entreprise')),
  client_grade text default '',            -- grade client libre (options futures)
  business_name text default '',           -- si compte entreprise
  created_at timestamptz not null default now()
);

-- Crée automatiquement un profil à chaque inscription Supabase Auth
-- Génère un identifiant unique "prenom.nom" (ajoute un chiffre si déjà pris).
create or replace function public.generate_username(p_first text, p_last text)
returns text
language plpgsql
as $$
declare
  base_username text;
  final_username text;
  counter int := 0;
begin
  base_username := lower(coalesce(nullif(p_first, ''), 'user') || '.' || coalesce(p_last, ''));
  base_username := translate(
    base_username,
    'àâäáãåèéêëìíîïòóôöõùúûüçñýÿ',
    'aaaaaaeeeeiiiiooooouuuucnyy'
  );
  base_username := regexp_replace(base_username, '[^a-z0-9.]+', '', 'g');
  base_username := trim(both '.' from base_username);
  if base_username = '' then base_username := 'user'; end if;

  final_username := base_username;
  while exists (select 1 from public.profiles where username = final_username) loop
    counter := counter + 1;
    final_username := base_username || counter::text;
  end loop;

  return final_username;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
as $$
declare
  new_username text;
begin
  new_username := public.generate_username(
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name'
  );

  insert into public.profiles (id, email, first_name, last_name, phone, username)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    new_username
  );
  return new;
end;
$$;

-- Résout un identifiant vers son e-mail, appelable AVANT connexion
-- (par un utilisateur anonyme) — ne renvoie que l'e-mail, rien d'autre.
create or replace function public.get_email_by_username(p_username text)
returns text
language sql
security definer
stable
as $$
  select email from public.profiles where username = lower(p_username);
$$;

grant execute on function public.get_email_by_username(text) to anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ------------------------------------------------------------
-- 2. VÉHICULES
-- ------------------------------------------------------------
-- ------------------------------------------------------------
-- 2bis. CATÉGORIES DE VÉHICULES (dynamiques, éditables par le Directeur/admin)
-- ------------------------------------------------------------
create table public.vehicle_categories (
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

create table public.vehicles (
  id text primary key,                     -- slug, ex: "sultan-rs"
  name text not null,
  category text not null,                  -- CITY, BUSINESS, FAMILY, SPORT, PRESTIGE, EVENT, UTILITY
  power int default 0,
  top_speed int default 0,
  accel text default '—',
  braking text default 'Correct',
  transmission text default 'Automatique',
  fuel text default 'Essence',
  seats int default 4,
  trunk int default 300,
  price_4h numeric not null default 0,
  price_24h numeric not null default 0,
  price_7d numeric not null default 0,
  deposit numeric not null default 0,
  status text not null default 'available'
    check (status in ('available','reserved','preparation','rented','maintenance','unavailable')),
  image_url text default '',               -- URL Supabase Storage
  popularity int default 0,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3. RÉSERVATIONS
-- ------------------------------------------------------------
create sequence if not exists reservation_seq start 1;

create table public.reservations (
  id uuid primary key default uuid_generate_v4(),
  reference text unique not null,
  user_id uuid not null references public.profiles(id),
  vehicle_id text not null references public.vehicles(id),
  vehicle_name text not null,
  start_date date not null,
  start_time time not null,
  end_date date not null,
  end_time time not null,
  insurance text,
  insurance_price numeric default 0,
  delivery text,
  delivery_price numeric default 0,
  rental_price numeric not null,
  rental_base_price numeric,
  applied_club_tier text default '',
  rental_discount_percent numeric default 0,
  delivery_savings numeric default 0,
  insurance_savings numeric default 0,
  total numeric not null,
  deposit numeric not null,
  status text not null default 'pending'
    check (status in ('pending','confirmed','active','completed','cancelled')),
  created_at timestamptz not null default now()
);

create or replace function public.generate_reservation_reference()
returns text language sql as $$
  select 'AR-' || extract(year from now())::text || '-' || lpad(nextval('reservation_seq')::text, 4, '0');
$$;

-- ------------------------------------------------------------
-- 4. INCIDENTS
-- ------------------------------------------------------------
create sequence if not exists incident_seq start 1;

create table public.incidents (
  reference text primary key default ('INC-' || extract(year from now())::text || '-' || lpad(nextval('incident_seq')::text, 4, '0')),
  vehicle_id text references public.vehicles(id),
  vehicle_name text,
  reservation_ref text,
  description text not null,
  estimated_damage numeric default 0,
  applied_cost numeric,
  status text not null default 'OUVERT' check (status in ('OUVERT','EN COURS','RÉSOLU','CLOS')),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 5. DEMANDES ENTREPRISE / MEDIA
-- ------------------------------------------------------------
create table public.business_requests (
  id uuid primary key default uuid_generate_v4(),
  company_name text not null,
  manager_name text not null,
  email text not null,
  phone text default '',
  fleet_size int default 1,
  message text default '',
  status text not null default 'new' check (status in ('new','approved','declined')),
  grade text default 'Standard',
  account_user_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.media_requests (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id),
  project_name text not null,
  project_type text,
  event_date date,
  duration text,
  vehicle_count int,
  vehicle_types text,
  location text,
  needs_delivery boolean default false,
  needs_driver boolean default false,
  budget numeric,
  description text,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 6. GRADES CLIENTS (liste libre créée par l'admin)
-- ------------------------------------------------------------
create table public.client_grades (
  label text primary key
);

-- ------------------------------------------------------------
-- 7. PERMISSIONS PAR GRADE EMPLOYÉ
-- ------------------------------------------------------------
create table public.grade_permissions (
  grade_code text not null,
  capability_key text not null,
  can_view boolean not null default false,
  can_edit boolean not null default false,
  primary key (grade_code, capability_key)
);

-- ------------------------------------------------------------
-- 8. CONFIGURATION DES PALIERS VIP
-- ------------------------------------------------------------
create table public.club_tier_config (
  tier text primary key check (tier in ('apex-club','apex-black','entreprise')),
  price_per_week numeric not null default 0,
  rental_discount numeric not null default 0,   -- 0.10 = 10%
  free_delivery boolean not null default false,
  free_insurance boolean not null default false,
  perks text[] not null default '{}'
);

insert into public.club_tier_config (tier, price_per_week, rental_discount, free_delivery, free_insurance, perks) values
  ('apex-club', 15000, 0.10, true, true, array['Livraison gratuite','Assurance prise en charge','Réservation prioritaire','10% de réduction sur les locations','Préparation prioritaire','Accès aux véhicules CLUB','Frais de récupération réduits']),
  ('apex-black', 35000, 0.20, true, true, array['Livraison gratuite','Assurance prise en charge','Priorité maximale','20% de réduction sur les locations','Accès aux véhicules PRESTIGE','Préparation prioritaire','Récupération gratuite','Véhicules exclusifs','Conditions commerciales personnalisées']),
  ('entreprise', 0, 0, false, false, array['Compte rattaché à une entreprise APEX BUSINESS'])
on conflict (tier) do nothing;

-- ------------------------------------------------------------
-- 9. COMPTABILITÉ (paie, primes, impôts, charges...)
-- ------------------------------------------------------------
create table public.accounting_entries (
  id uuid primary key default uuid_generate_v4(),
  category text not null,                  -- paie, prime, impot, charge, achat, autre
  employee_id uuid references public.profiles(id),
  employee_name text default '',
  label text not null,
  amount numeric not null,
  entry_date date not null default current_date,
  created_at timestamptz not null default now()
);

-- Écritures financières auto-générées (ex: réparations d'incidents facturées)
create table public.finance_entries (
  key text primary key,                    -- ex: "incident_INC-2026-0001" (upsert)
  type text not null,
  label text not null,
  amount numeric not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.reservations enable row level security;
alter table public.incidents enable row level security;
alter table public.business_requests enable row level security;
alter table public.media_requests enable row level security;
alter table public.client_grades enable row level security;
alter table public.grade_permissions enable row level security;
alter table public.club_tier_config enable row level security;
alter table public.accounting_entries enable row level security;
alter table public.finance_entries enable row level security;

create or replace function public.current_role()
returns text language sql security definer stable as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_staff()
returns boolean language sql security definer stable as $$
  select public.current_role() in ('admin', 'employee');
$$;

create or replace function public.is_admin_or_director()
returns boolean language sql security definer stable as $$
  select public.current_role() = 'admin' or exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'employee' and grade_code = 'director'
  );
$$;

-- Profils : chacun voit le sien, le staff voit tout
create policy "voir son profil ou staff" on public.profiles for select
  using (id = auth.uid() or public.is_staff());
create policy "modifier son profil ou staff" on public.profiles for update
  using (id = auth.uid() or public.is_admin_or_director());

-- Véhicules : catalogue public en lecture, modification staff uniquement
create policy "vehicules visibles par tous" on public.vehicles for select using (true);
create policy "staff modifie les vehicules" on public.vehicles for all
  using (public.is_staff()) with check (public.is_staff());

alter table public.vehicle_categories enable row level security;
create policy "categories visibles par tous" on public.vehicle_categories for select using (true);
create policy "directeur ou admin ajoute categories" on public.vehicle_categories for insert
  with check (public.is_admin_or_director());
create policy "directeur ou admin modifie categories" on public.vehicle_categories for update
  using (public.is_admin_or_director());
create policy "directeur ou admin supprime categories" on public.vehicle_categories for delete
  using (public.is_admin_or_director());

-- Réservations : client voit les siennes, staff voit tout
create policy "voir ses reservations ou staff" on public.reservations for select
  using (user_id = auth.uid() or public.is_staff());
create policy "creer sa reservation" on public.reservations for insert
  with check (
    public.is_staff()
    or (
      user_id = auth.uid()
      and exists (
        select 1 from public.profiles
        where id = auth.uid() and club_tier in ('apex-club', 'apex-black')
      )
    )
  );
create policy "staff modifie reservations" on public.reservations for update
  using (public.is_staff());
create policy "admin ou directeur supprime reservations" on public.reservations for delete
  using (public.is_admin_or_director());

-- Incidents, finances, permissions, config VIP, comptabilité : staff uniquement
create policy "staff gere incidents" on public.incidents for all using (public.is_staff()) with check (public.is_staff());
create policy "staff gere grade_permissions" on public.grade_permissions for all using (public.is_staff()) with check (public.is_staff());
create policy "tout le monde lit club_tier_config" on public.club_tier_config for select using (true);
create policy "staff modifie club_tier_config" on public.club_tier_config for update using (public.is_staff());
create policy "staff insere club_tier_config" on public.club_tier_config for insert with check (public.is_staff());
create policy "staff gere accounting" on public.accounting_entries for all using (public.is_staff()) with check (public.is_staff());
create policy "staff gere finance_entries" on public.finance_entries for all using (public.is_staff()) with check (public.is_staff());
create policy "staff gere client_grades" on public.client_grades for all using (public.is_staff()) with check (public.is_staff());

-- Demandes Business/Media : n'importe qui peut soumettre, staff gère
create policy "creer demande business" on public.business_requests for insert with check (true);
create policy "staff lit et gere business_requests" on public.business_requests for select using (public.is_staff());
create policy "staff modifie business_requests" on public.business_requests for update using (public.is_staff());
create policy "creer sa demande media" on public.media_requests for insert with check (user_id = auth.uid());
create policy "voir sa demande media ou staff" on public.media_requests for select using (user_id = auth.uid() or public.is_staff());
create policy "staff modifie media_requests" on public.media_requests for update using (public.is_staff());
create policy "admin ou directeur supprime media_requests" on public.media_requests for delete using (public.is_admin_or_director());

-- ============================================================
-- COMPTE ADMIN DE DÉMONSTRATION
-- ============================================================
-- Après avoir exécuté ce script, crée un compte normal via
-- inscription.html avec l'e-mail admin@apexrental.rp, PUIS lance :
--
-- update public.profiles set role = 'admin'
-- where id = (select id from auth.users where email = 'admin@apexrental.rp');
