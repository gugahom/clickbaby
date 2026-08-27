-- =============================================================================
-- Separa REELS de VÍDEO, acrescenta EDIÇÃO DE FOTOS, e divide as etapas em
-- duas trilhas: CAMPO e EDIÇÃO.
--
-- O QUE ESTAVA ERRADO
-- O enum `etapa_tipo` sempre teve `reels` E `edicao_video`, mas todo pacote
-- usava só `edicao_video` — e `reels` ficou órfão desde a migration inicial.
-- Confirmado com o gestor em 27/08/2026: são coisas DIFERENTES.
--
--   reels         vertical, curto. Existe em TODOS os pacotes — mesmo os que
--                 não vendem vídeo, a equipe faz o reels.
--   edicao_video  o horizontal, só no MASTER e MASTER + ÁLBUM. É o "✓ +
--                 horizontal" que a seção 2 do CLAUDE.md já descrevia e que o
--                 dado nunca representou.
--
-- Ou seja: as 39 etapas `edicao_video` que existem hoje em produção são, quase
-- todas, `reels` com o nome errado. Isto não é renomear um rótulo de tela — é
-- corrigir o que a linha sempre significou.
--
-- EDIÇÃO DE FOTOS
-- `edicao_foto` também já existia no enum e também nunca foi usado. Entra em
-- todos os pacotes. É UMA etapa por caso, não uma por bloco de captura:
-- confirmado que as fotos do banho entram na MESMA edição, já em andamento,
-- em vez de abrirem uma segunda rodada.
--
-- AS DUAS TRILHAS
-- A operação já pensa assim, e o gestor pediu que a tela mostre assim: um
-- grupo de etapas é atendimento (o que acontece na maternidade) e o outro é
-- operação interna (o que acontece na ilha de edição).
--
--   campo   entrada, nascimento, banho, fechamento
--   edicao  edicao_foto, reels, edicao_video, album
--
-- A trilha não é só rótulo: ela É a regra de precedência. O modelo linear
-- antigo ("conclua tudo com ordem menor") não descreve a operação, porque
-- banho e fechamento acontecem DEPOIS do nascimento e não dependem da edição,
-- enquanto a edição libera assim que o nascimento conclui. Não é uma fila, é
-- um grafo:
--
--     entrada -> nascimento -+-> banho -> fechamento     (CAMPO, sequencial)
--                            +-> foto | reels | video    (EDIÇÃO, paralelas)
--
-- A trilha é coluna GERADA, não coluna preenchida: derivar do tipo garante que
-- ela nunca discorde dele. Preencher à mão criaria uma linha possível em que a
-- etapa é `banho` e a trilha diz `edicao`.
--
-- POR QUE O TRABALHO DE DADOS AQUI É NO-OP NO LOCAL
-- Num `db reset`, migrations rodam ANTES do seed e as tabelas de cadastro
-- ainda estão vazias — nada para migrar. No remoto, onde os 88 casos já
-- existem, é aqui que a correção acontece. O seed carrega o mesmo desenho para
-- o local. Mesmo padrão da migration 20260827135656.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. A trilha
-- -----------------------------------------------------------------------------

alter table public.caso_etapas
  add column trilha text
  generated always as (
    case
      when tipo in ('entrada', 'nascimento', 'banho', 'fechamento') then 'campo'
      else 'edicao'
    end
  ) stored;

comment on column public.caso_etapas.trilha is
  'CAMPO (o que acontece na maternidade) ou EDICAO (o que acontece na ilha de edição). Gerada a partir do tipo, nunca preenchida — é a divisão que a operação já usa, e também a regra de precedência: campo é sequencial entre si; edição libera quando o nascimento conclui.';

create index idx_caso_etapas_trilha on public.caso_etapas (caso_id, trilha);


-- -----------------------------------------------------------------------------
-- 2. O desenho novo dos pacotes
--
-- `ordem` passa a ser fixa POR TIPO, igual em todo pacote. Antes era a posição
-- dentro daquele pacote, o que fazia `edicao_video` ser 2 no BIRTH e 5 no
-- MASTER — número que não significava nada comparando dois casos. Agora ela é
-- só a ordem de LEITURA dentro da trilha; quem decide o que libera é a trilha.
-- Buracos na sequência são esperados (um BIRTH não tem entrada).
-- -----------------------------------------------------------------------------

create or replace function public.ordem_padrao_da_etapa(p_tipo public.etapa_tipo)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_tipo
    when 'entrada'      then 1
    when 'nascimento'   then 2
    when 'banho'        then 3
    when 'fechamento'   then 4
    when 'edicao_foto'  then 5
    when 'reels'        then 6
    when 'edicao_video' then 7
    when 'album'        then 8
  end;
$$;

comment on function public.ordem_padrao_da_etapa(public.etapa_tipo) is
  'Ordem de leitura de uma etapa, igual em todos os pacotes. Existe para pacote_etapas.ordem e caso_etapas.ordem não divergirem entre si nem entre pacotes.';

-- Sem grant para `authenticated`, de propósito: esta função só é chamada de
-- dentro de adicionar_video (SECURITY DEFINER, roda como o dono) e do seed. O
-- app nunca precisa dela, e uma linha na política de privilégios que ninguém
-- consegue justificar é exatamente o que a auditoria existe para pegar.
revoke all on function public.ordem_padrao_da_etapa(public.etapa_tipo) from public;


-- O mapa completo, num lugar só. BIRTH e BIRTH + REELS não têm `entrada`
-- porque são vendidos sem contrato, no pós-parto — a fotógrafa já está lá.
-- `edicao_foto` e `reels` aparecem em TODOS; `edicao_video` só no MASTER.
with alvo(slug, etapa_tipo) as (
  select p.slug, e.tipo
  from public.pacotes p
  cross join lateral (
    select unnest(
      case
        when p.slug in ('birth', 'birth-reels')
          then array['nascimento', 'edicao_foto', 'reels']::public.etapa_tipo[]
        when p.slug in ('basic', 'basic-reels-venda', 'basic-reels-contrato')
          then array['entrada', 'nascimento', 'edicao_foto', 'reels']::public.etapa_tipo[]
        when p.slug in ('standard', 'baby-reels')
          then array['entrada', 'nascimento', 'banho', 'fechamento',
                     'edicao_foto', 'reels']::public.etapa_tipo[]
        when p.slug = 'master'
          then array['entrada', 'nascimento', 'banho', 'fechamento',
                     'edicao_foto', 'reels', 'edicao_video']::public.etapa_tipo[]
        when p.slug = 'master-album'
          then array['entrada', 'nascimento', 'banho', 'fechamento',
                     'edicao_foto', 'reels', 'edicao_video', 'album']::public.etapa_tipo[]
        else array[]::public.etapa_tipo[]
      end
    ) as tipo
  ) e
)
insert into public.pacote_etapas (pacote_id, etapa_tipo, ordem, obrigatoria)
select p.id, a.etapa_tipo, public.ordem_padrao_da_etapa(a.etapa_tipo), true
from alvo a
join public.pacotes p on p.slug = a.slug
on conflict (pacote_id, etapa_tipo) do update
  set ordem = excluded.ordem;

-- Tira o que sobrou: `edicao_video` dos pacotes que não são MASTER. Só o
-- MOLDE do pacote é limpo aqui; os casos JÁ CRIADOS são tratados no passo 3,
-- onde a etapa é convertida em `reels` em vez de sumir. Apagar trabalho
-- registrado seria perder histórico.
delete from public.pacote_etapas pe
using public.pacotes p
where pe.pacote_id = p.id
  and pe.etapa_tipo = 'edicao_video'
  and p.slug not in ('master', 'master-album');


-- -----------------------------------------------------------------------------
-- 3. Os casos que já existem
-- -----------------------------------------------------------------------------

-- 3a. O que se chamava vídeo e sempre foi reels. Converte em vez de apagar e
--     recriar: a linha guarda iniciado_em, concluido_em, responsável e as
--     pausas, e os eventos em `eventos` apontam para o id dela.
update public.caso_etapas ce
   set tipo = 'reels',
       ordem = public.ordem_padrao_da_etapa('reels')
  from public.casos c
  join public.pacotes p on p.id = c.pacote_id
 where ce.caso_id = c.id
   and ce.tipo = 'edicao_video'
   and p.slug not in ('master', 'master-album');

-- 3b. Alinha a ordem das etapas que ficaram.
update public.caso_etapas
   set ordem = public.ordem_padrao_da_etapa(tipo)
 where ordem is distinct from public.ordem_padrao_da_etapa(tipo);

-- 3c. Cria as etapas que faltam nos casos ABERTOS.
--
--     Só os não terminais, de propósito: acrescentar uma edição de fotos a um
--     caso já encerrado o faria parecer incompleto para sempre, e o
--     denominador de "x de y concluídos" passaria a mentir sobre um trabalho
--     que terminou. O que já fechou, fechou com o escopo que tinha.
insert into public.caso_etapas (caso_id, tipo, status, ordem)
select c.id, pe.etapa_tipo, 'pendente', public.ordem_padrao_da_etapa(pe.etapa_tipo)
from public.casos c
join public.pacote_etapas pe on pe.pacote_id = c.pacote_id
where c.status_operacional not in ('encerrado', 'cancelado')
on conflict (caso_id, tipo) do nothing;


-- -----------------------------------------------------------------------------
-- 4. adicionar_reels vira adicionar_video
--
-- A função criava `edicao_video` e se chamava `adicionar_reels` — nomes que
-- descreviam a mesma coisa enquanto vídeo e reels eram a mesma coisa. Agora
-- que não são, o nome antigo apontaria para o horizontal do MASTER, que é o
-- oposto do que ele promete.
--
-- O caso de uso vira: um pacote que não vende o horizontal fecha a venda dele
-- na hora. O reels não precisa mais ser adicionado por ninguém — está em todo
-- pacote desde o passo 2.
-- -----------------------------------------------------------------------------

drop function if exists public.adicionar_reels(uuid);

create or replace function public.adicionar_video(p_caso_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id     uuid;
  v_status        public.status_operacional;
  v_caso_etapa_id uuid;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select c.status_operacional into v_status
  from public.casos c
  where c.id = p_caso_id
  for update;

  if not found then
    raise exception 'Caso % não encontrado.', p_caso_id;
  end if;

  if v_status in ('encerrado', 'cancelado') then
    raise exception
      'Caso % já está em status terminal ("%") — não dá para acrescentar etapa.',
      p_caso_id, v_status;
  end if;

  -- Ordem fixa por tipo, não max+1: a de antes dependia de quais etapas o caso
  -- já tinha, então o mesmo vídeo acabava com ordem diferente em dois casos.
  insert into public.caso_etapas (caso_id, tipo, ordem)
  values (p_caso_id, 'edicao_video', public.ordem_padrao_da_etapa('edicao_video'))
  on conflict (caso_id, tipo) do nothing
  returning id into v_caso_etapa_id;

  -- Já tinha: nada mudou, nada a registrar.
  if v_caso_etapa_id is null then
    return false;
  end if;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_caso_id,
    v_caso_etapa_id,
    v_pessoa_id,
    'video_adicionado',
    jsonb_build_object(
      'caso_id', p_caso_id,
      'caso_etapa_id', v_caso_etapa_id
    ),
    now()
  );

  return true;
end;
$$;

comment on function public.adicionar_video(uuid) is
  'Acrescenta a etapa edicao_video (o horizontal do MASTER) a um caso que ainda não a tem, para quando a venda dele se concretiza fora do pacote. NÃO troca o pacote — o pacote continua sendo o que foi vendido. Idempotente pela constraint caso_etapas_unica_por_caso: a segunda chamada devolve false, sem erro e sem evento. Substitui adicionar_reels, que criava esta mesma etapa quando reels e vídeo ainda eram a mesma coisa; hoje o reels existe em todo pacote e não precisa ser adicionado por ninguém.';

revoke all on function public.adicionar_video(uuid) from public;
grant execute on function public.adicionar_video(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 5. A fila de edição passa a ser da TRILHA, não de um tipo
--
-- A view filtrava `tipo = 'edicao_video'`, o que era razoável enquanto vídeo
-- era a única etapa de pós-produção que existia de fato. Com a separação, esse
-- filtro passou a significar "fila do horizontal do MASTER" — 9 casos de 88 —
-- e deixaria foto e reels invisíveis, que é o oposto do que uma fila de edição
-- serve para mostrar.
--
-- Agora é `trilha = 'edicao'`: uma linha por TAREFA de edição aberta, não por
-- caso. Um MASTER com foto, reels e vídeo pendentes aparece três vezes, porque
-- são três trabalhos que podem estar com três pessoas diferentes — que é
-- exatamente a razão de o gestor ter pedido a separação.
--
-- A tela da Fila foi removida (a pedido dele, PR #25) e esta view segue sem
-- consumidor. Ela fica porque continua sendo a definição correta de "o que há
-- para editar", e porque o teste da trava da seção 9 se apoia nela. Deixá-la
-- apontando para o tipo errado seria pior que removê-la.
-- -----------------------------------------------------------------------------

create or replace view public.fila_edicao
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
