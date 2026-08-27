-- pgTAP: duas rodadas de edição (migration 20260827172830).
--
-- O PROBLEMA QUE ISTO RESOLVE, nas palavras do gestor: a editora dá play na
-- edição, conclui sem querer, "mas teria ainda que editar um banho — a edição
-- se perde e não tem como voltar atrás".
--
-- A resposta tem duas metades, e este arquivo protege as duas:
--   1. a segunda rodada nasce sozinha quando o fechamento conclui, então o
--      material do banho SEMPRE tem onde ser registrado;
--   2. reabrir_etapa desfaz uma conclusão errada sem destruir o tempo de ciclo.

begin;
select plan(22);


-- =============================================================================
-- Fixtures
-- =============================================================================

insert into auth.users (id, email, aud, role, created_at, updated_at)
values (gen_random_uuid(), 'rodadas@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Editora Rodadas', u.id, 'operador', true
from auth.users u where u.email = 'rodadas@clickbaby.test';

-- BABY REELS: tem fechamento, então tem segunda rodada.
insert into public.casos (id, mae_nome, pacote_id, maternidade_id, previsao_em)
values (
  'eeee4444-0000-0000-0000-000000000001',
  'MAE DUAS RODADAS',
  (select id from public.pacotes where slug = 'baby-reels'),
  (select id from public.maternidades where sigla = 'HSC'),
  '2026-09-28 08:00:00+00'
);

-- BASIC: NÃO tem fechamento. Nunca ganha segunda rodada.
--
-- Era o BIRTH até 27/08/2026, quando o gestor corrigiu o cadastro e o BIRTH
-- passou a ter fechamento (migration 20260827190426) — e com ele, segunda
-- rodada. O BASIC assumiu o papel de exemplo porque continua sendo pacote de
-- captura curta, sem banho nem fechamento.
insert into public.casos (id, mae_nome, pacote_id, maternidade_id, previsao_em)
values (
  'eeee4444-0000-0000-0000-000000000002',
  'MAE UMA RODADA',
  (select id from public.pacotes where slug = 'basic'),
  (select id from public.maternidades where sigla = 'HSC'),
  '2026-09-28 10:00:00+00'
);

create function pg_temp.etapa(p_caso uuid, p_tipo public.etapa_tipo, p_rodada smallint default 1)
returns uuid
language sql stable as $$
  select id from public.caso_etapas
  where caso_id = p_caso and tipo = p_tipo and rodada = p_rodada;
$$;

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


-- =============================================================================
-- 1. Estado inicial: tudo na rodada 1
-- =============================================================================

select is(
  (select count(*)::int from public.caso_etapas
    where caso_id = 'eeee4444-0000-0000-0000-000000000001' and rodada <> 1),
  0,
  'o caso nasce inteiro na rodada 1'
);

select is(
  (select array_agg(tipo::text order by ordem) from public.caso_etapas
    where caso_id = 'eeee4444-0000-0000-0000-000000000001'),
  array['entrada', 'nascimento', 'banho', 'fechamento', 'edicao_foto', 'reels'],
  'BABY REELS: seis etapas, uma edição de cada'
);


-- =============================================================================
-- 2. Concluir o FECHAMENTO cria a segunda rodada
--
-- É o coração da migration. A criação é consequência, não decisão: se
-- dependesse de alguém apertar um botão, esquecê-lo devolveria exatamente o
-- problema que se está resolvendo.
-- =============================================================================

update public.caso_etapas
   set status = 'concluida',
       iniciado_em = now() - interval '2 hours',
       concluido_em = now() - interval '1 hour'
 where caso_id = 'eeee4444-0000-0000-0000-000000000001'
   and tipo in ('entrada', 'nascimento', 'banho');

select is(
  (select count(*)::int from public.caso_etapas
    where caso_id = 'eeee4444-0000-0000-0000-000000000001' and rodada = 2),
  0,
  'concluir entrada, nascimento e banho ainda NÃO cria a segunda rodada'
);

update public.caso_etapas
   set status = 'concluida',
       iniciado_em = now() - interval '90 minutes',
       concluido_em = now() - interval '30 minutes'
 where caso_id = 'eeee4444-0000-0000-0000-000000000001'
   and tipo = 'fechamento';

select is(
  (select array_agg(tipo::text order by tipo::text) from public.caso_etapas
    where caso_id = 'eeee4444-0000-0000-0000-000000000001' and rodada = 2),
  array['edicao_foto', 'reels'],
  'concluir o FECHAMENTO cria a segunda edição de fotos e o segundo reels'
);

select is(
  (select count(*)::int from public.caso_etapas
    where caso_id = 'eeee4444-0000-0000-0000-000000000001'
      and rodada = 2 and status <> 'pendente'),
  0,
  'e elas nascem pendentes, sem responsável e sem relógio'
);

-- O horizontal e o álbum ficam fora: o MASTER tem 10 dias úteis e monta o
-- vídeo uma vez com todo o material.
select ok(
  not public.tipo_tem_segunda_rodada('edicao_video')
  and not public.tipo_tem_segunda_rodada('album')
  and public.tipo_tem_segunda_rodada('edicao_foto')
  and public.tipo_tem_segunda_rodada('reels'),
  'só foto e reels têm segunda rodada — vídeo horizontal e álbum não'
);

select is(
  (select count(*)::int from public.eventos
    where caso_id = 'eeee4444-0000-0000-0000-000000000001'
      and tipo = 'segunda_rodada_de_edicao_criada'),
  1,
  'a criação virou evento — o histórico explica de onde vieram as etapas novas'
);


-- =============================================================================
-- 3. Idempotência
--
-- Reconcluir o fechamento (depois de uma reabertura, por exemplo) não pode
-- duplicar a rodada 2 nem apagar o trabalho já feito nela.
-- =============================================================================

update public.caso_etapas
   set status = 'em_andamento', concluido_em = null
 where caso_id = 'eeee4444-0000-0000-0000-000000000001' and tipo = 'fechamento';

update public.caso_etapas
   set status = 'concluida', concluido_em = now()
 where caso_id = 'eeee4444-0000-0000-0000-000000000001' and tipo = 'fechamento';

select is(
  (select count(*)::int from public.caso_etapas
    where caso_id = 'eeee4444-0000-0000-0000-000000000001' and rodada = 2),
  2,
  'concluir o fechamento de novo NÃO duplica a rodada 2'
);

select is(
  (select count(*)::int from public.eventos
    where caso_id = 'eeee4444-0000-0000-0000-000000000001'
      and tipo = 'segunda_rodada_de_edicao_criada'),
  1,
  'e não gera evento novo, porque nada foi criado'
);


-- =============================================================================
-- 4. Pacote sem fechamento nunca tem rodada 2
-- =============================================================================

update public.caso_etapas
   set status = 'concluida',
       iniciado_em = now() - interval '1 hour',
       concluido_em = now()
 where caso_id = 'eeee4444-0000-0000-0000-000000000002';

select is(
  (select count(*)::int from public.caso_etapas
    where caso_id = 'eeee4444-0000-0000-0000-000000000002' and rodada = 2),
  0,
  'BASIC não tem fechamento, então não tem segunda rodada — nem concluindo tudo'
);


-- =============================================================================
-- 5. A unicidade mudou de forma, não sumiu
-- =============================================================================

select ok(
  pg_temp.levanta($sql$
    insert into public.caso_etapas (caso_id, tipo, ordem, rodada)
    values ('eeee4444-0000-0000-0000-000000000001', 'edicao_foto', 5, 2)
  $sql$),
  'duas edições de foto na MESMA rodada continuam proibidas'
);

select lives_ok($sql$
  insert into public.caso_etapas (caso_id, tipo, ordem, rodada)
  values ('eeee4444-0000-0000-0000-000000000002', 'edicao_foto', 5, 2)
$sql$,
  'mas a mesma etapa em rodada diferente é permitida — é o ponto da mudança'
);

select ok(
  pg_temp.levanta($sql$
    insert into public.caso_etapas (caso_id, tipo, ordem, rodada)
    values ('eeee4444-0000-0000-0000-000000000002', 'banho', 3, 0)
  $sql$),
  'rodada 0 é recusada pela constraint'
);


-- =============================================================================
-- 6. reabrir_etapa
--
-- O outro lado do problema: concluir sem querer. Duas rodadas não cobrem isso
-- — dá para errar na segunda também.
-- =============================================================================

select pg_temp.vira('rodadas@clickbaby.test');
set local role authenticated;

-- Etapa em aberto não tem o que reabrir.
select ok(
  pg_temp.levanta(format(
    'select public.reabrir_etapa(%L)',
    pg_temp.etapa('eeee4444-0000-0000-0000-000000000001', 'edicao_foto', 2::smallint))),
  'reabrir etapa que não está concluída é RECUSADO'
);

reset role;

-- A editora fez a edição do parto e concluiu por engano.
update public.caso_etapas
   set status = 'concluida',
       iniciado_em = now() - interval '3 hours',
       concluido_em = now() - interval '5 minutes',
       responsavel_id = (select id from public.pessoas where nome = 'Editora Rodadas'),
       observacao = 'ficou faltando a sequencia da familia'
 where id = pg_temp.etapa('eeee4444-0000-0000-0000-000000000001', 'edicao_foto', 1::smallint);

select pg_temp.vira('rodadas@clickbaby.test');
set local role authenticated;

select lives_ok(format(
  'select public.reabrir_etapa(%L, %L)',
  pg_temp.etapa('eeee4444-0000-0000-0000-000000000001', 'edicao_foto', 1::smallint),
  'conclui sem querer'),
  'reabrir uma etapa concluída funciona'
);

reset role;

select is(
  (select status from public.caso_etapas
    where id = pg_temp.etapa('eeee4444-0000-0000-0000-000000000001', 'edicao_foto', 1::smallint)),
  'em_andamento'::public.status_etapa,
  'volta para EM ANDAMENTO, não para pendente'
);

-- O ponto: voltar para pendente apagaria iniciado_em e zeraria o tempo de
-- ciclo — a mesma métrica que a trava da seção 9 existe para proteger.
select ok(
  (select iniciado_em is not null and concluido_em is null
     from public.caso_etapas
    where id = pg_temp.etapa('eeee4444-0000-0000-0000-000000000001', 'edicao_foto', 1::smallint)),
  'iniciado_em PERMANECE e concluido_em foi limpo — o trabalho aconteceu'
);

select is(
  (select observacao from public.caso_etapas
    where id = pg_temp.etapa('eeee4444-0000-0000-0000-000000000001', 'edicao_foto', 1::smallint)),
  'ficou faltando a sequencia da familia',
  'a observação e o responsável não são apagados'
);

select is(
  (select payload ->> 'motivo' from public.eventos
    where caso_etapa_id = pg_temp.etapa('eeee4444-0000-0000-0000-000000000001', 'edicao_foto', 1::smallint)
      and tipo = 'etapa_reaberta'),
  'conclui sem querer',
  'a reabertura vira evento com o motivo'
);

select ok(
  (select payload ->> 'concluido_em_anterior' is not null from public.eventos
    where caso_etapa_id = pg_temp.etapa('eeee4444-0000-0000-0000-000000000001', 'edicao_foto', 1::smallint)
      and tipo = 'etapa_reaberta'),
  'e guarda o carimbo que foi apagado — eventos é append-only (invariante 3.3)'
);

-- A rodada 2 criada pela conclusão do fechamento NÃO é removida por uma
-- reabertura: é trabalho que passou a existir.
select is(
  (select count(*)::int from public.caso_etapas
    where caso_id = 'eeee4444-0000-0000-0000-000000000001' and rodada = 2),
  2,
  'reabrir não desfaz a segunda rodada — apagá-la trocaria um erro por um maior'
);


-- =============================================================================
-- 7. Caso terminal
-- =============================================================================

update public.casos
   set status_operacional = 'cancelado', motivo_cancelamento = 'teste'
 where id = 'eeee4444-0000-0000-0000-000000000002';

update public.caso_etapas
   set status = 'concluida', iniciado_em = now(), concluido_em = now()
 where caso_id = 'eeee4444-0000-0000-0000-000000000002' and tipo = 'nascimento';

select pg_temp.vira('rodadas@clickbaby.test');
set local role authenticated;

select ok(
  pg_temp.levanta(format(
    'select public.reabrir_etapa(%L)',
    pg_temp.etapa('eeee4444-0000-0000-0000-000000000002', 'nascimento', 1::smallint))),
  'reabrir etapa de caso cancelado é RECUSADO — deixaria o caso inconsistente'
);

reset role;


select * from finish();
rollback;
