-- pgTAP: a checagem de permissão roda UMA vez por consulta
-- (migration 20260918085454).
--
-- O QUE ESTE ARQUIVO PROTEGE. Em 18/09/2026 o Quadro ficou lento em produção, e
-- um dos multiplicadores era a RLS: `using (eh_pessoa_ativa())` fazia o
-- Postgres chamar a função em CADA linha de CADA varredura — medido, 4x mais
-- lento que sem ela. Embrulhada num `(select ...)`, ela vira um InitPlan e roda
-- uma vez por consulta.
--
-- A armadilha é que a forma lenta e a rápida dão o MESMO resultado: nenhum
-- teste de permissão pega a regressão, e a próxima policy escrita do jeito
-- óbvio devolveria a lentidão em silêncio. Este teste pega.

begin;
select plan(3);

-- 1. NENHUMA policy do schema public chama um dos helpers sem o select em
--    volta. Conta as chamadas e conta as embrulhadas; têm de ser iguais.
select is(
  (select count(*)::int
     from pg_policies p,
          lateral (select coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '') as expr) e
    where p.schemaname = 'public'
      and regexp_count(e.expr, 'eh_(pessoa_ativa|adm|atendimento)\(\)')
        <> regexp_count(e.expr, 'SELECT eh_(pessoa_ativa|adm|atendimento)\(\)')),
  0,
  'U1: toda policy que chama eh_pessoa_ativa/eh_adm/eh_atendimento o faz dentro de (select ...)');

-- 2. E elas continuam existindo — a troca foi de expressão, não de policy.
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public'
      and (qual ~ 'eh_(pessoa_ativa|adm|atendimento)\(\)'
           or with_check ~ 'eh_(pessoa_ativa|adm|atendimento)\(\)')),
  19,
  'U2: as 19 policies que usam os helpers continuam lá');

-- 3. O PLANO mostra a diferença: a consulta do Quadro, como o app a faz, não
--    tem mais a função como filtro linha a linha — ela aparece como InitPlan.
insert into auth.users (id, email, aud, role, created_at, updated_at)
values (gen_random_uuid(), 'plano.rls@clickbaby.test', 'authenticated', 'authenticated', now(), now());
insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Plano RLS', u.id, 'operador', true from auth.users u where u.email = 'plano.rls@clickbaby.test';

create function pg_temp.plano_do_quadro() returns text language plpgsql as $$
declare
  v_id uuid;
  linha text;
  plano text := '';
begin
  select id into v_id from auth.users where email = 'plano.rls@clickbaby.test';
  execute format('set local request.jwt.claims = %L',
    json_build_object('sub', v_id, 'role', 'authenticated')::text);
  execute 'set local role authenticated';
  for linha in execute 'explain (costs off) select * from public.quadro_casos' loop
    plano := plano || linha || E'\n';
  end loop;
  execute 'reset role';
  return plano;
end;
$$;

-- Linha a linha: nenhuma linha de "Filter:" do plano pode citar a função. Antes
-- da migration eram seis, uma por varredura.
select is(
  (select count(*)::int
     from regexp_split_to_table(pg_temp.plano_do_quadro(), E'\n') as l(linha)
    where l.linha ~ 'Filter:' and l.linha ~ 'eh_pessoa_ativa'),
  0,
  'U3: no plano do Quadro, eh_pessoa_ativa() não é mais filtro por linha');

select * from finish();
rollback;
