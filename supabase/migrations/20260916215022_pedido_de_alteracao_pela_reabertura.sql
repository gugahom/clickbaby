-- O PEDIDO DE ALTERAÇÃO ENTRA PELO MESMO DIÁLOGO DA REABERTURA (16/09/2026,
-- pedido do gestor).
--
-- Em 16/09 de manhã o vídeo e o Foto/Livro SAÍRAM da lista "o que precisa ser
-- refeito": eles têm seção própria, e reabrir o caso inteiro por causa de um
-- ajuste de dez minutos era o que ele tinha pedido para acabar. A porta virou
-- o "Pedir alteração" da linha da etapa, dentro do card.
--
-- Ele olhou e trouxe o que faltava: **a equipe usa ESSE diálogo**, inclusive
-- quando o pedido é só do vídeo. Ele é onde se escreve o que a família pediu,
-- e é onde se olha quando um caso entregue volta a ter trabalho. Tirar de lá
-- as duas etapas não tirou o pedido do caminho delas — só escondeu a porta.
--
-- ENTÃO AS DUAS VOLTAM PARA A LISTA, COM COMPORTAMENTO DIFERENTE: marcar
-- "Foto" reabre o CASO (`reabrir_caso`, que cria a rodada nova e devolve o
-- cartão ao Quadro); marcar "Vídeo" ou "Foto/Livro" devolve só A ETAPA para a
-- fase de alteração, com o caso seguindo encerrado. Marcar os dois faz as duas
-- coisas. A escolha do que acontece é do TIPO da etapa, não de quem clica —
-- é a diferença que o gestor descreveu como "junto com os outros, mas com
-- comportamento diferente".
--
-- POR QUE UMA RPC, E NÃO DUAS CHAMADAS DA TELA
-- São duas escritas que só fazem sentido juntas: mover a fase e guardar o que
-- a família pediu. Separadas, a rede caindo no meio produz um vídeo em
-- ALTERAÇÕES sem ninguém saber o que alterar — que é exatamente o estado que o
-- pedido existe para evitar. Aqui as duas estão na mesma transação.
--
-- POR QUE ELA CHAMA AS OUTRAS RPCs EM VEZ DE REPETIR O UPDATE
-- `mover_video_master` e `mover_album` já sabem tudo: a fase válida, o carimbo
-- de início, a pausa que fecha, o caso cancelado que recusa, o evento. Copiar
-- esse corpo para cá criaria uma segunda definição de "mover", e a próxima
-- correção iria só para uma delas. `security definer` chamando `security
-- definer` não muda `auth.uid()` — ele vem do JWT, não do dono da função —,
-- então as checagens de pessoa ativa continuam valendo para quem chamou.
--
-- O PEDIDO SE SOMA, NÃO SUBSTITUI
-- A observação da etapa é onde moram os PEDIDOS DO CLIENTE desde a migration
-- 20260916180834 ("Música: <link>", os prints). Um pedido novo que apagasse o
-- anterior faria a editora sentar na estação com metade do que a família
-- pediu. `anotar_etapa` escreve por cima — é o certo para ela, que é a porta de
-- CORRIGIR o texto —, então quem soma é aqui: o texto novo entra numa linha
-- abaixo do que já estava. Apagar continua sendo possível pelo botão Pedidos.

create or replace function public.pedir_alteracao_da_etapa(
  p_caso_etapa_id uuid,
  p_motivo        text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo    public.etapa_tipo;
  v_antes   text;
  v_motivo  text;
begin
  v_motivo := btrim(coalesce(p_motivo, ''));

  -- O MOTIVO É OBRIGATÓRIO, e não por burocracia: ele É o pedido. Um vídeo que
  -- volta para ALTERAÇÕES sem dizer o que alterar manda a editora perguntar no
  -- WhatsApp — que é de onde este campo veio para tirar o trabalho.
  if v_motivo = '' then
    raise exception 'O pedido de alteração precisa dizer o que a família pediu.';
  end if;

  select ce.tipo, ce.observacao
    into v_tipo, v_antes
  from public.caso_etapas ce
  where ce.id = p_caso_etapa_id;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_tipo = 'edicao_video' then
    perform public.mover_video_master(p_caso_etapa_id, 'em_alteracao');
  elsif v_tipo = 'album' then
    perform public.mover_album(p_caso_etapa_id, 'pedido_de_alteracoes');
  else
    -- Toda outra etapa volta pela reabertura do caso, que cria uma RODADA nova
    -- em vez de mexer na que já foi entregue. Estas duas são a exceção porque
    -- têm esteira própria e não seguram o encerramento.
    raise exception
      'A etapa "%" não tem seção própria — o caminho dela é reabrir o caso.',
      v_tipo;
  end if;

  perform public.anotar_etapa(
    p_caso_etapa_id,
    case
      when v_antes is null or btrim(v_antes) = '' then v_motivo
      else v_antes || E'\n' || v_motivo
    end);
end;
$$;

comment on function public.pedir_alteracao_da_etapa(uuid, text) is
  'Devolve o vídeo do MASTER ou o Foto/Livro para a fase de alteração e guarda o que a família pediu, na MESMA transação. Só estes dois tipos: são os que têm seção própria e não seguram o encerramento — toda outra etapa volta por reabrir_caso, que cria rodada nova. O caso continua encerrado. Delega a mudança de fase para mover_video_master/mover_album em vez de repetir o UPDATE, e SOMA o pedido à observação em vez de escrever por cima.';

revoke all on function public.pedir_alteracao_da_etapa(uuid, text) from public;
revoke all on function public.pedir_alteracao_da_etapa(uuid, text) from anon;
grant execute on function public.pedir_alteracao_da_etapa(uuid, text) to authenticated;
