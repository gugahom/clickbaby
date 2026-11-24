-- =============================================================================
-- FASE B DO COMERCIAL — FECHOU, O CASO NASCE NO CRM (24/11/2026)
-- =============================================================================
--
-- Até aqui o lead fechado só se LIGAVA a um caso que já existia
-- (`marcar_lead_ganho`), e o caso continuava nascendo pela agenda do Google,
-- com o vendedor escrevendo "MÃE/BEBÊ - PACOTE - SIGLA" à mão. Decisões do
-- usuário e do gestor para a fase B (docs/painel-comercial.md, seção 8):
--
-- 1. "FECHOU" ABRE O FORMULÁRIO DO CASO JÁ PREENCHIDO com o lead, e salvar é
--    UMA transação: cria o caso, lança a venda, grava o contrato e fecha o lead
--    (`fechar_lead`). Separadas, a rede caindo no meio deixaria um caso sem
--    venda, ou um lead "em negociação" com o caso dele já na agenda.
--
-- 2. VALOR E CONTRATO SÃO OBRIGATÓRIOS NO FECHAMENTO (decisão do usuário). A
--    trava mora AQUI, e não só na tela: é o que faz o relatório de Vendas não
--    ter caso fechado sem valor. Pelo Calendário os dois seguem opcionais.
--
-- 3. CRIAR CASO PASSA A SER DE QUEM TEM A TELA COMERCIAL (decisão do gestor em
--    18/11: "criar caso passa a ser só do comercial"). Era `eh_adm()` — gestão,
--    coordenação, comercial e financeiro. Agora são os vendedores e a gestão (a
--    tela vem no padrão dos dois papéis), e coordenação e financeiro só se a
--    gestão lhes der a tela. EDITAR e CANCELAR não mudam: são do ADM.
--
-- 4. O CASO QUE JÁ EXISTE NÃO SE DUPLICA. Enquanto a agenda e o CRM convivem, a
--    mesma mãe pode já estar na agenda (o vendedor marcou antes, ou o parto virou
--    BIRTH). `casos_parecidos_do_lead` devolve os candidatos, e a tela oferece
--    LIGAR a um deles (`marcar_lead_ganho`, que já existia) antes de criar outro.
--
-- O miolo de `criar_caso` foi para `inserir_caso_novo`, sem conferência de
-- papel e fechada para todo mundo: as duas portas — o Calendário e o CRM —
-- conferem cada uma a sua regra e chamam o mesmo miolo. Assim a próxima
-- correção na criação do caso vale para as duas, e o evento `caso_criado` diz
-- de onde o caso veio ('calendario' ou 'crm').
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. O miolo da criação, sem porta própria
-- -----------------------------------------------------------------------------

create function public.inserir_caso_novo(
  p_pessoa_id      uuid,
  p_origem         text,
  p_mae_nome       text,
  p_bebe_nome      text,
  p_pacote_id      uuid,
  p_maternidade_id uuid,
  p_previsao_em    timestamptz,
  p_click_home     boolean,
  p_sem_hora       boolean,
  p_cesarea_em     timestamptz,
  p_observacao     text,
  p_fotolivro      boolean,
  p_dpp            date,
  p_lead_id        uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cor      text;
  v_caso_id  uuid;
  v_mae      text := upper(btrim(coalesce(p_mae_nome, '')));
  v_bebe     text := nullif(upper(btrim(coalesce(p_bebe_nome, ''))), '');
  v_previsao timestamptz := public.previsao_do_dia(p_previsao_em, coalesce(p_sem_hora, false));
  v_obs      text := nullif(btrim(coalesce(p_observacao, '')), '');
begin
  if v_mae = '' then
    raise exception 'Informe o nome da mãe.';
  end if;

  -- A barra separa mãe de bebê no título do Google: um nome com barra quebraria
  -- a leitura do próprio evento que o sistema vai escrever.
  if strpos(v_mae, '/') > 0 or strpos(coalesce(v_bebe, ''), '/') > 0 then
    raise exception 'O nome não pode ter barra (/).';
  end if;

  if p_previsao_em is null then
    raise exception 'Informe o dia previsto.';
  end if;

  if length(coalesce(v_obs, '')) > 4000 then
    raise exception 'As observações passam de 4.000 caracteres.';
  end if;

  select coalesce(pc.cor_calendar, m.cor_calendar) into v_cor
  from public.pacotes pc, public.maternidades m
  where pc.id = p_pacote_id and pc.ativo
    and m.id = p_maternidade_id and m.ativo;

  if not found then
    raise exception 'Escolha um pacote e uma maternidade do cadastro.';
  end if;

  insert into public.casos (
    mae_nome, bebe_nome, pacote_id, maternidade_id, previsao_em, previsao_sem_hora,
    cor_calendar, click_home, criado_por, google_pendente, cesarea_em, observacao_calendar, dpp
  )
  values (
    v_mae, v_bebe, p_pacote_id, p_maternidade_id, v_previsao, coalesce(p_sem_hora, false),
    v_cor, coalesce(p_click_home, false), p_pessoa_id, true, p_cesarea_em, v_obs, p_dpp
  )
  returning id into v_caso_id;

  -- O id do lead vai no PAYLOAD, e não na coluna `eventos.lead_id`: a coluna
  -- esconde a linha de quem não tem a tela Comercial, e a criação do caso faz
  -- parte do histórico do caso, que a equipe inteira lê.
  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id, p_pessoa_id, 'caso_criado',
    jsonb_strip_nulls(jsonb_build_object(
      'caso_id', v_caso_id,
      'origem', p_origem,
      'lead_id', p_lead_id,
      'click_home', coalesce(p_click_home, false),
      'fotolivro', coalesce(p_fotolivro, false)
    )),
    now()
  );

  -- O FOTOLIVRO VENDIDO entra como etapa fora do pacote, pelo caminho de
  -- sempre (idempotente: no MASTER + ÁLBUM ele já veio com o pacote).
  if coalesce(p_fotolivro, false) then
    perform public.adicionar_etapa(v_caso_id, 'album');
  end if;

  return v_caso_id;
end;
$$;
comment on function public.inserir_caso_novo(uuid, text, text, text, uuid, uuid, timestamptz, boolean, boolean, timestamptz, text, boolean, date, uuid) is
  'O miolo da criação de caso, SEM conferir quem chama: só as RPCs criar_caso (Calendário) e fechar_lead (CRM) o usam, cada uma com a sua regra. Fechada para todo mundo.';

revoke all on function public.inserir_caso_novo(uuid, text, text, text, uuid, uuid, timestamptz, boolean, boolean, timestamptz, text, boolean, date, uuid) from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 2. criar_caso: a porta do Calendário, agora da tela Comercial
-- -----------------------------------------------------------------------------
-- `create or replace` com a MESMA assinatura: os GRANTs ficam (seção 5 do
-- CLAUDE.md — um drop + create reaplicaria os default privileges).

create or replace function public.criar_caso(
  p_mae_nome       text,
  p_bebe_nome      text,
  p_pacote_id      uuid,
  p_maternidade_id uuid,
  p_previsao_em    timestamptz,
  p_click_home     boolean default false,
  p_sem_hora       boolean default false,
  p_cesarea_em     timestamptz default null,
  p_observacao     text default null,
  p_fotolivro      boolean default false,
  p_dpp            date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid() and p.ativo;

  if v_pessoa_id is null or not public.tem_tela('comercial') then
    raise exception 'Só quem tem a tela Comercial cria caso.';
  end if;

  return public.inserir_caso_novo(
    v_pessoa_id, 'calendario', p_mae_nome, p_bebe_nome, p_pacote_id, p_maternidade_id,
    p_previsao_em, p_click_home, p_sem_hora, p_cesarea_em, p_observacao, p_fotolivro, p_dpp
  );
end;
$$;
comment on function public.criar_caso(text, text, uuid, uuid, timestamptz, boolean, boolean, timestamptz, text, boolean, date) is
  'Cria um caso pelo calendário: pacote e maternidade do cadastro, previsão (ou só o dia), observações, New Born e Foto/Livro opcionais. A cor vem da regra do cadastro; o caso nasce PENDENTE de ir ao Google. Só quem tem a tela Comercial (desde 24/11/2026; antes, eh_adm).';


-- -----------------------------------------------------------------------------
-- 3. fechar_lead: o caso, a venda, o contrato e o lead, numa transação
-- -----------------------------------------------------------------------------

create function public.fechar_lead(
  p_lead_id        uuid,
  p_mae_nome       text,
  p_bebe_nome      text,
  p_pacote_id      uuid,
  p_maternidade_id uuid,
  p_previsao_em    timestamptz,
  p_vendas         jsonb,
  p_contrato       text,
  p_sem_hora       boolean default false,
  p_cesarea_em     timestamptz default null,
  p_observacao     text default null,
  p_click_home     boolean default false,
  p_fotolivro      boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid := public.pessoa_do_comercial();
  v_lead      public.leads%rowtype;
  v_caso_id   uuid;
  v_linha     jsonb;
begin
  select * into v_lead from public.leads where id = p_lead_id for update;

  if not found then
    raise exception 'Lead não encontrado.';
  end if;

  if v_lead.situacao in ('ganho', 'perdido') then
    raise exception 'Este lead já está encerrado.';
  end if;

  -- As duas travas do fechamento vêm ANTES de criar qualquer coisa: a mensagem
  -- diz o que falta, e nada é desfeito.
  if p_vendas is null or jsonb_typeof(p_vendas) <> 'array'
     or not exists (select 1 from jsonb_array_elements(p_vendas) e where e ->> 'item' = 'pacote') then
    raise exception 'Lance o valor do pacote vendido para fechar.';
  end if;

  if nullif(btrim(coalesce(p_contrato, '')), '') is null then
    raise exception 'Informe o link do contrato para fechar.';
  end if;

  v_caso_id := public.inserir_caso_novo(
    v_pessoa_id, 'crm', p_mae_nome, p_bebe_nome, p_pacote_id, p_maternidade_id,
    p_previsao_em, p_click_home, p_sem_hora, p_cesarea_em, p_observacao, p_fotolivro,
    null, p_lead_id
  );

  -- Pelas RPCs de sempre: as mesmas validações de valor, parcelas e link, e os
  -- mesmos eventos (sem o valor e sem o link — seção 10).
  for v_linha in select * from jsonb_array_elements(p_vendas) loop
    perform public.registrar_venda_do_caso(
      v_caso_id,
      (v_linha ->> 'item')::public.item_de_venda,
      (v_linha ->> 'valor')::numeric,
      v_linha ->> 'descricao',
      null,
      (v_linha ->> 'parcelas')::integer,
      (v_linha ->> 'valor_parcela')::numeric
    );
  end loop;

  perform public.definir_contrato_do_caso(v_caso_id, p_contrato);
  perform public.marcar_lead_ganho(p_lead_id, v_caso_id);

  return v_caso_id;
end;
$$;
comment on function public.fechar_lead(uuid, text, text, uuid, uuid, timestamptz, jsonb, text, boolean, timestamptz, text, boolean, boolean) is
  'Fecha a venda de um lead aberto: cria o caso (vai ao Google pelo sync), lança as linhas da venda (exige a do pacote), grava o contrato (obrigatório) e marca o lead como ganho, ligado ao caso — numa transação. Quem tem a tela Comercial.';

revoke all on function public.fechar_lead(uuid, text, text, uuid, uuid, timestamptz, jsonb, text, boolean, timestamptz, text, boolean, boolean) from public, anon;
grant execute on function public.fechar_lead(uuid, text, text, uuid, uuid, timestamptz, jsonb, text, boolean, timestamptz, text, boolean, boolean) to authenticated;


-- -----------------------------------------------------------------------------
-- 4. casos_parecidos_do_lead: o caso que já está na agenda
-- -----------------------------------------------------------------------------
-- O mesmo PRIMEIRO NOME da mãe (sem acento, sem caixa), dia a até 60 dias da
-- DPP (sem DPP, de 30 dias atrás em diante), caso não cancelado e que nenhum
-- outro lead já tomou. É SUGESTÃO, nunca decisão: quem fecha escolhe ligar a
-- um deles ou criar o caso novo — o sistema não liga sozinho por nome
-- parecido, pela mesma regra do sync (seção 7: não assumir quando é ambíguo).

create function public.casos_parecidos_do_lead(p_lead_id uuid)
returns table (
  id          uuid,
  mae_nome    text,
  bebe_nome   text,
  dia         date,
  sem_hora    boolean,
  pacote      text,
  maternidade text,
  situacao    public.status_operacional
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lead     public.leads%rowtype;
  v_primeiro text;
begin
  perform public.pessoa_do_comercial();

  select * into v_lead from public.leads l where l.id = p_lead_id;
  if not found then
    raise exception 'Lead não encontrado.';
  end if;

  v_primeiro := split_part(translate(upper(btrim(v_lead.mae_nome)),
                                     'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC'), ' ', 1);

  return query
  select c.id, c.mae_nome, c.bebe_nome,
         (c.previsao_em at time zone 'America/Sao_Paulo')::date,
         c.previsao_sem_hora,
         pc.nome, m.sigla, c.status_operacional
  from public.casos c
  left join public.pacotes pc on pc.id = c.pacote_id
  left join public.maternidades m on m.id = c.maternidade_id
  where c.status_operacional <> 'cancelado'
    and c.previsao_em is not null
    and split_part(translate(upper(btrim(c.mae_nome)),
                             'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC'), ' ', 1) = v_primeiro
    and not exists (select 1 from public.leads l where l.caso_id = c.id)
    and case
          when v_lead.dpp is not null then
            abs((c.previsao_em at time zone 'America/Sao_Paulo')::date - v_lead.dpp) <= 60
          else
            (c.previsao_em at time zone 'America/Sao_Paulo')::date
              >= (now() at time zone 'America/Sao_Paulo')::date - 30
        end
  order by abs((c.previsao_em at time zone 'America/Sao_Paulo')::date
               - coalesce(v_lead.dpp, (now() at time zone 'America/Sao_Paulo')::date)),
           c.id
  limit 5;
end;
$$;
comment on function public.casos_parecidos_do_lead(uuid) is
  'Até 5 casos que podem ser o do lead: mesmo primeiro nome da mãe, perto da DPP, não cancelados e sem outro lead. Sugestão para o fechamento ligar em vez de duplicar. Quem tem a tela Comercial.';

revoke all on function public.casos_parecidos_do_lead(uuid) from public, anon;
grant execute on function public.casos_parecidos_do_lead(uuid) to authenticated;
