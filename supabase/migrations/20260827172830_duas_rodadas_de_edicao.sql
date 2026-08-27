-- =============================================================================
-- Duas RODADAS de edição por caso.
--
-- O QUE MUDOU, E POR QUE A VERSÃO ANTERIOR ESTAVA ERRADA
-- Até aqui o caso tinha UMA `edicao_foto` e UM `reels`, e a premissa era que
-- as fotos do banho entravam na mesma edição já em andamento. A operação não é
-- essa. O gestor descreveu, e é o que vale:
--
--   nascimento concluído          -> edição de fotos e reels do PARTO
--   banho + fechamento concluídos -> NOVA edição de fotos e reels
--
-- São duas entregas de trabalho separadas no tempo. Com uma etapa só, concluir
-- a edição do parto fechava a porta: o material do banho chegava depois e não
-- havia onde registrá-lo — "a edição se perde e não tem como voltar atrás",
-- nas palavras dele.
--
-- O RELÓGIO CONTINUA UM SÓ
-- Confirmado: a segunda rodada entra no MESMO SLA do caso, contado da conclusão
-- do nascimento. Por isso `vence_em` não muda e a view fica intacta — o prazo é
-- do caso, não da rodada. Se um dia a segunda rodada ganhar prazo próprio, é
-- aqui que a decisão precisa ser revista, e não é uma linha.
--
-- POR QUE `rodada` E NÃO TIPOS NOVOS NO ENUM
-- A alternativa seria `edicao_foto_parto` e `edicao_foto_fechamento`. Ela
-- duplica o vocabulário (dois nomes para a mesma atividade), obriga toda regra
-- que hoje pergunta "é edição de foto?" a listar duas constantes, e não escala
-- se aparecer um terceiro bloco de captura. Uma coluna diz o que a coisa é: a
-- mesma etapa, feita de novo sobre material novo.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. A coluna e a unicidade
-- -----------------------------------------------------------------------------

alter table public.caso_etapas
  add column rodada smallint not null default 1;

-- `>= 1` e não `in (1, 2)`: hoje só existem duas porque só há dois blocos de
-- captura, mas isso é fato da operação, não do schema. Uma constraint fechada
-- transformaria "o cliente passou a fazer um terceiro atendimento" numa
-- migration de constraint em vez de uma linha de regra.
alter table public.caso_etapas
  add constraint caso_etapas_rodada_valida check (rodada >= 1);

comment on column public.caso_etapas.rodada is
  'Qual passagem de edição esta etapa é. 1 = material do parto (libera com o nascimento); 2 = material do banho e fechamento (nasce quando o fechamento conclui). Só edicao_foto e reels têm segunda rodada — ver tipo_tem_segunda_rodada. O SLA NÃO se divide por rodada: o prazo é do caso.';

-- A unicidade passa a incluir a rodada. Sem isto, a segunda edição de fotos
-- esbarraria na constraint antiga e a trigger falharia em silêncio no meio de
-- uma conclusão de etapa.
alter table public.caso_etapas
  drop constraint caso_etapas_unica_por_caso;

alter table public.caso_etapas
  add constraint caso_etapas_unica_por_caso unique (caso_id, tipo, rodada);

create index idx_caso_etapas_rodada on public.caso_etapas (caso_id, rodada);


-- -----------------------------------------------------------------------------
-- 2. Quem tem segunda rodada
--
-- Só foto e reels, conforme o gestor descreveu. O VÍDEO HORIZONTAL do MASTER
-- fica fora de propósito: ele tem 10 dias úteis de prazo, tempo de sobra para
-- ser montado uma vez com todo o material, e parti-lo em dois criaria duas
-- linhas para um trabalho que a operação faz de uma vez. O ÁLBUM idem — é o
-- fechamento de tudo, não tem rodada.
--
-- Função, e não uma lista repetida em três lugares: quando um tipo entrar ou
-- sair da regra, muda aqui.
-- -----------------------------------------------------------------------------

create or replace function public.tipo_tem_segunda_rodada(p_tipo public.etapa_tipo)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_tipo in ('edicao_foto', 'reels');
$$;

comment on function public.tipo_tem_segunda_rodada(public.etapa_tipo) is
  'Quais etapas de edição são refeitas sobre o material do banho e fechamento. Vídeo horizontal e álbum ficam de fora: o primeiro tem 10 dias úteis e é montado uma vez com tudo, o segundo é o fechamento de todo o trabalho.';

revoke all on function public.tipo_tem_segunda_rodada(public.etapa_tipo) from public;


-- -----------------------------------------------------------------------------
-- 3. A segunda rodada nasce quando o fechamento conclui
--
-- Trigger e não RPC: a criação não é uma decisão de ninguém, é consequência do
-- fechamento ter sido concluído. Deixar isso a cargo de um botão significaria
-- que esquecer o botão perde o registro do trabalho — que é exatamente o
-- problema que esta migration existe para resolver.
--
-- Só em caso NÃO terminal: um caso encerrado ou cancelado não ganha trabalho
-- novo. E só se o pacote tiver a etapa na primeira rodada — um BASIC não tem
-- fechamento, então nunca chega aqui; mas se um dia tiver, a segunda rodada
-- segue o que o pacote vende.
-- -----------------------------------------------------------------------------

create or replace function public.gerar_segunda_rodada_de_edicao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status_caso public.status_operacional;
  v_criadas     integer;
begin
  select c.status_operacional into v_status_caso
  from public.casos c
  where c.id = new.caso_id;

  if v_status_caso in ('encerrado', 'cancelado') then
    return new;
  end if;

  insert into public.caso_etapas (caso_id, tipo, status, ordem, rodada)
  select new.caso_id, ce.tipo, 'pendente', ce.ordem, 2
  from public.caso_etapas ce
  where ce.caso_id = new.caso_id
    and ce.rodada = 1
    and public.tipo_tem_segunda_rodada(ce.tipo)
  on conflict (caso_id, tipo, rodada) do nothing;

  get diagnostics v_criadas = row_count;

  if v_criadas > 0 then
    insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
    values (
      new.caso_id,
      new.id,
      -- Quem concluiu o fechamento é quem disparou isto. A pessoa vem do
      -- responsável da etapa, não de auth.uid(): a trigger também roda em
      -- backfill e em contexto sem usuário logado.
      new.responsavel_id,
      'segunda_rodada_de_edicao_criada',
      jsonb_build_object(
        'caso_id', new.caso_id,
        'disparada_por_caso_etapa_id', new.id,
        'etapas_criadas', v_criadas
      ),
      now()
    );
  end if;

  return new;
end;
$$;

comment on function public.gerar_segunda_rodada_de_edicao() is
  'Cria a rodada 2 de edicao_foto e reels quando o fechamento é concluído. Idempotente pela unique (caso_id, tipo, rodada). É trigger e não RPC porque a criação é consequência do fechamento, não decisão de alguém — depender de um botão faria esquecê-lo perder o registro do trabalho.';

-- Função de trigger NÃO precisa de EXECUTE para quem dispara o trigger, mas
-- nasce com ele para PUBLIC — e anon herda de PUBLIC. O revoke tem que citar
-- PUBLIC, não os papéis (armadilha 1 da seção 5 do CLAUDE.md).
revoke all on function public.gerar_segunda_rodada_de_edicao() from public;

create trigger gerar_segunda_rodada_on_fechamento
  after update on public.caso_etapas
  for each row
  when (
    new.tipo = 'fechamento'
    and new.status = 'concluida'
    and old.status is distinct from 'concluida'
  )
  execute function public.gerar_segunda_rodada_de_edicao();


-- -----------------------------------------------------------------------------
-- 4. Os casos que já existem
--
-- Quem já concluiu o fechamento e segue aberto deveria ter a segunda rodada.
-- Sem isto, a regra valeria só para os casos futuros e o Quadro mostraria dois
-- comportamentos diferentes lado a lado, sem nada na tela explicando por quê.
--
-- No local isto é no-op (não há casos quando as migrations rodam); no remoto é
-- onde o trabalho acontece.
-- -----------------------------------------------------------------------------

insert into public.caso_etapas (caso_id, tipo, status, ordem, rodada)
select ce.caso_id, ce.tipo, 'pendente', ce.ordem, 2
from public.caso_etapas ce
join public.casos c on c.id = ce.caso_id
where ce.rodada = 1
  and public.tipo_tem_segunda_rodada(ce.tipo)
  and c.status_operacional not in ('encerrado', 'cancelado')
  and exists (
    select 1 from public.caso_etapas f
    where f.caso_id = ce.caso_id
      and f.tipo = 'fechamento'
      and f.status = 'concluida'
  )
on conflict (caso_id, tipo, rodada) do nothing;


-- -----------------------------------------------------------------------------
-- 5. reabrir_etapa
--
-- O outro lado do problema que o gestor trouxe. Duas rodadas resolvem "concluí
-- a edição do parto e o banho ainda vem"; não resolvem "cliquei no check sem
-- querer". Até aqui, concluir era irreversível — e a conclusão é justamente o
-- gesto de um toque, feito com uma mão, num corredor.
--
-- O QUE ELA DESFAZ, E O QUE NÃO
-- Limpa `concluido_em` e devolve a etapa a `em_andamento`, não a `pendente`: o
-- trabalho aconteceu, `iniciado_em` continua lá, e voltar para pendente
-- apagaria o início e zeraria o tempo de ciclo — a mesma métrica que a trava da
-- seção 9 existe para proteger.
--
-- NÃO apaga a observação nem o responsável. E NÃO remove a segunda rodada que a
-- conclusão do fechamento tenha criado: aquilo é trabalho que passou a existir,
-- e apagá-lo por causa de um clique errado seria trocar um erro por outro
-- maior.
--
-- A reabertura é EVENTO, como tudo. É o que permite depois perguntar quantas
-- conclusões foram desfeitas — se for muita, o problema é o botão, não a gente.
-- -----------------------------------------------------------------------------

create or replace function public.reabrir_etapa(
  p_caso_etapa_id uuid,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id  uuid;
  v_caso_id    uuid;
  v_status     public.status_etapa;
  v_iniciado   timestamptz;
  v_concluido  timestamptz;
  v_caso_termo public.status_operacional;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select ce.caso_id, ce.status, ce.iniciado_em, ce.concluido_em
    into v_caso_id, v_status, v_iniciado, v_concluido
  from public.caso_etapas ce
  where ce.id = p_caso_etapa_id
  for update;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_status <> 'concluida' then
    raise exception
      'Etapa % está em "%" — só há o que reabrir numa etapa concluída.',
      p_caso_etapa_id, v_status;
  end if;

  select c.status_operacional into v_caso_termo
  from public.casos c
  where c.id = v_caso_id;

  -- Caso encerrado exige entrega confirmada (invariante 3.5). Reabrir uma
  -- etapa dele deixaria o caso "encerrado" com trabalho em aberto — um estado
  -- que a constraint de terminal não descreve. Quem quiser mexer num caso
  -- encerrado passa pelas RPCs de caso, não por esta.
  if v_caso_termo in ('encerrado', 'cancelado') then
    raise exception
      'Caso % está % — reabrir etapa de caso terminal deixaria o caso inconsistente.',
      v_caso_id, v_caso_termo;
  end if;

  update public.caso_etapas
     set status = 'em_andamento',
         concluido_em = null
   where id = p_caso_etapa_id;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    p_caso_etapa_id,
    v_pessoa_id,
    'etapa_reaberta',
    jsonb_build_object(
      'caso_etapa_id', p_caso_etapa_id,
      'caso_id', v_caso_id,
      'motivo', nullif(btrim(coalesce(p_motivo, '')), ''),
      -- O carimbo que foi apagado fica aqui. `eventos` é append-only
      -- (invariante 3.3), então é possível reconstruir o que a coluna dizia.
      'concluido_em_anterior', v_concluido,
      'iniciado_em', v_iniciado
    ),
    now()
  );
end;
$$;

comment on function public.reabrir_etapa(uuid, text) is
  'Desfaz a conclusão de uma etapa, devolvendo-a a em_andamento e limpando concluido_em. NÃO volta para pendente: iniciado_em permanece, porque o trabalho aconteceu e zerá-lo destruiria o tempo de ciclo da seção 9. Não apaga observação, responsável nem a segunda rodada que a conclusão tenha criado. Recusa etapa não concluída e caso terminal. O carimbo apagado fica no evento.';

revoke all on function public.reabrir_etapa(uuid, text) from public;
grant execute on function public.reabrir_etapa(uuid, text) to authenticated;


-- -----------------------------------------------------------------------------
-- 6. adicionar_video acompanha a constraint nova
--
-- Trocar a unique de (caso_id, tipo) para (caso_id, tipo, rodada) quebra todo
-- `ON CONFLICT` que nomeava a antiga — o Postgres recusa com "there is no
-- unique or exclusion constraint matching the ON CONFLICT specification". Foi
-- o pgTAP que pegou; em produção teria aparecido na primeira venda de vídeo
-- fora do MASTER.
--
-- O vídeo horizontal não tem segunda rodada (ver tipo_tem_segunda_rodada), por
-- isso a rodada é fixa em 1.
-- -----------------------------------------------------------------------------

create or replace function public.adicionar_video(p_caso_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id     uuid;
  v_status        public.status_operacional;
  v_caso_etapa_id uuid;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select c.status_operacional into v_status
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

  insert into public.caso_etapas (caso_id, tipo, ordem, rodada)
  values (p_caso_id, 'edicao_video', public.ordem_padrao_da_etapa('edicao_video'), 1)
  on conflict (caso_id, tipo, rodada) do nothing
  returning id into v_caso_etapa_id;

  if v_caso_etapa_id is null then
    return false;
  end if;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_caso_id,
    v_caso_etapa_id,
    v_pessoa_id,
    'video_adicionado',
    jsonb_build_object(
      'caso_id', p_caso_id,
      'caso_etapa_id', v_caso_etapa_id
    ),
    now()
  );

  return true;
end;
$$;

comment on function public.adicionar_video(uuid) is
  'Acrescenta a etapa edicao_video (o horizontal do MASTER) a um caso que ainda não a tem, para quando a venda dele se concretiza fora do pacote. NÃO troca o pacote. Idempotente pela unique (caso_id, tipo, rodada) — o vídeo não tem segunda rodada, então entra sempre na 1.';

revoke all on function public.adicionar_video(uuid) from public;
grant execute on function public.adicionar_video(uuid) to authenticated;
