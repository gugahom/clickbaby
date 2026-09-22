-- pgTAP: o termo de uso de imagem (migration 20260922183631).
--
-- O que este arquivo protege:
--   A — quem responde é atendimento ou adm, e a resposta fica em eventos.
--   B — as respostas são TRÊS: nulo e `nao_aplicavel` são recusados.
--   C — a correção depois do encerramento é possível, e guarda o anterior.
--   D — a coluna saiu do UPDATE direto; quem escreve é a RPC.

begin;
select plan(13);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'fotografa.termo@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'atendimento.termo@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Fotografa Termo', u.id, 'operador', true from auth.users u where u.email = 'fotografa.termo@clickbaby.test';
insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Atendimento Termo', u.id, 'atendimento', true from auth.users u where u.email = 'atendimento.termo@clickbaby.test';

insert into public.maternidades (nome, sigla) values ('Maternidade Termo', 'TERMOT');

insert into public.casos (mae_nome, pacote_id, maternidade_id)
select v.mae, (select id from public.pacotes where slug = v.slug),
       (select id from public.maternidades where sigla = 'TERMOT')
from (values ('Mae Termo A', 'baby-reels'), ('Mae Termo B', 'birth')) as v(mae, slug);

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


-- =============================================================================
-- A. Quem responde
-- =============================================================================

select is(
  (select termo_status::text from public.casos where mae_nome = 'Mae Termo A'),
  null,
  'A1: caso novo nasce SEM resposta — "pendente" seria afirmar sobre um contrato que ninguém leu'
);

select pg_temp.como('fotografa.termo@clickbaby.test');
select throws_ok(
  format($$ select public.registrar_termo(%L::uuid, 'assinado') $$, pg_temp.caso('Mae Termo A')),
  'P0001',
  'Só atendimento ou adm podem registrar o termo de uso de imagem.',
  'A2: a fotógrafa não responde pelo contrato'
);
reset role;

select pg_temp.como('atendimento.termo@clickbaby.test');
select lives_ok(
  format($$ select public.registrar_termo(%L::uuid, 'assinado') $$, pg_temp.caso('Mae Termo A')),
  'A3: o atendimento responde'
);
reset role;

select is(
  (select termo_status::text from public.casos where mae_nome = 'Mae Termo A'),
  'assinado',
  'A4: a resposta fica no caso'
);

select is(
  (select payload ->> 'termo_anterior' from public.eventos
    where caso_id = pg_temp.caso('Mae Termo A') and tipo = 'termo_registrado'),
  null,
  'A5: o evento guarda o anterior — nulo, porque ninguém tinha respondido'
);

-- Responder o mesmo de novo não é resposta nova: senão a Morgana confirmando
-- duas entregas do mesmo caso encheria o histórico de linhas iguais.
select pg_temp.como('atendimento.termo@clickbaby.test');
select public.registrar_termo(pg_temp.caso('Mae Termo A'), 'assinado');
reset role;

select is(
  (select count(*)::int from public.eventos
    where caso_id = pg_temp.caso('Mae Termo A') and tipo = 'termo_registrado'),
  1,
  'A6: valor igual ao gravado não gera evento'
);


-- =============================================================================
-- B. São três respostas
-- =============================================================================

select pg_temp.como('atendimento.termo@clickbaby.test');

select throws_ok(
  format($$ select public.registrar_termo(%L::uuid, null) $$, pg_temp.caso('Mae Termo B')),
  'P0001',
  'Escolha uma resposta para o termo: assinado, pendente ou sem contrato.',
  'B1: nulo não é resposta'
);

select throws_ok(
  format($$ select public.registrar_termo(%L::uuid, 'nao_aplicavel') $$, pg_temp.caso('Mae Termo B')),
  'P0001',
  'O termo tem três respostas: assinado, pendente ou sem contrato. Quem não tem contrato é "sem contrato".',
  'B2: o quarto valor do enum não entra na operação'
);

-- O BIRTH é vendido depois do parto e não tem contrato: "sem contrato" é o que
-- a tela já abre marcado nele.
select lives_ok(
  format($$ select public.registrar_termo(%L::uuid, 'sem_contrato') $$, pg_temp.caso('Mae Termo B')),
  'B3: BIRTH entra como sem contrato'
);

reset role;


-- =============================================================================
-- C. Corrigir depois do encerramento
-- =============================================================================

update public.casos
   set status_operacional = 'encerrado', status_entrega = 'confirmado'
 where mae_nome = 'Mae Termo A';

select pg_temp.como('atendimento.termo@clickbaby.test');
select lives_ok(
  format($$ select public.registrar_termo(%L::uuid, 'pendente') $$, pg_temp.caso('Mae Termo A')),
  'C1: caso encerrado aceita correção — a resposta é dada no mesmo minuto do encerramento'
);
reset role;

select is(
  (select payload ->> 'termo_anterior' from public.eventos
    where caso_id = pg_temp.caso('Mae Termo A')
      and tipo = 'termo_registrado'
      and payload ->> 'termo' = 'pendente'),
  'assinado',
  'C2: e a correção diz o que havia antes'
);


-- =============================================================================
-- D. Fora do UPDATE direto
-- =============================================================================

select ok(
  not has_column_privilege('authenticated', 'public.casos', 'termo_status', 'UPDATE'),
  'D1: termo_status saiu do UPDATE de coluna — quem escreve é registrar_termo (dívida #4, metade fechada)'
);

select ok(
  has_column_privilege('authenticated', 'public.casos', 'situacao_clinica', 'UPDATE'),
  'D2: e a outra metade da dívida continua de pé, como está escrito na seção 13'
);

select * from finish();
rollback;
