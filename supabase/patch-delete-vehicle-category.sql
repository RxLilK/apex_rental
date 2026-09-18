-- ============================================================
-- PATCH : autoriser la suppression d'une catégorie de véhicule
-- (Directeur grade 10 ou admin uniquement)
-- ============================================================

drop policy if exists "directeur ou admin supprime categories" on public.vehicle_categories;

create policy "directeur ou admin supprime categories" on public.vehicle_categories for delete
  using (public.is_admin_or_director());
