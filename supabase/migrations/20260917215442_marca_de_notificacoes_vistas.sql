-- A MARCA DE "JÁ VI" DO SINO (17/09/2026, pedido do gestor).
--
-- O sino do cabeçalho não guarda notificação nenhuma: a lista é DERIVADA do
-- que está vivo no banco — etapa atribuída a mim, aviso escrito num card,
-- horário estourando, vídeo que voltou para alteração. Foi decisão explícita,
-- e a razão é a frase dele: "quando resolvido, some das notificações". Com uma
-- tabela de notificações, cada ação teria que lembrar de apagar a linha
-- correspondente, e a primeira regra que alguém esquecesse viraria sino
-- tocando por trabalho que já acabou — a mesma classe de defeito da tela
-- discordando do banco que este projeto já pagou três vezes.
--
-- SÓ UMA COISA PRECISA SER GUARDADA: quando cada pessoa olhou o sino pela
-- última vez. Sem isso o pulso fica aceso para sempre, porque o trabalho
-- continua lá até alguém fazê-lo. Com isso, abrir o sino apaga o PULSO e o
-- item continua listado — que é o que o gestor escolheu: "ao abrir o sino, mas
-- o item fica até resolver".
--
-- POR QUE UMA TABELA E NÃO UMA COLUNA EM `pessoas`
-- Uma coluna ali seria lida por toda a equipe (a policy de `pessoas` é de
-- leitura geral, porque o cadastro é compartilhado), e o que ela guarda é
-- "a que horas fulana abriu o app pela última vez" — um relógio de presença
-- pela porta dos fundos, que é justamente o que a seção 9 do CLAUDE.md põe
-- fora de escopo. Numa tabela própria, a policy é "só a sua linha": ninguém vê
-- a de ninguém, e não há de onde derivar jornada.
--
-- ISTO NÃO É MEDIÇÃO, e vale dizer com todas as letras: nada nesta tabela
-- entra em indicador, relatório ou tela de equipe. É preferência de leitura,
-- guardada no banco em vez do aparelho porque os seis CEL CLICK trocam de mão
-- a cada turno — no `localStorage` o "já vi" de uma valeria para a próxima.
--
-- NÃO GRAVA EVENTO. `eventos` é append-only e registra TRABALHO (invariante
-- 3.3); abrir o sino não é trabalho, e catorze pessoas abrindo o sino algumas
-- dezenas de vezes por turno encheriam a tabela que sustenta todo indicador do
-- painel com ruído de leitura.

create table public.notificacoes_vistas (
  pessoa_id  uuid primary key references public.pessoas (id) on delete cascade,
  visto_em   timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.notificacoes_vistas is
  'Quando cada pessoa olhou o sino pela última vez. Uma linha por pessoa, legível só por ela. Serve para o PULSO parar quando alguém já viu — a lista de notificações em si é derivada do estado vivo do Quadro e não mora em lugar nenhum. Não é medição de presença (seção 9 do CLAUDE.md).';

comment on column public.notificacoes_vistas.visto_em is
  'Carimbo do servidor (invariante 3.4). Notificação mais nova que isto é "novidade" e acende o pulso.';

-- `on delete cascade` e não `restrict`, ao contrário das onze FKs de trabalho:
-- isto não é histórico. Quem nunca tocou em nada pode ser excluída da Equipe, e
-- ter aberto o sino uma vez não pode ser o que trava essa exclusão.

create trigger set_updated_at
  before update on public.notificacoes_vistas
  for each row execute function public.set_updated_at();

alter table public.notificacoes_vistas enable row level security;

-- SÓ A SUA LINHA, nos dois sentidos. A escrita nem aparece na policy porque
-- não existe pelo cliente: quem escreve é a RPC abaixo.
create policy notificacoes_vistas_select_propria
  on public.notificacoes_vistas
  for select
  to authenticated
  using (
    pessoa_id in (
      select p.id from public.pessoas p
      where p.auth_user_id = (select auth.uid()) and p.ativo
    )
  );

grant select on public.notificacoes_vistas to authenticated;

/**
 * Marca o sino como visto AGORA.
 *
 * Devolve o carimbo para a tela não precisar adivinhar qual foi — e para o
 * relógio ser o do servidor, não o do aparelho (invariante 3.4). Num celular
 * com a hora adiantada, uma marca do cliente apagaria o pulso de coisas que
 * ainda nem aconteceram.
 */
create or replace function public.marcar_notificacoes_vistas()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_agora     timestamptz := now();
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  insert into public.notificacoes_vistas (pessoa_id, visto_em)
  values (v_pessoa_id, v_agora)
  on conflict (pessoa_id) do update set visto_em = excluded.visto_em;

  return v_agora;
end;
$$;

comment on function public.marcar_notificacoes_vistas() is
  'Carimba o "já vi" do sino da pessoa logada. Qualquer pessoa ativa, e só para si mesma — não recebe pessoa_id de propósito, então não há como marcar o sino de outra. Não grava evento: abrir o sino não é trabalho.';

revoke all on function public.marcar_notificacoes_vistas() from public;
revoke all on function public.marcar_notificacoes_vistas() from anon;
grant execute on function public.marcar_notificacoes_vistas() to authenticated;

-- O SINO NASCE CALADO. Sem esta linha, todo mundo abriria o app na primeira vez
-- com o pulso aceso por trabalho que já estava lá há dias — e o primeiro uso de
-- um alerta é o que ensina se ele merece atenção. As notificações continuam
-- LISTADAS; o que a marca cala é o pulso, até a primeira novidade de verdade.
insert into public.notificacoes_vistas (pessoa_id, visto_em)
select p.id, now() from public.pessoas p
on conflict (pessoa_id) do nothing;
