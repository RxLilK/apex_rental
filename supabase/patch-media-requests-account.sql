-- ============================================================
-- PATCH : demandes Media rattachées à un compte
-- Jusqu'ici une demande Media n'était liée à aucun compte (pas
-- d'e-mail, pas d'utilisateur) — impossible de savoir qui l'a
-- envoyée ni de la lui montrer dans son espace client.
-- ============================================================

alter table public.media_requests add column if not exists user_id uuid references public.profiles(id);

-- Le client peut créer et voir SES propres demandes ; le staff voit tout.
drop policy if exists "creer demande media" on public.media_requests;
drop policy if exists "staff lit media_requests" on public.media_requests;
drop policy if exists "staff modifie media_requests" on public.media_requests;

create policy "creer sa demande media" on public.media_requests for insert
  with check (user_id = auth.uid());
create policy "voir sa demande media ou staff" on public.media_requests for select
  using (user_id = auth.uid() or public.is_staff());
create policy "staff modifie media_requests" on public.media_requests for update
  using (public.is_staff());
