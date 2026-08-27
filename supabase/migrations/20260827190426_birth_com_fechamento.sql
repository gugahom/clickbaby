-- =============================================================================
-- BIRTH e BIRTH + REELS passam a ter FECHAMENTO.
--
-- Correção de cadastro vinda do gestor em 27/08/2026. Os dois pacotes eram
-- vendidos no pós-parto, sem contrato, e o checklist refletia isso: só
-- nascimento e as edições. Na prática há fechamento, e ele não estava sendo
-- registrado em lugar nenhum.
--
-- BANHO CONTINUA FORA. Só o fechamento foi corrigido — o gestor foi específico.
-- Se o banho também acontecer nesses pacotes, é outra linha nesta mesma lista,
-- não uma mudança de modelo.
--
-- CONSEQUÊNCIA QUE NÃO É ÓBVIA
-- Fechamento é o gatilho da SEGUNDA RODADA de edição (migration
-- 20260827172830). Ou seja: ao concluir o fechamento, um BIRTH passa a ganhar
-- uma segunda edição de fotos e um segundo reels, como qualquer outro pacote.
-- Isso é o comportamento correto — há material novo a editar —, mas vale dizer
-- em voz alta porque o rótulo da rodada 2 é "B+F", e o BIRTH não tem banho.
-- O nome descreve o BLOCO de captura que a operação chama assim, não a lista
-- exata de etapas daquele pacote.
-- =============================================================================

insert into public.pacote_etapas (pacote_id, etapa_tipo, ordem, obrigatoria)
select p.id, 'fechamento', public.ordem_padrao_da_etapa('fechamento'), true
from public.pacotes p
where p.slug in ('birth', 'birth-reels')
on conflict (pacote_id, etapa_tipo) do nothing;


-- Os casos que já existem e seguem abertos.
--
-- Só os NÃO terminais: acrescentar uma etapa a um caso encerrado o faria
-- parecer incompleto para sempre, e o denominador de "x de y concluídos"
-- passaria a mentir sobre um trabalho que terminou. Mesma regra da
-- 20260827140400.
--
-- `rodada = 1` explícito: fechamento é etapa de acompanhamento e não tem
-- segunda rodada; deixar no default seria o mesmo valor, mas dizer é melhor
-- que depender do default numa tabela onde a rodada passou a significar algo.
insert into public.caso_etapas (caso_id, tipo, status, ordem, rodada)
select c.id, 'fechamento', 'pendente', public.ordem_padrao_da_etapa('fechamento'), 1
from public.casos c
join public.pacotes p on p.id = c.pacote_id
where p.slug in ('birth', 'birth-reels')
  and c.status_operacional not in ('encerrado', 'cancelado')
on conflict (caso_id, tipo, rodada) do nothing;
