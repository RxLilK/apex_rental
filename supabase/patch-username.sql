-- ============================================================
-- PATCH : identifiant de connexion (prénom.nom)
-- ============================================================


alter table public.profiles add column if not exists username text unique;

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

-- Met à jour le trigger d'inscription pour générer l'identifiant.
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

-- Complète l'identifiant des comptes déjà créés avant ce patch.
do $$
declare
  r record;
begin
  for r in select id, first_name, last_name from public.profiles where username is null loop
    update public.profiles
    set username = public.generate_username(r.first_name, r.last_name)
    where id = r.id;
  end loop;
end $$;

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
