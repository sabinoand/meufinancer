-- 18: endurecimento de segurança (auditoria)
-- 1) anon não precisa de acesso direto a nenhuma tabela/view (RLS já bloqueava; agora nem o privilégio existe)
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, public;

-- 2) RPCs: só usuário logado, exceto as 3 que o login/etiqueta pública precisam
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, p.proname
           from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f'
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    if f.proname in ('email_for_username','etiqueta_publica','avaliar_etiqueta') then
      execute format('grant execute on function %s to anon, authenticated', f.sig);
    elsif f.proname in ('handle_new_user','req_protegida','req_item_protegido') then
      execute format('revoke execute on function %s from authenticated', f.sig); -- só gatilhos
    else
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;

-- 3) search_path fixo nos gatilhos
alter function public.req_protegida() set search_path = public;
alter function public.req_item_protegido() set search_path = public;

-- 4) etiqueta pública: validar tamanho do token (evita lixo/abuso)
create or replace function public.avaliar_etiqueta(p_token text, p_nota integer, p_comentario text, p_avaliador text)
returns void language plpgsql security definer set search_path = public as $$
declare v_e public.etiquetas;
begin
  if p_token is null or length(p_token) > 100 then raise exception 'Etiqueta inválida.'; end if;
  if p_nota is null or p_nota < 1 or p_nota > 5 then raise exception 'Escolha uma nota de 1 a 5.'; end if;
  select * into v_e from public.etiquetas where token = p_token;
  if not found then raise exception 'Etiqueta inválida.'; end if;
  if exists (select 1 from public.avaliacoes where etiqueta_id = v_e.id) then
    raise exception 'Este produto já foi avaliado.';
  end if;
  insert into public.avaliacoes (etiqueta_id, empresa_id, nota, comentario, avaliador)
  values (v_e.id, v_e.empresa_id, p_nota, left(nullif(trim(p_comentario), ''), 500), left(nullif(trim(p_avaliador), ''), 80));
end $$;
revoke execute on function public.avaliar_etiqueta(text,integer,text,text) from public;
grant execute on function public.avaliar_etiqueta(text,integer,text,text) to anon, authenticated;
revoke execute on function public.recalcular_item(uuid) from public, anon, authenticated;
