-- =============================================================================
-- DADOS FICTÍCIOS PARA VER O RELATÓRIO DE PESSOAS — SÓ NO BANCO LOCAL.
--
-- Rodar com `npm run seed:metricas`, que manda este arquivo para o Postgres do
-- Docker local. Nunca para o remoto: nada aqui passa pelas RPCs, os carimbos são
-- escritos à mão, e o mês inteiro é INVENTADO.
--
-- DE OUTUBRO DE 2026 A DEZEMBRO DE 2027 (29/09/2026, pedido do gestor: "coloca
-- dados fictícios pra eu poder analisar" as comparações). Começa em outubro
-- porque as métricas só contam a partir de 01/10/2026 (`inicio_das_metricas()`);
-- vai até dezembro de 2027 para existir "o mesmo mês do ano passado" e um ano
-- inteiro contra o anterior. Tudo isso está no FUTURO — para a tela desenhar,
-- abra o relatório com `?hoje=2027-12-31` (só funciona em desenvolvimento).
--
-- A EQUIPE MELHORA COM O TEMPO, de propósito: o atraso e o retrabalho caem mês
-- a mês e o relógio passa a ser aberto mais vezes; o volume tem estação (março,
-- abril e setembro mais cheios, dezembro e janeiro mais vazios). Sem isso toda
-- comparação daria "igual", e não haveria o que analisar.
--
-- POR QUE PEDRAS PRECIOSAS: são nomes que ninguém confunde com a equipe real.
-- As famílias são "FICTÍCIA 001", "Bebê 001" — sem nome de gente (seção 10).
--
-- CADA PESSOA TEM UM PERFIL (ritmo, disciplina com o relógio, atraso,
-- retrabalho), para o ranking e as fichas terem diferença de verdade para
-- mostrar. As mesmas pessoas fotografam e editam, em proporções diferentes —
-- é a invariante 3.1: não existe "tipo fotógrafa".
--
-- IDEMPOTENTE POR MÊS: um mês que já tem caso FICTÍCIA é pulado, e os que
-- faltam são criados — rodar de novo depois de aumentar o período só acrescenta.
-- As pessoas são reaproveitadas pelo nome. Depois de um `db reset`, roda de novo.
-- =============================================================================

do $$
declare
  v_gestao        uuid;
  v_maternidades  uuid[];
  v_pacotes       uuid[];
  v_caso          uuid;
  v_n             integer := 0;
  v_dia           date;
  v_hora          numeric;
  v_previsao      timestamptz;
  v_campo         uuid;
  v_editor        uuid;
  v_perfil        record;
  v_etapa         record;
  v_ini           timestamptz;
  v_fim           timestamptz;
  v_fim_nasc      timestamptz;
  v_vence         timestamptz;
  v_ultima_edicao timestamptz;
  v_pausa         interval;
  v_quem_clicou   uuid;
  v_outro         uuid;
  v_envio         timestamptz;
  v_mes           date;
  v_m             integer;
  v_criados       integer := 0;
  v_partos_dia    integer;
  v_fator_atraso  numeric;
  v_fator_ajuste  numeric;
  v_bonus_relogio numeric;
begin
  perform setseed(0.42);

  -- A numeração continua de onde parou, para rodar de novo sem repetir nome.
  select coalesce(max(substring(mae_nome from 10)::int), 0) into v_n
  from public.casos where mae_nome ~ '^FICTÍCIA [0-9]+$';

  -- A gestão que distribui, confirma e às vezes registra pela equipe: a conta
  -- de dev, se existir (é com ela que se loga para ver o relatório).
  select id into v_gestao from public.pessoas
   where papel_sistema = 'gestao' and ativo order by created_at limit 1;
  if v_gestao is null then
    raise exception 'Rode `npm run seed:auth` antes: falta a conta de gestão de dev.';
  end if;

  select array_agg(id) into v_maternidades from public.maternidades where ativo;
  -- Pesos pela operação real: BABY REELS é o carro-chefe; MASTER é raro.
  select array_agg(p.id) into v_pacotes
  from public.pacotes p
  cross join lateral generate_series(1, case p.slug
    when 'baby-reels'           then 6
    when 'standard'             then 3
    when 'basic'                then 2
    when 'basic-reels-contrato' then 1
    when 'basic-reels-venda'    then 1
    when 'master'               then 1
    when 'birth'                then 1
    when 'birth-reels'          then 1
    else 0 end)
  where p.ativo;
  if v_pacotes is null or array_length(v_pacotes, 1) = 0 then
    select array_agg(id) into v_pacotes from public.pacotes where ativo;
  end if;

  -- ---------------------------------------------------------------------------
  -- As pessoas e seus perfis.
  --   campo, edicao   peso na escolha para cada trilha (0 = nunca)
  --   ritmo           multiplica a duração (0.7 rápida, 1.4 lenta)
  --   disciplina      chance de o relógio estar aberto de verdade na edição
  --   atraso          chance de uma edição sair depois do vencimento
  --   ajuste          chance de o caso voltar para ajuste
  -- ---------------------------------------------------------------------------
  create temp table perfil (
    id uuid, nome text, campo int, edicao int, ritmo numeric,
    disciplina numeric, atraso numeric, ajuste numeric
  ) on commit drop;

  insert into public.pessoas (nome, papel_sistema, ativo)
  select v.nome, 'operador', true
  from (values
    ('Ametista'), ('Berilo'), ('Citrino'), ('Diamante'), ('Esmeralda'), ('Granada'),
    ('Jade'), ('Opala'), ('Pérola'), ('Rubi'), ('Safira'), ('Topázio')
  ) as v(nome)
  where not exists (select 1 from public.pessoas p where p.nome = v.nome);

  insert into perfil
  select n.id, n.nome, v.campo, v.edicao, v.ritmo, v.disciplina, v.atraso, v.ajuste
  from public.pessoas n
  join (values
    -- nome         campo edicao ritmo disciplina atraso ajuste
    ('Ametista',    6,    0,     0.9,  0.90,      0.02,  0.02),  -- só campo
    ('Berilo',      5,    1,     1.1,  0.80,      0.05,  0.03),
    ('Citrino',     4,    2,     1.0,  0.70,      0.06,  0.05),
    ('Diamante',    0,    6,     0.75, 0.95,      0.03,  0.04),  -- só edição, rápida e cuidadosa
    ('Esmeralda',   1,    5,     1.3,  0.40,      0.18,  0.10),  -- lenta, relógio fechado
    ('Granada',     0,    5,     0.95, 0.60,      0.08,  0.12),
    ('Jade',        3,    3,     1.0,  0.85,      0.05,  0.03),  -- faz tudo
    ('Opala',       3,    3,     1.15, 0.55,      0.10,  0.06),
    ('Pérola',      5,    0,     1.05, 0.90,      0.02,  0.02),
    ('Rubi',        0,    4,     0.85, 0.30,      0.04,  0.08),  -- rápida no relógio... que quase não abre
    ('Safira',      2,    4,     1.0,  0.75,      0.06,  0.05),
    ('Topázio',     2,    2,     1.2,  0.65,      0.12,  0.07)
  ) as v(nome, campo, edicao, ritmo, disciplina, atraso, ajuste) on v.nome = n.nome;

  -- A gestão também fotografa às vezes (e é por isso que o ranking não filtra
  -- por papel — invariante 3.1).
  insert into perfil values (v_gestao, 'Gestão', 1, 0, 1.0, 0.8, 0.05, 0.03);

  -- ---------------------------------------------------------------------------
  -- Mês a mês, de outubro de 2026 a dezembro de 2027: 3 a 5 partos por dia,
  -- com estação.
  -- ---------------------------------------------------------------------------
  for v_mes in select generate_series(date '2026-10-01', date '2027-12-01', interval '1 month')::date loop
  if exists (
    select 1 from public.casos
    where mae_nome like 'FICTÍCIA %'
      and previsao_em >= v_mes::timestamp at time zone 'America/Sao_Paulo'
      and previsao_em <  (v_mes + interval '1 month')::timestamp at time zone 'America/Sao_Paulo'
  ) then
    continue;
  end if;

  -- Quantos meses desde outubro de 2026: a equipe melhora com eles.
  v_m := (extract(year from v_mes)::int - 2026) * 12 + extract(month from v_mes)::int - 10;
  v_fator_atraso  := greatest(0.35, 1.5 - 0.08 * v_m);
  v_fator_ajuste  := greatest(0.5, 1.3 - 0.05 * v_m);
  v_bonus_relogio := least(0.3, 0.025 * v_m);

  for v_dia in select generate_series(v_mes, (v_mes + interval '1 month' - interval '1 day')::date, interval '1 day')::date loop
    v_partos_dia := 3 + floor(random() * 3)::int
                  + case when extract(month from v_dia) in (3, 4, 9) then 1
                         when extract(month from v_dia) in (12, 1) then -1
                         else 0 end;
    for i in 1 .. v_partos_dia loop
      v_n := v_n + 1;
      v_hora := 1 + random() * 21;
      v_previsao := (v_dia + make_interval(secs => (v_hora * 3600)::int))::timestamp at time zone 'America/Sao_Paulo';

      insert into public.casos (mae_nome, bebe_nome, pacote_id, maternidade_id, previsao_em, termo_status)
      values (
        'FICTÍCIA ' || lpad(v_n::text, 4, '0'),
        'Bebê ' || lpad(v_n::text, 4, '0'),
        v_pacotes[1 + floor(random() * array_length(v_pacotes, 1))::int],
        v_maternidades[1 + floor(random() * array_length(v_maternidades, 1))::int],
        v_previsao,
        (array['assinado', 'assinado', 'assinado', 'pendente', 'sem_contrato'])[1 + floor(random() * 5)::int]::public.termo_status
      )
      returning id into v_caso;
      v_criados := v_criados + 1;

      -- Quem vai à maternidade: escolha ponderada pelo peso de campo.
      select p.id into v_campo from perfil p
       cross join lateral generate_series(1, p.campo)
       order by random() limit 1;
      select * into v_perfil from perfil where id = v_campo;

      -- ------------------------------------------------------------ CAMPO
      v_ini := v_previsao - interval '90 minutes';
      v_fim_nasc := null;

      for v_etapa in
        select ce.id, ce.tipo from public.caso_etapas ce
        where ce.caso_id = v_caso and ce.trilha = 'acompanhamento'
        order by ce.ordem
      loop
        if v_etapa.tipo = 'entrada' then
          v_fim := v_ini + make_interval(mins => ((30 + random() * 150) * v_perfil.ritmo)::int);
        elsif v_etapa.tipo = 'nascimento' then
          v_ini := v_ini + interval '5 minutes';
          v_fim := v_ini + make_interval(mins => ((50 + random() * 250) * v_perfil.ritmo)::int);
        else
          -- banho e fechamento: curtos, e um em cada cinco registrado depois
          -- (início = fim), como o campo admite (seção 9).
          v_ini := coalesce(v_fim_nasc, v_ini) + make_interval(mins => (20 + random() * 120)::int);
          v_fim := case when random() < 0.2 then v_ini
                        else v_ini + make_interval(mins => ((10 + random() * 50) * v_perfil.ritmo)::int) end;
        end if;

        -- Uma passagem de turno em 8% dos partos: a etapa termina com outra pessoa.
        v_outro := v_campo;
        if v_etapa.tipo = 'nascimento' and random() < 0.08 then
          select p.id into v_outro from perfil p where p.campo > 0 and p.id <> v_campo order by random() limit 1;
          insert into public.handoffs (caso_etapa_id, de_pessoa_id, para_pessoa_id, motivo, ocorrido_em)
          values (v_etapa.id, v_campo, v_outro, 'Troca de turno', v_ini + (v_fim - v_ini) / 2);
          insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
          values (v_caso, v_etapa.id, v_campo, 'etapa_transferida',
                  jsonb_build_object('de_pessoa_id', v_campo, 'para_pessoa_id', v_outro, 'motivo', 'Troca de turno'),
                  v_ini + (v_fim - v_ini) / 2);
        end if;

        update public.caso_etapas
           set status = 'concluida', responsavel_id = v_outro,
               iniciado_em = v_ini, concluido_em = v_fim, pausa_acumulada = interval '0'
         where id = v_etapa.id;

        -- 12% das conclusões de campo são registradas pela gestão, no lugar da
        -- fotógrafa — o jeito certo (o crédito continua dela).
        v_quem_clicou := case when random() < 0.12 then v_gestao else v_outro end;
        if v_fim > v_ini then
          insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, ocorrido_em)
          values (v_caso, v_etapa.id, v_outro, 'etapa_iniciada', v_ini);
        end if;
        insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, ocorrido_em)
        values (v_caso, v_etapa.id, v_quem_clicou, 'etapa_concluida', v_fim);

        -- O material do parto: cartões, quem baixou, quem subiu.
        if v_etapa.tipo = 'nascimento' then
          v_fim_nasc := v_fim;
          update public.caso_etapas
             set cartao_foto = (1 + floor(random() * 20))::int || ' HSC',
                 cartao_video = 'CEL CLICK ' || (1 + floor(random() * 6))::int,
                 baixou_por = (select p.id from perfil p order by random() limit 1),
                 subiu_por  = (select p.id from perfil p where p.edicao > 0 order by random() limit 1)
           where id = v_etapa.id;
          insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
          select v_caso, v_etapa.id, v_gestao, 'material_registrado',
                 jsonb_build_object('campo', c.campo, 'valor', c.valor, 'valor_anterior', null),
                 v_fim + make_interval(hours => c.h)
          from public.caso_etapas ce
          cross join lateral (values ('baixou', ce.baixou_por::text, 3), ('upload', ce.subiu_por::text, 6)) as c(campo, valor, h)
          where ce.id = v_etapa.id;
        end if;

        v_ini := v_fim;
      end loop;

      -- O vencimento do caso: o do pacote, contado do parto.
      select q.vence_em into v_vence from public.quadro_casos q where q.id = v_caso;

      -- ------------------------------------------------------------ EDIÇÃO
      -- Depois do campo, porque concluir o fechamento cria a rodada 2.
      v_ultima_edicao := v_fim_nasc;

      for v_etapa in
        select ce.id, ce.tipo from public.caso_etapas ce
        where ce.caso_id = v_caso and ce.trilha = 'edicao'
        order by ce.rodada, ce.ordem
      loop
        if v_etapa.tipo not in ('edicao_foto', 'reels', 'edicao_video') then
          update public.caso_etapas set status = 'dispensada' where id = v_etapa.id;
          continue;
        end if;

        select p.id into v_editor from perfil p
         cross join lateral generate_series(1, p.edicao)
         order by random() limit 1;
        select * into v_perfil from perfil where id = v_editor;

        -- Atribuída pela gestão em 60% dos casos.
        if random() < 0.6 then
          update public.caso_etapas set atribuido_por = v_gestao, atribuido_em = v_fim_nasc + interval '30 minutes'
           where id = v_etapa.id;
          insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
          values (v_caso, v_etapa.id, v_gestao, 'etapa_atribuida',
                  jsonb_build_object('para_pessoa_id', v_editor, 'tipo', v_etapa.tipo),
                  v_fim_nasc + interval '30 minutes');
        end if;

        v_ini := v_fim_nasc + make_interval(mins => (60 + random() * 1200)::int);

        if random() > least(0.98, v_perfil.disciplina + v_bonus_relogio) then
          -- O RELÓGIO FECHADO: play e concluir quase juntos — o hábito que o
          -- relatório mostra como "sem medição".
          v_fim := v_ini + make_interval(mins => (1 + floor(random() * 3))::int);
          v_pausa := interval '0';
        else
          v_fim := v_ini + make_interval(mins => (case v_etapa.tipo
                     when 'edicao_video' then 300 + random() * 1200
                     when 'reels'        then 25 + random() * 120
                     else                     30 + random() * 200 end * v_perfil.ritmo)::int);
          v_pausa := make_interval(mins => (case when random() < 0.4 then random() * 60 else 0 end)::int);
          v_fim := v_fim + v_pausa;
        end if;

        -- O atraso: empurra a conclusão para depois do vencimento.
        if v_vence is not null and v_etapa.tipo in ('edicao_foto', 'reels') and random() < v_perfil.atraso * v_fator_atraso then
          v_ini := v_vence + make_interval(hours => (1 + floor(random() * 12))::int);
          v_fim := v_ini + make_interval(mins => (20 + random() * 90)::int);
        end if;

        update public.caso_etapas
           set status = 'concluida', responsavel_id = v_editor,
               iniciado_em = v_ini, concluido_em = v_fim, pausa_acumulada = v_pausa
         where id = v_etapa.id;

        insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, ocorrido_em)
        values (v_caso, v_etapa.id, v_editor, 'etapa_iniciada', v_ini),
               (v_caso, v_etapa.id, case when random() < 0.05 then v_gestao else v_editor end, 'etapa_concluida', v_fim);

        -- Clique errado desfeito em minutos (não conta como ajuste) …
        if random() < 0.06 then
          insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
          values (v_caso, v_etapa.id, v_editor, 'etapa_reaberta',
                  jsonb_build_object('status_anterior', 'concluida', 'concluido_em_anterior', v_fim, 'motivo', 'Cliquei sem querer'),
                  v_fim + interval '4 minutes');
        end if;

        -- … e o ajuste de verdade, pedido depois.
        if v_etapa.tipo in ('edicao_foto', 'reels') and random() < v_perfil.ajuste * v_fator_ajuste then
          insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
          values (v_caso, null, v_gestao, 'caso_reaberto',
                  jsonb_build_object('etapas', jsonb_build_array(v_etapa.tipo), 'motivo', 'Família pediu ajuste'),
                  v_fim + make_interval(days => (2 + floor(random() * 5))::int));
        end if;

        if v_etapa.tipo <> 'edicao_video' then
          v_ultima_edicao := greatest(v_ultima_edicao, v_fim);
        end if;
      end loop;

      -- ------------------------------------------------------------ ENTREGA
      v_envio := v_ultima_edicao + make_interval(mins => (10 + random() * 300)::int);

      insert into public.entregaveis (caso_id, tipo, url, criado_por, criado_em, confirmado_em, confirmado_por)
      values (v_caso, 'google_photos', 'https://exemplo.invalid/ficticia/' || v_n, v_editor,
              v_envio - interval '20 minutes',
              v_envio + make_interval(hours => (1 + floor(random() * 18))::int), v_gestao);

      update public.casos
         set liberado_para_entrega_em  = v_envio,
             liberado_para_entrega_por = v_editor,
             status_entrega            = 'confirmado',
             status_operacional        = 'encerrado',
             encerrado_em              = v_envio + make_interval(hours => (1 + floor(random() * 18))::int)
       where id = v_caso;

      insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
      select v_caso, v_gestao, 'entrega_confirmada', jsonb_build_object('caso_id', v_caso), c.encerrado_em
      from public.casos c where c.id = v_caso;
    end loop;
  end loop;
  end loop;

  if v_criados = 0 then
    raise notice 'Os dados fictícios de outubro/2026 a dezembro/2027 já estão no banco — nada a fazer.';
  else
    raise notice 'Pronto: % casos fictícios novos (outubro/2026 a dezembro/2027), 12 pessoas fictícias.', v_criados;
  end if;
end;
$$;
