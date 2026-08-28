-- =============================================================================
-- O sync do Calendar passa a rodar SOZINHO.
--
-- O QUE ESTAVA ERRADO
-- A Edge Function existe, está no ar e funciona — mas nada nunca a chamava. O
-- comentário no topo de index.ts dizia, em letras claras, "sem cron configurado
-- ainda (próxima fatia) — só invocação manual". Na prática: um evento criado no
-- Google Calendar às 3h só virava caso quando alguém disparava o sync à mão.
-- O intake principal do sistema (seção 7 do CLAUDE.md) estava 0% automático.
--
-- COMO O DISPARO FUNCIONA
-- pg_cron acorda de dentro do banco e chama a Edge Function por HTTP com
-- pg_net. A credencial sai do Vault na hora da chamada e nunca passa por um
-- cliente: nem o navegador, nem um CI, nem uma máquina de alguém precisa ter a
-- service_role key para o sync acontecer. É o desenho que o próprio index.ts
-- já previa.
--
-- POR QUE A CHAVE NÃO ESTÁ AQUI
-- Migration é arquivo versionado. Qualquer segredo escrito aqui estaria no git
-- para sempre, e rotacionar a chave não apagaria o histórico. Esta migration
-- cria a máquina e a ensina a PROCURAR o segredo pelo nome; quem coloca o valor
-- é `scripts/configurar-sync-cron.mjs`, que lê de variável de ambiente e roda
-- uma vez por ambiente.
--
-- CONSEQUÊNCIA DELIBERADA: sem o segredo, o job acorda e não faz nada. É o que
-- mantém o banco LOCAL quieto — ninguém quer um `db reset` deixando um cron
-- batendo em Edge Function a cada dois minutos numa máquina de desenvolvimento.
-- Ligar é um gesto explícito, por ambiente.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. As extensões
--
-- `if not exists` porque o Supabase Cloud já traz as duas instaladas em alguns
-- projetos; recriar daria erro e travaria a migration no meio.
-- -----------------------------------------------------------------------------

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;


-- -----------------------------------------------------------------------------
-- 2. Onde mora a configuração
--
-- Dois segredos, ambos no Vault (`vault.secrets`, criptografado em repouso):
--
--   sync_calendar_url    a URL da Edge Function deste ambiente
--   sync_calendar_chave  a credencial que `autorizarChamada` aceita
--
-- A URL entra como segredo não por ser secreta — não é —, mas porque é o mesmo
-- mecanismo e evita uma segunda tabela de configuração só para ela. E porque
-- ela difere entre ambientes: escrevê-la na migration amarraria o arquivo
-- versionado a UM projeto, e o local passaria a chamar o remoto no `db reset`.
-- -----------------------------------------------------------------------------

create or replace function public.disparar_sync_calendar()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url        text;
  v_chave      text;
  v_request_id bigint;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'sync_calendar_url';

  select decrypted_secret into v_chave
  from vault.decrypted_secrets
  where name = 'sync_calendar_chave';

  -- Silêncio, não erro. Um `raise` aqui encheria o log do cron de falhas a
  -- cada dois minutos em todo ambiente que não configurou o segredo — e um log
  -- que grita sempre é um log que ninguém lê quando importa.
  if v_url is null or v_chave is null then
    return 'sem segredo configurado — sync não disparado';
  end if;

  select net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_chave,
      'Content-Type', 'application/json'
    ),
    body    := '{}'::jsonb,
    -- O sync lê a agenda inteira e escreve os casos. 104 eventos levam alguns
    -- segundos; 5s cortaria a chamada no meio de um lote com frequência.
    timeout_milliseconds := 30000
  ) into v_request_id;

  return 'disparado (request ' || v_request_id || ')';
end;
$$;

comment on function public.disparar_sync_calendar() is
  'Chama a Edge Function do sync do Calendar por HTTP, com a credencial vinda do Vault. É o que o job do pg_cron executa. Devolve texto em vez de erro quando não há segredo configurado: sem isso, todo ambiente sem o segredo (o local, por exemplo) encheria o log do cron de falhas a cada disparo. NÃO expõe a chave em nenhum retorno nem em log.';

-- A função monta um cabeçalho Authorization com a service_role key. Quem puder
-- executá-la dispara o sync; quem puder ler o plano dela chega perto do
-- segredo. Fica fechada para todo mundo — o pg_cron roda como o dono do job
-- (postgres) e não precisa de GRANT.
revoke all on function public.disparar_sync_calendar() from public;


-- -----------------------------------------------------------------------------
-- 3. Guardar os segredos, sem que eles passem por um arquivo
--
-- O script de configuração fala com o banco pelo PostgREST (é o único caminho
-- que temos sem psql na máquina), então precisa de uma RPC. Ela é deliberadamente
-- ESTREITA: aceita só os dois nomes que esta migration conhece.
--
-- Uma RPC genérica de "escreva qualquer segredo com qualquer nome" seria uma
-- primitiva perigosa demais para existir por conveniência de um script — quem
-- obtivesse a service_role key poderia sobrescrever qualquer segredo do Vault,
-- inclusive os que outra parte do sistema venha a usar.
-- -----------------------------------------------------------------------------

create or replace function public.configurar_segredo_do_sync(
  p_nome  text,
  p_valor text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     uuid;
  v_limpo  text;
begin
  if p_nome not in ('sync_calendar_url', 'sync_calendar_chave') then
    raise exception 'Segredo "%" não faz parte do sync do Calendar.', p_nome;
  end if;

  v_limpo := nullif(btrim(coalesce(p_valor, '')), '');
  if v_limpo is null then
    raise exception 'Valor vazio para "%" — para desligar o sync, remova o job do cron.', p_nome;
  end if;

  select id into v_id from vault.secrets where name = p_nome;

  if v_id is null then
    perform vault.create_secret(v_limpo, p_nome, 'Configuração do sync do Google Calendar.');
    return 'criado';
  end if;

  perform vault.update_secret(v_id, v_limpo);
  return 'atualizado';
end;
$$;

comment on function public.configurar_segredo_do_sync(text, text) is
  'Grava no Vault um dos dois segredos do sync do Calendar (sync_calendar_url, sync_calendar_chave). Aceita SÓ esses dois nomes de propósito: uma RPC genérica de escrita no Vault seria uma primitiva perigosa demais para existir por conveniência de um script. Nunca devolve o valor — só "criado" ou "atualizado". Chamada por scripts/configurar-sync-cron.mjs com service_role; EXECUTE fechado para todo o resto.';

-- Mesma regra do sync_upsert_caso: SECURITY DEFINER que não valida o chamador
-- (não pode — o script roda sem usuário logado) tem que ficar com o EXECUTE
-- fechado. PUBLIC entra no revoke porque anon e authenticated herdam dele.
revoke all on function public.configurar_segredo_do_sync(text, text) from public;
revoke all on function public.configurar_segredo_do_sync(text, text) from anon;
revoke all on function public.configurar_segredo_do_sync(text, text) from authenticated;

-- E o único papel que PODE: o script roda com a service_role key. O grant é
-- explícito porque o `revoke ... from public` acima tira o que service_role
-- herdaria de PUBLIC — sem esta linha o script leva 403.
grant execute on function public.configurar_segredo_do_sync(text, text) to service_role;


-- -----------------------------------------------------------------------------
-- 4. O job
--
-- A CADA DOIS MINUTOS. O pedido foi "se eu criar um card lá agora, aparece já
-- no painel". Dois minutos é o maior intervalo que ainda se lê como "já" para
-- quem acabou de digitar o evento e virou para a outra tela.
--
-- O custo é baixo dos dois lados: são ~30 leituras/hora de uma agenda de 104
-- eventos, contra uma cota diária do Google na casa do milhão; e a RPC
-- `sync_upsert_caso` é idempotente — evento sem mudança não vira UPDATE nem
-- evento, então rodar mais vezes não engorda a tabela `eventos`.
--
-- `unschedule` antes: `schedule` com nome repetido atualiza, mas só a partir do
-- pg_cron 1.4, e não vale depender da versão do servidor para uma migration
-- reaplicar limpo num `db reset`.
-- -----------------------------------------------------------------------------

do $$
begin
  perform cron.unschedule('sync-calendar');
exception
  when others then null;  -- não existia ainda; é o caso normal
end;
$$;

select cron.schedule(
  'sync-calendar',
  '*/2 * * * *',
  $$select public.disparar_sync_calendar()$$
);
