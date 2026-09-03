-- Duas mudanças de REGRA DA OPERAÇÃO, ditadas pelo gestor em 03/09/2026.
--
-- =============================================================================
-- 1. O MASTER DEIXA DE TRAZER REELS DE FÁBRICA
--
-- ISTO CONTRADIZ A SEÇÃO 2 DO CLAUDE.md, e a contradição é o ponto. Lá está
-- escrito, confirmado em 27/08/2026, que "reels existe em TODOS os pacotes —
-- mesmo os que não o vendem, a equipe faz". Era verdade quando foi escrito; o
-- dono da operação diz que não é mais para o MASTER. Fato do domínio muda por
-- decisão de quem opera, não por dedução de quem programa — o CLAUDE.md é
-- corrigido junto com esta migration.
--
-- O reels não some do MASTER: sai do PADRÃO. Um MASTER que vender o vertical
-- ganha a etapa por `adicionar_etapa`, que existe exatamente para isso.
--
-- O QUE ESTA MIGRATION NÃO FAZ: mexer nos casos que já existem. Onze casos
-- MASTER abertos têm reels pendente no remoto, e oito já têm reels CONCLUÍDO —
-- trabalho que aconteceu de verdade. Apagar ou dispensar isso por dedução seria
-- reescrever histórico a partir de uma regra que passou a valer hoje. Os
-- pendentes se resolvem um a um com "dispensar", que é o gesto para "não vai
-- acontecer", e essa é uma decisão da operação, não desta migration.
-- =============================================================================

delete from public.pacote_etapas pe
 using public.pacotes p
 where p.id = pe.pacote_id
   and pe.etapa_tipo = 'reels'
   and p.slug in ('master', 'master-album');


-- =============================================================================
-- 2. O ENCONTRO DE IRMÃOS ABRE UMA RODADA DE REELS
--
-- O PROBLEMA, relatado do campo: um caso teve o reels editado e concluído, e
-- depois a família viveu o encontro de irmãos. O material novo não tinha onde
-- ser registrado — o reels já estava fechado, e reabrir a rodada do parto
-- misturaria dois trabalhos distintos no mesmo carimbo de tempo. É o mesmo
-- problema que a migration 20260827172830 resolveu para o banho e o fechamento,
-- e a solução é a mesma peça: outra RODADA.
--
-- A coluna `rodada` já foi desenhada para isto. A constraint é `>= 1` e não
-- `in (1, 2)` justamente porque "quantos blocos de captura existem" é fato da
-- operação, não do schema — está escrito lá. Esta é a primeira vez que a porta
-- é usada.
--
-- RODADA 3 É DO ENCONTRO, sempre, mesmo quando não houve rodada 2. Um BIRTH com
-- encontro de irmãos pula de 1 para 3, e o buraco é de propósito: o número
-- identifica QUAL bloco de captura, não a ordem em que apareceram. Se a rodada
-- 3 mudasse de significado conforme o caso, o rótulo "Irmãos" na tela mentiria
-- em metade deles.
--
-- NA CONCLUSÃO, NÃO NA ADIÇÃO. O gestor pediu "quando for adicionado um
-- encontro de irmãos"; a rodada nasce quando ele é CONCLUÍDO, e é a mesma
-- escolha que a rodada 2 já faz com o fechamento. O motivo é que a edição só
-- existe depois de haver material: criada na adição, ela ficaria disponível
-- para começar (a precedência libera edição assim que o nascimento conclui)
-- antes de o encontro ter acontecido. Na prática a diferença é o mesmo dia.
--
-- SÓ REELS, e não a edição de fotos junto. Foi o que o gestor pediu, com estas
-- palavras: "deve ser disponibilizado o reels pra editar como encontro de
-- irmãos". Se as fotos do encontro também precisarem de rodada própria, é uma
-- linha nesta função — mas é uma decisão dele, não uma dedução minha.
-- =============================================================================

create or replace function public.gerar_reels_do_encontro_de_irmaos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status_caso public.status_operacional;
  v_criadas     integer;
begin
  select c.status_operacional into v_status_caso
  from public.casos c
  where c.id = new.caso_id;

  -- Caso encerrado ou cancelado não ganha trabalho novo — mesma guarda da
  -- rodada 2. Um MASTER encerrado com o vídeo aberto também cai aqui, e é o
  -- que se quer: o encontro que acontecer depois da entrega é outro contrato.
  if v_status_caso in ('encerrado', 'cancelado') then
    return new;
  end if;

  insert into public.caso_etapas (caso_id, tipo, status, ordem, rodada)
  values (
    new.caso_id,
    'reels',
    'pendente',
    public.ordem_padrao_da_etapa('reels'),
    3
  )
  on conflict (caso_id, tipo, rodada) do nothing;

  get diagnostics v_criadas = row_count;

  if v_criadas > 0 then
    insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
    values (
      new.caso_id,
      new.id,
      -- Quem concluiu o encontro. Vem do responsável da etapa e não de
      -- auth.uid(): a trigger também roda em backfill e sem usuário logado.
      new.responsavel_id,
      'reels_do_encontro_criado',
      jsonb_build_object('caso_id', new.caso_id, 'rodada', 3),
      now()
    );
  end if;

  return new;
end;
$$;

comment on function public.gerar_reels_do_encontro_de_irmaos() is
  'Abre a rodada 3 de reels quando o encontro de irmãos conclui. Mesma forma da '
  'rodada 2 (banho + fechamento, migration 20260827172830): material novo pede '
  'edição nova, e reabrir a rodada do parto misturaria dois trabalhos no mesmo '
  'carimbo. A rodada 3 é SEMPRE do encontro, mesmo sem rodada 2 no caso.';

revoke all on function public.gerar_reels_do_encontro_de_irmaos() from public;

drop trigger if exists reels_do_encontro_de_irmaos on public.caso_etapas;

create trigger reels_do_encontro_de_irmaos
  after update of status on public.caso_etapas
  for each row
  when (
    new.tipo = 'encontro_irmaos'
    and new.status = 'concluida'
    and old.status is distinct from 'concluida'
  )
  execute function public.gerar_reels_do_encontro_de_irmaos();

comment on column public.caso_etapas.rodada is
  'Qual passagem de edição esta etapa é. 1 = material do parto (libera com o '
  'nascimento); 2 = material do banho e fechamento (nasce quando o fechamento '
  'conclui); 3 = material do encontro de irmãos (nasce quando o encontro '
  'conclui). O número identifica o BLOCO DE CAPTURA, não a ordem de chegada: um '
  'caso sem rodada 2 pula direto para a 3. O SLA NÃO se divide por rodada — o '
  'prazo é do caso.';
