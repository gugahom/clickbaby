-- =============================================================================
-- AS FASES DO TRABALHO DE CAMPO (28/09/2026, pedido do gestor).
--
-- "Precisamos de um local para definir fases em 2 etapas. (…) essas etapas
-- servem para conhecimento da gestão de que pé está o trabalho sendo realizado,
-- para evitar mostrar 4 horas de nascimento ou algo assim."
--
--   ENTRADA      Deslocamento/recebimento · Aguardando internamento
--   NASCIMENTO   Admissão CCO · Nascimento · Cuidados
--
-- O PROBLEMA É DE LEITURA, e ele é real: a etapa de nascimento engloba a
-- admissão no centro cirúrgico, o parto e os cuidados com o bebê. Na fita do
-- card isso vira "Nascimento — 4h", e quem lê de longe entende um parto de
-- quatro horas. A etapa sempre mediu bem o TRABALHO e nunca disse nada sobre o
-- PÉ em que ele estava.
--
-- POR QUE NÃO SÃO ETAPAS. Etapa é unidade de trabalho: tem responsável,
-- handoff, relógio de ciclo, precedência e entra no "x de y" do dia. Quebrar o
-- nascimento em três multiplicaria o checklist de todo caso do sistema e
-- pediria play/pause dentro de um centro cirúrgico — que é exatamente onde
-- ninguém toca no aparelho. A fase é um ESTADO da etapa, declarado num toque.
--
-- POR QUE NÃO É `situacao_clinica`. Aquela coluna descreve a MÃE (aguardando,
-- internada, indução, trabalho de parto, nasceu, UTI, alta); esta descreve o
-- TRABALHO DA FOTÓGRAFA — deslocamento e admissão no CCO não são estado clínico
-- de ninguém. As duas se encostam em "aguardando internamento", e encosto não é
-- duplicata: uma diz onde a FAMÍLIA está, a outra o que a EQUIPE está fazendo.
-- O resto vale dizer em voz alta: `situacao_clinica` está morta na prática (300
-- dos 313 casos no valor padrão, nenhuma tela a escreve — é a dívida #4), e é
-- esta coluna nova que a operação vai de fato preencher.
--
-- A FASE NÃO É O STATUS, e aqui a diferença é mais forte que no fotolivro
-- (20260910150425): as cinco fases são TODAS trabalho acontecendo. Dirigindo
-- para a maternidade, esperando o internamento, no CCO ou nos cuidados, a
-- fotógrafa está trabalhando o tempo todo. Por isso esta RPC não toca em
-- `status`, em `iniciado_em`, na pausa nem em nada do relógio da etapa: quem
-- diz se há trabalho em curso continua sendo o play/pause, e uma segunda fonte
-- para a mesma pergunta é a divergência que a seção 13 manda evitar.
--
-- A FASE NÃO NASCE SOZINHA NO PLAY (decisão do gestor). Podia: dar play na
-- entrada é quase sempre sair de casa. Ele preferiu que nada seja afirmado sem
-- gesto humano — o mesmo princípio do termo e da avaliação da família —, então
-- a etapa iniciada mostra "Definir fase" até alguém dizer a primeira.
--
-- O QUE VAI VIRAR MÉTRICA. `fase_campo_em` é só quando a fase ATUAL começou, e
-- existe para a tela mostrar "Cuidados · 12min" sem ler `eventos` a cada
-- recarga do Quadro. O histórico completo — por quais fases a etapa passou e
-- quanto durou cada uma — fica em `eventos`, append-only, que é de onde os
-- relatórios vão tirar a conta. Guardar duração acumulada numa coluna seria um
-- segundo lugar dizendo o que os eventos já dizem, e o primeiro a ficar velho.
-- =============================================================================

create type public.fase_de_campo as enum (
  'deslocamento_recebimento',
  'aguardando_internamento',
  'admissao_cco',
  'nascimento',
  'cuidados'
);

comment on type public.fase_de_campo is
  'Em que pé está o trabalho de campo, dentro da etapa. As duas primeiras são da ENTRADA, as três últimas do NASCIMENTO — a constraint caso_etapas_fase_campo_valida amarra cada valor à sua etapa. Não confundir com situacao_clinica, que é o estado da mãe e do bebê: esta é o estado do trabalho da fotógrafa.';


alter table public.caso_etapas
  add column fase_campo    public.fase_de_campo,
  add column fase_campo_em timestamptz;

comment on column public.caso_etapas.fase_campo is
  'Fase do trabalho de campo. Nula em toda etapa que não seja entrada ou nascimento, e nula nessas duas até alguém declarar a primeira — a fase não nasce com o play (decisão do gestor). É ORTOGONAL ao status: as cinco fases são trabalho acontecendo, e quem diz se há trabalho em curso continua sendo o play/pause. Escreve-se só por mover_fase_de_campo.';

comment on column public.caso_etapas.fase_campo_em is
  'Quando a fase ATUAL começou — é o relógio que o card mostra ao lado dela ("Cuidados · 12min"), no lugar do total da etapa, que lido de longe parecia um parto de quatro horas. O histórico das fases anteriores está em eventos (fase_de_campo_registrada), com quanto durou cada uma.';

alter table public.caso_etapas
  -- O ESPELHO DESTA REGRA VIVE EM DOIS LUGARES, de propósito: aqui, que é a
  -- trava de verdade, e na mensagem de erro de mover_fase_de_campo, para quem
  -- errar receber uma frase em vez de uma violação de constraint. Mudou uma
  -- fase de etapa, mude nos dois — ou em nenhum.
  add constraint caso_etapas_fase_campo_valida check (
    fase_campo is null
    or (tipo = 'entrada'    and fase_campo in ('deslocamento_recebimento', 'aguardando_internamento'))
    or (tipo = 'nascimento' and fase_campo in ('admissao_cco', 'nascimento', 'cuidados'))
  ),
  -- Fase sem carimbo seria fase sem relógio, e carimbo sem fase seria um
  -- relógio contando nada. Os dois andam juntos porque só uma RPC os escreve.
  add constraint caso_etapas_fase_campo_carimbada check (
    (fase_campo is null) = (fase_campo_em is null)
  );

-- Parcial: a esmagadora maioria das etapas do sistema nunca terá fase (só
-- entrada e nascimento têm), e é por fase que o relatório vai agrupar.
create index caso_etapas_fase_campo_idx
  on public.caso_etapas (fase_campo, fase_campo_em)
  where fase_campo is not null;


-- -----------------------------------------------------------------------------
-- A ÚNICA PORTA DE ESCRITA.
--
-- QUALQUER PESSOA ATIVA move a fase, e isso não é frouxidão: quem sabe que o
-- bebê nasceu é quem está na sala. Exigir papel aqui poria a coordenação entre
-- o parto e o registro dele, que é o oposto do que a gestão pediu — ela quer
-- saber o pé em que o trabalho está AGORA.
--
-- ACEITA ETAPA EM QUALQUER STATUS, inclusive pendente e concluída: campo admite
-- registro retroativo (seção 9 do CLAUDE.md), e quem fotografa um parto nem
-- sempre pode tocar no aparelho na hora. A TELA é mais estrita — só oferece o
-- seletor em etapa aberta —, que é o arranjo de sempre.
--
-- NÃO EXISTE APAGAR. Fase errada se corrige escolhendo outra; voltar para "sem
-- fase" afirmaria que o trabalho não começou, e nenhuma tela precisa disso.
-- -----------------------------------------------------------------------------

create function public.mover_fase_de_campo(
  p_caso_etapa_id uuid,
  p_fase          public.fase_de_campo
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
  v_fase      public.fase_de_campo;
  v_desde     timestamptz;
  v_terminal  public.status_operacional;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  if p_fase is null then
    raise exception 'Escolha uma fase para a etapa.';
  end if;

  select ce.caso_id, ce.tipo, ce.fase_campo, ce.fase_campo_em, c.status_operacional
    into v_caso_id, v_tipo, v_fase, v_desde, v_terminal
  from public.caso_etapas ce
  join public.casos c on c.id = ce.caso_id
  where ce.id = p_caso_etapa_id
  for update of ce;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_tipo not in ('entrada', 'nascimento') then
    raise exception
      'Só a entrada e o nascimento têm fases de campo — a etapa "%" não tem.',
      v_tipo;
  end if;

  -- Espelho da constraint caso_etapas_fase_campo_valida (ver acima).
  if (v_tipo = 'entrada'    and p_fase not in ('deslocamento_recebimento', 'aguardando_internamento'))
  or (v_tipo = 'nascimento' and p_fase not in ('admissao_cco', 'nascimento', 'cuidados')) then
    raise exception 'A fase "%" não é da etapa "%".', p_fase, v_tipo;
  end if;

  -- Cancelado, não: contrato que caiu não tem trabalho de campo para andar. O
  -- ENCERRADO passa, pelo mesmo motivo do registro retroativo acima.
  if v_terminal = 'cancelado' then
    raise exception 'Caso cancelado — não se registra fase de um atendimento que não aconteceu.';
  end if;

  if v_fase is not distinct from p_fase then
    return;  -- já está nesta fase; nada mudou, nada a registrar
  end if;

  update public.caso_etapas
     set fase_campo    = p_fase,
         fase_campo_em = now()
   where id = p_caso_etapa_id;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    p_caso_etapa_id,
    v_pessoa_id,
    'fase_de_campo_registrada',
    jsonb_build_object(
      'etapa', v_tipo,
      'fase', p_fase,
      -- O anterior e quanto ele durou: é daqui que o relatório tira "quanto
      -- tempo se passa em cada fase", sem precisar parear eventos depois.
      -- Nulos na primeira fase declarada, que não tem anterior.
      'fase_anterior', v_fase,
      'segundos_na_anterior',
        case when v_desde is null then null
             else extract(epoch from (now() - v_desde))::int
        end
    ),
    now()
  );
end;
$$;

comment on function public.mover_fase_de_campo(uuid, public.fase_de_campo) is
  'Declara em que pé está o trabalho de campo: deslocamento/recebimento e aguardando internamento na ENTRADA; admissão CCO, nascimento e cuidados no NASCIMENTO. É a única porta de escrita de fase_campo, e carimba fase_campo_em junto. Qualquer pessoa ativa — quem sabe que o bebê nasceu é quem está na sala. NÃO toca no status nem no relógio da etapa: a fase diz onde o trabalho está, o play/pause diz se ele acontece agora. Aceita etapa em qualquer status (campo admite registro retroativo) e caso encerrado; recusa cancelado. Fase igual à gravada não gera evento.';

revoke all on function public.mover_fase_de_campo(uuid, public.fase_de_campo) from public, anon;
grant execute on function public.mover_fase_de_campo(uuid, public.fase_de_campo) to authenticated;
