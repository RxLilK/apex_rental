-- ============================================================
-- PATCH : autoriser le staff à créer une réservation pour un client
-- (nécessaire pour admin/nouvelle-reservation.html)
-- ============================================================

drop policy if exists "creer sa reservation" on public.reservations;

create policy "creer sa reservation" on public.reservations for insert
  with check (user_id = auth.uid() or public.is_staff());
