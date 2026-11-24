-- pgTAP: fechar o lead cria o caso (migration 20261124150001).
--
--   F1 — criar caso é de quem tem a tela Comercial: a coordenação deixou de criar.
--   F2 — fechar exige a linha do PACOTE e o CONTRATO; quem não tem a tela não fecha.
--   F3 — fechar cria o caso, a venda, o contrato, e liga o lead — numa transação.
--   F4 — o que falha no meio não deixa caso solto nem lead fechado.
--   F5 — lead fechado não fecha de novo.
--   F6 — os casos parecidos: mesmo primeiro nome, perto da DPP, sem outro lead.
--   F7 — o anon não alcança as RPCs; o miolo é fechado até para authenticated.

begin;
select plan(26);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'comercial.fl@clickbaby.test',   'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'coordenacao.fl@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'foto.fl@clickbaby.test',        'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select v.nome, u.id, v.papel::public.papel_sistema, true
from (values ('Comercial FL',   'comercial.fl@clickbaby.test',   'comercial'),
             ('Coordenacao FL', 'coordenacao.fl@clickbaby.test', 'coordenacao'),
             ('Foto FL',        'foto.fl@clickbaby.test',        'operador')) as v(nome, email, papel)
join auth.users u on u.email = v.email;

create function pg_temp.pac(p_slug text) returns uuid language sql as $$
  select id from public.pacotes where slug = p_slug;
$$;
create function pg_temp.mat(p_sigla text) returns uuid language sql as $$
  select id from public.maternidades where sigla = p_sigla;
$$;
create function pg_temp.lead(p_mae text) returns uuid language sql as $$
  select id from public.leads where mae_nome = p_mae;
$$;
grant execute on function pg_temp.pac(text) to authenticated, anon;
grant execute on function pg_temp.mat(text) to authenticated, anon;
grant execute on function pg_temp.lead(text) to authenticated, anon;

create function pg_temp.como(p_email text) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L', json_build_object('sub', v_id, 'role', 'authenticated')::text);
end;
$$;

-- Os leads do teste, criados pelo comercial.
select pg_temp.como('comercial.fl@clickbaby.test');
select public.criar_lead('Maria José Fechamento', '41 99111-0001', '2029-06-10', pg_temp.mat('HSC'), 'cupom');
select public.criar_lead('Joana Falha', '41 99111-0002', '2029-06-10', pg_temp.mat('HSC'), 'cupom');
reset role;


-- =============================================================================
-- F1. Quem cria caso
-- =============================================================================

select pg_temp.como('coordenacao.fl@clickbaby.test');
select throws_ok(
  $$ select public.criar_caso('Ana', null, pg_temp.pac('basic'), pg_temp.mat('HSC'), '2029-06-10 10:00-03') $$,
  'P0001', 'Só quem tem a tela Comercial cria caso.',
  'F1: a coordenação deixou de criar caso'
);
reset role;

select pg_temp.como('comercial.fl@clickbaby.test');
select lives_ok(
  $$ select public.criar_caso('MARIA JOSE AGENDA', 'LUIZA', pg_temp.pac('basic'), pg_temp.mat('HSC'), '2029-06-12 10:00-03') $$,
  'F1: o comercial cria caso pelo calendário'
);
reset role;

select is(
  (select e.payload ->> 'origem' from public.eventos e
   join public.casos c on c.id = e.caso_id
   where c.mae_nome = 'MARIA JOSE AGENDA' and e.tipo = 'caso_criado'),
  'calendario',
  'F1: o caso do calendário diz que veio do calendário'
);


-- =============================================================================
-- F2. O que fechar exige
-- =============================================================================

select pg_temp.como('comercial.fl@clickbaby.test');
select throws_ok(
  $$ select public.fechar_lead(pg_temp.lead('Maria José Fechamento'), 'Maria José', 'Alice',
       pg_temp.pac('basic'), pg_temp.mat('HSC'), '2029-06-10 08:00-03',
       '[{"item": "reels", "valor": 300}]'::jsonb, 'https://contrato.test/1') $$,
  'P0001', 'Lance o valor do pacote vendido para fechar.',
  'F2: sem a linha do pacote não fecha'
);
select throws_ok(
  $$ select public.fechar_lead(pg_temp.lead('Maria José Fechamento'), 'Maria José', 'Alice',
       pg_temp.pac('basic'), pg_temp.mat('HSC'), '2029-06-10 08:00-03',
       '[{"item": "pacote", "valor": 1490}]'::jsonb, '  ') $$,
  'P0001', 'Informe o link do contrato para fechar.',
  'F2: sem o contrato não fecha'
);
reset role;

select pg_temp.como('foto.fl@clickbaby.test');
select throws_ok(
  $$ select public.fechar_lead(pg_temp.lead('Maria José Fechamento'), 'Maria José', 'Alice',
       pg_temp.pac('basic'), pg_temp.mat('HSC'), '2029-06-10 08:00-03',
       '[{"item": "pacote", "valor": 1490}]'::jsonb, 'https://contrato.test/1') $$,
  'P0001', 'Só quem tem a tela Comercial mexe nos leads.',
  'F2: a fotógrafa não fecha lead'
);
reset role;


-- =============================================================================
-- F6 (antes de fechar). Os casos parecidos
-- =============================================================================

select pg_temp.como('comercial.fl@clickbaby.test');
select public.criar_caso('MARIA LONGE', null, pg_temp.pac('basic'), pg_temp.mat('HSC'), '2029-12-30 10:00-03');
select public.criar_caso('MARIANA OUTRA', null, pg_temp.pac('basic'), pg_temp.mat('HSC'), '2029-06-11 10:00-03');
select is(
  (select array_agg(p.mae_nome order by p.mae_nome)
   from public.casos_parecidos_do_lead(pg_temp.lead('Maria José Fechamento')) p),
  array['MARIA JOSE AGENDA'],
  'F6: acha a mesma mãe perto da DPP — e não a de longe, nem outro primeiro nome'
);
reset role;

select pg_temp.como('foto.fl@clickbaby.test');
select throws_ok(
  $$ select * from public.casos_parecidos_do_lead(pg_temp.lead('Maria José Fechamento')) $$,
  'P0001', 'Só quem tem a tela Comercial mexe nos leads.',
  'F6: a fotógrafa não procura caso de lead'
);
reset role;


-- =============================================================================
-- F3. Fechar
-- =============================================================================

select pg_temp.como('comercial.fl@clickbaby.test');
select lives_ok(
  $$ select public.fechar_lead(pg_temp.lead('Maria José Fechamento'), 'Maria José', 'Alice',
       pg_temp.pac('basic'), pg_temp.mat('HSC'), '2029-06-10 08:00-03',
       '[{"item": "pacote", "valor": 1490, "parcelas": 6, "valor_parcela": 265},
         {"item": "reels", "valor": 300}]'::jsonb,
       'https://contrato.test/maria', p_click_home => true) $$,
  'F3: o comercial fecha o lead'
);
reset role;

select is(
  (select situacao::text from public.leads where id = pg_temp.lead('Maria José Fechamento')),
  'ganho',
  'F3: o lead fica ganho'
);
select is(
  (select c.mae_nome from public.casos c
   join public.leads l on l.caso_id = c.id
   where l.id = pg_temp.lead('Maria José Fechamento')),
  'MARIA JOSÉ',
  'F3: e ligado ao caso criado'
);
select ok(
  (select c.google_pendente and c.click_home from public.casos c
   join public.leads l on l.caso_id = c.id
   where l.id = pg_temp.lead('Maria José Fechamento')),
  'F3: o caso nasce pendente de ir ao Google, com o New Born'
);
select is(
  (select count(*)::int from public.vendas_do_caso v
   join public.leads l on l.caso_id = v.caso_id
   where l.id = pg_temp.lead('Maria José Fechamento')),
  2,
  'F3: as duas linhas da venda foram lançadas'
);
select is(
  (select v.valor_parcela from public.vendas_do_caso v
   join public.leads l on l.caso_id = v.caso_id
   where l.id = pg_temp.lead('Maria José Fechamento') and v.item = 'pacote'),
  265.00::numeric,
  'F3: com a condição do cartão'
);
select is(
  (select ct.url from public.contratos_dos_casos ct
   join public.leads l on l.caso_id = ct.caso_id
   where l.id = pg_temp.lead('Maria José Fechamento')),
  'https://contrato.test/maria',
  'F3: o contrato foi gravado'
);
select is(
  (select e.payload ->> 'origem' from public.eventos e
   join public.leads l on l.caso_id = e.caso_id
   where l.id = pg_temp.lead('Maria José Fechamento') and e.tipo = 'caso_criado'),
  'crm',
  'F3: o caso criado diz que veio do CRM'
);
select is(
  (select (e.payload ->> 'lead_id')::uuid from public.eventos e
   join public.leads l on l.caso_id = e.caso_id
   where l.id = pg_temp.lead('Maria José Fechamento') and e.tipo = 'caso_criado'),
  pg_temp.lead('Maria José Fechamento'),
  'F3: com o lead no payload'
);
select ok(
  (select e.lead_id is null from public.eventos e
   join public.leads l on l.caso_id = e.caso_id
   where l.id = pg_temp.lead('Maria José Fechamento') and e.tipo = 'caso_criado'),
  'F3: sem a coluna lead_id, para o histórico do caso seguir legível pela equipe'
);
select is(
  (select count(*)::int from public.eventos e
   where e.lead_id = pg_temp.lead('Maria José Fechamento') and e.tipo = 'lead_ganho'
     and e.caso_id is not null),
  1,
  'F3: o lead_ganho aponta o caso'
);


-- =============================================================================
-- F4. Falha no meio: nada fica
-- =============================================================================

select pg_temp.como('comercial.fl@clickbaby.test');
select throws_ok(
  $$ select public.fechar_lead(pg_temp.lead('Joana Falha'), 'Joana Falha', null,
       pg_temp.pac('basic'), pg_temp.mat('HSC'), '2029-06-10 08:00-03',
       '[{"item": "pacote", "valor": 1490}]'::jsonb, 'nao-e-um-link') $$,
  'P0001', 'O link do contrato precisa começar com http:// ou https:// e não ter espaço.',
  'F4: contrato inválido recusa o fechamento inteiro'
);
reset role;

select is(
  (select count(*)::int from public.casos where mae_nome = 'JOANA FALHA'),
  0,
  'F4: não sobra caso solto'
);
select is(
  (select situacao::text from public.leads where id = pg_temp.lead('Joana Falha')),
  'novo',
  'F4: e o lead continua aberto'
);


-- =============================================================================
-- F5. Lead fechado não fecha de novo
-- =============================================================================

select pg_temp.como('comercial.fl@clickbaby.test');
select throws_ok(
  $$ select public.fechar_lead(pg_temp.lead('Maria José Fechamento'), 'Maria José', 'Alice',
       pg_temp.pac('basic'), pg_temp.mat('HSC'), '2029-06-10 08:00-03',
       '[{"item": "pacote", "valor": 1490}]'::jsonb, 'https://contrato.test/maria') $$,
  'P0001', 'Este lead já está encerrado.',
  'F5: lead ganho não fecha outra vez'
);
reset role;


-- =============================================================================
-- F7. Portas fechadas
-- =============================================================================

set local role anon;
select throws_ok(
  $$ select public.fechar_lead(null, 'x', null, null, null, null, '[]'::jsonb, null) $$,
  '42501', null,
  'F7: o anon não fecha lead'
);
select throws_ok(
  $$ select * from public.casos_parecidos_do_lead(null) $$,
  '42501', null,
  'F7: nem procura caso'
);
reset role;

select ok(
  not has_function_privilege('authenticated',
    'public.inserir_caso_novo(uuid, text, text, text, uuid, uuid, timestamptz, boolean, boolean, timestamptz, text, boolean, date, uuid)',
    'execute'),
  'F7: o miolo da criação é fechado até para authenticated'
);

select * from finish();
rollback;
