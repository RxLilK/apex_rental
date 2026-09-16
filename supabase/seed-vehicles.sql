-- ============================================================
-- SEED : 20 véhicules de démonstration
-- À exécuter une fois, après schema.sql
-- ============================================================

insert into public.vehicles
  (id, name, category, power, top_speed, accel, braking, transmission, fuel, seats, trunk, price_4h, price_24h, price_7d, deposit, status, popularity)
values
  ('sultan-rs', 'Sultan RS', 'SPORT', 420, 265, '4.2s', 'Excellent', 'Manuelle', 'Essence', 4, 280, 2500, 6000, 27000, 15000, 'available', 95),
  ('elegy-retro-custom', 'Elegy Retro Custom', 'SPORT', 460, 275, '3.9s', 'Excellent', 'Manuelle', 'Essence', 4, 260, 2500, 6000, 27000, 15000, 'unavailable', 88),
  ('jester-rr', 'Jester RR', 'SPORT', 480, 280, '3.7s', 'Excellent', 'Automatique', 'Essence', 2, 180, 2500, 6000, 27000, 15000, 'available', 90),
  ('banshee-900r', 'Banshee 900R', 'PRESTIGE', 720, 330, '3.1s', 'Exceptionnel', 'Manuelle', 'Essence', 2, 150, 7500, 18000, 80000, 100000, 'available', 99),
  ('schafter-v12', 'Schafter V12', 'BUSINESS', 320, 230, '5.1s', 'Très bon', 'Automatique', 'Essence', 5, 420, 1000, 2500, 11000, 3000, 'available', 74),
  ('tailgater-s', 'Tailgater S', 'BUSINESS', 240, 210, '6.0s', 'Bon', 'Automatique', 'Essence', 5, 400, 1000, 2500, 11000, 3000, 'available', 70),
  ('buffalo-stx', 'Buffalo STX', 'SPORT', 440, 270, '4.0s', 'Excellent', 'Automatique', 'Essence', 4, 240, 2500, 6000, 27000, 15000, 'available', 80),
  ('comet-s2', 'Comet S2', 'SPORT', 450, 278, '3.8s', 'Excellent', 'Manuelle', 'Essence', 2, 160, 2500, 6000, 27000, 15000, 'available', 76),
  ('torero-xo', 'Torero XO', 'PRESTIGE', 780, 340, '2.9s', 'Exceptionnel', 'Automatique', 'Essence', 2, 140, 7500, 18000, 80000, 100000, 'available', 97),
  ('cognoscenti', 'Cognoscenti', 'BUSINESS', 280, 215, '5.6s', 'Bon', 'Automatique', 'Essence', 5, 410, 1000, 2500, 11000, 3000, 'unavailable', 58),
  ('baller', 'Baller', 'FAMILY', 290, 200, '6.3s', 'Bon', 'Automatique', 'Essence', 7, 600, 1200, 3000, 13000, 4000, 'available', 52),
  ('rebla-gts', 'Rebla GTS', 'FAMILY', 260, 190, '6.8s', 'Bon', 'Automatique', 'Essence', 7, 580, 1200, 3000, 13000, 4000, 'available', 48),
  ('sentinel-classic', 'Sentinel Classic', 'CITY', 190, 205, '7.2s', 'Correct', 'Manuelle', 'Essence', 4, 340, 500, 1200, 5500, 1000, 'available', 45),
  ('kuruma', 'Kuruma', 'CITY', 210, 195, '6.9s', 'Bon', 'Automatique', 'Essence', 4, 310, 500, 1200, 5500, 1000, 'available', 55),
  ('oracle-xs', 'Oracle XS', 'CITY', 200, 200, '7.0s', 'Correct', 'Automatique', 'Essence', 4, 330, 500, 1200, 5500, 1000, 'available', 40),
  ('f620', 'F620', 'CITY', 220, 210, '6.5s', 'Bon', 'Manuelle', 'Essence', 4, 300, 500, 1200, 5500, 1000, 'available', 42),
  ('turismo-classic', 'Turismo Classic', 'SPORT', 400, 260, '4.3s', 'Très bon', 'Manuelle', 'Essence', 2, 150, 2500, 6000, 27000, 15000, 'available', 65),
  ('pariah', 'Pariah', 'PRESTIGE', 700, 325, '3.0s', 'Exceptionnel', 'Automatique', 'Essence', 2, 130, 7500, 18000, 80000, 100000, 'unavailable', 93),
  ('infernus', 'Infernus', 'PRESTIGE', 690, 320, '3.2s', 'Exceptionnel', 'Automatique', 'Essence', 2, 120, 7500, 18000, 80000, 100000, 'available', 85),
  ('dubsta', 'Dubsta', 'UTILITY', 260, 180, '8.0s', 'Bon', 'Automatique', 'Diesel', 5, 700, 500, 1200, 5500, 1000, 'available', 30)

on conflict (id) do nothing;