-- ============================================================
-- PATCH : autoriser l'INSERT sur club_tier_config
-- (nécessaire pour que upsert() fonctionne depuis admin/prix.html)
-- ============================================================

create policy "staff insere club_tier_config" on public.club_tier_config for insert
  with check (public.is_staff());
