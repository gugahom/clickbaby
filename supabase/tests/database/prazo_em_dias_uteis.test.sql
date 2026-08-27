-- pgTAP: prazo em dias úteis (migration 20260827135656).
--
-- O que este arquivo protege: o MASTER entrega em 10 DIAS ÚTEIS, e dia útil
-- depende de QUANDO o nascimento foi concluído. Um erro aqui não aparece na
-- tela como erro — aparece como um prazo plausível e errado, que só é
-- descoberto quando a família cobra.
--
-- Por isso os casos de borda são o corpo do teste: virada de fim de semana,
-- horário local perto da meia-noite (onde UTC já é o dia seguinte), e feriado.

begin;
select plan(14);


-- =============================================================================
-- 1. A tabela de feriados
-- =============================================================================

select has_table('public', 'feriados', 'a tabela feriados existe');

select is(
  (select count(*)::int from public.feriados),
  0,
  'nasce VAZIA — sem lista confirmada pelo cliente, contar só fim de semana é o correto'
);

select ok(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'feriados'),
  'feriados tem RLS habilitada, como toda tabela (seção 5)'
);

select ok(
  has_table_privilege('authenticated', 'public.feriados', 'SELECT')
  and not has_table_privilege('anon', 'public.feriados', 'SELECT'),
  'authenticated lê, anon não'
);


-- =============================================================================
-- 2. A aritmética
-- =============================================================================

-- 27/08/2026 é quinta. Um dia útil depois é sexta.
select is(
  public.somar_dias_uteis('2026-08-27 14:00-03'::timestamptz, 1),
  '2026-08-28 14:00-03'::timestamptz,
  'quinta + 1 dia útil = sexta, com o MESMO horário'
);

-- Sexta + 1 pula o fim de semana inteiro.
select is(
  public.somar_dias_uteis('2026-08-28 14:00-03'::timestamptz, 1),
  '2026-08-31 14:00-03'::timestamptz,
  'sexta + 1 dia útil = segunda — o fim de semana não conta'
);

-- Sábado é ponto de partida válido: o parto acontece quando acontece.
select is(
  public.somar_dias_uteis('2026-08-29 14:00-03'::timestamptz, 1),
  '2026-08-31 14:00-03'::timestamptz,
  'sábado + 1 dia útil = segunda'
);

-- A armadilha do fuso: 22h de domingo em São Paulo já é SEGUNDA em UTC. Contar
-- a partir da data UTC daria um dia útil a mais de prazo.
select is(
  public.somar_dias_uteis('2026-08-30 22:00-03'::timestamptz, 1),
  '2026-08-31 22:00-03'::timestamptz,
  'domingo 22h (já segunda em UTC) + 1 = segunda — o dia útil é LOCAL'
);

-- O caso real: MASTER nascido numa quinta.
select is(
  public.somar_dias_uteis('2026-08-27 14:00-03'::timestamptz, 10),
  '2026-09-10 14:00-03'::timestamptz,
  'quinta + 10 dias úteis = quinta duas semanas depois (2 fins de semana pulados)'
);

select is(
  public.somar_dias_uteis(null, 10),
  null,
  'sem nascimento concluído não há prazo'
);

select is(
  public.somar_dias_uteis('2026-08-27 14:00-03'::timestamptz, 0),
  '2026-08-27 14:00-03'::timestamptz,
  'zero dias úteis devolve o próprio instante, sem laço'
);


-- =============================================================================
-- 3. Feriado
--
-- Este teste é o que dá sentido à tabela vazia: ela FUNCIONA, só não está
-- preenchida. 07/09/2026 (Independência) cai numa segunda e está dentro da
-- janela do teste acima — hoje conta como dia útil, e é isso que a nota da
-- migration avisa.
-- =============================================================================

insert into public.feriados (data, descricao)
values ('2026-09-07', 'Independência do Brasil');

select is(
  public.somar_dias_uteis('2026-08-27 14:00-03'::timestamptz, 10),
  '2026-09-11 14:00-03'::timestamptz,
  'com 07/09 cadastrado, o mesmo prazo escorrega um dia — a tabela tem efeito real'
);


-- =============================================================================
-- 4. O pacote e a view
-- =============================================================================

select is(
  (select prazo_dias_uteis from public.pacotes where slug = 'master'),
  10,
  'MASTER entrega em 10 dias úteis'
);

select ok(
  (select prazo_entrega is null and prazo_dias_uteis = 10
     from public.pacotes where slug = 'master-album'),
  'MASTER + ÁLBUM idem, e SEM intervalo — um pacote tem um prazo, não dois'
);


select * from finish();
rollback;
