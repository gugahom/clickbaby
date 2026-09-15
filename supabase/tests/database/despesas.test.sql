-- pgTAP: despesas do caso (migration 20260913022926).
--
-- O QUE ESTE ARQUIVO PROTEGE
-- Este módulo foi REMOVIDO do escopo uma vez (20260820043748) e voltou por
-- pedido explícito do gestor. Se ele sair de novo, que saia por decisão — não
-- porque alguém deixou a escrita aberta e o dado virou lixo.
--
-- As duas guardas que mais importam:
--   1. `authenticated` NÃO escreve direto. Valor em reais com INSERT livre é
--      convite para a soma do mês não bater com nada.
--   2. Caso CANCELADO aceita despesa. É contraintuitivo e é o ponto: a corrida
--      de Uber acontece mesmo quando o parto não acontece, e esse é justamente
--      o gasto que a empresa precisa enxergar.

begin;
select plan(21);

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'foto.despesa@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'adm.despesa@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Fotografa Despesa', u.id, 'operador', true
  from auth.users u where u.email = 'foto.despesa@clickbaby.test';

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Adm Despesa', u.id, 'atendimento', true
  from auth.users u where u.email = 'adm.despesa@clickbaby.test';

insert into public.maternidades (nome, sigla) values ('Maternidade Despesa', 'DSPTEST');

insert into public.casos (mae_nome, pacote_id, maternidade_id)
select 'Mae Despesa Ativa',
       (select id from public.pacotes where slug = 'basic'),
       (select id from public.maternidades where sigla = 'DSPTEST');

-- O caso que o gestor precisa ver no total: cancelado, com deslocamento pago.
insert into public.casos (mae_nome, pacote_id, maternidade_id, status_operacional, motivo_cancelamento)
select 'Mae Despesa Cancelada',
       (select id from public.pacotes where slug = 'basic'),
       (select id from public.maternidades where sigla = 'DSPTEST'),
       'cancelado',
       'Cancelado via Google Calendar (card cinza)';

create function pg_temp.como(p_email text) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
    json_build_object('sub', v_id, 'role', 'authenticated')::text);
end;
$$;

create function pg_temp.caso(p_mae text) returns uuid language sql as $$
  select id from public.casos where mae_nome = p_mae;
$$;

create function pg_temp.pessoa(p_nome text) returns uuid language sql as $$
  select id from public.pessoas where nome = p_nome;
$$;


-- =============================================================================
-- 1. Estrutura e privilégios
-- =============================================================================

select ok(
  (select relrowsecurity from pg_class where oid = 'public.despesas'::regclass),
  'despesas tem RLS habilitada'
);

select ok(
  has_table_privilege('authenticated', 'public.despesas', 'SELECT'),
  'authenticated LÊ despesas — a lista é de todo mundo, por decisão do gestor'
);

select ok(
  not has_table_privilege('authenticated', 'public.despesas', 'INSERT')
  and not has_table_privilege('authenticated', 'public.despesas', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.despesas', 'DELETE')
  and not has_table_privilege('authenticated', 'public.despesas', 'TRUNCATE'),
  'authenticated NÃO escreve despesas por fora — só pelas RPCs'
);

select ok(
  not has_table_privilege('anon', 'public.despesas', 'SELECT'),
  'anon não lê despesas'
);

select ok(
  not has_function_privilege('anon', 'public.registrar_despesa(uuid, public.tipo_despesa, numeric, uuid, public.momento_despesa, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.remover_despesa(uuid, text)', 'EXECUTE'),
  'anon não executa as RPCs de despesa (o revoke incluiu PUBLIC, de onde anon herda)'
);


-- =============================================================================
-- 2. Registrar — o caminho comum
-- =============================================================================

select pg_temp.como('foto.despesa@clickbaby.test');

select lives_ok(
  format($$ select public.registrar_despesa(%L::uuid, 'uber_ida', 24.90) $$,
         pg_temp.caso('Mae Despesa Ativa')),
  'RD1: a fotógrafa lança a própria corrida com tipo e valor, e mais nada'
);

select is(
  (select d.pessoa_id from public.despesas d where d.valor = 24.90),
  pg_temp.pessoa('Fotografa Despesa'),
  'RD2: sem p_pessoa_id, a despesa é de quem está lançando'
);

select is(
  (select d.registrado_por from public.despesas d where d.valor = 24.90),
  pg_temp.pessoa('Fotografa Despesa'),
  'RD3: e registrado_por é a mesma pessoa neste caminho'
);

select is(
  (select (e.payload ->> 'valor')::numeric from public.eventos e
    where e.tipo = 'despesa_registrada' and e.caso_id = pg_temp.caso('Mae Despesa Ativa')),
  24.90::numeric,
  'RD4: o evento append-only guarda o VALOR — é o que sobrevive a uma remoção'
);

-- O ADM lançando pela fotógrafa: as duas colunas passam a discordar, e é
-- exatamente para isso que elas são duas.
reset role;
select pg_temp.como('adm.despesa@clickbaby.test');

select lives_ok(
  format($$ select public.registrar_despesa(%L::uuid, 'refeicao', 32.00, %L::uuid, 'fechamento') $$,
         pg_temp.caso('Mae Despesa Ativa'),
         pg_temp.pessoa('Fotografa Despesa')),
  'RD5: o ADM lança a refeição da fotógrafa, com o momento da planilha'
);

select is(
  (select d.pessoa_id || '/' || d.registrado_por from public.despesas d where d.valor = 32.00),
  pg_temp.pessoa('Fotografa Despesa') || '/' || pg_temp.pessoa('Adm Despesa'),
  'RD6: o gasto é DELA, o lançamento é DELE — quem se deslocou e quem digitou'
);

select is(
  (select d.momento::text from public.despesas d where d.valor = 32.00),
  'fechamento',
  'RD7: o momento é guardado como rótulo'
);


-- =============================================================================
-- 3. O que a RPC recusa
-- =============================================================================

select throws_ok(
  format($$ select public.registrar_despesa(%L::uuid, 'uber_ida', 0) $$,
         pg_temp.caso('Mae Despesa Ativa')),
  'P0001',
  null,
  'RD8: valor zero não é gasto, é engano de digitação'
);

select throws_ok(
  format($$ select public.registrar_despesa(%L::uuid, 'uber_volta', -15.00) $$,
         pg_temp.caso('Mae Despesa Ativa')),
  'P0001',
  null,
  'RD9: valor negativo também'
);

select throws_ok(
  format($$ select public.registrar_despesa(%L::uuid, 'outro', 12.00) $$,
         pg_temp.caso('Mae Despesa Ativa')),
  'P0001',
  null,
  'RD10: "outro" sem descrição vira linha que ninguém confere depois'
);

select throws_ok(
  $$ select public.registrar_despesa('00000000-0000-0000-0000-000000000000'::uuid, 'uber_ida', 10.00) $$,
  'P0001',
  null,
  'RD11: caso inexistente é recusado'
);

select throws_ok(
  format($$ insert into public.despesas (caso_id, pessoa_id, tipo, valor, registrado_por)
            values (%L::uuid, %L::uuid, 'uber_ida', 99.00, %L::uuid) $$,
         pg_temp.caso('Mae Despesa Ativa'),
         pg_temp.pessoa('Adm Despesa'),
         pg_temp.pessoa('Adm Despesa')),
  '42501',
  null,
  'RD12: INSERT direto é negado mesmo para adm — o GRANT não existe'
);


-- =============================================================================
-- 4. Caso cancelado — a regra contraintuitiva
-- =============================================================================

select lives_ok(
  format($$ select public.registrar_despesa(%L::uuid, 'uber_ida', 18.50, null, 'parto') $$,
         pg_temp.caso('Mae Despesa Cancelada')),
  'RD13: caso CANCELADO aceita despesa — a corrida acontece mesmo quando o parto não acontece'
);


-- =============================================================================
-- 5. Remover
-- =============================================================================

select lives_ok(
  format($$ select public.remover_despesa(
              (select id from public.despesas where valor = 24.90), 'valor errado') $$),
  'RD14: quem lançou errado apaga — não existe editar'
);

select is(
  (select count(*)::int from public.despesas where valor = 24.90),
  0,
  'RD15: a linha some de verdade'
);

select is(
  (select (e.payload ->> 'valor')::numeric from public.eventos e
    where e.tipo = 'despesa_removida'),
  24.90::numeric,
  'RD16: e o evento de remoção guarda quanto era — senão o total do mês fica sem explicação'
);

select * from finish();
rollback;
