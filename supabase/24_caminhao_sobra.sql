-- Carroceria aberta: quanto a carga pode sobrar para fora, a partir da 2ª camada (cm)
alter table public.caminhoes
  add column if not exists sobra_lado_cm numeric not null default 0 check (sobra_lado_cm >= 0 and sobra_lado_cm <= 100),
  add column if not exists sobra_tras_cm numeric not null default 0 check (sobra_tras_cm >= 0 and sobra_tras_cm <= 200);
