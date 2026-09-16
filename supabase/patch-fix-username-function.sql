-- ============================================================
-- CORRECTIF : generate_username sans dépendance à unaccent
-- L'extension unaccent n'est pas disponible sur ce projet Supabase.
-- On utilise translate(), une fonction PostgreSQL de base toujours
-- présente, pour retirer les accents courants à la place.
-- ============================================================

create or replace function public.generate_username(p_first text, p_last text)
returns text
language plpgsql
as $$
declare
  base_username text;
  final_username text;
  counter int := 0;
  cleaned text;
begin
  cleaned := lower(coalesce(nullif(p_first, ''), 'user') || '.' || coalesce(p_last, ''));
  cleaned := translate(
    cleaned,
    'àâäáãåèéêëìíîïòóôöõùúûüçñýÿ',
    'aaaaaaeeeeiiiiooooouuuucnyy'
  );
  base_username := regexp_replace(cleaned, '[^a-z0-9.]+', '', 'g');
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

-- Retente de générer un identifiant pour les comptes qui n'en ont
-- toujours pas (ceux dont la génération a échoué à cause du bug).
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
