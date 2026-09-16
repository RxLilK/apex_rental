-- ============================================================
-- PATCH : ajouter l'e-mail aux profils
-- La table auth.users (qui contient l'e-mail) n'est pas lisible
-- par les autres comptes pour des raisons de sécurité. On copie
-- donc l'e-mail dans profiles à l'inscription, pour que l'admin
-- puisse voir la liste des clients avec leur e-mail.
-- ============================================================

alter table public.profiles add column if not exists email text;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, first_name, last_name, phone, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    new.email
  );
  return new;
end;
$$;

-- Complète l'e-mail des comptes déjà créés avant ce patch.
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and (p.email is null or p.email = '');
