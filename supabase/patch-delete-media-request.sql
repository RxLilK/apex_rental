-- ============================================================
-- PATCH : autoriser la suppression d'une demande Media
-- (admin ou Directeur grade 10 uniquement)
-- ============================================================

drop policy if exists "admin ou directeur supprime media_requests" on public.media_requests;

create policy "admin ou directeur supprime media_requests" on public.media_requests for delete
  using (public.is_admin_or_director());
