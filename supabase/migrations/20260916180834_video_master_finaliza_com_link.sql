-- =============================================================================
-- O VÍDEO DO MASTER TERMINA COM O LINK — "pronto para entrega" e "enviado /
-- finalizado" viram um estado só.
--
-- PEDIDO DO GESTOR (16/09/2026): "os dois status são redundantes". E estavam:
-- o fluxo do Trello trazia PRONTO PARA ENTREGA e ENVIADO / FINALIZADO como
-- colunas diferentes, e na prática a editora marcava as duas no mesmo minuto —
-- a segunda só dizia que alguém tinha mandado o link, que é justamente o gesto
-- que ninguém registrava em lugar nenhum.
--
-- Agora é UM gesto: a editora escolhe "Pronto para entrega", a tela pede o LINK
-- do vídeo, e com ele o vídeo é finalizado. Sem link não termina — a mesma
-- ideia que vale no envio do caso para Entregáveis desde 15/09.
--
-- POR QUE UMA RPC NOVA, e não `registrar_entregavel` seguido de
-- `mover_video_master`: as duas coisas precisam acontecer JUNTAS ou nenhuma.
-- Meio caminho produz um link órfão num vídeo que continua aberto, ou — pior —
-- um vídeo marcado como entregue sem endereço nenhum para a família, que é
-- exatamente o estado que a regra veio impedir. É o mesmo argumento de
-- `concluir_etapa_com_entregaveis` (20260904190000).
--
-- `mover_video_master` CONTINUA aceitando 'concluida': a regra comercial vive
-- na tela (o seletor não oferece mais essa fase), e a RPC segue sendo o caminho
-- de quem precisa corrigir a fase sem inventar um link. O que a tela oferece é
-- esta função.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. O tipo de entregável que faltava
--
-- `tipo_entregavel` tinha google_photos, wetransfer, cadeado, reels e album — o
-- horizontal do MASTER nunca teve o seu, porque até hoje ele não era entregue
-- pelo sistema. Tipo PRÓPRIO e não "wetransfer" (decisão do gestor): o meio
-- pelo qual o arquivo viaja muda com o tamanho do vídeo, e o que a lista do
-- caso precisa dizer é O QUE é aquele link, não por onde ele foi.
--
-- `add value` não pode ser USADO na mesma transação em que é criado — por isso
-- o valor só aparece dentro do corpo da função abaixo, que é resolvido na
-- primeira execução, e não na criação.
-- -----------------------------------------------------------------------------

alter type public.tipo_entregavel add value if not exists 'video';


-- -----------------------------------------------------------------------------
-- 2. finalizar_video_master
--
-- ACEITA CASO ENCERRADO, como `mover_video_master`: desde 20260903153101 o caso
-- encerra sem esperar o horizontal, então a esmagadora maioria dos vídeos é
-- finalizada depois do caso fechar. Cancelado continua recusado.
--
-- NÃO EXIGE PLAY ANTES. `concluir_etapa` exige `iniciado_em` na pós-produção
-- (20260825051226) para o tempo de ciclo não vir zero, e aqui a guarda seria
-- pior que o remédio: um vídeo que nasceu junto com o caso e foi editado antes
-- de alguém tocar no play ficaria sem caminho de saída. O carimbo é preenchido
-- com `now()` quando falta — o ciclo fica zero e diz a verdade: ninguém marcou
-- o início.
-- -----------------------------------------------------------------------------

create or replace function public.finalizar_video_master(
  p_caso_etapa_id uuid,
  p_url           text
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
  v_url       text;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  v_url := btrim(coalesce(p_url, ''));

  if v_url = '' then
    raise exception 'O link do vídeo é obrigatório para finalizar.';
  end if;

  select ce.caso_id, ce.tipo, ce.status, c.status_operacional
    into v_caso_id, v_tipo, v_status, v_terminal
  from public.caso_etapas ce
  join public.casos c on c.id = ce.caso_id
  where ce.id = p_caso_etapa_id
  for update of ce;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_tipo <> 'edicao_video' then
    raise exception
      'Só o vídeo horizontal do MASTER se finaliza por aqui — esta etapa é "%".', v_tipo;
  end if;

  if v_terminal = 'cancelado' then
    raise exception 'Caso cancelado: o vídeo não se finaliza.';
  end if;

  if v_status = 'concluida' then
    raise exception 'Este vídeo já está finalizado.';
  end if;

  insert into public.entregaveis (caso_id, tipo, url, criado_por)
  values (v_caso_id, 'video', v_url, v_pessoa_id);

  update public.caso_etapas
     set status       = 'concluida',
         -- Fecha a pausa aberta antes de carimbar o fim: sem isto o intervalo
         -- em que ninguém trabalhou entraria no tempo de ciclo.
         pausa_acumulada = pausa_acumulada
           + case when pausado_em is not null then now() - pausado_em else interval '0' end,
         pausado_em   = null,
         iniciado_em  = coalesce(iniciado_em, now()),
         concluido_em = now()
   where id = p_caso_etapa_id;

  -- DOIS FATOS, DOIS EVENTOS: o link entrou e o vídeo terminou. O mesmo par que
  -- `concluir_etapa_com_entregaveis` grava — e a URL fica fora do payload, que
  -- é telemetria (seção 10 do CLAUDE.md): ela mora em `entregaveis`.
  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    v_pessoa_id,
    'entregavel_registrado',
    jsonb_build_object('caso_id', v_caso_id, 'tipo', 'video'),
    now()
  );

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    p_caso_etapa_id,
    v_pessoa_id,
    'video_master_finalizado',
    jsonb_build_object(
      'caso_etapa_id', p_caso_etapa_id,
      'caso_id', v_caso_id,
      'status_anterior', v_status
    ),
    now()
  );
end;
$$;

comment on function public.finalizar_video_master(uuid, text) is
  'Fecha o vídeo horizontal do MASTER registrando o link na MESMA transação: entregável do tipo video + etapa concluída. Une as fases "pronto para entrega" e "enviado / finalizado", que o gestor considerou redundantes (16/09/2026). Qualquer pessoa ativa. Aceita caso encerrado; recusa cancelado, etapa de outro tipo, vídeo já finalizado e link vazio.';

revoke all on function public.finalizar_video_master(uuid, text) from public;
revoke all on function public.finalizar_video_master(uuid, text) from anon;
grant execute on function public.finalizar_video_master(uuid, text) to authenticated;
