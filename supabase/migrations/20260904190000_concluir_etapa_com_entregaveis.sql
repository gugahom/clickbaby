-- =============================================================================
-- concluir_etapa_com_entregaveis — o link entra JUNTO com a conclusão.
--
-- O PEDIDO (gestor, 04/09/2026): na conclusão da etapa de edição, já pedir o
-- link de entrega, em vez de deixá-lo só para o encerramento do caso. Quem
-- acabou de editar tem o link na mão; quem vai encerrar o caso, dias depois,
-- muitas vezes não tem.
--
-- POR QUE ISTO É UMA RPC NOVA E NÃO DUAS CHAMADAS SEGUIDAS
-- O front poderia chamar `registrar_entregavel` e depois `concluir_etapa`. As
-- duas falhas possíveis desse arranjo são exatamente o que a regra quer
-- impedir:
--   - o link entra e a conclusão é recusada → link órfão num caso cuja etapa
--     continua aberta, e o retry duplica o link;
--   - a conclusão passa e o link não → etapa de edição concluída SEM link, que
--     é o estado que o gestor pediu para tornar impossível.
-- Numa transação só, ou as duas coisas acontecem ou nenhuma. É a mesma razão
-- pela qual toda transição de estado deste projeto passa por RPC (seção 4).
--
-- O QUE ESTA FUNÇÃO NÃO DECIDE: quais links cada pacote exige. Isso é regra
-- comercial — "BASIC e STANDARD pedem o cadeado do reels" — e vive na tela,
-- junto do checklist de encerramento, que já é feito assim de propósito. Meter
-- a tabela de pacotes dentro da máquina de estados acoplaria o ciclo de vida da
-- etapa ao que o comercial vende naquele mês. A função garante o que é dela:
-- atomicidade, carimbo do servidor e evento append-only.
--
-- REAPROVEITA `concluir_etapa` em vez de copiar. A trava de "edição precisa ter
-- sido iniciada", os estados de origem aceitos, o fechamento da pausa e o
-- evento `etapa_concluida` são de lá e continuam num lugar só. Copiar era a
-- forma garantida de as duas divergirem na próxima mudança.
-- =============================================================================

create or replace function public.concluir_etapa_com_entregaveis(
  p_caso_etapa_id uuid,
  p_entregaveis jsonb,
  p_observacao text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_caso_id   uuid;
  v_item      jsonb;
  v_tipo      public.tipo_entregavel;
  v_url       text;
  v_novo      boolean;
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

  if v_caso_id is null then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if p_entregaveis is null or jsonb_typeof(p_entregaveis) <> 'array' then
    raise exception 'Informe os links como uma lista.';
  end if;

  -- Lista vazia é recusada de propósito. Esta função existe para conclusões que
  -- EXIGEM link; sem nenhum, o caminho certo é `concluir_etapa`, e aceitar
  -- vazio aqui seria abrir a porta que a regra do gestor acabou de fechar.
  if jsonb_array_length(p_entregaveis) = 0 then
    raise exception 'Nenhum link informado. Para concluir sem link, use concluir_etapa.';
  end if;

  for v_item in select * from jsonb_array_elements(p_entregaveis)
  loop
    if not (v_item ? 'tipo') or not (v_item ? 'url') then
      raise exception 'Cada link precisa de tipo e url.';
    end if;

    v_url := btrim(coalesce(v_item ->> 'url', ''));

    if v_url = '' then
      raise exception 'URL do entregável não pode ser vazia.';
    end if;

    -- Cast explícito para o enum: um tipo inventado morre aqui, com o nome
    -- errado no erro, em vez de virar linha estranha em `entregaveis`.
    begin
      v_tipo := (v_item ->> 'tipo')::public.tipo_entregavel;
    exception when invalid_text_representation then
      raise exception 'Tipo de entregável "%" não existe.', v_item ->> 'tipo';
    end;

    -- IDÊNTICO NÃO DUPLICA. A rodada 2 da edição de fotos conclui com o mesmo
    -- link do Google da rodada 1 — é o mesmo álbum —, e um duplo toque no botão
    -- faz o mesmo. Sem isto, a lista de entregáveis da família vira três cópias
    -- do mesmo endereço e ninguém sabe qual é o bom.
    insert into public.entregaveis (caso_id, tipo, url, criado_por)
    select v_caso_id, v_tipo, v_url, v_pessoa_id
    where not exists (
      select 1 from public.entregaveis e
      where e.caso_id = v_caso_id
        and e.tipo = v_tipo
        and e.url = v_url
    );

    get diagnostics v_novo = row_count;

    if v_novo then
      insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
      values (
        v_caso_id,
        v_pessoa_id,
        'entregavel_registrado',
        -- SEM A URL no payload. `eventos` é append-only e o link é credencial de
        -- acesso à galeria da família (seção 10): o que se audita é que um link
        -- daquele tipo foi registrado, por quem e quando — nunca qual era.
        jsonb_build_object(
          'caso_id', v_caso_id,
          'tipo', v_tipo,
          'na_conclusao_de', p_caso_etapa_id
        ),
        now()
      );
    end if;
  end loop;

  -- Por último, e é de propósito: se a conclusão for recusada (etapa de edição
  -- que nunca foi iniciada, status errado), a transação inteira volta atrás e
  -- os links não ficam para trás.
  perform public.concluir_etapa(p_caso_etapa_id, p_observacao);
end;
$$;

comment on function public.concluir_etapa_com_entregaveis(uuid, jsonb, text) is
  'Registra os links de entrega e conclui a etapa NA MESMA TRANSAÇÃO — pedido do gestor em 04/09/2026 para a conclusão da edição pedir o link na hora. Reaproveita concluir_etapa, que continua sendo a dona das regras de transição. Não decide quais links cada pacote exige: isso é regra comercial e vive na tela, como o checklist de encerramento. Link idêntico já registrado não duplica. A url nunca entra no payload do evento (seção 10).';

revoke all on function public.concluir_etapa_com_entregaveis(uuid, jsonb, text) from public, anon;
grant execute on function public.concluir_etapa_com_entregaveis(uuid, jsonb, text) to authenticated;
