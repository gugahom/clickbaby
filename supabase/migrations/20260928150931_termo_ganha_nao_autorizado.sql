-- =============================================================================
-- O TERMO PASSA A TER QUATRO RESPOSTAS (28/09/2026, pedido do gestor):
-- Autorizado · Não autorizado · Ass pendente · Sem contrato.
--
-- A QUE FALTAVA É "NÃO AUTORIZADO", e ela é o oposto declarado do sim. Até aqui
-- a família que RECUSOU o uso das imagens só tinha onde cair como "ass
-- pendente" — que diz "ainda não chegou" — ou "sem contrato", que é falso
-- quando o contrato existe. Para a mídia da empresa, que é quem consulta este
-- campo, as duas leituras terminam em "talvez", e a diferença entre "ainda não
-- respondeu" e "respondeu que não" é justamente a que decide se uma foto pode
-- ser publicada um dia.
--
-- "AUTORIZADO" É O `assinado` DE SEMPRE, só com outro rótulo na tela. O valor
-- no banco NÃO muda: os casos já marcados continuam certos, porque assinar o
-- termo É autorizar. Trocar o identificador exigiria reescrever histórico por
-- uma palavra — mesmo arranjo de `operador`/"Fotógrafo(a)" e `album`/"Foto/Livro".
--
-- O QUINTO VALOR, `nao_aplicavel`, segue recusado: ele sobrou do schema inicial
-- e nenhuma tela o escreve. Valor de enum não se apaga.
-- =============================================================================

alter type public.termo_status add value if not exists 'nao_autorizado';

comment on column public.casos.termo_status is
  'Termo de uso de imagem do contrato, a coluna TERMO da planilha de atendimento: assinado (na tela, "Autorizado"), nao_autorizado, pendente ou sem_contrato. NULO é "ninguém respondeu ainda" — a pergunta é feita no diálogo de confirmar a entrega, e casos antigos nunca a receberam. Escreve-se só por registrar_termo. O valor nao_aplicavel sobrou do schema inicial e não é aceito pela RPC.';


-- -----------------------------------------------------------------------------
-- A RPC só muda de TEXTO: a recusa continua sendo de `nao_aplicavel`, e o valor
-- novo passa a ser aceito por não estar na exceção.
--
-- O `create or replace` abaixo NÃO usa o valor novo — só menciona nomes numa
-- mensagem de erro. É o que permite estar na mesma migration do `add value`:
-- o que a transação proíbe é USAR o valor recém-declarado, não citá-lo em
-- texto (ver a nota da 20260821030717).
-- -----------------------------------------------------------------------------

create or replace function public.registrar_termo(
  p_caso_id uuid,
  p_termo   public.termo_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_anterior  public.termo_status;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  if not (public.eh_atendimento() or public.eh_adm()) then
    raise exception 'Só atendimento ou adm podem registrar o termo de uso de imagem.';
  end if;

  if p_termo is null then
    raise exception 'Escolha uma resposta para o termo: autorizado, não autorizado, ass pendente ou sem contrato.';
  end if;

  if p_termo = 'nao_aplicavel' then
    raise exception 'O termo tem quatro respostas: autorizado, não autorizado, ass pendente ou sem contrato. Quem não tem contrato é "sem contrato".';
  end if;

  select c.termo_status into v_anterior
  from public.casos c
  where c.id = p_caso_id
  for update;

  if not found then
    raise exception 'Caso % não encontrado.', p_caso_id;
  end if;

  if v_anterior is not distinct from p_termo then
    return;  -- nada mudou, nada a registrar
  end if;

  update public.casos
     set termo_status = p_termo
   where id = p_caso_id;

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_caso_id,
    v_pessoa_id,
    'termo_registrado',
    jsonb_build_object(
      'caso_id', p_caso_id,
      'termo', p_termo,
      -- O anterior fica: é o que responde "desde quando este caso é autorizado"
      -- depois de uma correção. Nulo quando ninguém tinha respondido.
      'termo_anterior', v_anterior
    ),
    now()
  );
end;
$$;

comment on function public.registrar_termo(uuid, public.termo_status) is
  'Registra o termo de uso de imagem do caso (a coluna TERMO da planilha): assinado — "Autorizado" na tela —, nao_autorizado, pendente ou sem_contrato. Atendimento ou adm, em caso de qualquer estado: a resposta é dada ao confirmar a entrega e pode ser corrigida depois, inclusive em caso encerrado. Recusa nao_aplicavel, valor do schema inicial que a operação não usa. Valor igual ao gravado não gera evento.';
