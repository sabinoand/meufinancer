-- GestCel — Parte 10c: carroceria aberta não tem altura; o limite é quantas caixas empilhar
alter table public.caminhoes add column max_pilha integer check (max_pilha is null or max_pilha between 1 and 30);
