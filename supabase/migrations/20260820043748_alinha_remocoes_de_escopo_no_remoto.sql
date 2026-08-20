-- =============================================================================
-- Alinha o banco remoto com as correções de escopo aplicadas à migration
-- 20260819192042 DEPOIS que ela já constava como aplicada.
--
-- O QUE ACONTECEU
-- A 20260819192042 foi aplicada no remoto na sua primeira versão. O arquivo foi
-- editado três vezes em seguida (remoção do módulo de despesas, remoção de
-- status_financeiro, inclusão de motivo_cancelamento). Como o Supabase indexa
-- migration por timestamp, o ledger já registrava aquela versão e o db push
-- passou a pular o arquivo inteiro: as correções existiam no repositório e em
-- lugar nenhum do banco.
--
-- COMO ESTA MIGRATION RESOLVE
-- Todo comando aqui é guardado (if exists / if not exists, e constraint sempre
-- drop seguido de add). O efeito é:
--   - banco novo, que replica os arquivos do zero: a 20260819192042 já entra
--     corrigida, então tudo aqui é NO-OP;
--   - banco remoto, que recebeu a versão antiga: os comandos são efetivos.
-- Os dois caminhos convergem para o mesmo schema final.
--
-- Guardar em vez de reconstruir é deliberado: sem Docker não há db dump para
-- conferir o que foi realmente aplicado, então esta migration depende apenas do
-- estado atual do banco, nunca de uma suposição sobre o passado.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Módulo de despesas — fora de escopo
-- -----------------------------------------------------------------------------

drop table if exists public.despesas;

drop type if exists public.tipo_despesa;


-- -----------------------------------------------------------------------------
-- 2. Trilha financeira do caso — fora de escopo
--
-- A coluna sai antes do tipo: o tipo não pode ser removido enquanto houver
-- coluna que dependa dele.
-- -----------------------------------------------------------------------------

alter table public.casos
  drop column if exists status_financeiro;

drop type if exists public.status_financeiro;


-- -----------------------------------------------------------------------------
-- 3. motivo_cancelamento
-- -----------------------------------------------------------------------------

alter table public.casos
  add column if not exists motivo_cancelamento text;

-- Postgres não tem ADD CONSTRAINT IF NOT EXISTS: drop antes de add é o que
-- torna este bloco repetível nos dois cenários.
alter table public.casos
  drop constraint if exists casos_motivo_cancelamento_nao_vazio;

alter table public.casos
  add constraint casos_motivo_cancelamento_nao_vazio
    check (motivo_cancelamento is null or length(btrim(motivo_cancelamento)) > 0);

comment on column public.casos.motivo_cancelamento is
  'Obrigatório quando status_operacional = cancelado — ver casos_status_terminal_valido. Preenchido pela RPC de cancelamento (tarefa futura, junto com o sync do Google Calendar).';


-- -----------------------------------------------------------------------------
-- 4. Constraint de estado terminal
--
-- Substitui casos_encerrado_exige_entrega_confirmada, que só cobria o
-- encerramento e cujo nome viraria mentira ao passar a cobrir o cancelamento.
--   encerrado -> exige entrega confirmada;
--   cancelado -> exige motivo registrado;
--   demais status -> sem exigência.
-- -----------------------------------------------------------------------------

alter table public.casos
  drop constraint if exists casos_encerrado_exige_entrega_confirmada;

alter table public.casos
  drop constraint if exists casos_status_terminal_valido;

alter table public.casos
  add constraint casos_status_terminal_valido
    check (
      case status_operacional
        when 'encerrado' then status_entrega = 'confirmado'
        when 'cancelado' then motivo_cancelamento is not null
        else true
      end
    );
