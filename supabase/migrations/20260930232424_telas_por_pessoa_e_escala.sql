-- =============================================================================
-- TELAS POR PESSOA, E A ESCALA DE PLANTÃO (30/09/2026, pedido do gestor)
-- =============================================================================
--
-- DUAS MUDANÇAS DE MODELO, que chegaram no mesmo pedido:
--
-- 1. QUEM VÊ QUAL TELA deixa de ser só o PAPEL. A gestão passa a conceder e
--    tirar telas pessoa a pessoa ("quando a gente tiver o painel financeiro e o
--    painel comercial, quem é do comercial entra numa tela totalmente
--    diferente"). `pessoas.telas` NULO é "o padrão do papel" — exatamente o que
--    valia até hoje, então ninguém muda de acesso com esta migration.
--
--    E A TELA DÁ O PODER JUNTO (decisão do gestor, perguntado): conceder
--    Relatórios a um coordenador deixa ele LER as métricas, e conceder Equipe
--    deixa mexer no cadastro. Por isso as travas do banco que eram de PAPEL
--    nessas duas telas passam a olhar a tela:
--      * `exigir_gestao()` — a porta de toda função dos relatórios (interno e
--        externo) — passa a exigir a tela Relatórios. O NOME ficou: são quinze
--        funções que a chamam, e reescrevê-las só para trocar uma palavra
--        arriscaria mais do que o nome velho engana. O comentário diz a verdade.
--      * a escrita em `pessoas` e em `escalas` deixa de ser de `eh_adm()` (que
--        incluía comercial, coordenação e financeiro, sem tela nenhuma para
--        isso) e passa a ser de quem tem a tela Equipe.
--    O que NÃO muda: o resto da RLS continua por papel (cancelar caso, editar
--    cadastro de caso, confirmar entrega). As telas Quadro, Concluídos e
--    Calendário mostram dados que toda pessoa ativa já lê; Despesas lê uma view
--    `security_invoker` que também é de todos. Nelas a tela é só a porta.
--
-- 2. A ESCALA DE PLANTÃO, na tabela `escalas` que existe vazia desde o schema
--    inicial. A gestão lança os plantões de cada pessoa (dia, início e fim), e o
--    relatório interno compara as HORAS DE PLANTÃO com as horas de etapa com
--    relógio aberto. NÃO É PONTO (seção 9 do CLAUDE.md): é a escala PLANEJADA,
--    e a comparação é leitura para a gestão, não apontamento.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. As telas
-- -----------------------------------------------------------------------------

create type public.tela as enum (
  'quadro',
  'concluidos',
  'calendario',
  'equipe',
  'despesas',
  'relatorios'
);

comment on type public.tela is
  'As telas do sistema que a gestão concede pessoa a pessoa. Tela nova (o painel comercial, o financeiro) entra aqui e em TELAS, na tela.';

alter table public.pessoas add column telas public.tela[];

comment on column public.pessoas.telas is
  'As telas que a pessoa vê. NULO = o padrão do papel (telas_padrao_do_papel). Nas telas Relatórios e Equipe ela dá o PODER junto — ver tem_tela.';

-- O PADRÃO DE CADA PAPEL é o que a tela fazia até hoje, escrito uma vez:
-- operador só o Quadro; atendimento, comercial e coordenação com Concluídos e
-- Calendário; o financeiro com Despesas; a gestão com tudo. Espelho em
-- `telasPadraoDoPapel` (src/features/auth/telas.ts) — muda nos dois.
create function public.telas_padrao_do_papel(p_papel public.papel_sistema)
returns public.tela[]
language sql
immutable
set search_path = ''
as $$
  select case p_papel
    when 'gestao' then array['quadro', 'concluidos', 'calendario', 'equipe', 'despesas', 'relatorios']::public.tela[]
    when 'financeiro' then array['quadro', 'concluidos', 'calendario', 'despesas']::public.tela[]
    when 'operador' then array['quadro']::public.tela[]
    else array['quadro', 'concluidos', 'calendario']::public.tela[]
  end
$$;

revoke all on function public.telas_padrao_do_papel(public.papel_sistema) from public, anon;
grant execute on function public.telas_padrao_do_papel(public.papel_sistema) to authenticated;

-- As telas EFETIVAS de uma linha de `pessoas`: as escolhidas, ou as do papel.
create function public.telas_efetivas(p_telas public.tela[], p_papel public.papel_sistema)
returns public.tela[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_telas, public.telas_padrao_do_papel(p_papel))
$$;

revoke all on function public.telas_efetivas(public.tela[], public.papel_sistema) from public, anon;
grant execute on function public.telas_efetivas(public.tela[], public.papel_sistema) to authenticated;

-- QUEM ESTÁ LOGADO tem esta tela? É o helper das policies (Equipe) e da porta
-- dos relatórios. SECURITY DEFINER pelo mesmo motivo de eh_adm(): as policies
-- rodam com o privilégio de quem consulta, e a leitura de `pessoas` aqui dentro
-- não pode depender de outra policy.
create function public.tem_tela(p_tela public.tela)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pessoas p
    where p.auth_user_id = auth.uid()
      and p.ativo
      and p_tela = any (public.telas_efetivas(p.telas, p.papel_sistema))
  )
$$;

comment on function public.tem_tela(public.tela) is
  'A pessoa logada tem esta tela (as escolhidas pela gestão, ou as do papel). Usada nas policies de pessoas e escalas, e na porta dos relatórios. Nunca revogar de authenticated: as policies morrem sem ela.';

revoke all on function public.tem_tela(public.tela) from public, anon;
grant execute on function public.tem_tela(public.tela) to authenticated;


-- -----------------------------------------------------------------------------
-- 2. A porta dos relatórios passa a ser a tela
-- -----------------------------------------------------------------------------

create or replace function public.exigir_gestao()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.tem_tela('relatorios') then
    raise exception 'Os relatórios são de quem tem a tela Relatórios liberada.';
  end if;
end;
$$;

comment on function public.exigir_gestao() is
  'A PORTA DOS RELATÓRIOS (interno e externo). Desde 30/09/2026 exige a TELA Relatórios, não o papel gestão — a gestão concede a tela e o poder vai junto. O nome ficou porque quinze funções a chamam.';


-- -----------------------------------------------------------------------------
-- 3. Quem escreve no cadastro de pessoas e na escala: quem tem a tela Equipe
-- -----------------------------------------------------------------------------

drop policy pessoas_escrita_adm on public.pessoas;

create policy pessoas_escrita_equipe
  on public.pessoas
  for all
  to authenticated
  using ((select public.tem_tela('equipe')))
  with check ((select public.tem_tela('equipe')));

comment on policy pessoas_escrita_equipe on public.pessoas is
  'Nome, apelidos, papel, telas, ativo: quem tem a tela Equipe (30/09/2026). Até ali era eh_adm(), que incluía papéis sem tela nenhuma para isso. A foto vai pelas RPCs.';

drop policy escalas_escrita_adm on public.escalas;

create policy escalas_escrita_equipe
  on public.escalas
  for all
  to authenticated
  using ((select public.tem_tela('equipe')))
  with check ((select public.tem_tela('equipe')));

comment on table public.escalas is
  'A ESCALA PLANEJADA: os plantões de cada pessoa, lançados pela gestão na tela Equipe. O relatório interno compara as horas de plantão com as de etapa com relógio aberto. NÃO é registro de ponto nem jornada — seção 9 do CLAUDE.md.';

-- NINGUÉM SE TRANCA PARA FORA. Tirar a tela Equipe da última pessoa ativa que a
-- tem — ou desativá-la, ou trocar o papel dela para um que não a traz —
-- deixaria o sistema sem ninguém capaz de devolver o acesso, e o conserto seria
-- SQL no banco de produção. Só olha quem PERDE a tela; quem ganha passa direto.
create function public.guardar_acesso_a_equipe()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.ativo
     and 'equipe' = any (public.telas_efetivas(old.telas, old.papel_sistema))
     and (
       tg_op = 'DELETE'
       or not new.ativo
       or not ('equipe' = any (public.telas_efetivas(new.telas, new.papel_sistema)))
     )
     and not exists (
       select 1 from public.pessoas p
       where p.id <> old.id
         and p.ativo
         and p.auth_user_id is not null
         and 'equipe' = any (public.telas_efetivas(p.telas, p.papel_sistema))
     )
  then
    raise exception 'Sobraria ninguém com a tela Equipe. Dê a tela a outra pessoa antes.';
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function public.guardar_acesso_a_equipe() from public;

create trigger guardar_acesso_a_equipe
  after update of ativo, telas, papel_sistema or delete on public.pessoas
  for each row execute function public.guardar_acesso_a_equipe();

-- QUEM MEXEU NO ACESSO DE QUEM fica em `eventos` (seção 10: acesso é coisa que
-- se audita). Uma linha por mudança de telas ou de papel, com o antes e o
-- depois. O ator é quem está logado; o sync e a Edge Function não mexem nisso.
create function public.registrar_mudanca_de_acesso()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.telas is distinct from new.telas or old.papel_sistema is distinct from new.papel_sistema then
    insert into public.eventos (pessoa_id, tipo, payload, ocorrido_em)
    values (
      (select p.id from public.pessoas p where p.auth_user_id = auth.uid()),
      'acesso_alterado',
      jsonb_build_object(
        'pessoa_id', new.id,
        'papel_antes', old.papel_sistema,
        'papel_depois', new.papel_sistema,
        'telas_antes', old.telas,
        'telas_depois', new.telas
      ),
      now()
    );
  end if;
  return new;
end;
$$;

revoke all on function public.registrar_mudanca_de_acesso() from public;

create trigger registrar_mudanca_de_acesso
  after update of telas, papel_sistema on public.pessoas
  for each row execute function public.registrar_mudanca_de_acesso();


-- -----------------------------------------------------------------------------
-- 4. A foto de OUTRA pessoa, pela Equipe
-- -----------------------------------------------------------------------------
--
-- A foto própria continua como era (pasta do `auth.uid()`, definir_minha_foto).
-- A da Equipe mora numa pasta PRÓPRIA, `equipe/<pessoa_id>/`: a pessoa pode nem
-- ter conta ainda (as "sem acesso"), e escrever na pasta do uid de outra pessoa
-- misturaria as duas origens. Sem troca nem sobrescrita: nome novo a cada envio,
-- como na foto própria.

create policy avatares_upload_pela_equipe
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = 'equipe'
    and (select public.tem_tela('equipe'))
  );

create policy avatares_remocao_pela_equipe
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = 'equipe'
    and (select public.tem_tela('equipe'))
  );

create function public.definir_foto_da_pessoa(p_pessoa_id uuid, p_foto_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quem uuid;
begin
  if not public.tem_tela('equipe') then
    raise exception 'Só quem tem a tela Equipe troca a foto de outra pessoa.';
  end if;

  if p_foto_path is not null and p_foto_path not like 'equipe/' || p_pessoa_id::text || '/%' then
    raise exception 'O caminho da foto tem que estar na pasta desta pessoa.';
  end if;

  update public.pessoas set foto_path = p_foto_path where id = p_pessoa_id;
  if not found then
    raise exception 'Pessoa não encontrada.';
  end if;

  select p.id into v_quem from public.pessoas p where p.auth_user_id = auth.uid();

  insert into public.eventos (pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_quem,
    'perfil_atualizado',
    jsonb_build_object('foto', p_foto_path is not null, 'pessoa_id', p_pessoa_id, 'pela_equipe', true),
    now()
  );
end;
$$;

comment on function public.definir_foto_da_pessoa(uuid, text) is
  'A Equipe troca (ou tira, com null) a foto de outra pessoa. O arquivo mora em avatares/equipe/<pessoa_id>/. RPC pelo mesmo motivo de definir_minha_foto: o caminho precisa ser conferido.';

revoke all on function public.definir_foto_da_pessoa(uuid, text) from public, anon;
grant execute on function public.definir_foto_da_pessoa(uuid, text) to authenticated;


-- -----------------------------------------------------------------------------
-- 5. As horas de plantão, para o relatório interno
-- -----------------------------------------------------------------------------
--
-- Por pessoa, no período: quantos plantões e quantos minutos de plantão. O
-- plantão conta pelo DIA em que começa (o noturno de 19h às 7h é do dia das
-- 19h). Mesmo piso e mesma porta de toda métrica das pessoas.

create function public.metricas_plantoes_por_pessoa(p_inicio date, p_fim date)
returns table (pessoa_id uuid, plantoes integer, minutos integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_gestao();

  return query
  select e.pessoa_id,
         count(*)::integer,
         round(sum(extract(epoch from (e.fim - e.inicio))) / 60)::integer
  from public.escalas e
  where e.data between greatest(p_inicio, (public.inicio_das_metricas() at time zone 'America/Sao_Paulo')::date)
                   and p_fim
  group by e.pessoa_id;
end;
$$;

comment on function public.metricas_plantoes_por_pessoa(date, date) is
  'Relatório interno: plantões e minutos de plantão por pessoa no período (escala PLANEJADA, não ponto). Piso de 01/10/2026; só quem tem a tela Relatórios.';

revoke all on function public.metricas_plantoes_por_pessoa(date, date) from public, anon;
grant execute on function public.metricas_plantoes_por_pessoa(date, date) to authenticated;
