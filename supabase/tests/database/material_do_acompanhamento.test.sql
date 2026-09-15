-- pgTAP: material do acompanhamento — cartão F, cartão V, baixou e upload
-- (migration 20260915134638).
--
-- O QUE ESTE ARQUIVO PROTEGE
--   1. A escrita é só pela RPC: `authenticated` continua sem UPDATE em
--      caso_etapas, e anon não alcança a função.
--   2. Os campos só existem no ACOMPANHAMENTO — na RPC e na constraint.
--   3. Repetir o valor gravado não gera evento. O campo salva no blur, e sem
--      esta guarda cada clique fora encheria o histórico de linhas sem fato.
--   4. Pessoa inativa não recebe material novo, e valor em branco limpa.

begin;
select plan(23);

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'foto.material@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'adm.material@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'inativa.material@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Fotografa Material', u.id, 'operador', true from auth.users u where u.email = 'foto.material@clickbaby.test';
insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Adm Material', u.id, 'atendimento', true from auth.users u where u.email = 'adm.material@clickbaby.test';
insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Inativa Material', u.id, 'operador', false from auth.users u where u.email = 'inativa.material@clickbaby.test';

insert into public.maternidades (nome, sigla) values ('Maternidade Material', 'MATTEST');

-- BASIC gera entrada, nascimento, edição de fotos e reels.
insert into public.casos (mae_nome, pacote_id, maternidade_id)
select 'Mae Material',
       (select id from public.pacotes where slug = 'basic'),
       (select id from public.maternidades where sigla = 'MATTEST');

-- Os ids vão para set_config AGORA, como superusuário: dentro dos blocos que
-- rodam como `authenticated`, a leitura de `pessoas` e `caso_etapas` passaria
-- pela RLS de quem está logado — e a pessoa inativa não enxergaria nada.
select set_config('mat.entrada',
  (select ce.id::text from public.caso_etapas ce join public.casos c on c.id = ce.caso_id
    where c.mae_nome = 'Mae Material' and ce.tipo = 'entrada'), true);
select set_config('mat.edicao',
  (select ce.id::text from public.caso_etapas ce join public.casos c on c.id = ce.caso_id
    where c.mae_nome = 'Mae Material' and ce.tipo = 'edicao_foto'), true);
select set_config('mat.foto',    (select id::text from public.pessoas where nome = 'Fotografa Material'), true);
select set_config('mat.adm',     (select id::text from public.pessoas where nome = 'Adm Material'), true);
select set_config('mat.inativa', (select id::text from public.pessoas where nome = 'Inativa Material'), true);

create function pg_temp.como(p_email text) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L', json_build_object('sub', v_id, 'role', 'authenticated')::text);
end;
$$;

create function pg_temp.registrar(p_etapa text, p_campo text, p_valor text) returns text language sql as $$
  select format(
    $f$ select public.registrar_material_da_etapa(%L::uuid, %L::public.campo_material, %L) $f$,
    current_setting(p_etapa), p_campo, p_valor);
$$;


-- =============================================================================
-- 1. Estrutura e privilégios
-- =============================================================================

select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'caso_etapas'
      and column_name in ('cartao_foto', 'cartao_video', 'baixou_por', 'subiu_por')),
  4,
  'E1: caso_etapas tem as quatro colunas do material');

select ok(
  not has_table_privilege('authenticated', 'public.caso_etapas', 'UPDATE'),
  'E2: authenticated continua sem UPDATE em caso_etapas — a escrita é só pela RPC');

select ok(
  has_function_privilege('authenticated', 'public.registrar_material_da_etapa(uuid, public.campo_material, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.registrar_material_da_etapa(uuid, public.campo_material, text)', 'EXECUTE'),
  'E3: authenticated executa a RPC; anon não');


-- =============================================================================
-- 2. Escrita
-- =============================================================================

select pg_temp.como('foto.material@clickbaby.test');
select lives_ok(pg_temp.registrar('mat.entrada', 'cartao_foto', '  14 HSC '),
  'W1: fotógrafa registra o cartão F, com o sufixo da maternidade');
select lives_ok(pg_temp.registrar('mat.entrada', 'cartao_video', 'CELULAR SARAH'),
  'W2: registra o cartão V como texto livre — o celular de alguém da equipe');
select lives_ok(pg_temp.registrar('mat.entrada', 'baixou', current_setting('mat.adm')),
  'W3: registra quem baixou — outra pessoa');
select lives_ok(pg_temp.registrar('mat.entrada', 'upload', current_setting('mat.foto')),
  'W4: registra quem fez o upload');
select lives_ok(pg_temp.registrar('mat.entrada', 'cartao_foto', '14 HSC'),
  'W5: repetir o mesmo cartão não é erro');
reset role;

select is(
  (select cartao_foto || '|' || cartao_video || '|'
          || (baixou_por::text = current_setting('mat.adm')) || '|'
          || (subiu_por::text = current_setting('mat.foto'))
     from public.caso_etapas where id = current_setting('mat.entrada')::uuid),
  '14 HSC|CELULAR SARAH|true|true',
  'W6: os quatro campos ficam gravados, com o espaço das pontas aparado');

select is(
  (select count(*)::int from public.eventos
    where caso_etapa_id = current_setting('mat.entrada')::uuid and tipo = 'material_registrado'),
  4,
  'W7: quatro eventos para quatro mudanças — repetir o valor não gera evento');

select is(
  (select payload ->> 'valor' from public.eventos
    where caso_etapa_id = current_setting('mat.entrada')::uuid
      and tipo = 'material_registrado' and payload ->> 'campo' = 'cartao_video'),
  'CELULAR SARAH',
  'W8: o evento guarda o campo e o valor');


-- =============================================================================
-- 3. Recusas
-- =============================================================================

select pg_temp.como('foto.material@clickbaby.test');
select throws_ok(pg_temp.registrar('mat.entrada', 'cartao_video', repeat('X', 25)), 'P0001', null,
  'R1: cartão V com mais de 24 caracteres é recusado');
select throws_ok(pg_temp.registrar('mat.entrada', 'cartao_foto', '1234567890123'), 'P0001', null,
  'R3: cartão F com mais de 12 caracteres é recusado');
select throws_ok(pg_temp.registrar('mat.entrada', 'baixou', 'nao-e-uuid'), 'P0001', null,
  'R4: baixou com pessoa inválida é recusado');
select throws_ok(pg_temp.registrar('mat.entrada', 'upload', current_setting('mat.inativa')), 'P0001', null,
  'R5: pessoa inativa não recebe material novo');
select throws_ok(pg_temp.registrar('mat.edicao', 'cartao_foto', '10'), 'P0001', null,
  'R6: etapa de EDIÇÃO não tem cartão — o material já chegou');
select throws_ok(
  format($f$ select public.registrar_material_da_etapa(%L::uuid, null, '10') $f$, current_setting('mat.entrada')),
  'P0001', null,
  'R7: sem campo, recusa');
reset role;

select pg_temp.como('inativa.material@clickbaby.test');
select throws_ok(pg_temp.registrar('mat.entrada', 'cartao_foto', '99'), 'P0001', null,
  'R8: quem está inativa não registra');
reset role;

select is(
  (select cartao_foto || '|' || cartao_video from public.caso_etapas where id = current_setting('mat.entrada')::uuid),
  '14 HSC|CELULAR SARAH',
  'R9: nenhuma recusa mexeu no que estava gravado');


-- =============================================================================
-- 4. Limpar
-- =============================================================================

select pg_temp.como('foto.material@clickbaby.test');
select lives_ok(pg_temp.registrar('mat.entrada', 'baixou', '   '),
  'L1: valor em branco limpa o campo');
reset role;

select is(
  (select coalesce(baixou_por::text, 'limpo') from public.caso_etapas where id = current_setting('mat.entrada')::uuid),
  'limpo',
  'L2: quem baixou fica vazio');

select is(
  (select payload ->> 'valor_anterior' from public.eventos
    where caso_etapa_id = current_setting('mat.entrada')::uuid
      and tipo = 'material_registrado' and payload ->> 'campo' = 'baixou'
      and payload ->> 'valor' is null),
  current_setting('mat.adm'),
  'L3: e o evento da limpeza guarda quem estava lá');


-- =============================================================================
-- 5. Constraint — a trava que não depende da RPC
-- =============================================================================

select throws_ok(
  format($f$ update public.caso_etapas set cartao_foto = '10' where id = %L::uuid $f$, current_setting('mat.edicao')),
  '23514', null,
  'C1: nem por fora da RPC uma etapa de edição guarda cartão');

select * from finish();
rollback;
