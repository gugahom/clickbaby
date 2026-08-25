-- =============================================================================
-- eventos passa a ser legível por qualquer pessoa ativa, não só por adm.
--
-- POR QUE ISTO NÃO É AFROUXAR A REGRA
-- A invariante 3.2 do CLAUDE.md diz, sobre o registro de quem fez o quê:
-- "O histórico de quem fez o quê É O PRODUTO." Um produto que só a gestão pode
-- olhar é outro produto.
--
-- A seção 9 é ainda mais direta sobre o princípio: "A fila de edição é visível
-- para TODA A EQUIPE, não só para a gestão. O cliente observou que a
-- produtividade subiu com a simples presença dos sócios — visibilidade
-- compartilhada reproduz esse efeito sem clima de fiscalização." Esconder o
-- histórico da equipe produz exatamente o clima que aquela frase evita: um log
-- que a gestão lê sobre você e você não.
--
-- E, na prática, a restrição já era porosa. Todas as tabelas de onde os eventos
-- derivam são de leitura compartilhada desde a migration 20260821005147:
--   - caso_etapas mostra responsável, iniciado_em e concluido_em;
--   - handoffs mostra quem passou para quem, com motivo e horário;
--   - entregaveis mostra quem registrou e quem confirmou.
-- Quem quisesse remontar "quem fez o quê" já conseguia. O que faltava era ler
-- isso em ordem cronológica, numa tela — que é a fatia do histórico.
--
-- O QUE NÃO MUDA
--   - A ESCRITA continua 100% negada para todo mundo, adm incluído: nenhuma
--     policy de INSERT/UPDATE/DELETE, nenhum GRANT desses verbos. `eventos`
--     segue append-only por SECURITY DEFINER (invariante 3.3). Esta migration
--     toca SELECT e nada mais.
--   - Nenhum payload carrega credencial. registrar_entregavel grava
--     jsonb_build_object('caso_id', ..., 'tipo', ...) e DELIBERADAMENTE deixa a
--     url de fora — a url é credencial de acesso à galeria da família (seção 10)
--     e não pode vazar pelo log. Ao acrescentar evento novo, mantenha essa
--     regra: payload descreve O QUE aconteceu, não o segredo envolvido.
--   - `anon` continua sem nada, e a tabela segue fora do Realtime.
-- =============================================================================

drop policy if exists eventos_select_adm on public.eventos;

create policy eventos_select_compartilhada
  on public.eventos
  for select
  to authenticated
  using (public.eh_pessoa_ativa());

comment on policy eventos_select_compartilhada on public.eventos is
  'Leitura compartilhada entre pessoas ativas, mesma regra de casos e caso_etapas. Substitui eventos_select_adm: o histórico de quem fez o quê é o produto (invariante 3.2) e a visibilidade compartilhada é um valor declarado da seção 9, não uma concessão. Escrita segue negada para todos — append-only via SECURITY DEFINER (invariante 3.3).';

comment on table public.eventos is
  'Log APPEND-ONLY. Nunca sofre UPDATE nem DELETE — invariante 3.3. Todo indicador do painel deriva daqui, o que permite recalcular métricas com definições novas sem perder histórico. LEITURA compartilhada entre pessoas ativas desde a migration 20260825020122; escrita só por SECURITY DEFINER. O payload descreve o que aconteceu e NUNCA carrega segredo: a url de um entregável, por exemplo, fica fora de propósito.';
