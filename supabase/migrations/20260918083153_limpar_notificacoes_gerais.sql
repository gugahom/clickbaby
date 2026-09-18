-- LIMPAR AS NOTIFICAÇÕES GERAIS (18/09/2026, pedido do gestor: "uma forma de
-- retirar as notificações que não são 'para você', pra não ficar muita coisa
-- acumulada ali").
--
-- AS GERAIS ACUMULAM, e é da natureza delas. Uma notificação só some quando a
-- condição que a criou deixa de ser verdade (ver `features/notificacoes/lib/
-- derivar.ts`), e as gerais são justamente as que falam do trabalho dos OUTROS:
-- o aviso num card que não é meu, o prazo vencido de um caso em que não toquei.
-- Eu não posso resolvê-las, então elas ficariam na minha lista até outra pessoa
-- agir — e a lista viraria o painel da operação inteira, que é o contrário de
-- uma caixa de entrada.
--
-- AS "PARA VOCÊ" NÃO SE LIMPAM, de propósito. Elas são trabalho meu esperando
-- por mim: atribuição, rendição, alteração em trabalho meu. Somem quando o
-- trabalho anda — é a regra do sino desde o primeiro dia —, e um botão que as
-- escondesse seria um jeito de fazer a etapa atribuída parar de chamar sem
-- ninguém dar play nela.
--
-- UM CARIMBO, E NÃO UMA LISTA DO QUE FOI LIMPO. Limpar esconde as gerais que já
-- existiam naquele instante; as que nascerem depois aparecem normalmente. Uma
-- tabela com cada notificação dispensada cresceria para sempre (a notificação
-- some quando resolve, a linha da dispensa ficaria), e daria o mesmo resultado
-- para o gesto que foi pedido, que é o de limpar em bloco.
--
-- Mora na mesma linha do "já vi", pela mesma razão que o "já vi" mora numa
-- tabela própria e não em `pessoas`: é leitura privada de cada um, e ninguém
-- precisa saber quando a colega limpou o sino.

alter table public.notificacoes_vistas
  add column gerais_limpas_em timestamptz;

comment on column public.notificacoes_vistas.gerais_limpas_em is
  'Até quando as notificações GERAIS foram limpas por esta pessoa. As gerais nascidas até este instante somem da lista dela; as de depois aparecem. As "para você" não são afetadas: elas somem quando o trabalho anda. Nulo = nunca limpou.';

/**
 * Limpa as gerais da pessoa logada — e marca o sino como visto junto, porque
 * quem limpou acabou de olhar. Devolve o carimbo do servidor (invariante 3.4):
 * num celular com a hora adiantada, uma marca do aparelho esconderia gerais que
 * ainda nem aconteceram.
 */
create or replace function public.limpar_notificacoes_gerais()
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

  insert into public.notificacoes_vistas (pessoa_id, visto_em, gerais_limpas_em)
  values (v_pessoa_id, v_agora, v_agora)
  on conflict (pessoa_id) do update
    set visto_em = excluded.visto_em,
        gerais_limpas_em = excluded.gerais_limpas_em;

  return v_agora;
end;
$$;

comment on function public.limpar_notificacoes_gerais() is
  'Esconde da lista da pessoa logada as notificações GERAIS que já existiam agora, e marca o sino como visto. As "para você" não se limpam — somem quando o trabalho anda. Só para si mesma: não recebe pessoa_id. Não grava evento: limpar o sino não é trabalho.';

revoke all on function public.limpar_notificacoes_gerais() from public;
revoke all on function public.limpar_notificacoes_gerais() from anon;
grant execute on function public.limpar_notificacoes_gerais() to authenticated;
