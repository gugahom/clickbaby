-- O VÍDEO DO MASTER PASSA POR ENTREGÁVEIS (21/09/2026, pedido do gestor).
--
-- O QUE ACONTECIA, medido no remoto no dia: 18 vídeos MASTER concluídos e só 3
-- links do tipo `video` no sistema. A maioria terminou pelo ✓ do cartão da seção,
-- que chama `concluir_etapa` direto — sem link nenhum e sem ninguém conferir. E o
-- caminho que pedia link (`finalizar_video_master`, 20260916180834) também
-- concluía na hora: "ao concluir no botão de finalizar, o card simplesmente
-- some".
--
-- O QUE O GESTOR PEDIU, nas palavras dele: o vídeo "precisa aparecer em
-- entregáveis, e ao sair de LÁ, aí sim pode sumir junto da seção de MASTER";
-- sinalizado "como VÍDEO, porque as fotos já foram entregues e o primeiro card
-- já foi — o que está passando mais uma vez nos entregáveis é apenas o vídeo". E
-- a finalização "precisa exigir os links referentes ao MASTER": o link do vídeo
-- E o WeTransfer (decisão dele, na mesma conversa).
--
-- É O MESMO ARRANJO DO FOTO/LIVRO (20260921202848), pelo mesmo motivo:
--
--   1. `enviar_video_para_entrega` — terminar a edição. Grava os DOIS links e
--      leva o vídeo para "Pronto para entrega", na mesma transação. O vídeo NÃO
--      conclui: fica na seção e aparece em Entregáveis.
--   2. `confirmar_entrega_do_video` — a Morgana confirma em Entregáveis. Aí sim
--      o vídeo conclui, os dois links viram confirmados, e o cartão sai da
--      seção. Atendimento ou adm, como toda confirmação de entrega.
--   3. `mover_video_master` ganha as travas: "Pronto para entrega" exige os dois
--      links (quem arrasta passa pelo diálogo; a trava é para quem não passar),
--      e "concluída" é só a confirmação do atendimento ou adm, a partir de
--      pronto. E PRONTO ABRE A PAUSA: o vídeo esperando o ADM não está sendo
--      editado, e sem isto os dias em Entregáveis entrariam no tempo de edição —
--      justamente o número que a empresa usa para cobrar (seção 9 do CLAUDE.md).
--   4. `finalizar_video_master` SAI. Ela era o caminho que concluía sem passar
--      por Entregáveis; mantê-la seria deixar a porta que este pedido fecha.
--
-- O WETRANSFER DO VÍDEO É UM TIPO PRÓPRIO (`video_wetransfer`), e não o
-- `wetransfer` de sempre: o caso já tem o WeTransfer das FOTOS, e a conferência
-- do envio do caso (DialogoConfirmarEntrega) exige "um wetransfer" — um vídeo
-- terminado antes do envio das fotos satisfaria essa caixa com o arquivo errado.
-- Mesmo argumento de 16/09 para o tipo `video`: a lista precisa dizer O QUE é
-- cada link.
--
-- O `concluir_etapa` NÃO muda, como no fotolivro: a tela deixa de oferecê-lo no
-- vídeo, e o banco continua aceitando.

-- -----------------------------------------------------------------------------
-- 1. O tipo do WeTransfer do vídeo
--
-- `add value` não pode ser USADO na mesma transação em que é criado — o valor só
-- aparece dentro do corpo das funções abaixo, resolvido na primeira execução.
-- -----------------------------------------------------------------------------

alter type public.tipo_entregavel add value if not exists 'video_wetransfer';


-- -----------------------------------------------------------------------------
-- 2. mover_video_master, com as travas
--
-- Repete a definição de 20260903153101. `create or replace` com a mesma
-- assinatura mantém os privilégios.
-- -----------------------------------------------------------------------------

create or replace function public.mover_video_master(
  p_caso_etapa_id uuid,
  p_fase          public.status_etapa
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
  v_status    public.status_etapa;
  v_terminal  public.status_operacional;
  v_pausado   timestamptz;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  if p_fase not in ('pendente', 'em_andamento', 'em_alteracao', 'pronto_para_entrega', 'concluida') then
    raise exception
      'Fase "%" não faz parte do fluxo do vídeo do MASTER.', p_fase;
  end if;

  select ce.caso_id, ce.tipo, ce.status, ce.pausado_em, c.status_operacional
    into v_caso_id, v_tipo, v_status, v_pausado, v_terminal
  from public.caso_etapas ce
  join public.casos c on c.id = ce.caso_id
  where ce.id = p_caso_etapa_id
  for update of ce;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_tipo <> 'edicao_video' then
    raise exception
      'O fluxo de fases é do vídeo horizontal do MASTER — etapa "%" não passa por ele.',
      v_tipo;
  end if;

  -- CANCELADO trava; ENCERRADO não (20260903153101): o vídeo sobrevive à
  -- entrega das fotos.
  if v_terminal = 'cancelado' then
    raise exception
      'Caso está cancelado — não se mexe no vídeo de um caso que caiu.';
  end if;

  if v_status = p_fase then
    return;
  end if;

  -- PRONTO EXIGE OS DOIS LINKS (21/09/2026). Quem chega pela tela já passou por
  -- `enviar_video_para_entrega`, que os grava antes. "Os dois" = um de cada tipo
  -- ainda não confirmado: o da entrega anterior (antes de um pedido de
  -- alteração) já foi conferido e não serve para esta.
  if p_fase = 'pronto_para_entrega' and (
       not exists (select 1 from public.entregaveis e
                    where e.caso_id = v_caso_id and e.tipo = 'video' and e.confirmado_em is null)
    or not exists (select 1 from public.entregaveis e
                    where e.caso_id = v_caso_id and e.tipo = 'video_wetransfer' and e.confirmado_em is null)
  ) then
    raise exception
      'Para ir para “Pronto para entrega” o vídeo precisa do link do vídeo e do WeTransfer.';
  end if;

  -- CONCLUÍDA É CONFIRMAÇÃO, NÃO FASE (21/09/2026): quem entrega é o ADM, em
  -- Entregáveis, e só o que está pronto.
  if p_fase = 'concluida' then
    if not (public.eh_atendimento() or public.eh_adm()) then
      raise exception
        'Quem confirma a entrega do vídeo é o atendimento ou a gestão, na aba Entregáveis.';
    end if;
    if v_status is distinct from 'pronto_para_entrega' then
      raise exception
        'Só se confirma a entrega do vídeo que está em “Pronto para entrega”.';
    end if;
  end if;

  update public.caso_etapas
     set status = p_fase,
         iniciado_em = case
           when p_fase = 'pendente' then iniciado_em
           else coalesce(iniciado_em, now())
         end,
         concluido_em = case when p_fase = 'concluida' then now() else null end,
         pausa_acumulada = pausa_acumulada
           + case when v_pausado is not null then now() - v_pausado
                  else interval '0' end,
         -- PRONTO ABRE A PAUSA (21/09/2026): esperando o ADM não é editando. As
         -- outras fases seguem fechando a janela, como sempre.
         pausado_em = case when p_fase = 'pronto_para_entrega' then now() else null end,
         responsavel_id = coalesce(responsavel_id, v_pessoa_id)
   where id = p_caso_etapa_id;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    p_caso_etapa_id,
    v_pessoa_id,
    'video_master_movido',
    jsonb_build_object(
      'caso_etapa_id', p_caso_etapa_id,
      'caso_id', v_caso_id,
      'de', v_status,
      'para', p_fase
    ),
    now()
  );
end;
$$;


-- -----------------------------------------------------------------------------
-- 3. enviar_video_para_entrega
-- -----------------------------------------------------------------------------

create or replace function public.enviar_video_para_entrega(
  p_caso_etapa_id    uuid,
  p_link_video       text,
  p_link_wetransfer  text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id  uuid;
  v_caso_id    uuid;
  v_tipo       public.etapa_tipo;
  v_status     public.status_etapa;
  v_video      text := nullif(btrim(coalesce(p_link_video, '')), '');
  v_wetransfer text := nullif(btrim(coalesce(p_link_wetransfer, '')), '');
  v_substituidos integer;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  if v_video is null or v_wetransfer is null then
    raise exception 'Para finalizar o vídeo são obrigatórios o link do vídeo e o WeTransfer.';
  end if;

  if v_video !~* '^https?://' or v_wetransfer !~* '^https?://' then
    raise exception 'Os links precisam começar com http:// ou https://.';
  end if;

  select ce.caso_id, ce.tipo, ce.status into v_caso_id, v_tipo, v_status
  from public.caso_etapas ce
  where ce.id = p_caso_etapa_id
  for update;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_tipo <> 'edicao_video' then
    raise exception 'Só o vídeo horizontal do MASTER se finaliza por aqui — esta etapa é "%".', v_tipo;
  end if;

  if v_status = 'pronto_para_entrega' then
    raise exception 'Este vídeo já está em Entregáveis, esperando a confirmação da entrega.';
  end if;

  if v_status in ('concluida', 'dispensada') then
    raise exception 'Este vídeo já foi entregue. Para uma nova versão, peça alteração.';
  end if;

  -- Uma versão pendente de conferência de antes (a edição voltou de pronto para
  -- editando sem ninguém confirmar) sai do caminho: o que vale é o par novo.
  -- Só os NÃO confirmados — o que já foi entregue à família é histórico.
  delete from public.entregaveis
   where caso_id = v_caso_id
     and tipo in ('video', 'video_wetransfer')
     and confirmado_em is null;
  get diagnostics v_substituidos = row_count;

  insert into public.entregaveis (caso_id, tipo, url, criado_por)
  values (v_caso_id, 'video', v_video, v_pessoa_id),
         (v_caso_id, 'video_wetransfer', v_wetransfer, v_pessoa_id);

  perform public.mover_video_master(p_caso_etapa_id, 'pronto_para_entrega');

  -- Sem as URLs no payload: são credenciais de acesso da família (seção 10).
  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id, p_caso_etapa_id, v_pessoa_id, 'video_enviado_para_entrega',
    -- `links_substituidos`: quantos links de uma versão anterior, ainda não
    -- conferidos, saíram para dar lugar a estes. É o rastro da troca.
    jsonb_build_object('caso_etapa_id', p_caso_etapa_id, 'status_anterior', v_status,
                       'links_substituidos', v_substituidos),
    now()
  );
end;
$$;

comment on function public.enviar_video_para_entrega(uuid, text, text) is
  'Termina a edição do vídeo do MASTER: grava o link do vídeo e o WeTransfer e leva a etapa para "Pronto para entrega", na mesma transação. NÃO conclui — o vídeo aparece em Entregáveis e sai só com confirmar_entrega_do_video. Qualquer pessoa ativa.';

revoke all on function public.enviar_video_para_entrega(uuid, text, text) from public, anon;
grant execute on function public.enviar_video_para_entrega(uuid, text, text) to authenticated;


-- -----------------------------------------------------------------------------
-- 4. confirmar_entrega_do_video
-- -----------------------------------------------------------------------------

create or replace function public.confirmar_entrega_do_video(p_caso_etapa_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_caso_id   uuid;
  v_tipo      public.etapa_tipo;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select ce.caso_id, ce.tipo into v_caso_id, v_tipo
  from public.caso_etapas ce
  where ce.id = p_caso_etapa_id;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_tipo <> 'edicao_video' then
    raise exception 'Só o vídeo do MASTER se confirma por aqui.';
  end if;

  -- A trava de papel e de fase mora em `mover_video_master` — uma definição só
  -- de "quem conclui o vídeo".
  perform public.mover_video_master(p_caso_etapa_id, 'concluida');

  -- Os dois links desta entrega passam a contar como conferidos, como os do
  -- caso em `confirmar_entrega`: link confirmado não se apaga.
  update public.entregaveis
     set confirmado_em  = now(),
         confirmado_por = v_pessoa_id
   where caso_id = v_caso_id
     and tipo in ('video', 'video_wetransfer')
     and confirmado_em is null;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id, p_caso_etapa_id, v_pessoa_id, 'video_entregue',
    jsonb_build_object('caso_etapa_id', p_caso_etapa_id),
    now()
  );
end;
$$;

comment on function public.confirmar_entrega_do_video(uuid) is
  'A Morgana confirma em Entregáveis que o vídeo do MASTER foi entregue: a etapa conclui (sai da seção) e os dois links viram confirmados. Atendimento ou adm, e só a partir de "Pronto para entrega" — as travas moram em mover_video_master.';

revoke all on function public.confirmar_entrega_do_video(uuid) from public, anon;
grant execute on function public.confirmar_entrega_do_video(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 5. finalizar_video_master sai
-- -----------------------------------------------------------------------------

drop function public.finalizar_video_master(uuid, text);
