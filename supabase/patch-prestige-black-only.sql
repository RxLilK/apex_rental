-- ============================================================
-- PATCH : les véhicules Prestige sont réservés à Apex Black
-- Un client Apex Club (pas Black) ne peut pas réserver lui-même
-- un véhicule de catégorie PRESTIGE. Le staff garde la main
-- (peut réserver n'importe quel véhicule pour n'importe quel client).
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
      and not (
        exists (select 1 from public.profiles where id = auth.uid() and club_tier = 'apex-club')
        and exists (select 1 from public.vehicles where id = vehicle_id and category = 'PRESTIGE')
      )
    )
  );
