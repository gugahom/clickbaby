-- =============================================================================
-- A SEÇÃO FOTO/LIVRO — o álbum ganha fluxo próprio, como o vídeo do MASTER.
--
-- O PEDIDO (gestor, 10/09/2026): o mesmo arranjo da seção MASTER, para o
-- fotolivro. Ele mostrou o segundo quadro do Trello da equipe — "FOTO LIVRO" —
-- e pediu aquelas colunas como fases.
--
-- -----------------------------------------------------------------------------
-- POR QUE UMA COLUNA NOVA, E NÃO MAIS VALORES EM `status_etapa`
-- -----------------------------------------------------------------------------
-- A migration 20260901051229 argumentou o CONTRÁRIO para o vídeo, e o argumento
-- estava certo LÁ: as cinco fases do vídeo SÃO o status do trabalho. "EDITANDO"
-- é `em_andamento`; "ENVIADO / FINALIZADO" é `concluida`. Um eixo só, e uma
-- segunda coluna criaria duas respostas para a mesma pergunta.
--
-- No fotolivro isso não se repete, e a diferença é de natureza. Das dez fases,
-- UMA é trabalho acontecendo — "Realizando diagramação". As outras nove são o
-- produto ESPERANDO: esperando o pagamento, esperando o cliente aprovar,
-- esperando a gráfica, esperando a entrega. Um `status` de etapa chamado
-- `pago_e_enviado_para_ticcolor` não descreve trabalho nenhum, e cairia em
-- quatro tabelas exaustivas de `StatusEtapa` na tela — cor da pílula, selo,
-- peso de ordenação, rótulo — todas as quatro com uma linha que não significa
-- nada para as outras dez etapas do sistema.
--
-- São DUAS PERGUNTAS diferentes, e é por isso que ganham duas colunas:
--
--   status      alguém está trabalhando nisto agora, e há quanto tempo?
--   fase_album  onde o produto está na esteira?
--
-- É a mesma separação que o gestor pediu na seção MASTER em 09/09, quando o
-- seletor de fase ganhou play/pause do lado: a fase é o TRAJETO, o relógio é o
-- TEMPO. Aqui ela nasce no banco em vez de ser remendada na tela.
--
-- E AS DUAS NUNCA DISCORDAM porque NUNCA SÃO ESCRITAS SEPARADAMENTE:
-- `mover_album` escreve as duas na mesma transação. A objeção da 20260901051229
-- — "duas colunas que precisariam ser mantidas em acordo para sempre" — só vale
-- quando existem dois caminhos de escrita, e aqui existe um.
--
-- -----------------------------------------------------------------------------
-- O QUE FICOU DE FORA DO TRELLO, E POR QUÊ
-- -----------------------------------------------------------------------------
-- A coluna "ESTÁ NA UTI" não virou fase (decisão do gestor, 10/09/2026). UTI já
-- é estado do CASO neste sistema: `uti_desde` pausa o SLA, tira o card do bloco
-- do dia e tem seção própria. Repetir a informação como fase do álbum criaria
-- duas fontes que podem discordar — alguém marca a fase e o caso não está na
-- UTI, ou o contrário.
--
-- "AGUARDANDO PAGAMENTO, FINALIZAÇÃO DAS FOTOS" e "AGUARDANDO DIAGRAMAÇÃO" são
-- duas esperas diferentes e viraram duas fases: a primeira espera o CLIENTE
-- pagar, a segunda espera a EQUIPE pegar. Juntá-las apagaria de quem é a bola.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. As dez fases.
--
-- Os rótulos da tela são os do Trello deles (ver ROTULO_FASE_ALBUM no front);
-- aqui ficam os identificadores. `enviado_grafica` não diz "ticcolor" de
-- propósito: a gráfica é fornecedor, e trocar de fornecedor não pode pedir
-- migration.
-- -----------------------------------------------------------------------------

create type public.fase_album as enum (
  'aguardando_pagamento',
  'aguardando_diagramacao',
  'diagramando',
  'enviar_para_aprovacao',
  'aguardando_aprovacao',
  'pedido_de_alteracoes',
  'aprovado',
  'enviado_grafica',
  'pronto_para_entrega',
  'entregue'
);

comment on type public.fase_album is
  'Onde o fotolivro está na esteira de produção — do pagamento à entrega. É '
  'ORTOGONAL a status_etapa: a fase diz onde o produto está, o status diz se '
  'alguém está trabalhando nele agora. Só a etapa `album` a usa, e só '
  'mover_album a escreve.';


-- -----------------------------------------------------------------------------
-- 2. A coluna.
--
-- NULA até alguém dizer a primeira fase, pelo mesmo motivo do vídeo: estar na
-- seção já é ser um fotolivro a fazer, e um padrão inventado afirmaria um
-- estado que ninguém declarou. A tela mostra "Definir fase".
--
-- Sem constraint amarrando a coluna ao tipo `album`. Quem governa isso é a RPC
-- (`mover_album` recusa qualquer outro tipo), como em `mover_video_master` —
-- uma constraint aqui só duplicaria a regra num segundo lugar.
-- -----------------------------------------------------------------------------

alter table public.caso_etapas
  add column fase_album public.fase_album;

comment on column public.caso_etapas.fase_album is
  'Fase da esteira do fotolivro. Só faz sentido em etapas do tipo `album`, e só '
  'mover_album escreve — junto com o status, na mesma transação, para as duas '
  'nunca discordarem.';

create index caso_etapas_fase_album_idx
  on public.caso_etapas (fase_album)
  where fase_album is not null;


-- -----------------------------------------------------------------------------
-- 3. mover_album — a única porta de escrita da fase.
--
-- Espelha `mover_video_master` (20260901051232) no que é comum: exige pessoa
-- ativa, recusa tipo errado, recusa caso CANCELADO e aceita caso ENCERRADO (o
-- fotolivro sobrevive à entrega, ver a exceção lá embaixo), carimba
-- início/pausa/conclusão e grava evento.
--
-- O QUE ELA FAZ A MAIS: mantém `status` e `fase_album` em acordo.
--
--   diagramando  -> em_andamento   é a única fase que é trabalho acontecendo
--   entregue     -> concluida      é a única fase que é fim
--   as outras    -> pausada        o produto está esperando alguém de fora
--
-- PAUSADA, e não `pendente`: `pausar_etapa` já significa "começou e parou", o
-- relógio de ciclo já desconta pausa (`pausa_acumulada`), e uma espera de
-- gráfica é exatamente isso. Marcar `pendente` faria o tempo de diagramação já
-- registrado desaparecer da conta.
-- -----------------------------------------------------------------------------

create or replace function public.mover_album(
  p_caso_etapa_id uuid,
  p_fase          public.fase_album
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_caso_id   uuid;
  v_tipo      public.etapa_tipo;
  v_fase      public.fase_album;
  v_terminal  public.status_operacional;
  v_pausado   timestamptz;
  v_status    public.status_etapa;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select ce.caso_id, ce.tipo, ce.fase_album, ce.pausado_em, c.status_operacional
    into v_caso_id, v_tipo, v_fase, v_pausado, v_terminal
  from public.caso_etapas ce
  join public.casos c on c.id = ce.caso_id
  where ce.id = p_caso_etapa_id
  for update of ce;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_tipo <> 'album' then
    raise exception
      'A esteira do fotolivro é da etapa de álbum — etapa "%" não passa por ela.',
      v_tipo;
  end if;

  if v_terminal = 'cancelado' then
    raise exception
      'Caso cancelado — não se mexe no fotolivro de um contrato que caiu.';
  end if;

  if v_fase is not distinct from p_fase then
    return;
  end if;

  v_status := case p_fase
    when 'diagramando' then 'em_andamento'::public.status_etapa
    when 'entregue'    then 'concluida'::public.status_etapa
    else 'pausada'::public.status_etapa
  end;

  update public.caso_etapas
     set fase_album  = p_fase,
         status      = v_status,
         -- O relógio começa na primeira fase que alguém declara, e não só na
         -- diagramação: o pagamento já é parte do ciclo do produto, e sem isto
         -- um álbum que ficou um mês esperando pagamento apareceria como se
         -- tivesse nascido no dia em que a diagramação começou.
         iniciado_em = coalesce(iniciado_em, now()),
         concluido_em = case when p_fase = 'entregue' then now() else null end,
         pausa_acumulada = pausa_acumulada
           + case when v_pausado is not null then now() - v_pausado
                  else interval '0' end,
         -- Entrar numa fase de espera reabre a pausa; sair dela fecha. É o que
         -- faz o tempo de ciclo medir diagramação e não calendário.
         pausado_em = case when v_status = 'pausada' then now() else null end,
         responsavel_id = coalesce(responsavel_id, v_pessoa_id)
   where id = p_caso_etapa_id;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    p_caso_etapa_id,
    v_pessoa_id,
    'fase_do_album_movida',
    jsonb_build_object(
      'de', v_fase,
      'para', p_fase,
      'status', v_status
    ),
    now()
  );
end;
$$;

comment on function public.mover_album(uuid, public.fase_album) is
  'Move o fotolivro na esteira de produção. É a ÚNICA porta de escrita de '
  'fase_album, e escreve o status junto na mesma transação — diagramando vira '
  'em_andamento, entregue vira concluida, e toda fase de espera vira pausada, '
  'que é o que faz o tempo de ciclo medir diagramação em vez de calendário. '
  'Recusa etapa que não seja `album` e caso CANCELADO; aceita caso ENCERRADO, '
  'porque o fotolivro sobrevive à entrega (mesma razão do vídeo horizontal).';

revoke all on function public.mover_album(uuid, public.fase_album) from public;
grant execute on function public.mover_album(uuid, public.fase_album) to authenticated;


-- -----------------------------------------------------------------------------
-- 4. O FOTOLIVRO NÃO SEGURA MAIS O ENCERRAMENTO (decisão do gestor, 10/09/2026).
--
-- É a mesma exceção que o vídeo horizontal ganhou em 20260903153101, pelo mesmo
-- motivo e com um agravante. O motivo: o trabalho leva semanas, tem fluxo
-- próprio na seção, e a família já recebeu fotos e reels muito antes. O
-- agravante: a maior parte da esteira do fotolivro é ESPERA POR GENTE DE FORA —
-- o cliente pagar, o cliente aprovar, a gráfica imprimir. Segurar o
-- encerramento nisso prenderia o card na lista do dia por um mês por causa de
-- trabalho que a equipe não pode acelerar nem terminar.
--
-- As duas funções abaixo são as de 20260906151515 sem uma vírgula mudada, com a
-- exceção ampliada de um tipo para dois — migration é imutável, então a
-- alteração é arquivo novo (seção 5 do CLAUDE.md).
--
-- O QUE NÃO MUDA: o caso continua precisando de ao menos um entregável, e toda
-- outra etapa continua tendo que estar concluída ou dispensada. E o fotolivro
-- continua aparecendo — em Concluídos o cartão ganha selo, como o vídeo.
-- -----------------------------------------------------------------------------

create or replace function public.liberar_para_entrega(p_caso_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id          uuid;
  v_status_operacional public.status_operacional;
  v_liberado_em        timestamptz;
  v_pendentes          text;
  v_tem_entregavel     boolean;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select c.status_operacional, c.liberado_para_entrega_em
    into v_status_operacional, v_liberado_em
  from public.casos c
  where c.id = p_caso_id
  for update;

  if not found then
    raise exception 'Caso % não encontrado.', p_caso_id;
  end if;

  if v_status_operacional in ('encerrado', 'cancelado') then
    raise exception
      'Caso % já está em status terminal ("%") — não há o que enviar para Entregas.',
      p_caso_id, v_status_operacional;
  end if;

  -- Idempotente: dois toques no botão, ou duas pessoas ao mesmo tempo, não
  -- reescrevem quem foi o primeiro. O crédito do envio é de quem enviou.
  if v_liberado_em is not null then
    return;
  end if;

  -- DUAS exceções agora: o vídeo horizontal do MASTER (20260903153101) e o
  -- FOTOLIVRO (20260910150425). Os dois têm o mesmo formato de problema — fluxo
  -- próprio na seção, semanas de duração, e trabalho que sobrevive à entrega das
  -- fotos. O fotolivro é ainda mais extremo: a maior parte da esteira dele é
  -- espera por gente de fora (cliente pagar, cliente aprovar, gráfica imprimir),
  -- então segurar o encerramento nele prenderia o card na lista do dia por um
  -- mês por causa de trabalho que a equipe nem pode acelerar.
  select string_agg(ce.tipo::text, ', ' order by ce.rodada, ce.ordem)
    into v_pendentes
  from public.caso_etapas ce
  where ce.caso_id = p_caso_id
    and ce.tipo not in ('edicao_video', 'album')
    and ce.status not in ('concluida', 'dispensada');

  if v_pendentes is not null then
    raise exception
      'Caso % tem etapa em aberto (%) — conclua ou dispense antes de enviar para Entregas.',
      p_caso_id, v_pendentes;
  end if;

  select exists(
    select 1 from public.entregaveis e where e.caso_id = p_caso_id
  ) into v_tem_entregavel;

  if not v_tem_entregavel then
    raise exception
      'Caso % não tem nenhum link registrado — registre ao menos um antes de enviar para Entregas.',
      p_caso_id;
  end if;

  update public.casos
     set liberado_para_entrega_em  = now(),
         liberado_para_entrega_por = v_pessoa_id
   where id = p_caso_id;

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_caso_id,
    v_pessoa_id,
    'caso_liberado_para_entrega',
    jsonb_build_object('caso_id', p_caso_id),
    now()
  );
end;
$$;

create or replace function public.confirmar_entrega(p_caso_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id          uuid;
  v_status_operacional public.status_operacional;
  v_status_entrega     public.status_entrega;
  v_tem_entregavel     boolean;
  v_pendentes          text;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  if not (public.eh_atendimento() or public.eh_adm()) then
    raise exception 'Só atendimento ou adm podem confirmar entrega.';
  end if;

  select c.status_operacional, c.status_entrega
    into v_status_operacional, v_status_entrega
  from public.casos c
  where c.id = p_caso_id
  for update;

  if not found then
    raise exception 'Caso % não encontrado.', p_caso_id;
  end if;

  if v_status_operacional in ('encerrado', 'cancelado') then
    raise exception
      'Caso % já está em status terminal ("%") — não pode confirmar entrega.',
      p_caso_id, v_status_operacional;
  end if;

  if v_status_entrega = 'confirmado' then
    raise exception 'Caso % já tem entrega confirmada.', p_caso_id;
  end if;

  -- O trabalho tem que estar feito — EXCETO o vídeo horizontal do MASTER, que
  -- segue sendo operado pela seção depois do encerramento (20260903153101).
  select string_agg(ce.tipo::text, ', ' order by ce.rodada, ce.ordem)
    into v_pendentes
  from public.caso_etapas ce
  where ce.caso_id = p_caso_id
    and ce.tipo not in ('edicao_video', 'album')
    and ce.status not in ('concluida', 'dispensada');

  if v_pendentes is not null then
    raise exception
      'Caso % tem etapa em aberto (%) — conclua ou dispense antes de encerrar.',
      p_caso_id, v_pendentes;
  end if;

  -- A trava antiga, e a que continua importando: não se encerra caso sem link.
  select exists(
    select 1 from public.entregaveis e where e.caso_id = p_caso_id
  ) into v_tem_entregavel;

  if not v_tem_entregavel then
    raise exception
      'Caso % não tem nenhum entregável registrado — registre ao menos um link antes de confirmar.',
      p_caso_id;
  end if;

  update public.entregaveis
     set confirmado_por = v_pessoa_id,
         confirmado_em  = now()
   where caso_id = p_caso_id
     and confirmado_por is null;

  update public.casos
     set status_entrega     = 'confirmado',
         status_operacional = 'encerrado'
   where id = p_caso_id;

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_caso_id,
    v_pessoa_id,
    'entrega_confirmada',
    jsonb_build_object(
      'caso_id', p_caso_id,
      -- Fica no evento porque é a diferença entre "acabou" e "acabou menos o
      -- que continua na esteira". Sem isto, daqui a um ano ninguém sabe
      -- reconstruir por que um caso encerrado tinha etapa aberta.
      'video_master_pendente', exists(
        select 1 from public.caso_etapas ce
        where ce.caso_id = p_caso_id
          and ce.tipo = 'edicao_video'
          and ce.status not in ('concluida', 'dispensada')
      ),
      'fotolivro_pendente', exists(
        select 1 from public.caso_etapas ce
        where ce.caso_id = p_caso_id
          and ce.tipo = 'album'
          and ce.status not in ('concluida', 'dispensada')
      )
    ),
    now()
  );
end;
$$;
