-- ============================================================
-- PATCH : autoriser la suppression des réservations
-- (admin ou employé grade Directeur uniquement)
-- ============================================================

create policy "admin ou directeur supprime reservations" on public.reservations for delete
  using (
    public.current_role() = 'admin'
    or (
      public.current_role() = 'employee'
      and exists (select 1 from public.profiles where id = auth.uid() and grade_code = 'director')
    )
  );
