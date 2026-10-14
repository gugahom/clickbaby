-- pgTAP: a DPP no lugar da cesárea (migration 20261014113525).
--
--   D1 — criar guarda a DPP.
--   D2 — editar a DPP muda o caso, entra em "campos" do histórico e, no caso que
--        o sistema criou, marca o evento do Google para atualizar.
--   D3 — editar devolvendo a cesárea como estava não a apaga (o formulário não
--        mostra mais o campo, mas os casos antigos têm a hora).
--   D4 — o sync recebe a DPP.

begin;
select plan(8);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values (gen_random_uuid(), 'gestao.dpp@clickbaby.test', 'authenticated', 'authenticated', now(), now());
insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Gestao DPP', u.id, 'gestao', true from auth.users u where u.email = 'gestao.dpp@clickbaby.test';

create function pg_temp.como(p_email text) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L', json_build_object('sub', v_id, 'role', 'authenticated')::text);
end;
$$;
create function pg_temp.sair() returns void language plpgsql as $$
begin
  execute 'reset role';
  execute 'set local request.jwt.claims = ''{}''';
end;
$$;
create function pg_temp.pac(p_slug text) returns uuid language sql as $$ select id from public.pacotes where slug = p_slug; $$;
create function pg_temp.mat(p_sigla text) returns uuid language sql as $$ select id from public.maternidades where sigla = p_sigla; $$;
create function pg_temp.caso(p_mae text) returns uuid language sql as $$ select id from public.casos where mae_nome = p_mae; $$;
grant execute on function pg_temp.pac(text), pg_temp.mat(text), pg_temp.caso(text) to authenticated;


-- =============================================================================
-- D1. Criar
-- =============================================================================

select pg_temp.como('gestao.dpp@clickbaby.test');
select lives_ok(
  $$ select public.criar_caso('Dpp Um', null, pg_temp.pac('basic'), pg_temp.mat('HSC'), '2029-09-10 10:00-03',
       p_cesarea_em => '2029-09-10 11:30-03', p_dpp => '2029-09-14') $$,
  'D1: cria com DPP (e a cesárea, que a RPC segue aceitando)'
);
select pg_temp.sair();

select is(
  (select dpp from public.casos where mae_nome = 'DPP UM'),
  '2029-09-14'::date,
  'D1: a DPP ficou gravada'
);

-- O caso acabou de nascer pendente de ir ao Google; para D2 ele precisa estar
-- LIGADO a um evento, como fica depois do primeiro ciclo do sync.
update public.casos
   set google_pendente = false, google_calendar_event_id = 'evento-dpp-teste', google_desatualizado = false
 where mae_nome = 'DPP UM';


-- =============================================================================
-- D2 e D3. Editar
-- =============================================================================

select pg_temp.como('gestao.dpp@clickbaby.test');
select is(
  public.editar_caso(pg_temp.caso('DPP UM'), 'Dpp Um', null, pg_temp.pac('basic'), pg_temp.mat('HSC'),
    '2029-09-10 10:00-03', p_cesarea_em => '2029-09-10 11:30-03', p_dpp => '2029-09-16'),
  'editado',
  'D2: trocar a DPP é uma edição'
);
select pg_temp.sair();

select results_eq(
  $$ select dpp, google_desatualizado,
            to_char(cesarea_em at time zone 'America/Sao_Paulo', 'HH24:MI')
       from public.casos where mae_nome = 'DPP UM' $$,
  $$ values ('2029-09-16'::date, true, '11:30'::text) $$,
  'D2/D3: DPP nova, evento do Google marcado, e a cesárea devolvida intacta'
);

select is(
  (select payload -> 'campos' from public.eventos
    where caso_id = pg_temp.caso('DPP UM') and tipo = 'caso_editado'),
  '["dpp"]'::jsonb,
  'D2: o histórico diz que mudou só a DPP'
);

select pg_temp.como('gestao.dpp@clickbaby.test');
select is(
  public.editar_caso(pg_temp.caso('DPP UM'), 'Dpp Um', null, pg_temp.pac('basic'), pg_temp.mat('HSC'),
    '2029-09-10 10:00-03', p_cesarea_em => '2029-09-10 11:30-03', p_dpp => '2029-09-16'),
  'sem_efeito',
  'D3: salvar sem mudar nada não grava edição'
);
select pg_temp.sair();


-- =============================================================================
-- D4. O sync recebe a DPP
-- =============================================================================

select is(
  (select dpp from public.sync_casos_para_atualizar_no_google() where caso_id = pg_temp.caso('DPP UM')),
  '2029-09-16'::date,
  'D4: a lista do que atualizar no Google traz a DPP'
);

update public.casos set google_pendente = true, google_calendar_event_id = null, google_desatualizado = false where mae_nome = 'DPP UM';
select is(
  (select dpp from public.sync_casos_para_o_google() where caso_id = pg_temp.caso('DPP UM')),
  '2029-09-16'::date,
  'D4: a lista do que criar no Google também'
);


select * from finish();
rollback;
