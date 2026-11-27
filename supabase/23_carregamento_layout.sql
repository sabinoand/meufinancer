-- GestCel — Parte 10d: posições das caixas quando o carregamento foi editado à mão
alter table public.carregamentos add column layout jsonb check (layout is null or (jsonb_typeof(layout) = 'array' and jsonb_array_length(layout) <= 5000));
