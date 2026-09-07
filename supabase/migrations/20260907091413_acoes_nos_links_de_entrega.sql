-- =============================================================================
-- DUAS AÇÕES QUE FALTAVAM QUANDO O LINK SAI ERRADO.
--
-- O PEDIDO (gestor, 07/09/2026): na aba Entregáveis, poder EXCLUIR um link. O
-- caso real é a Morgana abrindo o álbum e vendo a galeria de outra família.
--
-- SÃO DUAS FALHAS DIFERENTES, e o desenho separa as duas de propósito:
--
--   1. LINK errado, TRABALHO certo — colou a URL do álbum vizinho. Precisa só
--      de link novo; reabrir a edição seria mandar refazer o que está pronto.
--   2. MATERIAL errado — a edição em si não presta. Para isso já existe
--      `reabrir_etapa`, e não é o que estas funções fazem.
--
-- POR ISSO EXCLUIR NÃO DEVOLVE O CASO SOZINHO. Apagar um link duplicado, com o
-- bom ainda no lugar, não pode mexer no caso — e um efeito colateral desses
-- surpreende justamente quem está consertando um erro. Devolver ao Quadro é
-- gesto próprio, com motivo, e fica em `eventos`.
-- =============================================================================


-- =============================================================================
-- remover_entregavel — apaga UM link.
--
-- QUALQUER PESSOA ATIVA, como em `registrar_entregavel`. Quem colou o link
-- errado é quem percebe primeiro, e obrigar a chamar o ADM para desfazer um
-- engano de digitação criaria fila para um gesto de dois segundos. O evento
-- guarda quem apagou.
--
-- LINK JÁ CONFIRMADO NÃO SE APAGA. Ele faz parte de uma entrega fechada: mexer
-- ali é reabrir o caso (`reabrir_caso`), não editar a lista por baixo. Sem esta
-- guarda, um caso encerrado poderia ficar sem nenhum entregável — e a
-- invariante 3.5 diz que encerrado exige ao menos um.
--
-- O EVENTO SOBREVIVE À LINHA. `eventos` é append-only: o `entregavel_registrado`
-- de quando o link entrou continua lá, e agora ganha o par que conta que ele
-- saiu. A url não entra em nenhum dos dois (seção 10) — o que se audita é que
-- um link daquele tipo existiu, por quem e quando.
-- =============================================================================

create or replace function public.remover_entregavel(
  p_entregavel_id uuid,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id     uuid;
  v_caso_id       uuid;
  v_tipo          public.tipo_entregavel;
  v_confirmado_em timestamptz;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select e.caso_id, e.tipo, e.confirmado_em
    into v_caso_id, v_tipo, v_confirmado_em
  from public.entregaveis e
  where e.id = p_entregavel_id
  for update;

  if not found then
    raise exception 'Link % não encontrado.', p_entregavel_id;
  end if;

  if v_confirmado_em is not null then
    raise exception
      'Este link já foi confirmado na entrega e não pode ser apagado. Para mexer nele, reabra o caso.';
  end if;

  delete from public.entregaveis where id = p_entregavel_id;

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    v_pessoa_id,
    'entregavel_removido',
    jsonb_build_object(
      'caso_id', v_caso_id,
      'tipo', v_tipo,
      'motivo', nullif(btrim(coalesce(p_motivo, '')), '')
    ),
    now()
  );
end;
$$;

comment on function public.remover_entregavel(uuid, text) is
  'Apaga um link de entrega. Qualquer pessoa ativa pode chamar — quem colou o link '
  'errado é quem percebe primeiro. Link JÁ CONFIRMADO é recusado: ele faz parte de '
  'uma entrega fechada, e mexer nele é reabrir o caso. A url nunca entra no evento '
  '(seção 10); o `entregavel_registrado` original permanece, porque eventos é '
  'append-only.';

revoke all on function public.remover_entregavel(uuid, text) from public, anon;
grant execute on function public.remover_entregavel(uuid, text) to authenticated;


-- =============================================================================
-- devolver_para_o_quadro — o caso volta para quem faz o trabalho.
--
-- É O AVESSO DE `confirmar_entrega`, e por isso pede o MESMO papel: as duas são
-- as duas saídas da mesma conferência — "está bom, entreguei" e "não está bom,
-- refaça". Quem revisa é atendimento ou adm.
--
-- Quem enviou por engano não fica sem saída: a aba Entregáveis é visível para a
-- equipe inteira e qualquer pessoa ativa pode acrescentar o link certo ali
-- mesmo. Devolver é para quando o trabalho precisa voltar, não para desfazer um
-- clique.
--
-- MOTIVO OBRIGATÓRIO, como em `cancelar_caso` e `reabrir_caso`. Um caso que
-- reaparece no Quadro sem explicação é um card que ninguém sabe por que voltou —
-- e quem for refazer precisa saber o que estava errado.
--
-- NÃO MEXE NAS ETAPAS. Elas continuam concluídas, porque o trabalho foi feito; o
-- que voltou foi a entrega. Se o material em si estiver errado, o caminho é
-- `reabrir_etapa`, que é outra decisão e outro gesto.
-- =============================================================================

create or replace function public.devolver_para_o_quadro(
  p_caso_id uuid,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id          uuid;
  v_status_operacional public.status_operacional;
  v_liberado_em        timestamptz;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  if not (public.eh_atendimento() or public.eh_adm()) then
    raise exception 'Só atendimento ou adm podem devolver um caso ao Quadro.';
  end if;

  if p_motivo is null or length(btrim(p_motivo)) = 0 then
    raise exception 'Diga por que o caso está voltando — quem for refazer precisa saber.';
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
      'Caso % está em status terminal ("%") — para mexer nele, reabra o caso.',
      p_caso_id, v_status_operacional;
  end if;

  if v_liberado_em is null then
    raise exception 'Caso % não está em Entregáveis.', p_caso_id;
  end if;

  update public.casos
     set liberado_para_entrega_em  = null,
         liberado_para_entrega_por = null
   where id = p_caso_id;

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_caso_id,
    v_pessoa_id,
    'caso_devolvido_ao_quadro',
    jsonb_build_object('caso_id', p_caso_id, 'motivo', btrim(p_motivo)),
    now()
  );
end;
$$;

comment on function public.devolver_para_o_quadro(uuid, text) is
  'Tira o caso da aba Entregáveis e devolve ao Quadro, com motivo. É o avesso de '
  'confirmar_entrega e pede o mesmo papel (atendimento ou adm): são as duas saídas '
  'da mesma conferência. NÃO mexe nas etapas — o trabalho continua concluído; o que '
  'voltou foi a entrega. Material errado é reabrir_etapa, que é outra decisão.';

revoke all on function public.devolver_para_o_quadro(uuid, text) from public, anon;
grant execute on function public.devolver_para_o_quadro(uuid, text) to authenticated;
