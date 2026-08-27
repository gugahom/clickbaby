-- =============================================================================
-- 1. A trilha CAMPO vira ACOMPANHAMENTO.
-- 2. Observação passa a poder ser escrita a qualquer momento, não só ao
--    concluir.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Acompanhamento
--
-- "Campo" era palavra minha, não da operação. O gestor chama de
-- ACOMPANHAMENTO — o que a empresa faz ao lado da família, em oposição à
-- EDIÇÃO, que é operação interna.
--
-- O valor muda no BANCO, não só o rótulo da tela. Deixar o banco dizendo
-- `campo` e a tela dizendo "Acompanhamento" criaria dois nomes para a mesma
-- coisa — e a seção 2 do CLAUDE.md é explícita: o vocabulário do domínio é um
-- só, e não se traduz no caminho.
--
-- Coluna gerada não aceita ALTER da expressão, então é drop e recria. Não há
-- dado a perder: ela é derivada do tipo.
-- -----------------------------------------------------------------------------

-- A view filtra por trilha, então segura a coluna. Derrubar e recriar é o
-- caminho: `create or replace view` não ajuda aqui porque a dependência é da
-- COLUNA, não do formato da view.
drop view if exists public.fila_edicao;

drop index if exists public.idx_caso_etapas_trilha;

alter table public.caso_etapas drop column trilha;

alter table public.caso_etapas
  add column trilha text
  generated always as (
    case
      when tipo in ('entrada', 'nascimento', 'banho', 'fechamento')
        then 'acompanhamento'
      else 'edicao'
    end
  ) stored;

comment on column public.caso_etapas.trilha is
  'ACOMPANHAMENTO (o que a empresa faz junto da família, na maternidade) ou EDICAO (o que acontece na ilha de edição). Gerada a partir do tipo, nunca preenchida — é a divisão que a operação já usa, e também a regra de precedência: acompanhamento é sequencial entre si; edição libera quando o nascimento conclui.';

create index idx_caso_etapas_trilha on public.caso_etapas (caso_id, trilha);

-- Recriada igual à 20260827140400, com o valor novo no filtro.
create view public.fila_edicao
with (security_invoker = true)
as
select
  q.id                as caso_id,
  q.mae_nome,
  q.bebe_nome,
  q.dia,
  q.cor_calendar,
  q.pacote_nome,
  q.maternidade_sigla,
  q.prazo_entrega_horas,
  q.vence_em,
  q.sla_pausado,
  q.na_uti,

  e.id                as caso_etapa_id,
  e.tipo              as etapa_tipo,
  e.status            as etapa_status,
  e.responsavel_id,
  r.nome              as responsavel_nome,
  e.atribuido_em,
  a.nome              as atribuido_por_nome,
  e.iniciado_em,
  e.pausado_em,
  e.pausa_acumulada,
  e.estacao
from public.quadro_casos q
join public.caso_etapas  e on e.caso_id = q.id and e.trilha = 'edicao'
left join public.pessoas r on r.id = e.responsavel_id
left join public.pessoas a on a.id = e.atribuido_por
where e.status in ('pendente', 'atribuida', 'em_andamento', 'pausada')
  and not q.eh_terminal;

comment on view public.fila_edicao is
  'Tudo que há para editar: uma linha por ETAPA da trilha de edição ainda aberta (foto, reels, vídeo, álbum) — não por caso. Um MASTER com três edições pendentes aparece três vezes, porque são três trabalhos que podem estar com três pessoas. SELECIONA DE quadro_casos de propósito: vence_em é a régua da fila e reimplementá-lo aqui criaria uma segunda definição de SLA. Herda a volatilidade da view base (caso na UTI recalcula vence_em a cada consulta). Não ordena: a view diz o que existe, a tela diz o que aparece e em que ordem. Caso na UTI permanece, porque a edição pode seguir — o que está congelado é o prazo, e sla_pausado diz isso.';

grant select on public.fila_edicao to authenticated;


-- -----------------------------------------------------------------------------
-- 2. anotar_etapa
--
-- O PROBLEMA
-- `caso_etapas.observacao` só era escrita por `concluir_etapa`. Ou seja: dava
-- para contar como foi, nunca para avisar o que vem. O caso que o gestor
-- trouxe é o inverso do que existia — a coordenação sabe ANTES que o banho vai
-- ser no quarto 115 às 14h, e precisa que quem chegar no plantão veja isso no
-- Quadro sem abrir o caso.
--
-- QUALQUER STATUS, INCLUSIVE PENDENTE
-- É o ponto. Uma anotação que só existisse depois do play chegaria tarde para
-- o único uso que ela tem.
--
-- NÃO É TRANSIÇÃO DE ESTADO
-- Não mexe em status, responsável nem timestamp — a seção 4 do CLAUDE.md pede
-- RPC para transição, e isto não é uma. Ainda assim é RPC, por dois motivos:
-- `authenticated` não tem UPDATE por coluna em `caso_etapas` para coluna
-- nenhuma (migration 20260822072158), e a anotação precisa virar evento para o
-- histórico do caso não ter buraco.
-- -----------------------------------------------------------------------------

create or replace function public.anotar_etapa(
  p_caso_etapa_id uuid,
  p_observacao text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_caso_id   uuid;
  v_status    public.status_etapa;
  v_anterior  text;
  v_nova      text;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select ce.caso_id, ce.status, ce.observacao
    into v_caso_id, v_status, v_anterior
  from public.caso_etapas ce
  where ce.id = p_caso_etapa_id
  for update;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  -- Texto em branco APAGA. Sem isso, uma observação errada ficaria para sempre
  -- e a única saída seria escrever "ignore o de cima".
  v_nova := nullif(btrim(coalesce(p_observacao, '')), '');

  if v_nova is not distinct from v_anterior then
    return;  -- nada mudou, nada a registrar
  end if;

  update public.caso_etapas
     set observacao = v_nova
   where id = p_caso_etapa_id;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    p_caso_etapa_id,
    v_pessoa_id,
    case when v_nova is null then 'observacao_removida' else 'etapa_anotada' end,
    jsonb_build_object(
      'caso_etapa_id', p_caso_etapa_id,
      'caso_id', v_caso_id,
      'status_da_etapa', v_status,
      -- O texto ANTIGO fica no evento. `eventos` é append-only (invariante
      -- 3.3), então é ele que responde "o que dizia antes" depois de uma
      -- correção — a coluna guarda só o valor atual.
      'observacao_anterior', v_anterior
    ),
    now()
  );
end;
$$;

comment on function public.anotar_etapa(uuid, text) is
  'Escreve a observação de uma etapa em QUALQUER status, inclusive pendente — é o que permite avisar o que vem (o banho será no quarto 115 às 14h) e não só relatar o que foi. Texto em branco apaga. Não é transição de estado: não toca status, responsável nem timestamp. É RPC porque authenticated não tem UPDATE por coluna em caso_etapas e porque a mudança precisa virar evento.';

revoke all on function public.anotar_etapa(uuid, text) from public;
grant execute on function public.anotar_etapa(uuid, text) to authenticated;
