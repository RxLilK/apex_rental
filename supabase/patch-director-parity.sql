-- ============================================================
-- PATCH : parité Directeur (grade 10) / admin au niveau RLS
-- Jusqu'ici plusieurs policies vérifiaient littéralement role = 'admin',
-- ce qui bloquait un employé grade 10 (ex: modifier le profil d'un
-- client, changer son abonnement VIP, etc.) même si l'interface lui
-- donnait accès. On corrige en profondeur avec une fonction dédiée.
-- ============================================================

create or replace function public.is_admin_or_director()
returns boolean
language sql
security definer
stable
as $$
  select public.current_role() = 'admin' or exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'employee' and grade_code = 'director'
  );
$$;

-- Profils : un client peut modifier le sien, l'admin ou le Directeur
-- peuvent modifier n'importe quel profil (statut VIP, grade client...).
drop policy if exists "modifier son profil ou staff" on public.profiles;
create policy "modifier son profil ou staff" on public.profiles for update
  using (id = auth.uid() or public.is_admin_or_director());

-- Réservations : suppression réservée à l'admin ou au Directeur
-- (remplace la version précédente par la fonction commune).
drop policy if exists "admin ou directeur supprime reservations" on public.reservations;
create policy "admin ou directeur supprime reservations" on public.reservations for delete
  using (public.is_admin_or_director());
