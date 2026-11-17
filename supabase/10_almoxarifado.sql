-- GestCel — Parte 8: Almoxarifado (estoque central da Cel) + solicitações das terceirizadas

-- Novo papel: almoxarife (pertence à Cel Móveis)
alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check
  check (papel in ('pendente', 'admin', 'cel', 'fornecedor', 'almoxarife'));

-- o almoxarife precisa enxergar o nome das terceirizadas
drop policy if exists "empresas_ver" on public.empresas;
create policy "empresas_ver" on public.empresas for select to authenticated
  using (public.meu_papel() in ('admin', 'cel', 'almoxarife') or id = public.minha_empresa());

-- ===== Catálogo + estoque do almoxarife =====
create table public.almox_itens (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  unidade text not null,
  grupo text,
  valor numeric(12,2) not null default 0 check (valor >= 0),
  minimo numeric(12,3) not null default 0 check (minimo >= 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index almox_itens_nome_uq on public.almox_itens (lower(nome));

create table public.almox_mov (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.almox_itens(id) on delete cascade,
  tipo text not null check (tipo in ('entrada','saida')),
  quantidade numeric(12,3) not null check (quantidade > 0),
  observacao text,
  data date not null default current_date,
  criado_por uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index almox_mov_item_idx on public.almox_mov(item_id);

alter table public.almox_itens enable row level security;
alter table public.almox_mov enable row level security;

-- terceirizadas enxergam o catálogo (itens ativos), mas nunca o saldo nem as movimentações
create policy "almox_itens_ver" on public.almox_itens for select to authenticated
  using (public.meu_papel() in ('admin','almoxarife') or (public.meu_papel() = 'fornecedor' and ativo));
create policy "almox_itens_inserir" on public.almox_itens for insert to authenticated
  with check (public.meu_papel() = 'almoxarife');
create policy "almox_itens_editar" on public.almox_itens for update to authenticated
  using (public.meu_papel() = 'almoxarife') with check (public.meu_papel() = 'almoxarife');
create policy "almox_mov_ver" on public.almox_mov for select to authenticated
  using (public.meu_papel() in ('admin','almoxarife'));

create view public.almox_saldo with (security_invoker = true) as
  select item_id, sum(case when tipo = 'entrada' then quantidade else -quantidade end) as saldo
  from public.almox_mov group by item_id;
grant select on public.almox_saldo to authenticated;

create or replace function public.almox_movimentar(p_item uuid, p_tipo text, p_qtd numeric, p_valor numeric, p_obs text, p_data date)
returns void language plpgsql security definer set search_path = public as $$
declare i public.almox_itens; v_saldo numeric;
begin
  if public.meu_papel() <> 'almoxarife' then raise exception 'Sem permissão.'; end if;
  select * into i from public.almox_itens where id = p_item;
  if not found then raise exception 'Item não encontrado.'; end if;
  if p_tipo not in ('entrada','saida') then raise exception 'Tipo inválido.'; end if;
  if p_qtd is null or p_qtd <= 0 then raise exception 'Informe a quantidade.'; end if;
  if p_valor is not null and p_valor < 0 then raise exception 'Valor inválido.'; end if;

  perform pg_advisory_xact_lock(hashtext(p_item::text));
  if p_tipo = 'saida' then
    select coalesce(sum(case when tipo = 'entrada' then quantidade else -quantidade end), 0) into v_saldo
      from public.almox_mov where item_id = p_item;
    if p_qtd > v_saldo then raise exception 'Estoque insuficiente (saldo: % %).', v_saldo, i.unidade; end if;
  end if;

  insert into public.almox_mov (item_id, tipo, quantidade, observacao, data)
  values (p_item, p_tipo, p_qtd, nullif(trim(p_obs), ''), coalesce(p_data, current_date));
  if p_tipo = 'entrada' and p_valor is not null then
    update public.almox_itens set valor = p_valor where id = p_item;
  end if;
end $$;

create or replace function public.almox_excluir_mov(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m public.almox_mov; v_saldo numeric;
begin
  if public.meu_papel() <> 'almoxarife' then raise exception 'Sem permissão.'; end if;
  select * into m from public.almox_mov where id = p_id;
  if not found then raise exception 'Movimentação não encontrada.'; end if;
  perform pg_advisory_xact_lock(hashtext(m.item_id::text));
  if m.tipo = 'entrada' then
    select coalesce(sum(case when tipo = 'entrada' then quantidade else -quantidade end), 0) - m.quantidade into v_saldo
      from public.almox_mov where item_id = m.item_id;
    if v_saldo < 0 then raise exception 'Não dá para desfazer: o estoque ficaria negativo.'; end if;
  end if;
  delete from public.almox_mov where id = p_id;
end $$;

-- ===== Solicitações (terceirizada -> almoxarife) =====
create table public.solicitacoes (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  empresa_id uuid not null references public.empresas(id),
  tipo text not null check (tipo in ('coleta','entrega')),
  status text not null default 'solicitado'
    check (status in ('solicitado','confirmado','recusado','em_separacao','concluido','cancelado')),
  data_desejada date,
  observacao text,
  motivo text,
  criado_por uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  confirmado_em timestamptz,
  separacao_em timestamptz,
  concluido_em timestamptz
);
create index solicitacoes_status_idx on public.solicitacoes(status, created_at);
create index solicitacoes_empresa_idx on public.solicitacoes(empresa_id, created_at);

create table public.solicitacao_itens (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references public.solicitacoes(id) on delete cascade,
  item_id uuid not null references public.almox_itens(id),
  descricao text not null,
  unidade text not null,
  quantidade numeric(12,3) not null check (quantidade > 0)
);
create index solicitacao_itens_sol_idx on public.solicitacao_itens(solicitacao_id);

alter table public.solicitacoes enable row level security;
alter table public.solicitacao_itens enable row level security;

-- só leitura direta; criar/alterar passa pelas funções abaixo
create policy "sol_ver" on public.solicitacoes for select to authenticated
  using (public.meu_papel() in ('admin','almoxarife')
         or (public.meu_papel() = 'fornecedor' and empresa_id = public.minha_empresa()));
create policy "sol_itens_ver" on public.solicitacao_itens for select to authenticated
  using (exists (select 1 from public.solicitacoes s where s.id = solicitacao_id));

create or replace function public.criar_solicitacao(p_tipo text, p_data date, p_obs text, p_itens jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_emp uuid := public.minha_empresa(); x jsonb; it public.almox_itens; v_q numeric; v_n int := 0;
begin
  if public.meu_papel() <> 'fornecedor' or v_emp is null then raise exception 'Sem permissão.'; end if;
  if p_tipo not in ('coleta','entrega') then raise exception 'Escolha coleta ou entrega.'; end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Adicione ao menos um item.';
  end if;

  -- valida tudo antes de criar (evita queimar o número da solicitação)
  for x in select * from jsonb_array_elements(p_itens) loop
    v_q := (x ->> 'quantidade')::numeric;
    select * into it from public.almox_itens where id = (x ->> 'item_id')::uuid and ativo;
    if not found then raise exception 'Item não encontrado.'; end if;
    if v_q is null or v_q <= 0 then raise exception 'Informe a quantidade de %.', it.nome; end if;
  end loop;

  insert into public.solicitacoes (empresa_id, tipo, data_desejada, observacao)
  values (v_emp, p_tipo, p_data, nullif(trim(p_obs), '')) returning id into v_id;

  for x in select * from jsonb_array_elements(p_itens) loop
    select * into it from public.almox_itens where id = (x ->> 'item_id')::uuid;
    insert into public.solicitacao_itens (solicitacao_id, item_id, descricao, unidade, quantidade)
    values (v_id, it.id, it.nome, it.unidade, (x ->> 'quantidade')::numeric);
  end loop;
  return v_id;
end $$;

-- ações: almoxarife = confirmar | recusar | separar | concluir ; terceirizada = cancelar
create or replace function public.atualizar_solicitacao(p_id uuid, p_acao text, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.solicitacoes; v_papel text := public.meu_papel();
begin
  select * into s from public.solicitacoes where id = p_id for update;
  if not found then raise exception 'Solicitação não encontrada.'; end if;

  if v_papel = 'fornecedor' then
    if s.empresa_id is distinct from public.minha_empresa() then raise exception 'Solicitação não encontrada.'; end if;
    if p_acao <> 'cancelar' then raise exception 'Sem permissão.'; end if;
    if s.status not in ('solicitado','confirmado') then raise exception 'Já está em separação ou finalizada; fale com o almoxarife.'; end if;
    update public.solicitacoes set status = 'cancelado', atualizado_em = now() where id = p_id;

  elsif v_papel = 'almoxarife' then
    if p_acao = 'confirmar' then
      if s.status <> 'solicitado' then raise exception 'Só dá para confirmar uma solicitação nova.'; end if;
      update public.solicitacoes set status = 'confirmado', confirmado_em = now(), atualizado_em = now(), motivo = null where id = p_id;
    elsif p_acao = 'recusar' then
      if s.status not in ('solicitado','confirmado') then raise exception 'Não dá para recusar neste status.'; end if;
      update public.solicitacoes set status = 'recusado', motivo = nullif(trim(p_motivo), ''), atualizado_em = now() where id = p_id;
    elsif p_acao = 'separar' then
      if s.status <> 'confirmado' then raise exception 'Confirme a solicitação antes de separar.'; end if;
      update public.solicitacoes set status = 'em_separacao', separacao_em = now(), atualizado_em = now() where id = p_id;
    elsif p_acao = 'concluir' then
      if s.status <> 'em_separacao' then raise exception 'Coloque em separação antes de concluir.'; end if;
      update public.solicitacoes set status = 'concluido', concluido_em = now(), atualizado_em = now() where id = p_id;
    else
      raise exception 'Ação inválida.';
    end if;
  else
    raise exception 'Sem permissão.';
  end if;
end $$;

grant execute on function public.almox_movimentar(uuid,text,numeric,numeric,text,date) to authenticated;
grant execute on function public.almox_excluir_mov(uuid) to authenticated;
grant execute on function public.criar_solicitacao(text,date,text,jsonb) to authenticated;
grant execute on function public.atualizar_solicitacao(uuid,text,text) to authenticated;
