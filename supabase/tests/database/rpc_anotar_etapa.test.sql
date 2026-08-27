-- pgTAP: anotar_etapa (migration 20260827155728).
--
-- A observação existia e só `concluir_etapa` a escrevia: dava para contar como
-- FOI, nunca para avisar o que VEM. O uso que o gestor trouxe é o inverso — a
-- coordenação sabe antes que o banho será no quarto 115 às 14h, e quem chega
-- no plantão precisa ver isso no Quadro.
--
-- Por isso o teste central é o de que a anotação funciona em etapa PENDENTE.
-- Uma que só existisse depois do play chegaria tarde para o único uso que tem.

begin;
select plan(12);


-- =============================================================================
-- Fixtures
-- =============================================================================

insert into auth.users (id, email, aud, role, created_at, updated_at)
values (gen_random_uuid(), 'anota@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Coordenadora', u.id, 'coordenacao', true
from auth.users u where u.email = 'anota@clickbaby.test';

insert into public.casos (id, mae_nome, pacote_id, maternidade_id, previsao_em)
values (
  'dddd3333-0000-0000-0000-000000000001',
  'MAE ANOTACAO',
  (select id from public.pacotes where slug = 'standard'),
  (select id from public.maternidades where sigla = 'HSC'),
  '2026-09-25 08:00:00+00'
);

create function pg_temp.etapa(p_tipo public.etapa_tipo) returns uuid
language sql stable as $$
  select id from public.caso_etapas
  where caso_id = 'dddd3333-0000-0000-0000-000000000001' and tipo = p_tipo;
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
-- 1. Etapa PENDENTE aceita anotação — o ponto do arquivo
-- =============================================================================

select is(
  (select status from public.caso_etapas where id = pg_temp.etapa('banho')),
  'pendente'::public.status_etapa,
  'o banho ainda nem começou'
);

select pg_temp.vira('anota@clickbaby.test');
set local role authenticated;

select lives_ok(
  format('select public.anotar_etapa(%L, %L)',
    pg_temp.etapa('banho'), 'QUARTO 115 - 14H'),
  'anotar uma etapa PENDENTE funciona'
);

reset role;

select is(
  (select observacao from public.caso_etapas where id = pg_temp.etapa('banho')),
  'QUARTO 115 - 14H',
  'e o texto ficou gravado'
);

select is(
  (select status from public.caso_etapas where id = pg_temp.etapa('banho')),
  'pendente'::public.status_etapa,
  'sem mexer no status — anotar não é transição de estado'
);

select is(
  (select iniciado_em from public.caso_etapas where id = pg_temp.etapa('banho')),
  null,
  'nem no relógio: o tempo de ciclo da seção 9 não é afetado por um aviso'
);

select is(
  (select count(*)::int from public.eventos
    where caso_id = 'dddd3333-0000-0000-0000-000000000001' and tipo = 'etapa_anotada'),
  1,
  'virou evento — o histórico do caso não tem buraco'
);


-- =============================================================================
-- 2. Corrigir, e o que dizia antes
-- =============================================================================

select pg_temp.vira('anota@clickbaby.test');
set local role authenticated;

select public.anotar_etapa(pg_temp.etapa('banho'), 'QUARTO 118 - 15H');

reset role;

select is(
  (select observacao from public.caso_etapas where id = pg_temp.etapa('banho')),
  'QUARTO 118 - 15H',
  'corrigir sobrescreve'
);

-- A coluna guarda só o valor atual; quem responde "o que dizia antes" é o
-- evento, que é append-only (invariante 3.3).
--
-- Asserção por CONTEÚDO, não por ordem: dentro de uma transação `now()` é
-- fixo, então os dois eventos têm o mesmo ocorrido_em e um `order by ... desc
-- limit 1` escolheria um dos dois ao acaso.
select is(
  (select array_agg(payload ->> 'observacao_anterior' order by payload ->> 'observacao_anterior' nulls first)
     from public.eventos
    where caso_etapa_id = pg_temp.etapa('banho') and tipo = 'etapa_anotada'),
  array[null, 'QUARTO 115 - 14H'],
  'o texto antigo fica no evento: a primeira anotação não tinha anterior, a segunda tinha'
);


-- =============================================================================
-- 3. Apagar
-- =============================================================================

select pg_temp.vira('anota@clickbaby.test');
set local role authenticated;

-- Texto em branco apaga. Sem isso, uma observação errada ficaria para sempre e
-- a saída seria escrever "ignore o de cima".
select public.anotar_etapa(pg_temp.etapa('banho'), '   ');

reset role;

select is(
  (select observacao from public.caso_etapas where id = pg_temp.etapa('banho')),
  null,
  'texto em branco APAGA'
);

select is(
  (select count(*)::int from public.eventos
    where caso_id = 'dddd3333-0000-0000-0000-000000000001' and tipo = 'observacao_removida'),
  1,
  'e a remoção também é evento, com tipo próprio'
);


-- =============================================================================
-- 4. Sem mudança, sem evento
-- =============================================================================

select pg_temp.vira('anota@clickbaby.test');
set local role authenticated;

select public.anotar_etapa(pg_temp.etapa('banho'), null);

reset role;

select is(
  (select count(*)::int from public.eventos
    where caso_id = 'dddd3333-0000-0000-0000-000000000001' and tipo = 'observacao_removida'),
  1,
  'apagar o que já está vazio não gera evento — segue 1'
);


-- =============================================================================
-- 5. Pessoa inativa
-- =============================================================================

update public.pessoas set ativo = false where nome = 'Coordenadora';

select pg_temp.vira('anota@clickbaby.test');
set local role authenticated;

select ok(
  pg_temp.levanta(format(
    'select public.anotar_etapa(%L, %L)', pg_temp.etapa('banho'), 'nao deveria entrar')),
  'pessoa inativa não anota'
);

reset role;


select * from finish();
rollback;
