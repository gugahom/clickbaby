-- =============================================================================
-- TROCAR O PACOTE PASSA A TRAZER AS ETAPAS QUE FALTAM.
--
-- O BUG (gestor, 07/09/2026): mudar um caso de BASIC para BABY REELS não
-- acrescentava banho nem fechamento. O card continuava com o checklist do
-- pacote velho, e o trabalho novo não existia em lugar nenhum — a mesma classe
-- de problema que `adicionar_etapa` foi feita para resolver caso a caso, só que
-- aqui a informação de que as etapas mudaram já estava no sistema.
--
-- POR QUE NÃO ACONTECIA. `gerar_caso_etapas` roda no INSERT e num único caso de
-- UPDATE: `pacote_id` saindo de NULL, que é a confirmação de um rascunho
-- pendente. Ela ainda tem uma guarda explícita de "nunca regenerar etapas de um
-- caso que já tem alguma", escrita justamente para que um update em `pacote_id`
-- não duplicasse tudo. As duas coisas juntas fazem a troca de pacote não gerar
-- nada — o que estava certo enquanto trocar pacote não era um gesto de tela.
--
-- ESTA TRIGGER SÓ ACRESCENTA. Nunca apaga etapa que o pacote novo não tem, e a
-- razão é dupla: pode haver trabalho feito nela — um BABY REELS que vira BASIC
-- não desfaz o banho que já aconteceu —, e `eventos` referencia `caso_etapas`
-- com `on delete restrict`, então a remoção nem passaria. O que sobra do pacote
-- velho fica visível no card e se resolve com "dispensar", que é o gesto da
-- operação para "não vai acontecer".
--
-- E SÓ ACRESCENTA O QUE FALTA. A checagem é por TIPO, em qualquer rodada: um
-- caso com edicao_foto nas rodadas 1 e 2 não ganha uma terceira porque o pacote
-- novo também prevê edicao_foto.
-- =============================================================================

create or replace function public.completar_etapas_do_pacote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quantidade integer;
begin
  insert into public.caso_etapas (caso_id, tipo, status, ordem, rodada)
  select new.id, pe.etapa_tipo, 'pendente', pe.ordem, 1
  from public.pacote_etapas pe
  where pe.pacote_id = new.pacote_id
    and not exists (
      select 1
      from public.caso_etapas ce
      where ce.caso_id = new.id
        and ce.tipo = pe.etapa_tipo
    );

  get diagnostics v_quantidade = row_count;

  -- Sem etapa nova não há o que contar. É o caso comum de trocar para um pacote
  -- MENOR (BABY REELS -> BASIC): nada entra, e o que sobra do antigo continua
  -- no card para alguém dispensar.
  if v_quantidade = 0 then
    return new;
  end if;

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    new.id,
    -- Sem ator: a troca do pacote é um UPDATE direto de adm (policy
    -- casos_update_adm), não uma RPC, então não há `auth.uid()` confiável aqui.
    -- Quem trocou não fica registrado — é uma lacuna do caminho de cadastro,
    -- não desta trigger.
    null,
    'etapas_do_pacote_trocado',
    jsonb_build_object(
      'pacote_id', new.pacote_id,
      'pacote_anterior_id', old.pacote_id,
      'quantidade', v_quantidade
    ),
    now()
  );

  return new;
end;
$$;

comment on function public.completar_etapas_do_pacote() is
  'Acrescenta ao caso as etapas que o pacote NOVO prevê e que ele ainda não tem, '
  'quando o pacote é TROCADO por outro. Só acrescenta: etapa do pacote antigo que '
  'não existe no novo permanece, porque pode ter trabalho feito e porque eventos '
  'a referencia com on delete restrict — o caminho para ela é dispensar. A '
  'checagem é por tipo, em qualquer rodada, para não criar uma segunda rodada por '
  'engano.';

revoke all on function public.completar_etapas_do_pacote() from public;

drop trigger if exists completar_etapas_do_pacote on public.casos;

-- A condição é estreita de propósito: NULL -> pacote é a confirmação de
-- rascunho, e já tem dona (`gerar_caso_etapas_on_update`); pacote -> NULL não
-- existe pela tela e não deveria gerar nada.
create trigger completar_etapas_do_pacote
  after update of pacote_id on public.casos
  for each row
  when (
    old.pacote_id is not null
    and new.pacote_id is not null
    and old.pacote_id is distinct from new.pacote_id
  )
  execute function public.completar_etapas_do_pacote();

comment on trigger completar_etapas_do_pacote on public.casos is
  'Troca de pacote traz as etapas novas. Não dispara na confirmação de rascunho '
  '(NULL -> pacote), que é da gerar_caso_etapas_on_update.';
