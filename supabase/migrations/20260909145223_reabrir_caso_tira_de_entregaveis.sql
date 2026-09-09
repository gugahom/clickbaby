-- =============================================================================
-- REABRIR UM CASO TIRA ELE DE ENTREGÁVEIS.
--
-- O CASO REAL (gestor, 09/09/2026): um caso concluído foi reaberto para
-- refazer o reels. A rodada nova apareceu na seção REELS, mas o CARD não
-- voltou ao Quadro — e com ele ficou de fora tudo que diz o que precisa ser
-- feito, inclusive o motivo da reabertura, que a própria reabrir_caso grava na
-- observação da etapa nova e que a faixa de avisos do card mostraria.
--
-- A CAUSA É DE DATAS, NÃO DE LÓGICA. reabrir_caso é de 28/08
-- (20260828135838); as colunas liberado_para_entrega_em/_por chegaram em 06/09
-- com a aba Entregáveis (20260906151515). A função nunca soube que elas
-- existiam, e um caso encerrado sempre passou por lá — então toda reabertura
-- desde 06/09 deixou o caso num limbo:
--
--   * FORA do Quadro, que lista só liberado_para_entrega_em is null;
--   * DENTRO de Entregáveis, que lista enviado e não-terminal — ou seja,
--     cobrando do ADM a entrega de um trabalho que acabou de voltar a fazer.
--
-- É a mesma limpeza que devolver_para_o_quadro (20260907091413) já fazia. As
-- duas respondem à mesma pergunta — "este caso voltou a ter trabalho" —, e a
-- que existia desde antes da aba é a que ficou para trás. Quando uma coluna
-- nova entra, quem escreve nela é fácil de achar; quem DEVERIA LIMPÁ-LA não.
--
-- ESTA MIGRATION É UM create or replace DA FUNÇÃO INTEIRA. O corpo é o de
-- 28/08 sem uma vírgula mudada, com o update de casos ampliado — migration é
-- imutável, então a correção é arquivo novo (seção 5 do CLAUDE.md).
-- =============================================================================


create or replace function public.reabrir_caso(
  p_caso_id uuid,
  p_motivo  text,
  p_etapas  public.etapa_tipo[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_status    public.status_operacional;
  v_motivo    text;
  v_tipo      public.etapa_tipo;
  v_rodada    smallint;
  v_etapa_id  uuid;
  v_fora      text;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  if not (public.eh_atendimento() or public.eh_adm()) then
    raise exception
      'Reabrir um caso entregue é decisão de atendimento — peça a quem cuida do contrato.';
  end if;

  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');
  if v_motivo is null then
    raise exception
      'Reabertura exige o motivo: é ele que diz à editora o que a família pediu.';
  end if;

  if p_etapas is null or array_length(p_etapas, 1) is null then
    raise exception
      'Escolha ao menos uma etapa a refazer — reabrir sem trabalho a fazer deixaria o caso aberto para sempre.';
  end if;

  select c.status_operacional into v_status
  from public.casos c
  where c.id = p_caso_id
  for update;

  if not found then
    raise exception 'Caso % não encontrado.', p_caso_id;
  end if;

  if v_status <> 'encerrado' then
    raise exception
      'Só um caso ENCERRADO se reabre — este está "%". Cancelado é decisão comercial e não se desfaz por aqui.',
      v_status;
  end if;

  -- A etapa pedida tem que existir no pacote do caso. Sem isto, um BASIC
  -- ganharia uma edição de vídeo que ele nunca vendeu, e o checklist passaria
  -- a cobrar um trabalho que ninguém contratou.
  select string_agg(distinct t::text, ', ') into v_fora
  from unnest(p_etapas) t
  where not exists (
    select 1
    from public.pacote_etapas pe
    join public.casos c on c.pacote_id = pe.pacote_id
    where c.id = p_caso_id
      and pe.etapa_tipo = t
  );

  if v_fora is not null then
    raise exception 'O pacote deste caso não inclui: %.', v_fora;
  end if;

  -- A LIMPEZA DE `liberado_para_entrega_*` É O QUE FALTAVA (09/09/2026).
  --
  -- Um caso encerrado passou obrigatoriamente pela aba Entregáveis, então
  -- carrega esses dois carimbos. Reabrir sem apagá-los deixava o caso num
  -- estado que nenhuma tela sabe mostrar direito: FORA do Quadro (que filtra
  -- por `liberado_para_entrega_em is null`) e DENTRO de Entregáveis (que
  -- lista o que foi enviado e ainda não é terminal). A editora recebia a
  -- rodada nova só na seção lateral, sem o card e sem o motivo que a
  -- reabertura acabou de gravar na observação da etapa.
  --
  -- Reabrir é o oposto de enviar para entrega: o trabalho voltou a existir.
  -- A limpeza é incondicional porque só se reabre caso ENCERRADO — a
  -- liberação que houver é, por definição, da entrega que acabou de ser
  -- desfeita.
  update public.casos
     set status_operacional        = 'em_edicao',
         status_entrega            = 'pendente',
         reaberto_em               = now(),
         liberado_para_entrega_em  = null,
         liberado_para_entrega_por = null
   where id = p_caso_id;

  foreach v_tipo in array p_etapas loop
    select coalesce(max(ce.rodada), 0)::smallint + 1 into v_rodada
    from public.caso_etapas ce
    where ce.caso_id = p_caso_id
      and ce.tipo = v_tipo;

    insert into public.caso_etapas (caso_id, tipo, status, ordem, rodada, observacao)
    values (
      p_caso_id,
      v_tipo,
      'pendente',
      public.ordem_padrao_da_etapa(v_tipo),
      v_rodada,
      v_motivo
    )
    returning id into v_etapa_id;

    insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
    values (
      p_caso_id,
      v_etapa_id,
      v_pessoa_id,
      'etapa_de_revisao_criada',
      jsonb_build_object('tipo', v_tipo, 'rodada', v_rodada, 'motivo', v_motivo),
      now()
    );
  end loop;

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_caso_id,
    v_pessoa_id,
    'caso_reaberto',
    jsonb_build_object(
      'motivo', v_motivo,
      'etapas', to_jsonb(p_etapas),
      'status_anterior', v_status
    ),
    now()
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- E OS CASOS QUE JÁ ESTÃO PRESOS.
--
-- Quatro casos foram reabertos desde 06/09, e a correção NÃO é para os quatro.
-- Dois deles foram reabertos, tiveram o trabalho refeito e foram ENVIADOS DE
-- NOVO para Entregáveis: esses estão certos onde estão, e limpar seria
-- arrancá-los da fila do ADM sem ninguém pedir.
--
-- A diferença entre o caso preso e o caso legítimo é a ORDEM DOS CARIMBOS.
-- Liberação ANTERIOR à reabertura é resíduo da entrega desfeita; liberação
-- POSTERIOR é o envio novo, que aconteceu depois e vale. Por isso a condição
-- não é "reaberto e liberado", que pegaria os quatro.
--
-- O status terminal fica de fora por garantia: um caso encerrado de novo não
-- deve perder a liberação, senão some o registro de quem entregou.
-- -----------------------------------------------------------------------------

update public.casos
   set liberado_para_entrega_em  = null,
       liberado_para_entrega_por = null
 where reaberto_em is not null
   and liberado_para_entrega_em is not null
   and liberado_para_entrega_em < reaberto_em
   and status_operacional not in ('encerrado', 'cancelado');
