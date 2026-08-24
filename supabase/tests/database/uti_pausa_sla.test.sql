-- pgTAP: UTI e o SLA que pausa (migration 20260824163932).
--
-- O ponto central é o SLA: enquanto o caso está na UTI, o prazo tem que andar
-- junto com o relógio, e ao voltar tem que ficar esticado pelo tempo parado.
-- Um teste que só olhasse "vence_em não é nulo" passaria sem provar nada.
--
-- As estadias são simuladas recuando uti_desde com UPDATE direto (a conexão de
-- teste é privilegiada): now() não anda dentro da transação, então sem isso
-- toda estadia teria duração zero.

begin;
select plan(21);


-- =============================================================================
-- Fixtures
-- =============================================================================

insert into auth.users (id, email, aud, role, created_at, updated_at)
values (gen_random_uuid(), 'uti.teste@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Operador UTI', u.id, 'operador', true
from auth.users u where u.email = 'uti.teste@clickbaby.test';

-- BASIC: prazo de 48h, etapas entrada + nascimento.
insert into public.casos (id, mae_nome, pacote_id, maternidade_id, previsao_em)
values (
  'bbbbbbbb-0000-0000-0000-000000000001',
  'MAE UTI',
  (select id from public.pacotes where slug = 'basic'),
  (select id from public.maternidades where sigla = 'HSC'),
  '2026-09-12 12:00:00+00'
);

create function pg_temp.vira(p_email text) returns void
language sql as $$
  select set_config('request.jwt.claim.sub',
    (select id::text from auth.users where email = p_email), true);
$$;

create function pg_temp.levanta(p_sql text) returns boolean
language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return true;
end;
$$;

-- Nascimento concluído há 10h: o SLA já está correndo quando a UTI entra.
update public.caso_etapas
   set status = 'concluida',
       iniciado_em  = now() - interval '11 hours',
       concluido_em = now() - interval '10 hours'
 where caso_id = 'bbbbbbbb-0000-0000-0000-000000000001'
   and tipo = 'nascimento';


-- =============================================================================
-- 1. Estrutura
-- =============================================================================

select has_column('public', 'casos', 'uti_desde', 'casos tem uti_desde');
select has_column('public', 'casos', 'uti_acumulada', 'casos tem uti_acumulada');
select has_column('public', 'quadro_casos', 'sla_pausado', 'a view expõe sla_pausado');
select has_column('public', 'quadro_casos', 'na_uti', 'a view expõe na_uti');

select ok(
  (select reloptions::text[] @> array['security_invoker=true']
   from pg_class where oid = 'public.quadro_casos'::regclass),
  'a view recriada continua security_invoker (o DROP+CREATE não perdeu isso)'
);

select ok(
  has_table_privilege('authenticated', 'public.quadro_casos', 'SELECT'),
  'a view recriada tem GRANT para authenticated — objeto novo não nasce mais aberto sozinho'
);

select ok(
  not has_table_privilege('anon', 'public.quadro_casos', 'SELECT'),
  'e anon continua sem acesso à view recriada'
);


-- =============================================================================
-- 2. Estado inicial: SLA correndo, 48h a partir do nascimento
-- =============================================================================

select is(
  (select vence_em from public.quadro_casos
    where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  (select concluido_em + interval '48 hours' from public.caso_etapas
    where caso_id = 'bbbbbbbb-0000-0000-0000-000000000001' and tipo = 'nascimento'),
  'fora da UTI, vence_em é nascimento + 48h do BASIC — sem acréscimo'
);

select ok(
  not (select sla_pausado from public.quadro_casos
        where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  'fora da UTI, sla_pausado é falso'
);


-- =============================================================================
-- 3. mover_para_uti
-- =============================================================================

select pg_temp.vira('uti.teste@clickbaby.test');
set local role authenticated;

select public.mover_para_uti('bbbbbbbb-0000-0000-0000-000000000001');

select is(
  (select situacao_clinica from public.casos
    where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  'uti'::public.situacao_clinica,
  'mover_para_uti também grava situacao_clinica = uti'
);

select ok(
  (select sla_pausado and na_uti from public.quadro_casos
    where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  'na UTI, a view marca sla_pausado e na_uti'
);

select ok(
  pg_temp.levanta(
    'select public.mover_para_uti(''bbbbbbbb-0000-0000-0000-000000000001'')'),
  'mover para a UTI duas vezes é recusado — não abre duas janelas'
);

reset role;


-- =============================================================================
-- 4. O SLA pausa de verdade
--
-- Recua uti_desde em 6h: o prazo tem que ter esticado exatamente 6h.
-- =============================================================================

update public.casos
   set uti_desde = now() - interval '6 hours'
 where id = 'bbbbbbbb-0000-0000-0000-000000000001';

select ok(
  (select vence_em >= concluido_em + interval '53 hours 58 minutes'
      and vence_em <= concluido_em + interval '54 hours 2 minutes'
     from public.quadro_casos q
     join public.caso_etapas ce
       on ce.caso_id = q.id and ce.tipo = 'nascimento'
    where q.id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  'com 6h de UTI em curso, o vencimento já andou para ~54h (48 + 6)'
);

select ok(
  (select uti_horas_total >= 5.9 and uti_horas_total <= 6.1
     from public.quadro_casos
    where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  'uti_horas_total conta a estadia em curso'
);


-- =============================================================================
-- 5. retornar_da_uti — prazo esticado e situação deduzida
-- =============================================================================

select pg_temp.vira('uti.teste@clickbaby.test');
set local role authenticated;

select public.retornar_da_uti('bbbbbbbb-0000-0000-0000-000000000001');

reset role;

select ok(
  (select uti_desde is null and uti_acumulada >= interval '5 hours 58 minutes'
     from public.casos where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  'a volta fecha a janela e soma as ~6h em uti_acumulada'
);

select ok(
  not (select sla_pausado from public.quadro_casos
        where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  'fora da UTI o SLA volta a correr'
);

-- O ponto todo: o prazo ficou esticado, não voltou para 48h.
select ok(
  (select vence_em >= ce.concluido_em + interval '53 hours 58 minutes'
     from public.quadro_casos q
     join public.caso_etapas ce on ce.caso_id = q.id and ce.tipo = 'nascimento'
    where q.id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  'depois da volta o prazo SEGUE esticado pelas 6h paradas — não voltou para 48h'
);

-- Deduzida, não restaurada de coluna: o nascimento está concluído, então volta
-- para 'nasceu' em vez de regredir para 'internada'.
select is(
  (select situacao_clinica from public.casos
    where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  'nasceu'::public.situacao_clinica,
  'a volta deduz a situação: nascimento concluído -> nasceu, não internada'
);

select pg_temp.vira('uti.teste@clickbaby.test');
set local role authenticated;

select ok(
  pg_temp.levanta(
    'select public.retornar_da_uti(''bbbbbbbb-0000-0000-0000-000000000001'')'),
  'voltar da UTI sem estar na UTI é recusado'
);

reset role;


-- =============================================================================
-- 6. A dedução no outro ramo: caso sem nascimento concluído volta para internada
-- =============================================================================

insert into public.casos (id, mae_nome, pacote_id, maternidade_id, previsao_em)
values (
  'bbbbbbbb-0000-0000-0000-000000000002',
  'MAE UTI ANTES DO PARTO',
  (select id from public.pacotes where slug = 'basic'),
  (select id from public.maternidades where sigla = 'HSC'),
  '2026-09-13 12:00:00+00'
);

select pg_temp.vira('uti.teste@clickbaby.test');
set local role authenticated;
select public.mover_para_uti('bbbbbbbb-0000-0000-0000-000000000002');
select public.retornar_da_uti('bbbbbbbb-0000-0000-0000-000000000002');
reset role;

select is(
  (select situacao_clinica from public.casos
    where id = 'bbbbbbbb-0000-0000-0000-000000000002'),
  'internada'::public.situacao_clinica,
  'sem nascimento concluído, a volta é para internada'
);

select is(
  (select string_agg(tipo, ',' order by tipo)
     from public.eventos
    where caso_id = 'bbbbbbbb-0000-0000-0000-000000000002'
      and tipo like '%uti%'),
  'caso_movido_para_uti,caso_retornou_da_uti',
  'ida e volta ficam no log append-only'
);


select * from finish();
rollback;
