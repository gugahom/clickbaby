-- pgTAP: os leads do comercial (migration 20261118150001).
--
--   L1 — quem não tem a tela Comercial não lê nem cria lead.
--   L2 — criar: telefone normalizado, vendedor da maternidade, telefone repetido devolve o existente.
--   L3 — telefone ilegível é recusado.
--   L4 — contato: novo → em contato, proposta → negociando, fase carimbada, retorno trocado.
--   L5 — a view: prazo = DPP − 10, prioridade e fase pela data.
--   L6 — perder (com motivo), reabrir, e o que virou caso não reabre.
--   L7 — passar só para quem pode receber lead.
--   L8 — eventos de lead somem para quem não tem a tela Comercial.
--   L9 — o vendedor da maternidade é da tela Equipe.
--   L10 — o anon não alcança as RPCs.

begin;
select plan(29);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'gestao.lead@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'comercial.lead@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'foto.lead@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select v.nome, u.id, v.papel::public.papel_sistema, true
from (values ('Gestao LEAD', 'gestao.lead@clickbaby.test', 'gestao'),
             ('Comercial LEAD', 'comercial.lead@clickbaby.test', 'comercial'),
             ('Foto LEAD', 'foto.lead@clickbaby.test', 'operador')) as v(nome, email, papel)
join auth.users u on u.email = v.email;

insert into public.maternidades (nome, sigla) values ('Maternidade LEAD', 'LEADM');

create function pg_temp.pessoa(p_nome text) returns uuid language sql as $$
  select id from public.pessoas where nome = p_nome;
$$;
create function pg_temp.maternidade() returns uuid language sql as $$
  select id from public.maternidades where sigla = 'LEADM';
$$;
create function pg_temp.lead(p_telefone text) returns uuid language sql as $$
  select id from public.leads where telefone = p_telefone;
$$;
grant execute on function pg_temp.pessoa(text) to authenticated, anon;
grant execute on function pg_temp.maternidade() to authenticated, anon;
grant execute on function pg_temp.lead(text) to authenticated, anon;

create function pg_temp.como(p_email text) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L', json_build_object('sub', v_id, 'role', 'authenticated')::text);
end;
$$;
create function pg_temp.sair() returns void language plpgsql as $$
begin
  execute 'reset role';
  execute 'set local request.jwt.claims = ''{}''';
end;
$$;

-- L9 — o cadastro do vendedor da maternidade
select pg_temp.como('comercial.lead@clickbaby.test');
select throws_ok(
  $$ select public.definir_vendedor_da_maternidade(pg_temp.maternidade(), pg_temp.pessoa('Comercial LEAD')) $$,
  'Quem define o vendedor de cada maternidade é quem tem a tela Equipe.',
  'L9: o comercial não define o vendedor da maternidade'
);
select pg_temp.sair();

select pg_temp.como('gestao.lead@clickbaby.test');
select throws_ok(
  $$ select public.definir_vendedor_da_maternidade(pg_temp.maternidade(), pg_temp.pessoa('Foto LEAD')) $$,
  'Essa pessoa não pode receber lead: precisa estar ativa e ter a tela Comercial.',
  'L9: a fotógrafa não pode ser vendedora da maternidade'
);
select lives_ok(
  $$ select public.definir_vendedor_da_maternidade(pg_temp.maternidade(), pg_temp.pessoa('Comercial LEAD')) $$,
  'L9: a gestão define o vendedor da maternidade'
);
select pg_temp.sair();

-- L1
select pg_temp.como('foto.lead@clickbaby.test');
select throws_ok(
  $$ select public.criar_lead('Mae FOTO', '41 99999-0000') $$,
  'Só quem tem a tela Comercial mexe nos leads.',
  'L1: a fotógrafa não cria lead'
);
select pg_temp.sair();

-- L2
select pg_temp.como('comercial.lead@clickbaby.test');
select is(
  (select (public.criar_lead('Mae UM', '41 9876-5432', ((now() at time zone 'America/Sao_Paulo')::date + 30),
                             pg_temp.maternidade(), 'cupom'))->>'ja_existia'),
  'false',
  'L2: o comercial cria o lead'
);
select pg_temp.sair();

select is(
  (select telefone from public.leads where mae_nome = 'Mae UM'),
  '+554198765432',
  'L2: o telefone é normalizado'
);
select is(
  (select vendedor_id from public.leads where mae_nome = 'Mae UM'),
  pg_temp.pessoa('Comercial LEAD'),
  'L2: o vendedor vem da maternidade'
);

select pg_temp.como('comercial.lead@clickbaby.test');
select is(
  (select public.criar_lead('Mae DOIS', '(41) 3333-4444')->>'ja_existia'),
  'false',
  'L2: outro telefone é outro lead'
);
select is(
  (select public.criar_lead('Mae UM REPETIDA', '+55 41 9876-5432')->>'id'),
  pg_temp.lead('+554198765432')::text,
  'L2: telefone com lead aberto devolve o existente'
);

-- L3
select throws_ok(
  $$ select public.criar_lead('Mae RUIM', '3') $$,
  'Telefone inválido: use DDD e número.',
  'L3: telefone ilegível é recusado'
);

-- L4
select public.registrar_contato_do_lead(pg_temp.lead('+554198765432'), 'whatsapp', 'sem_resposta', null,
                                        now() + interval '2 days');
select pg_temp.sair();

select ok(
  (select situacao = 'em_contato' and proximo_retorno_em > now() from public.leads where id = pg_temp.lead('+554198765432')),
  'L4: o primeiro contato tira de "novo" e agenda o retorno'
);
select is(
  (select fase::text from public.contatos_do_lead where lead_id = pg_temp.lead('+554198765432')),
  'venda',
  'L4: com o prazo pela frente, o contato é da fase de venda'
);

select pg_temp.como('comercial.lead@clickbaby.test');
select public.registrar_contato_do_lead(pg_temp.lead('+554198765432'), 'ligacao', 'mandou_proposta');
select pg_temp.sair();

select ok(
  (select situacao = 'negociando' and proximo_retorno_em is null from public.leads where id = pg_temp.lead('+554198765432')),
  'L4: proposta enviada vira negociação, e o retorno cumprido sai'
);

-- L5 — a view
select pg_temp.como('comercial.lead@clickbaby.test');
select public.criar_lead('Mae REPESCAGEM', '41 91111-2222', ((now() at time zone 'America/Sao_Paulo')::date + 5), null, 'cupom');
select public.criar_lead('Mae URGENTE', '41 91111-3333', ((now() at time zone 'America/Sao_Paulo')::date + 11), null, 'vendedor');

select is(
  (select prazo_venda from public.leads_do_comercial where telefone = '+554198765432'),
  ((now() at time zone 'America/Sao_Paulo')::date + 20),
  'L5: o prazo é a DPP menos 10 dias'
);
select is(
  (select prioridade || '/' || fase from public.leads_do_comercial where telefone = '+554198765432'),
  'normal/venda',
  'L5: 20 dias até o prazo é normal, na fase de venda'
);
select is(
  (select prioridade || '/' || fase from public.leads_do_comercial where telefone = '+5541911112222'),
  'repescagem/repescagem',
  'L5: prazo vencido é repescagem'
);
select is(
  (select prioridade from public.leads_do_comercial where telefone = '+5541911113333'),
  'urgente',
  'L5: 1 dia até o prazo é urgente'
);

select public.registrar_contato_do_lead(pg_temp.lead('+5541911112222'), 'whatsapp', 'respondeu');
select is(
  (select contatos_na_repescagem from public.leads_do_comercial where telefone = '+5541911112222'),
  1,
  'L5: o contato depois do prazo conta como retorno da repescagem'
);

-- L6
select throws_ok(
  $$ select public.marcar_lead_perdido(pg_temp.lead('+5541911113333'), 'outro') $$,
  'Escreva o motivo em "outro".',
  'L6: "outro" pede o motivo escrito'
);
select lives_ok(
  $$ select public.marcar_lead_perdido(pg_temp.lead('+5541911113333'), 'ja_nasceu') $$,
  'L6: perder com motivo'
);
select throws_ok(
  $$ select public.registrar_contato_do_lead(pg_temp.lead('+5541911113333'), 'whatsapp', 'respondeu') $$,
  'Lead encerrado — reabra antes de registrar contato.',
  'L6: lead encerrado não recebe contato'
);
select throws_ok(
  $$ select public.reabrir_lead(pg_temp.lead('+5541911113333'), '  ') $$,
  'Diga por que o lead está sendo reaberto.',
  'L6: reabrir pede motivo'
);
select lives_ok(
  $$ select public.reabrir_lead(pg_temp.lead('+5541911113333'), 'A família voltou a chamar') $$,
  'L6: reabrir o perdido'
);
select pg_temp.sair();

insert into public.casos (mae_nome, pacote_id, maternidade_id, previsao_em)
values ('Mae LEAD CASO', (select id from public.pacotes where slug = 'standard'), pg_temp.maternidade(), now() + interval '20 days');

select pg_temp.como('comercial.lead@clickbaby.test');
select public.marcar_lead_ganho(pg_temp.lead('+554198765432'),
                                (select id from public.casos where mae_nome = 'Mae LEAD CASO'));
select throws_ok(
  $$ select public.reabrir_lead(pg_temp.lead('+554198765432'), 'engano') $$,
  'Este lead virou caso — cancele o caso em vez de reabrir o lead.',
  'L6: o que virou caso não reabre'
);

-- L7
select throws_ok(
  $$ select public.passar_lead(pg_temp.lead('+5541911112222'), pg_temp.pessoa('Foto LEAD')) $$,
  'Essa pessoa não pode receber lead: precisa estar ativa e ter a tela Comercial.',
  'L7: não passa para quem não tem a tela Comercial'
);
select lives_ok(
  $$ select public.passar_lead(pg_temp.lead('+5541911112222'), pg_temp.pessoa('Gestao LEAD'), 'cobrir férias') $$,
  'L7: passa para a gestão'
);
select pg_temp.sair();

-- L1 e L8 — o que a fotógrafa enxerga
select pg_temp.como('foto.lead@clickbaby.test');
select is(
  (select count(*)::int from public.leads_do_comercial),
  0,
  'L1: a fotógrafa não lê lead nenhum'
);
select is(
  (select count(*)::int from public.eventos where lead_id is not null),
  0,
  'L8: nem os eventos de lead'
);
select pg_temp.sair();

-- L10
select ok(
  not has_function_privilege('anon', 'public.registrar_contato_do_lead(uuid, public.canal_contato_lead, public.resultado_contato_lead, text, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.pessoa_do_comercial()', 'execute'),
  'L10: o anon não executa as RPCs, e a porta interna é fechada até para authenticated'
);

select * from finish();
rollback;
