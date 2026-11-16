-- GestCel — Gestão de Parceiros — Parte 1: base (empresas, perfis, papéis, segurança)

create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null check (tipo in ('cel', 'terceirizada')),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.perfis (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  nome text not null default 'Usuário',
  papel text not null default 'pendente' check (papel in ('pendente', 'admin', 'cel', 'fornecedor')),
  empresa_id uuid references public.empresas(id) on delete set null,
  ativo boolean not null default true,
  ultima_versao_vista text,
  created_at timestamptz not null default now()
);

-- Funções auxiliares (security definer evita recursão nas políticas de segurança)
create or replace function public.meu_papel()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select papel from public.perfis where user_id = auth.uid() and ativo
$$;

create or replace function public.minha_empresa()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select empresa_id from public.perfis where user_id = auth.uid() and ativo
$$;

-- Segurança por linha
alter table public.empresas enable row level security;
alter table public.perfis enable row level security;

create policy "empresas_ver" on public.empresas for select to authenticated
  using (public.meu_papel() in ('admin', 'cel') or id = public.minha_empresa());

create policy "empresas_admin" on public.empresas for all to authenticated
  using (public.meu_papel() = 'admin')
  with check (public.meu_papel() = 'admin');

create policy "perfis_ver_proprio" on public.perfis for select to authenticated
  using (user_id = auth.uid());

create policy "perfis_admin" on public.perfis for all to authenticated
  using (public.meu_papel() = 'admin')
  with check (public.meu_papel() = 'admin');

-- Ao criar uma conta: o primeiro usuário vira administrador, os demais ficam pendentes
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  primeiro boolean;
begin
  select not exists (select 1 from public.perfis) into primeiro;
  insert into public.perfis (user_id, username, nome, papel)
  values (
    new.id,
    nullif(lower(new.raw_user_meta_data ->> 'username'), ''),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'nome', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'username', ''),
      'Usuário'
    ),
    case when primeiro then 'admin' else 'pendente' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Login por nome de usuário (a tela de login traduz usuário -> e-mail interno)
create or replace function public.email_for_username(identifier text)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.email
  from auth.users u
  join public.perfis p on p.user_id = u.id
  where p.username = lower(identifier)
  limit 1
$$;

grant execute on function public.email_for_username(text) to anon, authenticated;

-- Guarda a última versão do app que o usuário viu (aviso de novidades)
create or replace function public.marcar_versao_vista(v text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.perfis set ultima_versao_vista = v where user_id = auth.uid()
$$;

grant execute on function public.marcar_versao_vista(text) to authenticated;

-- Empresa inicial
insert into public.empresas (nome, tipo) values ('Cel Móveis', 'cel');
