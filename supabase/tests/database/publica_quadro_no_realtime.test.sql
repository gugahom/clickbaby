-- pgTAP: publicação do Quadro no Realtime (migration 20260825004003).
--
-- O que este teste protege: a lista do que é TRANSMITIDO.
--
-- Publicar uma tabela é decidir mandar o conteúdo dela pela rede para todo
-- assinante. `casos` carrega nome de mãe, nome de recém-nascido e situação
-- clínica — dado sensível de saúde e de menor (seção 10 do CLAUDE.md). Uma
-- tabela entrando aqui sem querer não daria erro em lugar nenhum: passaria a
-- vazar em silêncio.
--
-- Por isso as asserções são nos dois sentidos — o que precisa estar, e o que
-- NÃO pode estar.

begin;
select plan(8);

select ok(
  exists (select 1 from pg_publication where pubname = 'supabase_realtime'),
  'a publication supabase_realtime existe'
);

select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'casos'
  ),
  'casos é publicada — sem isso o Quadro de duas pessoas nunca converge'
);

select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'caso_etapas'
  ),
  'caso_etapas é publicada — é onde iniciar/concluir/pausar aparecem'
);

-- eventos cresce a cada ação e nenhuma tela o desenha. Publicá-lo dobraria o
-- tráfego para ninguém ouvir, e transmitiria o log de auditoria inteiro.
select ok(
  not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'eventos'
  ),
  'eventos NÃO é publicada'
);

-- A URL de um entregável é credencial de acesso à galeria da família (seção 10).
select ok(
  not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'entregaveis'
  ),
  'entregaveis NÃO é publicada — a url é credencial, não se transmite de graça'
);

select ok(
  not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pessoas'
  ),
  'pessoas NÃO é publicada'
);

select is(
  (select count(*)::int from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'),
  2,
  'exatamente 2 tabelas publicadas — uma a mais aqui é decisão de vazar mais dado'
);

-- A RLS é a primeira das duas camadas que protegem o que o Realtime transmite
-- (a segunda é o cliente ignorar o payload). Sem RLS na tabela publicada, a
-- transmissão seria aberta.
select ok(
  (select bool_and(c.relrowsecurity)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('casos', 'caso_etapas')),
  'as duas tabelas publicadas têm RLS habilitada — é ela que filtra o assinante'
);

select * from finish();
rollback;
