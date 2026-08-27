-- pgTAP: trilhas ACOMPANHAMENTO e EDIÇÃO (migration 20260827140400).
--
-- A trilha existe por dois motivos, e este arquivo protege os dois:
--
--   1. É a divisão que o gestor pediu na tela — o card mostra o que acontece
--      na maternidade separado do que acontece na ilha de edição.
--   2. É a REGRA DE PRECEDÊNCIA. O modelo linear antigo ("conclua tudo com
--      ordem menor") não descreve a operação: banho e fechamento vêm depois do
--      nascimento e não dependem da edição, enquanto a edição libera assim que
--      o nascimento conclui.
--
-- O teste que mais importa é o de que a coluna é GERADA: se alguém a
-- transformar em coluna comum um dia, passa a existir uma linha possível em
-- que tipo = 'banho' e trilha = 'edicao', e as duas metades do card mentem.

begin;
select plan(12);


-- =============================================================================
-- 1. A coluna é derivada, não preenchida
-- =============================================================================

select ok(
  (select is_generated = 'ALWAYS' from information_schema.columns
    where table_schema = 'public' and table_name = 'caso_etapas' and column_name = 'trilha'),
  'trilha é GENERATED ALWAYS — não dá para divergir do tipo nem por engano'
);

insert into public.casos (id, mae_nome, pacote_id, maternidade_id, previsao_em)
values (
  'aaaa1111-0000-0000-0000-000000000001',
  'MAE TRILHA MASTER',
  (select id from public.pacotes where slug = 'master-album'),
  (select id from public.maternidades where sigla = 'HSC'),
  '2026-09-20 10:00:00+00'
);

-- Tentar escrever na coluna gerada tem que falhar. É o que garante que a
-- divisão continue vindo do tipo.
create function pg_temp.levanta(p_sql text) returns boolean
language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return true;
end;
$$;

select ok(
  pg_temp.levanta(
    'update public.caso_etapas set trilha = ''acompanhamento''
      where caso_id = ''aaaa1111-0000-0000-0000-000000000001'' and tipo = ''reels'''),
  'escrever na trilha à mão é RECUSADO'
);


-- =============================================================================
-- 2. O corte entre as duas trilhas
-- =============================================================================

select is(
  (select array_agg(tipo::text order by ordem) from public.caso_etapas
    where caso_id = 'aaaa1111-0000-0000-0000-000000000001' and trilha = 'acompanhamento'),
  array['entrada', 'nascimento', 'banho', 'fechamento'],
  'ACOMPANHAMENTO é o que a empresa faz junto da família'
);

select is(
  (select array_agg(tipo::text order by ordem) from public.caso_etapas
    where caso_id = 'aaaa1111-0000-0000-0000-000000000001' and trilha = 'edicao'),
  array['edicao_foto', 'reels', 'edicao_video', 'album'],
  'EDIÇÃO é o que acontece na ilha — e o MASTER + ÁLBUM tem as quatro'
);

select is(
  (select count(*)::int from public.caso_etapas
    where caso_id = 'aaaa1111-0000-0000-0000-000000000001'
      and trilha not in ('acompanhamento', 'edicao')),
  0,
  'não existe terceira trilha — toda etapa cai numa das duas'
);


-- =============================================================================
-- 3. A ordem é do TIPO, não do pacote
--
-- Antes, `ordem` era a posição dentro daquele pacote: o vídeo era 2 no BIRTH e
-- 5 no MASTER. Comparar a ordem de dois casos não significava nada.
-- =============================================================================

insert into public.casos (id, mae_nome, pacote_id, maternidade_id, previsao_em)
values (
  'aaaa1111-0000-0000-0000-000000000002',
  'MAE TRILHA BIRTH',
  (select id from public.pacotes where slug = 'birth'),
  (select id from public.maternidades where sigla = 'HSC'),
  '2026-09-20 12:00:00+00'
);

select is(
  (select ordem from public.caso_etapas
    where caso_id = 'aaaa1111-0000-0000-0000-000000000002' and tipo = 'nascimento'),
  (select ordem from public.caso_etapas
    where caso_id = 'aaaa1111-0000-0000-0000-000000000001' and tipo = 'nascimento'),
  'nascimento tem a MESMA ordem num BIRTH e num MASTER'
);

select is(
  (select min(ordem)::int from public.caso_etapas
    where caso_id = 'aaaa1111-0000-0000-0000-000000000002'),
  2,
  'o BIRTH começa no 2: sem entrada, a sequência tem buraco — e isso é esperado'
);

select is(
  (select array_agg(ordem order by ordem) from public.caso_etapas
    where caso_id = 'aaaa1111-0000-0000-0000-000000000002'),
  array[2, 5, 6],
  'BIRTH: nascimento(2), edicao_foto(5), reels(6)'
);


-- =============================================================================
-- 4. O que a separação reels/vídeo garante
-- =============================================================================

select is(
  (select count(*)::int from public.pacote_etapas pe
    join public.pacotes p on p.id = pe.pacote_id
   where pe.etapa_tipo = 'edicao_video' and p.slug not in ('master', 'master-album')),
  0,
  'NENHUM pacote fora do MASTER tem edicao_video — o horizontal é só dele'
);

select is(
  (select count(*)::int from public.pacotes p
    where not exists (
      select 1 from public.pacote_etapas pe
      where pe.pacote_id = p.id and pe.etapa_tipo = 'reels')),
  0,
  'TODO pacote tem reels — mesmo os que não o vendem, a equipe faz'
);

select is(
  (select count(*)::int from public.pacotes p
    where not exists (
      select 1 from public.pacote_etapas pe
      where pe.pacote_id = p.id and pe.etapa_tipo = 'edicao_foto')),
  0,
  'TODO pacote tem edição de fotos'
);

select is(
  (select count(*)::int from public.pacotes p
    where not exists (
      select 1 from public.pacote_etapas pe
      where pe.pacote_id = p.id and pe.etapa_tipo = 'nascimento')),
  0,
  'e todo pacote tem nascimento — é ele que arma o relógio do SLA e libera a edição'
);


select * from finish();
rollback;
