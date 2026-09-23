-- =============================================================================
-- A SEÇÃO CLICK HOME — o ensaio newborn ganha esteira própria (22/09/2026,
-- pedido do gestor: "ele funciona como master e foto/livro, vamos criar a
-- seção dele assim como funciona com esses outros 2").
--
-- O QUE É. O CLICK HOME é o ensaio do recém-nascido na casa da família, vendido
-- junto com um pacote de parto e realizado 10 a 12 dias depois da entrega. Na
-- agenda ele é um sufixo no título do evento do PARTO — "STANDARD + CLICK
-- HOME" —, e é o único lugar onde ele aparece: **não existe um segundo evento
-- no Calendar** quando a sessão é marcada (confirmado com o gestor). A data
-- combinada entra pelo prazo do cartão (`agendar_etapa`), como no vídeo e no
-- fotolivro.
--
-- AS CINCO FASES são as colunas do quadro que ele mostrou, nessa ordem:
-- Aguardando edição · Editando · Criar galeria online · Enviar para escolha ·
-- Finalizado. Não há fase antes delas (decisão do gestor): o cartão nasce em
-- "Aguardando edição", com o ensaio já feito.
--
-- DUAS FASES SÃO TRABALHO, e por isso o status vira `em_andamento` nelas:
-- "Editando" e "Criar galeria online" — nas duas alguém está sentado na
-- estação. As outras são espera e viram `pausada`, pelo mesmo motivo do
-- fotolivro: é o que faz o tempo de ciclo medir TRABALHO e não calendário.
--
-- O FIM PASSA POR ENTREGÁVEIS (decisão do gestor), como o vídeo e o fotolivro:
-- "Enviar para escolha" exige o LINK da galeria, o cartão aparece na aba
-- Entregáveis sinalizado como CLICK HOME, e "Finalizado" é a confirmação da
-- Morgana ali. Sem isso, o link da galeria seria de novo aquilo que ninguém
-- registra — foi o que aconteceu com o vídeo até 21/09 (18 concluídos, 3
-- links).
--
-- E ELE NÃO SEGURA O ENCERRAMENTO. É a TERCEIRA exceção, ao lado de
-- `edicao_video` e `album`, e a mais óbvia das três: o ensaio acontece 10 a 12
-- dias DEPOIS da entrega do pacote. Segurar o caso nele prenderia o cartão no
-- bloco do dia do parto por duas semanas, esperando um trabalho que nem
-- começou.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Ordem de leitura: depois de tudo.
--
-- 12, sem renumerar nada — mesma regra da 20260831133153: os números de 1 a 8
-- estão copiados em `pacote_etapas.ordem` desde o seed, e é o alinhamento entre
-- os dois que faz `adicionar_etapa` encaixar uma etapa avulsa no lugar certo.
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
    when 'click_home'      then 12
  end;
$$;

comment on function public.ordem_padrao_da_etapa(public.etapa_tipo) is
  'Ordem de leitura de uma etapa, igual em todos os pacotes. Existe para pacote_etapas.ordem e caso_etapas.ordem não divergirem entre si nem entre pacotes. Encontro de irmãos, saída de UTI e alta (31/08/2026) e o Click Home (22/09/2026) entram depois de álbum — nenhum pacote as inclui de fábrica.';

-- A TRILHA não precisa de mudança, e é de propósito: a coluna gerada manda
-- para `edicao` tudo que não é acompanhamento, e o Click Home é trabalho de
-- ilha — edição, galeria, entrega —, como o vídeo e o fotolivro. A sessão em
-- si acontece na casa da família e não na maternidade, então `acompanhamento`
-- (cuja definição é "acontece na maternidade") seria a palavra errada.


-- -----------------------------------------------------------------------------
-- 2. O contrato inclui o ensaio: casos.click_home
--
-- Por que uma coluna, e não só a existência da etapa: um RASCUNHO PENDENTE
-- chega do sync sem pacote e, portanto, sem etapa nenhuma. Se o sync criasse a
-- etapa ali, `gerar_caso_etapas` veria "este caso já tem etapa" na hora da
-- confirmação e NUNCA geraria as do pacote — a guarda dela é exatamente essa.
-- A coluna guarda o fato desde o primeiro sync, e a etapa nasce quando o caso
-- ganha pacote.
--
-- O QUE É VERDADE NA TELA É A ETAPA, não esta coluna: quem acrescenta o Click
-- Home à mão usa `adicionar_etapa` e não passa por aqui. A seção, o chip do
-- cartão e a aba gateiam por TIPO DE ETAPA, como a do fotolivro.
-- -----------------------------------------------------------------------------

alter table public.casos
  add column click_home boolean not null default false;

comment on column public.casos.click_home is
  'O contrato inclui o ensaio CLICK HOME (newborn na casa da família). Escrito pelo sync quando o título do evento traz "+ CLICK HOME", e por ninguém mais. É a MEMÓRIA do sync, não a fonte da tela: quem decide se o caso tem o ensaio é a existência da etapa click_home — que esta coluna faz nascer quando o caso tem pacote.';


-- -----------------------------------------------------------------------------
-- 3. As cinco fases.
-- -----------------------------------------------------------------------------

create type public.fase_click_home as enum (
  'aguardando_edicao',
  'editando',
  'criar_galeria',
  'enviar_para_escolha',
  'finalizado'
);

comment on type public.fase_click_home is
  'As cinco colunas do quadro do Click Home, na ordem da esteira. `criar_galeria` não diz o nome do serviço de galeria de propósito: trocar de fornecedor não pode pedir migration.';

alter table public.caso_etapas
  add column fase_click_home public.fase_click_home;

comment on column public.caso_etapas.fase_click_home is
  'Onde o ensaio Click Home está na esteira. NULO em toda etapa que não é click_home, e também no click_home que ninguém declarou ainda — a seção põe esse no topo, que é o que corre risco de ser esquecido. Escrita SÓ por mover_click_home, que grava status junto.';

create index caso_etapas_fase_click_home_idx
  on public.caso_etapas (fase_click_home)
  where fase_click_home is not null;


-- -----------------------------------------------------------------------------
-- 4. A etapa nasce com o caso — ou quando o sync descobre o adicional.
--
-- ARMADILHA DE ORDEM, e o nome desta trigger depende dela: o Postgres dispara
-- triggers da mesma tabela e do mesmo momento em ORDEM ALFABÉTICA, e
-- `gerar_caso_etapas` volta sem fazer nada quando o caso JÁ TEM alguma etapa.
-- Uma trigger chamada "garantir_etapa_do_click_home" rodaria ANTES
-- ("gar" < "ger") e o caso nasceria só com a etapa do ensaio, sem as do pacote.
-- Por isso "gerar_etapa_do_click_home": `gerar_caso_…` < `gerar_etapa_…`.
-- -----------------------------------------------------------------------------

create or replace function public.gerar_etapa_do_click_home()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Rascunho pendente: sem pacote não há checklist nenhum ainda. A coluna
  -- guarda o fato, e esta mesma trigger roda de novo na confirmação.
  if new.pacote_id is null then
    return new;
  end if;

  if exists (
    select 1 from public.caso_etapas ce
    where ce.caso_id = new.id and ce.tipo = 'click_home'
  ) then
    return new;
  end if;

  insert into public.caso_etapas (caso_id, tipo, status, ordem, rodada)
  values (new.id, 'click_home', 'pendente', public.ordem_padrao_da_etapa('click_home'), 1);

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    new.id,
    -- Sem ator: quem trouxe a informação foi o sync, lendo o título do evento.
    null,
    'click_home_do_contrato',
    jsonb_build_object('caso_id', new.id),
    now()
  );

  return new;
end;
$$;

comment on function public.gerar_etapa_do_click_home() is
  'Cria a etapa click_home quando o caso tem o adicional e já tem pacote. Idempotente: nunca cria a segunda. Não remove nada quando a marca some do título — etapa que existe pode ter trabalho feito, e o caminho para desfazer é dispensar pela tela.';

revoke all on function public.gerar_etapa_do_click_home() from public;

create trigger gerar_etapa_do_click_home_on_insert
  after insert on public.casos
  for each row
  when (new.click_home)
  execute function public.gerar_etapa_do_click_home();

comment on trigger gerar_etapa_do_click_home_on_insert on public.casos is
  'Roda DEPOIS de gerar_caso_etapas_on_insert (ordem alfabética das triggers), que é o que precisa ver o caso ainda sem etapa nenhuma.';

create trigger gerar_etapa_do_click_home_on_update
  after update of click_home, pacote_id on public.casos
  for each row
  when (new.click_home)
  execute function public.gerar_etapa_do_click_home();

comment on trigger gerar_etapa_do_click_home_on_update on public.casos is
  'Dois caminhos no mesmo gatilho: o sync descobre o "+ CLICK HOME" num caso que já existia, e o rascunho pendente ganha pacote. Roda depois de gerar_caso_etapas_on_update, pela ordem alfabética.';


-- -----------------------------------------------------------------------------
-- 5. mover_click_home — a única porta de escrita da fase.
--
-- Mesmo desenho de `mover_album`: fase e status na mesma transação, para as
-- duas nunca discordarem.
-- -----------------------------------------------------------------------------

create or replace function public.mover_click_home(
  p_caso_etapa_id uuid,
  p_fase          public.fase_click_home
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
  v_fase      public.fase_click_home;
  v_terminal  public.status_operacional;
  v_pausado   timestamptz;
  v_status    public.status_etapa;
  v_tem_link  boolean;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select ce.caso_id, ce.tipo, ce.fase_click_home, ce.pausado_em, c.status_operacional
    into v_caso_id, v_tipo, v_fase, v_pausado, v_terminal
  from public.caso_etapas ce
  join public.casos c on c.id = ce.caso_id
  where ce.id = p_caso_etapa_id
  for update of ce;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_tipo <> 'click_home' then
    raise exception
      'A esteira do Click Home é da etapa do ensaio — etapa "%" não passa por ela.',
      v_tipo;
  end if;

  -- Caso ENCERRADO segue operável, como o vídeo e o fotolivro: o ensaio
  -- acontece depois da entrega, então ele quase sempre roda com o caso
  -- fechado. Cancelado, não: contrato que caiu não tem ensaio.
  if v_terminal = 'cancelado' then
    raise exception
      'Caso cancelado — não se mexe no Click Home de um contrato que caiu.';
  end if;

  if v_fase is not distinct from p_fase then
    return;
  end if;

  -- "Enviar para escolha" é o que leva o ensaio para Entregáveis, e ele só
  -- significa alguma coisa com o LINK da galeria: é ele que a família abre.
  -- Quem passa pelo diálogo já o registrou (enviar_click_home_para_escolha);
  -- esta guarda é para quem chegar por outro caminho.
  if p_fase = 'enviar_para_escolha' then
    select exists(
      select 1 from public.entregaveis e
      where e.caso_id = v_caso_id
        and e.tipo = 'click_home'
        and e.confirmado_em is null
    ) into v_tem_link;

    if not v_tem_link then
      raise exception
        'Para mandar o Click Home para escolha é preciso o link da galeria.';
    end if;
  end if;

  -- O FIM É DA MORGANA, na aba Entregáveis — e só a partir da escolha.
  if p_fase = 'finalizado' then
    if not (public.eh_atendimento() or public.eh_adm()) then
      raise exception
        'Quem finaliza o Click Home é o atendimento ou a gestão, na aba Entregáveis.';
    end if;

    if v_fase is distinct from 'enviar_para_escolha' then
      raise exception
        'Só se finaliza o Click Home que já foi mandado para a escolha da família.';
    end if;
  end if;

  v_status := case p_fase
    -- As duas fases em que alguém está sentado na estação.
    when 'editando'   then 'em_andamento'::public.status_etapa
    when 'criar_galeria' then 'em_andamento'::public.status_etapa
    when 'finalizado' then 'concluida'::public.status_etapa
    else 'pausada'::public.status_etapa
  end;

  update public.caso_etapas
     set fase_click_home = p_fase,
         status      = v_status,
         iniciado_em = coalesce(iniciado_em, now()),
         concluido_em = case when p_fase = 'finalizado' then now() else null end,
         pausa_acumulada = pausa_acumulada
           + case when v_pausado is not null then now() - v_pausado
                  else interval '0' end,
         -- Esperar a família escolher não é tempo de edição: a pausa abre em
         -- toda fase de espera e fecha quando o trabalho volta.
         pausado_em = case when v_status = 'pausada' then now() else null end,
         responsavel_id = coalesce(responsavel_id, v_pessoa_id)
   where id = p_caso_etapa_id;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    p_caso_etapa_id,
    v_pessoa_id,
    'fase_do_click_home_movida',
    jsonb_build_object('de', v_fase, 'para', p_fase, 'status', v_status),
    now()
  );
end;
$$;

comment on function public.mover_click_home(uuid, public.fase_click_home) is
  'Move o ensaio Click Home na esteira. É a ÚNICA porta de escrita de fase_click_home, e grava o status junto na mesma transação — editando e criar_galeria viram em_andamento, finalizado vira concluida, e toda espera vira pausada (com a pausa aberta, para o ciclo medir trabalho e não calendário). "Enviar para escolha" exige o link da galeria; "finalizado" é do atendimento ou adm, e só a partir da escolha. Aceita caso encerrado — o ensaio acontece depois da entrega —, nunca cancelado.';

revoke all on function public.mover_click_home(uuid, public.fase_click_home) from public;
grant execute on function public.mover_click_home(uuid, public.fase_click_home) to authenticated;


-- -----------------------------------------------------------------------------
-- 6. enviar_click_home_para_escolha — o link e a fase, juntos.
--
-- Mesmo arranjo de `enviar_video_para_entrega`: meio caminho produziria um
-- ensaio "na escolha" que a família não tem como abrir, ou um link solto num
-- ensaio que ninguém mandou.
-- -----------------------------------------------------------------------------

create or replace function public.enviar_click_home_para_escolha(
  p_caso_etapa_id uuid,
  p_link          text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id    uuid;
  v_caso_id      uuid;
  v_tipo         public.etapa_tipo;
  v_fase         public.fase_click_home;
  v_link         text := btrim(coalesce(p_link, ''));
  v_substituidos integer;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  if v_link = '' then
    raise exception 'O link da galeria de escolha é obrigatório.';
  end if;

  if v_link !~* '^https?://' then
    raise exception 'O link precisa começar com http:// ou https://.';
  end if;

  select ce.caso_id, ce.tipo, ce.fase_click_home into v_caso_id, v_tipo, v_fase
  from public.caso_etapas ce
  where ce.id = p_caso_etapa_id
  for update;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_tipo <> 'click_home' then
    raise exception 'Só o ensaio Click Home vai para escolha por aqui — esta etapa é "%".', v_tipo;
  end if;

  if v_fase = 'finalizado' then
    raise exception 'Este Click Home já foi finalizado. Para uma galeria nova, mova a fase de volta.';
  end if;

  -- Uma galeria anterior que ninguém conferiu sai do caminho; o que já foi
  -- entregue à família fica, porque é histórico da entrega que aconteceu.
  delete from public.entregaveis
   where caso_id = v_caso_id
     and tipo = 'click_home'
     and confirmado_em is null;
  get diagnostics v_substituidos = row_count;

  insert into public.entregaveis (caso_id, tipo, url, criado_por)
  values (v_caso_id, 'click_home', v_link, v_pessoa_id);

  perform public.mover_click_home(p_caso_etapa_id, 'enviar_para_escolha');

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    p_caso_etapa_id,
    v_pessoa_id,
    'click_home_para_escolha',
    -- Sem a URL: link de entrega é credencial de acesso da família e não entra
    -- em eventos (seção 10). O que fica é a CONTAGEM do que foi substituído.
    jsonb_build_object('links_substituidos', v_substituidos),
    now()
  );
end;
$$;

comment on function public.enviar_click_home_para_escolha(uuid, text) is
  'Grava o link da galeria de escolha e leva o ensaio para a fase "Enviar para escolha", na mesma transação. O cartão passa a aparecer em Entregáveis; quem o tira de lá é confirmar_entrega_do_click_home. Qualquer pessoa ativa — quem acabou de montar a galeria é quem sabe que acabou.';

revoke all on function public.enviar_click_home_para_escolha(uuid, text) from public;
grant execute on function public.enviar_click_home_para_escolha(uuid, text) to authenticated;


-- -----------------------------------------------------------------------------
-- 7. confirmar_entrega_do_click_home — a conferência da Morgana.
-- -----------------------------------------------------------------------------

create or replace function public.confirmar_entrega_do_click_home(p_caso_etapa_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_caso_id   uuid;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select ce.caso_id into v_caso_id
  from public.caso_etapas ce
  where ce.id = p_caso_etapa_id;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  -- A checagem de papel e a de fase moram na mover_click_home, e é ela quem
  -- conclui a etapa — uma segunda definição de "finalizar" receberia só metade
  -- da próxima correção.
  perform public.mover_click_home(p_caso_etapa_id, 'finalizado');

  update public.entregaveis
     set confirmado_por = v_pessoa_id,
         confirmado_em  = now()
   where caso_id = v_caso_id
     and tipo = 'click_home'
     and confirmado_em is null;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    p_caso_etapa_id,
    v_pessoa_id,
    'click_home_entregue',
    jsonb_build_object('caso_etapa_id', p_caso_etapa_id),
    now()
  );
end;
$$;

comment on function public.confirmar_entrega_do_click_home(uuid) is
  'Fecha o Click Home na aba Entregáveis: finaliza a etapa (delegando a mover_click_home, que guarda a regra de papel e de fase) e confirma o link da galeria. Atendimento ou adm.';

revoke all on function public.confirmar_entrega_do_click_home(uuid) from public;
grant execute on function public.confirmar_entrega_do_click_home(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 8. sync_marcar_click_home — como o adicional chega do Calendar.
--
-- RPC PRÓPRIA, e não um parâmetro novo em `sync_upsert_caso`: acrescentar um
-- argumento cria uma segunda assinatura e deixa a chamada AMBÍGUA para a
-- Edge Function antiga, que roda a cada 25 segundos e é o intake principal do
-- sistema. Uma janela de minutos sem sync entre o push e o deploy seria um
-- preço alto por um argumento. Assim, a função velha continua chamando o que
-- sempre chamou, e a nova chama isto a mais quando o título traz o sufixo.
--
-- SÓ MARCA, nunca desmarca. Tirar "+ CLICK HOME" do título não desfaz um
-- ensaio que pode já ter sido fotografado; quem precisa desfazer dispensa a
-- etapa pela tela, que é o gesto da operação para "não vai acontecer".
-- -----------------------------------------------------------------------------

create or replace function public.sync_marcar_click_home(p_google_event_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caso_id uuid;
  v_marcado boolean;
begin
  select c.id, c.click_home into v_caso_id, v_marcado
  from public.casos c
  where c.google_calendar_event_id = p_google_event_id
  for update;

  if not found then
    return 'sem_caso';
  end if;

  if v_marcado then
    return 'sem_efeito';
  end if;

  update public.casos set click_home = true where id = v_caso_id;

  return 'marcado';
end;
$$;

comment on function public.sync_marcar_click_home(text) is
  'Marca que o contrato inclui o ensaio Click Home, lido do sufixo "+ CLICK HOME" no título do evento. Só service_role (a Edge Function do sync) — roda sem usuário logado, então não tem como checar auth.uid(). Idempotente, e só marca: desmarcar não existe.';

revoke all on function public.sync_marcar_click_home(text) from public, anon, authenticated;
grant execute on function public.sync_marcar_click_home(text) to service_role;


-- -----------------------------------------------------------------------------
-- 9. O Click Home não segura o encerramento — a TERCEIRA exceção.
--
-- `liberar_para_entrega` e `confirmar_entrega` recriadas inteiras, com um item
-- a mais na mesma lista. A lista tem espelho na tela (`NAO_SEGURAM_A_ENTREGA`,
-- em lib/acoes.ts) e os dois lados mudam juntos ou nenhum — foi a lição de
-- 14/09, quando o banco aceitava um caso que o botão recusava.
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

  if v_liberado_em is not null then
    return;
  end if;

  -- TRÊS exceções: o vídeo horizontal do MASTER (20260903153101), o FOTOLIVRO
  -- (20260910150425) e o CLICK HOME (20260922212901). Os três têm fluxo próprio
  -- numa seção, levam semanas, e sobrevivem à entrega das fotos — o ensaio
  -- newborn, aliás, só acontece 10 a 12 dias DEPOIS dela.
  select string_agg(ce.tipo::text, ', ' order by ce.rodada, ce.ordem)
    into v_pendentes
  from public.caso_etapas ce
  where ce.caso_id = p_caso_id
    and ce.tipo not in ('edicao_video', 'album', 'click_home')
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

  select string_agg(ce.tipo::text, ', ' order by ce.rodada, ce.ordem)
    into v_pendentes
  from public.caso_etapas ce
  where ce.caso_id = p_caso_id
    and ce.tipo not in ('edicao_video', 'album', 'click_home')
    and ce.status not in ('concluida', 'dispensada');

  if v_pendentes is not null then
    raise exception
      'Caso % tem etapa em aberto (%) — conclua ou dispense antes de encerrar.',
      p_caso_id, v_pendentes;
  end if;

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
      ),
      -- Sem isto, daqui a um ano ninguém reconstrói por que um caso encerrado
      -- tinha etapa aberta.
      'click_home_pendente', exists(
        select 1 from public.caso_etapas ce
        where ce.caso_id = p_caso_id
          and ce.tipo = 'click_home'
          and ce.status not in ('concluida', 'dispensada')
      )
    ),
    now()
  );
end;
$$;


-- -----------------------------------------------------------------------------
-- 10. O ARQUIVO também aprende o Click Home.
--
-- `quadro_casos.arquivado` tira da carga do Quadro o caso terminal que não tem
-- mais nada a mostrar, e a exceção dela é justamente o caso ENCERRADO com
-- trabalho aberto numa seção lateral. Sem o Click Home nessa lista, um caso
-- encerrado com o ensaio pela frente seria arquivado — e o cartão sumiria da
-- seção antes de o trabalho existir. É o mesmo defeito que a 20260909145223
-- descreve: quando uma coluna nova entra, quem ESCREVE nela é fácil de achar;
-- quem deveria LÊ-LA, não.
--
-- A view é recriada inteira porque `create or replace view` não aceita mudar
-- coluna nenhuma — só o corpo, com a MESMA lista de colunas.
-- -----------------------------------------------------------------------------

create or replace view public.quadro_casos
with (security_invoker = true) as
  select
    c.id,
    c.mae_nome,
    c.bebe_nome,
    c.previsao_em,
    (c.previsao_em at time zone 'America/Sao_Paulo')::date as dia,
    c.cor_calendar,
    c.observacao,
    c.situacao_clinica,
    c.status_operacional,
    c.status_entrega,
    c.termo_status,
    c.pacote_id,
    p.nome as pacote_nome,
    p.slug as pacote_slug,
    extract(epoch from p.prazo_entrega) / 3600::numeric as prazo_entrega_horas,
    c.maternidade_id,
    m.nome as maternidade_nome,
    m.sigla as maternidade_sigla,
    n.concluido_em as nascimento_concluido_em,
    case
      when p.prazo_dias_uteis is not null
        then public.somar_dias_uteis(coalesce(c.reaberto_em, n.concluido_em), p.prazo_dias_uteis)
      else coalesce(c.reaberto_em, n.concluido_em) + p.prazo_entrega
    end
      + c.uti_acumulada
      + case when c.uti_desde is not null then now() - c.uti_desde
             else '00:00:00'::interval end
      as vence_em,
    c.uti_desde,
    c.uti_desde is not null as na_uti,
    c.uti_desde is not null as sla_pausado,
    extract(epoch from c.uti_acumulada +
      case when c.uti_desde is not null then now() - c.uti_desde
           else '00:00:00'::interval end) / 3600::numeric as uti_horas_total,
    c.pacote_id is null as falta_pacote,
    c.maternidade_id is null as falta_maternidade,
    c.pacote_id is null or c.maternidade_id is null as eh_rascunho,
    c.status_operacional = any (array['encerrado'::status_operacional, 'cancelado'::status_operacional]) as eh_terminal,
    etapas.total::integer as etapas_total,
    etapas.concluidas::integer as etapas_concluidas,
    c.created_at,
    c.updated_at,
    p.prazo_dias_uteis,
    extract(epoch from (
      case
        when p.prazo_dias_uteis is not null
          then public.somar_dias_uteis(coalesce(c.reaberto_em, n.concluido_em), p.prazo_dias_uteis)
        else coalesce(c.reaberto_em, n.concluido_em) + p.prazo_entrega
      end - coalesce(c.reaberto_em, n.concluido_em)
    )) / 3600::numeric as prazo_total_horas,
    c.reaberto_em,
    c.liberado_para_entrega_em,
    lib.nome as liberado_para_entrega_por_nome,
    coalesce(gasto.total, 0) as total_despesas,
    c.motivo_cancelamento,
    -- ARQUIVADO: terminal, e nada que o Quadro mostre depende dele. Ver o
    -- cabeçalho desta migration.
    (
      c.status_operacional = any (array['encerrado'::status_operacional, 'cancelado'::status_operacional])
      -- 1. Encerrado com vídeo ou fotolivro aberto continua na seção.
      and not (
        c.status_operacional = 'encerrado'
        and c.id in (
          select s.caso_id
            from public.caso_etapas s
           where s.tipo in ('edicao_video', 'album', 'click_home')
             and s.status not in ('concluida', 'dispensada')
        )
      )
      -- 2. Dia que ainda tem caso em aberto: este caso entra na conta dele.
      --    `coalesce` porque `x in (...)` com x nulo dá nulo, e o nulo tem a
      --    própria regra logo abaixo.
      and not coalesce(
        (c.previsao_em at time zone 'America/Sao_Paulo')::date in (
          select (o.previsao_em at time zone 'America/Sao_Paulo')::date
            from public.casos o
           where o.status_operacional <> all (array['encerrado'::status_operacional, 'cancelado'::status_operacional])
             and o.previsao_em is not null
        ),
        false
      )
      -- 2b. O mesmo para o bloco "Sem data prevista".
      and not (
        c.previsao_em is null
        and exists (
          select 1
            from public.casos o
           where o.previsao_em is null
             and o.status_operacional <> all (array['encerrado'::status_operacional, 'cancelado'::status_operacional])
        )
      )
    ) as arquivado
  from public.casos c
    left join public.pacotes p on p.id = c.pacote_id
    left join public.maternidades m on m.id = c.maternidade_id
    left join public.pessoas lib on lib.id = c.liberado_para_entrega_por
    left join public.caso_etapas n on n.caso_id = c.id and n.tipo = 'nascimento'
    left join lateral (
      select count(*) as total,
             count(*) filter (where ce.status = 'concluida') as concluidas
      from public.caso_etapas ce
      where ce.caso_id = c.id
    ) etapas on true
    left join lateral (
      select sum(d.valor) as total
      from public.despesas d
      where d.caso_id = c.id
    ) gasto on true;
