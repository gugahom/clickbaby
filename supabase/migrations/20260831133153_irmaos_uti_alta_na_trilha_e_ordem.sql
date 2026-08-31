-- =============================================================================
-- ENCONTRO DE IRMÃOS, SAÍDA DE UTI e ALTA entram na trilha ACOMPANHAMENTO e
-- ganham ordem própria. Continuação da migration anterior — separada porque
-- ADD VALUE não pode ser usado na mesma transação em que foi declarado.
--
-- POR QUE ACOMPANHAMENTO E NÃO EDIÇÃO
-- As três acontecem NA MATERNIDADE, ao lado da família — exatamente a
-- definição da trilha (comentário da coluna, migration 20260827155728). Sem
-- este ajuste elas cairiam em "edição" por serem o `else` da coluna gerada,
-- o que as colocaria na fila de edição e na faixa errada do cartão.
--
-- POR QUE ORDEM 9, 10, 11 — NO FIM, NÃO NO MEIO
-- As oito etapas existentes (entrada..álbum) têm ordem fixada em
-- `pacote_etapas.ordem`, copiada para `caso_etapas` no momento em que o
-- pacote gera o caso (gerar_caso_etapas). Essa cópia é dado de seed, não
-- deriva de ordem_padrao_da_etapa — mudar os números de 1 a 8 aqui não
-- tocaria nenhum caso já gerado, mas DESALINHARIA `ordem_padrao_da_etapa`
-- do que o seed já gravou, e é exatamente esse alinhamento que faz
-- `adicionar_etapa('banho', ...)` encaixar um banho avulso na posição
-- CERTA entre nascimento e fechamento de um caso que já tem os dois. Por
-- isso as três novas entram DEPOIS de álbum (8), sem renumerar nada
-- existente: 9, 10, 11.
--
-- CONSEQUÊNCIA NO GATE DE PRECEDÊNCIA (só de TELA — anteriorPendente em
-- lib/acoes.ts, RPC não trava por ordem): como as três têm ordem maior que
-- fechamento (4), a tela vai pedir para concluir o acompanhamento normal
-- antes de liberar qualquer uma delas. É a leitura mais defensável sem
-- instrução mais específica do gestor sobre a ordem relativa entre as três.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. ordem_padrao_da_etapa — três `when` novos.
-- -----------------------------------------------------------------------------

create or replace function public.ordem_padrao_da_etapa(p_tipo public.etapa_tipo)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_tipo
    when 'entrada'         then 1
    when 'nascimento'      then 2
    when 'banho'           then 3
    when 'fechamento'      then 4
    when 'edicao_foto'     then 5
    when 'reels'           then 6
    when 'edicao_video'    then 7
    when 'album'           then 8
    when 'encontro_irmaos' then 9
    when 'saida_uti'       then 10
    when 'alta'            then 11
  end;
$$;

comment on function public.ordem_padrao_da_etapa(public.etapa_tipo) is
  'Ordem de leitura de uma etapa, igual em todos os pacotes. Existe para pacote_etapas.ordem e caso_etapas.ordem não divergirem entre si nem entre pacotes. Encontro de irmãos, saída de UTI e alta (31/08/2026) entram depois de álbum — nenhum pacote as inclui de fábrica, só existem via adicionar_etapa.';


-- -----------------------------------------------------------------------------
-- 2. Trilha — recriar coluna gerada, índice e view dependente (mesmo
--    procedimento da migration 20260827155728).
-- -----------------------------------------------------------------------------

drop view if exists public.fila_edicao;

drop index if exists public.idx_caso_etapas_trilha;

alter table public.caso_etapas drop column trilha;

alter table public.caso_etapas
  add column trilha text
  generated always as (
    case
      when tipo in (
        'entrada', 'nascimento', 'banho', 'fechamento',
        'encontro_irmaos', 'saida_uti', 'alta'
      )
        then 'acompanhamento'
      else 'edicao'
    end
  ) stored;

comment on column public.caso_etapas.trilha is
  'ACOMPANHAMENTO (o que a empresa faz junto da família, na maternidade) ou EDICAO (o que acontece na ilha de edição). Gerada a partir do tipo, nunca preenchida. Encontro de irmãos, saída de UTI e alta (31/08/2026) são acompanhamento — acontecem na maternidade, não na ilha de edição.';

create index idx_caso_etapas_trilha on public.caso_etapas (caso_id, trilha);

-- Recriada idêntica à versão anterior — nada no filtro precisa mudar, a
-- view já seleciona por trilha = 'edicao' e as três novas nunca são isso.
create view public.fila_edicao
with (security_invoker = true)
as
select
  q.id                as caso_id,
  q.mae_nome,
  q.bebe_nome,
  q.dia,
  q.cor_calendar,
  q.pacote_nome,
  q.maternidade_sigla,
  q.prazo_entrega_horas,
  q.vence_em,
  q.sla_pausado,
  q.na_uti,

  e.id                as caso_etapa_id,
  e.tipo              as etapa_tipo,
  e.status            as etapa_status,
  e.responsavel_id,
  r.nome              as responsavel_nome,
  e.atribuido_em,
  a.nome              as atribuido_por_nome,
  e.iniciado_em,
  e.pausado_em,
  e.pausa_acumulada,
  e.estacao
from public.quadro_casos q
join public.caso_etapas  e on e.caso_id = q.id and e.trilha = 'edicao'
left join public.pessoas r on r.id = e.responsavel_id
left join public.pessoas a on a.id = e.atribuido_por
where e.status in ('pendente', 'atribuida', 'em_andamento', 'pausada')
  and not q.eh_terminal;

comment on view public.fila_edicao is
  'Tudo que há para editar: uma linha por ETAPA da trilha de edição ainda aberta (foto, reels, vídeo, álbum) — não por caso. Um MASTER com três edições pendentes aparece três vezes, porque são três trabalhos que podem estar com três pessoas. SELECIONA DE quadro_casos de propósito: vence_em é a régua da fila e reimplementá-lo aqui criaria uma segunda definição de SLA. Herda a volatilidade da view base (caso na UTI recalcula vence_em a cada consulta). Não ordena: a view diz o que existe, a tela diz o que aparece e em que ordem. Caso na UTI permanece, porque a edição pode seguir — o que está congelado é o prazo, e sla_pausado diz isso.';

grant select on public.fila_edicao to authenticated;
