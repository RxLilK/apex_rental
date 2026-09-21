-- ============================================================
-- PATCH : réduction personnalisée par client (0 à 100%)
-- S'ajoute à la réduction de l'abonnement (Apex Club/Black),
-- modifiable uniquement par l'admin ou le Directeur (grade 10).
-- La policy de mise à jour des profils existante (is_admin_or_director)
-- couvre déjà l'écriture ; ce patch ajoute juste la colonne.
-- ============================================================

alter table public.profiles add column if not exists custom_discount numeric not null default 0
  check (custom_discount >= 0 and custom_discount <= 100);
