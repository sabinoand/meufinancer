-- GestCel — Parte 10: carregamento de caminhão (caminhões, tipos de caixa e carregamentos salvos)
create table public.caminhoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  nome text not null check (length(trim(nome)) between 1 and 80),
  comp_cm numeric(7,1) not null check (comp_cm > 0 and comp_cm <= 2500),
  larg_cm numeric(7,1) not null check (larg_cm > 0 and larg_cm <= 400),
  alt_cm  numeric(7,1) not null check (alt_cm  > 0 and alt_cm  <= 500),
  observacao text check (observacao is null or length(observacao) <= 300),
  created_at timestamptz not null default now()
);

create table public.caixas_tipo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  nome text not null check (length(trim(nome)) between 1 and 80),
  comp_cm numeric(7,1) not null check (comp_cm > 0 and comp_cm <= 1000),
  larg_cm numeric(7,1) not null check (larg_cm > 0 and larg_cm <= 1000),
  alt_cm  numeric(7,1) not null check (alt_cm  > 0 and alt_cm  <= 1000),
  max_pilha integer not null default 2 check (max_pilha between 1 and 30),  -- caixas na mesma pilha, contando a de baixo
  pode_deitar boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.carregamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  caminhao_id uuid not null references public.caminhoes(id) on delete restrict,
  nome text not null check (length(trim(nome)) between 1 and 80),
  data date not null default current_date,
  observacao text check (observacao is null or length(observacao) <= 300),
  created_at timestamptz not null default now()
);

create table public.carregamento_itens (
  id uuid primary key default gen_random_uuid(),
  carregamento_id uuid not null references public.carregamentos(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id),
  tipo_id uuid not null references public.caixas_tipo(id) on delete restrict,
  quantidade integer not null check (quantidade between 1 and 5000)
);
create index carregamentos_emp_idx on public.carregamentos(empresa_id, data desc);
create index carregamento_itens_idx on public.carregamento_itens(carregamento_id);

alter table public.caminhoes enable row level security;
alter table public.caixas_tipo enable row level security;
alter table public.carregamentos enable row level security;
alter table public.carregamento_itens enable row level security;

create policy "caminhoes_proprios" on public.caminhoes for all to authenticated
  using (public.meu_papel() = 'fornecedor' and empresa_id = public.minha_empresa())
  with check (public.meu_papel() = 'fornecedor' and empresa_id = public.minha_empresa());
create policy "caminhoes_admin_ver" on public.caminhoes for select to authenticated using (public.meu_papel() = 'admin');

create policy "caixas_tipo_proprias" on public.caixas_tipo for all to authenticated
  using (public.meu_papel() = 'fornecedor' and empresa_id = public.minha_empresa())
  with check (public.meu_papel() = 'fornecedor' and empresa_id = public.minha_empresa());
create policy "caixas_tipo_admin_ver" on public.caixas_tipo for select to authenticated using (public.meu_papel() = 'admin');

create policy "carregamentos_proprios" on public.carregamentos for all to authenticated
  using (public.meu_papel() = 'fornecedor' and empresa_id = public.minha_empresa())
  with check (public.meu_papel() = 'fornecedor' and empresa_id = public.minha_empresa()
    and exists (select 1 from public.caminhoes c where c.id = caminhao_id and c.empresa_id = carregamentos.empresa_id));
create policy "carregamentos_admin_ver" on public.carregamentos for select to authenticated using (public.meu_papel() = 'admin');

create policy "carreg_itens_proprios" on public.carregamento_itens for all to authenticated
  using (public.meu_papel() = 'fornecedor' and empresa_id = public.minha_empresa())
  with check (public.meu_papel() = 'fornecedor' and empresa_id = public.minha_empresa()
    and exists (select 1 from public.carregamentos g where g.id = carregamento_id and g.empresa_id = carregamento_itens.empresa_id)
    and exists (select 1 from public.caixas_tipo t where t.id = tipo_id and t.empresa_id = carregamento_itens.empresa_id));
create policy "carreg_itens_admin_ver" on public.carregamento_itens for select to authenticated using (public.meu_papel() = 'admin');

revoke all on public.caminhoes, public.caixas_tipo, public.carregamentos, public.carregamento_itens from anon;
