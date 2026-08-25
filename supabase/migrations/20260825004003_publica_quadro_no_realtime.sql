-- =============================================================================
-- Publica casos e caso_etapas no Realtime.
--
-- POR QUE ISTO É O CORAÇÃO DO PRODUTO, NÃO UM ENFEITE
-- A seção 8 de docs/plano.md diz que o Realtime "é o que substitui o vidro de
-- verdade". Um quadro branco é compartilhado por construção: quem escreve nele
-- e quem passa na frente veem a mesma coisa, sempre. Uma página web não é.
--
-- Sem isto, duas fotógrafas na mesma maternidade não enxergam o trabalho uma da
-- outra até alguém dar refresh. O incômodo é o de menos: o risco real é as duas
-- registrarem a mesma etapa achando que a outra não registrou.
--
-- POR QUE SÓ ESTAS DUAS TABELAS
-- Elas cobrem tudo que o Quadro desenha. As demais escritas sempre acompanham
-- uma delas na mesma transação:
--   - transferir_etapa grava em handoffs E atualiza caso_etapas;
--   - confirmar_entrega carimba entregaveis E atualiza casos;
--   - mover_para_uti / cancelar_caso / sync_upsert_caso mexem em casos.
-- Publicar handoffs e entregaveis só duplicaria o mesmo aviso.
--
-- `eventos` fica de fora de propósito: é log de auditoria, cresce a cada ação, e
-- nenhuma tela do Quadro o desenha. Publicá-lo seria transmitir o dobro de
-- tráfego para ninguém ouvir.
--
-- PRIVACIDADE — LEIA ANTES DE ACRESCENTAR TABELA AQUI
-- O Realtime transmite a LINHA que mudou. `casos` carrega nome de mãe, nome de
-- recém-nascido e situação clínica: dado pessoal sensível de saúde e de menor
-- (seção 10 do CLAUDE.md).
--
-- Duas camadas seguram isso:
--   1. O Realtime do Supabase aplica a RLS de cada assinante em
--      postgres_changes — quem não passa em casos_select_compartilhada não
--      recebe a linha. É a mesma garantia do SELECT, pelo mesmo caminho.
--   2. O cliente IGNORA o payload. O hook do Quadro usa o evento só como sinal
--      de "algo mudou, recarregue" e refaz a query normal, sob RLS. Mesmo que a
--      camada 1 falhasse numa versão futura do Realtime, nada do payload chega
--      a ser lido ou renderizado.
--
-- Publicar uma tabela aqui é decidir transmitir o conteúdo dela. Não acrescente
-- sem passar pelas duas perguntas: alguma tela precisa reagir a isso, e o que
-- vaza se a RLS do Realtime falhar.
-- =============================================================================

-- Guardado: a publication supabase_realtime existe por padrão no Supabase, mas
-- um banco recriado do zero pode não tê-la ainda.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;

-- add table falha se a tabela já estiver na publication, então cada uma é
-- guardada por si — a migration precisa ser repetível num banco que já tenha
-- recebido parte disso à mão.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'casos'
  ) then
    alter publication supabase_realtime add table public.casos;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'caso_etapas'
  ) then
    alter publication supabase_realtime add table public.caso_etapas;
  end if;
end;
$$;

comment on table public.casos is
  'Um atendimento completo a uma família, do contrato à confirmação dos links. Contém dado pessoal sensível de saúde e de menor — ver seção 9 do CLAUDE.md. PUBLICADA NO REALTIME (migration 20260825004003): mudanças nesta tabela são transmitidas aos assinantes, filtradas pela RLS de cada um.';

comment on table public.caso_etapas is
  'Unidade de trabalho dentro de um caso. Gerada automaticamente a partir de pacote_etapas — nunca criada à mão. PUBLICADA NO REALTIME (migration 20260825004003): é o que faz o Quadro de duas fotógrafas na mesma maternidade mostrar a mesma coisa.';
