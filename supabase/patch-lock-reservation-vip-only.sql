-- ============================================================
-- PATCH : verrouiller la réservation en libre-service côté base
-- Un client "Standard" (ou Entreprise) ne peut plus créer de
-- réservation lui-même, même en contournant l'interface. Seuls
-- Apex Club, Apex Black, et le staff (peu importe le client
-- concerné) peuvent insérer une réservation.
-- ============================================================

drop policy if exists "creer sa reservation" on public.reservations;

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
