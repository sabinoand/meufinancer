-- GestCel — Parte 10b: tipo de carroceria e categoria do caminhão
alter table public.caminhoes
  add column tipo text not null default 'bau' check (tipo in ('bau','sider','carroceria')),
  add column categoria text check (categoria is null or categoria in ('vuc','tres_quartos','toco','truck','bitruck','carreta','outro'));
