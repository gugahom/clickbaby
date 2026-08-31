-- =============================================================================
-- Uma etapa que NÃO ESTAVA no pacote pode ser ACRESCENTADA.
--
-- O CASO REAL, do gestor: um BASIC não tem banho, mas a fotógrafa está lá e
-- consegue vender o banho na hora. Hoje esse trabalho acontece e o sistema não
-- registra — não existe etapa para dar play, e o tempo dela não entra em lugar
-- nenhum. O caso fecha dizendo que teve duas etapas quando teve três.
--
-- É O PAR DE `dispensar_etapa` (20260828211156). Aquela migration deu à
-- operação o "esta etapa não vai acontecer"; faltava o outro lado, o "esta
-- aqui vai, mesmo não estando no pacote". O checklist de um caso deixa de ser
-- uma cópia congelada do pacote e passa a ser o que de fato foi combinado com
-- aquela família.
--
-- SUBSTITUI `adicionar_video`, que era esta mesma função com o tipo cravado em
-- 'edicao_video'. O botão dela foi removido da tela em 28/08 porque a venda
-- avulsa do horizontal não acontece na prática — e agora se sabe qual era o
-- pedido de verdade: não era vídeo, era QUALQUER etapa. Manter as duas seria
-- ter duas implementações da mesma regra, e a específica é a que nunca foi
-- usada.
--
-- EXIGE PACOTE, e essa guarda não é burocracia: `gerar_caso_etapas` desiste
-- inteira se o caso já tiver QUALQUER etapa ("nunca regenerar"). Acrescentar
-- uma etapa a um rascunho sem pacote e confirmar o pacote depois deixaria o
-- caso com aquela etapa e mais nenhuma — um BABY REELS de uma etapa só, sem
-- erro nenhum aparecendo. O pacote define quais etapas existem (seção 2 do
-- CLAUDE.md); isto ACRESCENTA a um pacote, então tem que haver um.
--
-- NASCIMENTO É PERMITIDO AQUI, ao contrário de dispensar_etapa. Lá a recusa
-- existe porque dispensá-lo DESTRÓI o relógio do caso — `vence_em` deriva de
-- `nascimento.concluido_em`. Acrescentar só pode criar um relógio que faltava,
-- nunca apagar um que existe. Na prática todo pacote já traz nascimento e a
-- chamada volta `false` pela unique; a regra vale para o dia em que não trouxer.
--
-- RODADA 1 SEMPRE. A segunda rodada não se acrescenta à mão: ela nasce da
-- trigger quando o fechamento conclui (20260827172830), e é justamente esse o
-- caminho novo que se abre aqui — acrescentar banho e fechamento a um caso que
-- não os tinha faz a segunda rodada de foto e reels aparecer sozinha, na hora
-- certa, sem ninguém pedir.
-- =============================================================================


drop function if exists public.adicionar_video(uuid);


create or replace function public.adicionar_etapa(
  p_caso_id uuid,
  p_tipo    public.etapa_tipo
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id     uuid;
  v_status        public.status_operacional;
  v_pacote_id     uuid;
  v_caso_etapa_id uuid;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select c.status_operacional, c.pacote_id
    into v_status, v_pacote_id
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

  if v_pacote_id is null then
    raise exception
      'Caso % é rascunho sem pacote — confirme o pacote antes de acrescentar etapa avulsa.',
      p_caso_id;
  end if;

  insert into public.caso_etapas (caso_id, tipo, ordem, rodada)
  values (p_caso_id, p_tipo, public.ordem_padrao_da_etapa(p_tipo), 1)
  on conflict (caso_id, tipo, rodada) do nothing
  returning id into v_caso_etapa_id;

  -- Já existia. Não é erro: dois toques na mesma opção, ou duas pessoas
  -- vendendo o mesmo banho, não devem virar exceção na tela de quem está no
  -- corredor. O `false` é o que a tela usa para não anunciar o que não fez.
  if v_caso_etapa_id is null then
    return false;
  end if;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_caso_id,
    v_caso_etapa_id,
    v_pessoa_id,
    'etapa_adicionada',
    jsonb_build_object(
      'caso_id', p_caso_id,
      'caso_etapa_id', v_caso_etapa_id,
      'tipo', p_tipo
    ),
    now()
  );

  return true;
end;
$$;

comment on function public.adicionar_etapa(uuid, public.etapa_tipo) is
  'Acrescenta ao caso uma etapa que o pacote dele não previa — o banho vendido na hora, o fechamento que passou a existir. NÃO troca o pacote: o pacote continua sendo o registro do que foi vendido no contrato, e a etapa avulsa fica em eventos como etapa_adicionada. Exige pacote definido, porque gerar_caso_etapas desiste de gerar quando o caso já tem qualquer etapa. Entra sempre na rodada 1; a segunda rodada de edição continua nascendo da trigger do fechamento. Idempotente pela unique (caso_id, tipo, rodada) — devolve false quando a etapa já existia. Substitui adicionar_video, que era esta função com o tipo cravado.';

revoke all on function public.adicionar_etapa(uuid, public.etapa_tipo) from public;
grant execute on function public.adicionar_etapa(uuid, public.etapa_tipo) to authenticated;
