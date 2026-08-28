-- pgTAP: reabrir_caso e agendar_etapa (migration 20260828135838).
--
-- A reabertura é a operação mais delicada do ciclo de vida depois dos dois
-- terminais: ela desfaz um encerramento que alguém assinou, cria trabalho novo
-- num caso que já foi entregue, e MUDA A BASE DO SLA. Um erro aqui não aparece
-- na tela — aparece numa métrica de prazo que passa a mentir.

begin;
select plan(21);


-- =============================================================================
-- Fixtures
-- =============================================================================

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'operador.reabre@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'atendimento.reabre@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Operador Reabre', u.id, 'operador', true from auth.users u where u.email = 'operador.reabre@clickbaby.test';
insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Atendimento Reabre', u.id, 'atendimento', true from auth.users u where u.email = 'atendimento.reabre@clickbaby.test';

insert into public.maternidades (nome, sigla) values ('Maternidade Reabre', 'REABRE');

insert into public.casos (mae_nome, pacote_id, maternidade_id, status_operacional, status_entrega)
select 'Mãe Entregue', (select id from public.pacotes where slug = 'basic'),
       (select id from public.maternidades where sigla = 'REABRE'), 'encerrado', 'confirmado';
insert into public.casos (mae_nome, pacote_id, maternidade_id, status_operacional)
select 'Mãe Em Andamento', (select id from public.pacotes where slug = 'basic'),
       (select id from public.maternidades where sigla = 'REABRE'), 'em_edicao';
insert into public.casos (mae_nome, pacote_id, maternidade_id, status_operacional, motivo_cancelamento)
select 'Mãe Cancelada', (select id from public.pacotes where slug = 'basic'),
       (select id from public.maternidades where sigla = 'REABRE'), 'cancelado', 'desistiu';

-- O nascimento do caso entregue concluiu há muito tempo. É o que faz o teste
-- do SLA valer alguma coisa: sem reabertura o vencimento já passou faz dias.
update public.caso_etapas ce
   set status = 'concluida',
       iniciado_em = now() - interval '10 days',
       concluido_em = now() - interval '9 days'
  from public.casos c
 where c.id = ce.caso_id and c.mae_nome = 'Mãe Entregue';

create function pg_temp.como(p_email text) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  execute format('set local role authenticated');
  execute format(
    'set local request.jwt.claims = %L',
    json_build_object('sub', v_id, 'role', 'authenticated')::text
  );
end;
$$;

create function pg_temp.caso(p_nome text) returns uuid language sql as $$
  select id from public.casos where mae_nome = p_nome;
$$;


-- =============================================================================
-- A. Quem NÃO pode
-- =============================================================================

select pg_temp.como('operador.reabre@clickbaby.test');

select throws_ok(
  format($$ select public.reabrir_caso(%L::uuid, 'quer preto e branco', array['edicao_foto']::public.etapa_tipo[]) $$,
         pg_temp.caso('Mãe Entregue')),
  'Reabrir um caso entregue é decisão de atendimento — peça a quem cuida do contrato.',
  'A0: operador NÃO reabre — o pedido chega no atendimento, e a reabertura desfaz um encerramento assinado'
);

reset role;


-- =============================================================================
-- B. As recusas de atendimento
-- =============================================================================

select pg_temp.como('atendimento.reabre@clickbaby.test');

select throws_ok(
  format($$ select public.reabrir_caso(%L::uuid, '   ', array['edicao_foto']::public.etapa_tipo[]) $$,
         pg_temp.caso('Mãe Entregue')),
  'Reabertura exige o motivo: é ele que diz à editora o que a família pediu.',
  'B0: motivo em branco é recusado'
);

select throws_ok(
  format($$ select public.reabrir_caso(%L::uuid, 'motivo bom', array[]::public.etapa_tipo[]) $$,
         pg_temp.caso('Mãe Entregue')),
  'Escolha ao menos uma etapa a refazer — reabrir sem trabalho a fazer deixaria o caso aberto para sempre.',
  'B1: lista de etapas vazia é recusada'
);

select throws_ok(
  format($$ select public.reabrir_caso(%L::uuid, 'motivo bom', array['edicao_video']::public.etapa_tipo[]) $$,
         pg_temp.caso('Mãe Entregue')),
  'O pacote deste caso não inclui: edicao_video.',
  'B2: etapa fora do pacote é recusada — um BASIC não ganha edição de vídeo que nunca vendeu'
);

select throws_ok(
  format($$ select public.reabrir_caso(%L::uuid, 'motivo bom', array['edicao_foto']::public.etapa_tipo[]) $$,
         pg_temp.caso('Mãe Em Andamento')),
  'Só um caso ENCERRADO se reabre — este está "em_edicao". Cancelado é decisão comercial e não se desfaz por aqui.',
  'B3: caso que nem terminou não se reabre'
);

select throws_ok(
  format($$ select public.reabrir_caso(%L::uuid, 'motivo bom', array['edicao_foto']::public.etapa_tipo[]) $$,
         pg_temp.caso('Mãe Cancelada')),
  'Só um caso ENCERRADO se reabre — este está "cancelado". Cancelado é decisão comercial e não se desfaz por aqui.',
  'B4: caso CANCELADO não se reabre — desfazer cancelamento é vender de novo, não editar de novo'
);


-- =============================================================================
-- C. O caminho feliz
-- =============================================================================

select lives_ok(
  format($$ select public.reabrir_caso(%L::uuid, 'família pediu todas as fotos em preto e branco', array['edicao_foto','reels']::public.etapa_tipo[]) $$,
         pg_temp.caso('Mãe Entregue')),
  'C0: atendimento reabre com motivo e duas etapas'
);

reset role;

select is(
  (select status_operacional::text from public.casos where mae_nome = 'Mãe Entregue'),
  'em_edicao',
  'C1: o caso volta para em_edicao'
);

select is(
  (select status_entrega::text from public.casos where mae_nome = 'Mãe Entregue'),
  'pendente',
  'C2: a entrega volta a pendente — há trabalho novo antes de confirmar de novo'
);

select ok(
  (select reaberto_em is not null from public.casos where mae_nome = 'Mãe Entregue'),
  'C3: reaberto_em carimbado pelo servidor'
);

select is(
  (select count(*)::int from public.caso_etapas ce
    where ce.caso_id = pg_temp.caso('Mãe Entregue') and ce.tipo = 'edicao_foto'),
  2,
  'C4: a edição de fotos ganhou uma SEGUNDA linha, não sobrescreveu a primeira'
);

select is(
  (select max(rodada)::int from public.caso_etapas ce
    where ce.caso_id = pg_temp.caso('Mãe Entregue') and ce.tipo = 'edicao_foto'),
  2,
  'C5: a linha nova é a rodada seguinte'
);

select is(
  (select observacao from public.caso_etapas ce
    where ce.caso_id = pg_temp.caso('Mãe Entregue') and ce.tipo = 'edicao_foto' and ce.rodada = 2),
  'família pediu todas as fotos em preto e branco',
  'C6: o motivo chega na etapa — é o que a editora lê para saber o que fazer'
);

select is(
  (select status::text from public.caso_etapas ce
    where ce.caso_id = pg_temp.caso('Mãe Entregue') and ce.tipo = 'edicao_foto' and ce.rodada = 2),
  'pendente',
  'C7: a etapa nova nasce pendente'
);

-- A PRIMEIRA rodada continua intacta. É o ponto: ela guarda quanto tempo a
-- edição entregue levou, e é dela que sai a medição de produtividade daquele
-- trabalho. Reabrir não pode apagar isso.
select ok(
  (select concluido_em is not null and iniciado_em is not null
     from public.caso_etapas ce
    where ce.caso_id = pg_temp.caso('Mãe Entregue') and ce.tipo = 'edicao_foto' and ce.rodada = 1),
  'C8: a rodada 1 mantém iniciado_em e concluido_em — o tempo de ciclo do trabalho já entregue sobrevive'
);

select is(
  (select count(*)::int from public.eventos e
    where e.caso_id = pg_temp.caso('Mãe Entregue') and e.tipo = 'caso_reaberto'),
  1,
  'C9: a reabertura vira evento'
);

select is(
  (select e.payload->>'motivo' from public.eventos e
    where e.caso_id = pg_temp.caso('Mãe Entregue') and e.tipo = 'caso_reaberto'),
  'família pediu todas as fotos em preto e branco',
  'C10: o motivo fica no evento, não só na etapa'
);


-- =============================================================================
-- D. O SLA reinicia — a razão de existir do reaberto_em
--
-- O nascimento concluiu há 9 dias e o BASIC tem 48h: sem reabertura o
-- vencimento passou faz uma semana. Depois de reabrir, ele tem que estar no
-- FUTURO. Se este teste falhar, todo caso reaberto nasce vermelho no Quadro e
-- lidera a fila de edição para sempre.
-- =============================================================================

select ok(
  (select vence_em > now() from public.quadro_casos where id = pg_temp.caso('Mãe Entregue')),
  'D0: o vencimento passa a ser futuro — o relógio recomeçou na reabertura'
);

select ok(
  (select vence_em between now() + interval '47 hours' and now() + interval '49 hours'
     from public.quadro_casos where id = pg_temp.caso('Mãe Entregue')),
  'D1: e vale exatamente o prazo do PACOTE (48h do BASIC), não um prazo inventado para revisão'
);


-- =============================================================================
-- E. agendar_etapa
-- =============================================================================

select pg_temp.como('atendimento.reabre@clickbaby.test');

select lives_ok(
  format($$ select public.agendar_etapa(
      (select id from public.caso_etapas where caso_id = %L::uuid and tipo = 'nascimento'),
      now() + interval '3 hours') $$,
    pg_temp.caso('Mãe Em Andamento')),
  'E0: marca a hora combinada de uma etapa'
);

-- throws_like e não throws_ok: a mensagem nomeia o id da etapa, que muda a cada
-- rodada do teste. Casar o texto inteiro exigiria montar o id na expectativa,
-- e aí o teste passaria a afirmar o próprio fixture em vez da regra.
select throws_like(
  format($$ select public.agendar_etapa(
      (select id from public.caso_etapas where caso_id = %L::uuid and tipo = 'edicao_foto' and rodada = 1),
      now() + interval '3 hours') $$,
    pg_temp.caso('Mãe Entregue')),
  '%já está "concluida" — não há hora a combinar.',
  'E1: recusa etapa concluída'
);

reset role;


select * from finish();
rollback;
