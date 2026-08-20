-- =============================================================================
-- Schema inicial — Sistema de Gestão Operacional (fotografia de parto)
-- Referência: docs/plano.md, seção 5 (Modelo de dados)
--
-- Escopo desta migration: apenas estrutura.
-- RLS é HABILITADO em todas as tabelas, mas nenhuma policy é criada aqui —
-- o efeito é negar tudo para anon/authenticated até a migration de RLS.
-- Funções RPC de transição e a trigger de geração de caso_etapas vêm depois.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Função utilitária de updated_at
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger BEFORE UPDATE reutilizável: carimba updated_at com now() do servidor.';


-- -----------------------------------------------------------------------------
-- 2. Enums
-- -----------------------------------------------------------------------------

-- 'operador' é a linha de base: toda pessoa é operadora (invariante 3.1 do
-- CLAUDE.md). Os demais valores concedem apenas permissão administrativa.
create type public.papel_sistema as enum (
  'operador',
  'comercial',
  'coordenacao',
  'atendimento',
  'financeiro',
  'gestao'
);

create type public.tipo_equipamento as enum (
  'cartao_foto',
  'celular_captura',
  'pc_edicao_foto',
  'pc_edicao_video'
);

create type public.situacao_clinica as enum (
  'aguardando',
  'internada',
  'inducao',
  'trabalho_parto',
  'nasceu',
  'uti',
  'alta'
);

create type public.status_operacional as enum (
  'agendado',
  'em_atendimento',
  'em_edicao',
  'aguardando_entrega',
  'encerrado',
  'cancelado'
);

-- Única trilha de encerramento do caso. A trilha financeira (despesas e
-- conferência do ADM) está fora do escopo desta fase e não existe no schema.
create type public.status_entrega as enum (
  'pendente',
  'links_prontos',
  'confirmado'
);

create type public.termo_status as enum (
  'assinado',
  'pendente',
  'sem_contrato',
  'nao_aplicavel'
);

create type public.etapa_tipo as enum (
  'entrada',
  'nascimento',
  'banho',
  'fechamento',
  'edicao_foto',
  'edicao_video',
  'reels'
);

create type public.status_etapa as enum (
  'pendente',
  'atribuida',
  'em_andamento',
  'concluida',
  'dispensada'
);

create type public.tipo_entregavel as enum (
  'google_photos',
  'wetransfer',
  'cadeado',
  'reels',
  'album'
);

create type public.turno as enum (
  'diurno',
  'noturno',
  'comercial'
);


-- -----------------------------------------------------------------------------
-- 3. Cadastros
-- -----------------------------------------------------------------------------

create table public.pessoas (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  apelidos      text[] not null default '{}',
  ativo         boolean not null default true,
  auth_user_id  uuid unique references auth.users (id) on delete set null,
  pin_hash      text,
  papel_sistema public.papel_sistema not null default 'operador',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint pessoas_nome_nao_vazio check (length(btrim(nome)) > 0)
);

comment on table public.pessoas is
  'Cadastro de pessoas. Não existe usuário do tipo "fotógrafa" ou "editora": toda pessoa é operadora e a função se define pela etapa que executa. papel_sistema concede apenas permissão administrativa.';
comment on column public.pessoas.apelidos is
  'Grafias alternativas encontradas na planilha histórica (ex.: Amanda / Amandinha). Usado pelo script de importação para consolidar registros.';
comment on column public.pessoas.pin_hash is
  'Hash do PIN de login em dispositivo registrado (fase 1). Nunca o PIN em claro.';

create table public.maternidades (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  sigla      text not null unique,
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pacotes (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  slug       text not null unique,
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.pacotes is
  'Produto vendido. O pacote define quais etapas existem no caso, via pacote_etapas.';

create table public.pacote_etapas (
  id          uuid primary key default gen_random_uuid(),
  pacote_id   uuid not null references public.pacotes (id) on delete cascade,
  etapa_tipo  public.etapa_tipo not null,
  obrigatoria boolean not null default true,
  ordem       integer not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint pacote_etapas_unica unique (pacote_id, etapa_tipo)
);

comment on table public.pacote_etapas is
  'Escopo de cada pacote. É a fonte da geração automática de caso_etapas.';

create table public.equipamentos (
  id                  uuid primary key default gen_random_uuid(),
  tipo                public.tipo_equipamento not null,
  identificador       text not null unique,
  maternidade_fixa_id uuid references public.maternidades (id) on delete set null,
  device_token        text unique,
  ativo               boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on column public.equipamentos.identificador is
  'Rótulo físico usado pela equipe: CEL CLICK 3, PC VÍDEO, cartão 14.';
comment on column public.equipamentos.maternidade_fixa_id is
  'Preenchido quando o equipamento é dedicado a uma maternidade (ex.: cartões do HSC).';
comment on column public.equipamentos.device_token is
  'Vincula o PWA ao aparelho. Auto-preenche caso_etapas.equipamento_captura_id e é validado no login por PIN.';


-- -----------------------------------------------------------------------------
-- 4. Núcleo operacional
-- -----------------------------------------------------------------------------

create table public.casos (
  id                       uuid primary key default gen_random_uuid(),
  mae_nome                 text not null,
  bebe_nome                text,
  pacote_id                uuid not null references public.pacotes (id) on delete restrict,
  maternidade_id           uuid not null references public.maternidades (id) on delete restrict,
  previsao_em              timestamptz,
  google_calendar_event_id text unique,
  situacao_clinica         public.situacao_clinica   not null default 'aguardando',
  status_operacional       public.status_operacional not null default 'agendado',
  status_entrega           public.status_entrega     not null default 'pendente',
  termo_status             public.termo_status       not null default 'pendente',
  observacao               text,
  motivo_cancelamento      text,
  criado_por               uuid references public.pessoas (id) on delete restrict,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  -- Estados terminais do caso.
  --   encerrado -> exige entrega confirmada (regra 3 da seção 5 do plano);
  --   cancelado -> exige motivo registrado;
  --   demais status -> sem exigência.
  constraint casos_status_terminal_valido
    check (
      case status_operacional
        when 'encerrado' then status_entrega = 'confirmado'
        when 'cancelado' then motivo_cancelamento is not null
        else true
      end
    ),

  constraint casos_mae_nome_nao_vazio check (length(btrim(mae_nome)) > 0),
  constraint casos_motivo_cancelamento_nao_vazio
    check (motivo_cancelamento is null or length(btrim(motivo_cancelamento)) > 0)
);

comment on table public.casos is
  'Um atendimento completo a uma família, do contrato à confirmação dos links. Contém dado pessoal sensível de saúde e de menor — ver seção 9 do CLAUDE.md.';
comment on column public.casos.previsao_em is
  'Única data que pode vir do cliente (informada pelo comercial). Datas de ocorrência são sempre now() do servidor — invariante 3.4.';
comment on column public.casos.motivo_cancelamento is
  'Obrigatório quando status_operacional = cancelado — ver casos_status_terminal_valido. Preenchido pela RPC de cancelamento (tarefa futura, junto com o sync do Google Calendar).';

create table public.caso_etapas (
  id                     uuid primary key default gen_random_uuid(),
  caso_id                uuid not null references public.casos (id) on delete cascade,
  tipo                   public.etapa_tipo   not null,
  status                 public.status_etapa not null default 'pendente',
  ordem                  integer not null default 0,
  responsavel_id         uuid references public.pessoas (id) on delete restrict,
  atribuido_por          uuid references public.pessoas (id) on delete restrict,
  atribuido_em           timestamptz,
  equipamento_captura_id uuid references public.equipamentos (id) on delete restrict,
  cartao_id              uuid references public.equipamentos (id) on delete restrict,
  estacao_id             uuid references public.equipamentos (id) on delete restrict,
  iniciado_em            timestamptz,
  concluido_em           timestamptz,
  baixou_por             uuid references public.pessoas (id) on delete restrict,
  subiu_por              uuid references public.pessoas (id) on delete restrict,
  observacao             text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint caso_etapas_unica_por_caso unique (caso_id, tipo),
  constraint caso_etapas_atribuicao_completa
    check ((atribuido_por is null) = (atribuido_em is null)),
  constraint caso_etapas_conclusao_exige_inicio
    check (concluido_em is null or iniciado_em is not null),
  constraint caso_etapas_conclusao_apos_inicio
    check (concluido_em is null or concluido_em >= iniciado_em)
);

comment on table public.caso_etapas is
  'Unidade de trabalho dentro de um caso. Gerada automaticamente a partir de pacote_etapas — nunca criada à mão.';
comment on column public.caso_etapas.ordem is
  'Copiada de pacote_etapas.ordem na geração. Define a ordem de exibição na tela do caso.';
comment on column public.caso_etapas.iniciado_em is
  'Carimbado por now() do servidor dentro de iniciar_etapa(). Nunca vem do cliente.';
comment on column public.caso_etapas.concluido_em is
  'Carimbado por now() do servidor dentro de concluir_etapa(). Nunca vem do cliente. O tempo de ciclo é concluido_em menos iniciado_em.';
comment on column public.caso_etapas.estacao_id is
  'PC de edição. Recurso exclusivo: ver índice caso_etapas_estacao_exclusiva.';

-- Regra 4 da seção 5 do plano: estação de edição é recurso exclusivo.
-- Duas etapas não podem estar em_andamento na mesma estação — é essa validação
-- que expõe a fila por indisponibilidade de máquina (achado da seção 2).
create unique index caso_etapas_estacao_exclusiva
  on public.caso_etapas (estacao_id)
  where status = 'em_andamento' and estacao_id is not null;

create table public.handoffs (
  id             uuid primary key default gen_random_uuid(),
  caso_etapa_id  uuid not null references public.caso_etapas (id) on delete cascade,
  de_pessoa_id   uuid references public.pessoas (id) on delete restrict,
  para_pessoa_id uuid not null references public.pessoas (id) on delete restrict,
  motivo         text,
  ocorrido_em    timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint handoffs_pessoas_distintas
    check (de_pessoa_id is distinct from para_pessoa_id)
);

comment on table public.handoffs is
  'Passagem de uma etapa de uma pessoa para outra. Operação de primeira classe: o handoff grava a linha E atualiza caso_etapas.responsavel_id na mesma transação. Nunca sobrescrever o responsável sem esta linha — invariante 3.2.';


-- -----------------------------------------------------------------------------
-- 5. Entrega
-- -----------------------------------------------------------------------------

create table public.entregaveis (
  id             uuid primary key default gen_random_uuid(),
  caso_id        uuid not null references public.casos (id) on delete cascade,
  tipo           public.tipo_entregavel not null,
  url            text not null,
  criado_por     uuid references public.pessoas (id) on delete restrict,
  criado_em      timestamptz not null default now(),
  confirmado_por uuid references public.pessoas (id) on delete restrict,
  confirmado_em  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint entregaveis_confirmacao_completa
    check ((confirmado_por is null) = (confirmado_em is null)),
  constraint entregaveis_url_nao_vazia check (length(btrim(url)) > 0)
);

comment on table public.entregaveis is
  'Links finais para a família. A confirmação (confirmado_por/confirmado_em) é o gesto do atendimento que fecha o caso.';
comment on column public.entregaveis.url is
  'CREDENCIAL DE ACESSO à galeria da família. Tratar como segredo: nunca logar, nunca expor em listagem pública — seção 9 do CLAUDE.md.';

-- -----------------------------------------------------------------------------
-- 6. Escala e medição
-- -----------------------------------------------------------------------------

create table public.escalas (
  id         uuid primary key default gen_random_uuid(),
  pessoa_id  uuid not null references public.pessoas (id) on delete restrict,
  data       date not null,
  turno      public.turno not null,
  inicio     timestamptz not null,
  fim        timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint escalas_unica_por_turno unique (pessoa_id, data, turno),
  constraint escalas_fim_apos_inicio check (fim > inicio)
);

comment on table public.escalas is
  'Janela de turno prevista. Serve para alerta operacional quando um parto estoura o turno. NÃO é registro de ponto nem base de cálculo de jornada — seção 8 do CLAUDE.md.';

create table public.padroes_tempo (
  id                uuid primary key default gen_random_uuid(),
  etapa_tipo        public.etapa_tipo not null,
  pacote_id         uuid references public.pacotes (id) on delete cascade,
  minutos_esperados integer not null,
  vigente_desde     date not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint padroes_tempo_vigencia_unica
    unique nulls not distinct (etapa_tipo, pacote_id, vigente_desde),
  constraint padroes_tempo_minutos_positivos check (minutos_esperados > 0)
);

comment on table public.padroes_tempo is
  'A régua da produtividade. Os números vêm do cliente e são calibrados com 30 a 60 dias de dados reais — nunca chutados no código. Versionada por vigente_desde: uma nova régua é uma linha nova, jamais um UPDATE na anterior.';
comment on column public.padroes_tempo.pacote_id is
  'NULL = padrão geral do tipo de etapa. Preenchido = padrão específico daquele pacote.';

create table public.eventos (
  id            uuid primary key default gen_random_uuid(),
  caso_id       uuid references public.casos (id) on delete restrict,
  caso_etapa_id uuid references public.caso_etapas (id) on delete restrict,
  pessoa_id     uuid references public.pessoas (id) on delete restrict,
  tipo          text not null,
  payload       jsonb not null default '{}'::jsonb,
  ocorrido_em   timestamptz not null default now(),
  device_id     uuid references public.equipamentos (id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint eventos_tipo_nao_vazio check (length(btrim(tipo)) > 0)
);

comment on table public.eventos is
  'Log APPEND-ONLY. Nunca sofre UPDATE nem DELETE — invariante 3.3. Todo indicador do painel deriva daqui, o que permite recalcular métricas com definições novas sem perder histórico. O enforcement por RLS e por GRANT vem na migration de RLS.';
comment on column public.eventos.tipo is
  'Texto, não enum: o catálogo de eventos cresce sem parar e um enum exigiria uma migration por evento novo.';
comment on column public.eventos.pessoa_id is
  'Nulo apenas para eventos sem ator humano (gerados por trigger). Toda ação de pessoa deve preencher.';


-- -----------------------------------------------------------------------------
-- 7. Índices — toda FK tem índice explícito, mais os acessos quentes do Quadro
-- -----------------------------------------------------------------------------

-- FKs
create index idx_pacote_etapas_pacote        on public.pacote_etapas (pacote_id);
create index idx_equipamentos_maternidade    on public.equipamentos (maternidade_fixa_id);

create index idx_casos_pacote                on public.casos (pacote_id);
create index idx_casos_maternidade           on public.casos (maternidade_id);
create index idx_casos_criado_por            on public.casos (criado_por);

create index idx_caso_etapas_caso            on public.caso_etapas (caso_id);
create index idx_caso_etapas_responsavel     on public.caso_etapas (responsavel_id);
create index idx_caso_etapas_atribuido_por   on public.caso_etapas (atribuido_por);
create index idx_caso_etapas_equipamento     on public.caso_etapas (equipamento_captura_id);
create index idx_caso_etapas_cartao          on public.caso_etapas (cartao_id);
create index idx_caso_etapas_estacao         on public.caso_etapas (estacao_id);
create index idx_caso_etapas_baixou_por      on public.caso_etapas (baixou_por);
create index idx_caso_etapas_subiu_por       on public.caso_etapas (subiu_por);

create index idx_handoffs_caso_etapa         on public.handoffs (caso_etapa_id);
create index idx_handoffs_de_pessoa          on public.handoffs (de_pessoa_id);
create index idx_handoffs_para_pessoa        on public.handoffs (para_pessoa_id);

create index idx_entregaveis_caso            on public.entregaveis (caso_id);
create index idx_entregaveis_criado_por      on public.entregaveis (criado_por);
create index idx_entregaveis_confirmado_por  on public.entregaveis (confirmado_por);

create index idx_escalas_pessoa              on public.escalas (pessoa_id);
create index idx_padroes_tempo_pacote        on public.padroes_tempo (pacote_id);

create index idx_eventos_caso                on public.eventos (caso_id);
create index idx_eventos_caso_etapa          on public.eventos (caso_etapa_id);
create index idx_eventos_pessoa              on public.eventos (pessoa_id);
create index idx_eventos_device              on public.eventos (device_id);

-- Acessos quentes
-- Quadro: casos ativos por maternidade.
create index idx_casos_ativos
  on public.casos (maternidade_id, previsao_em)
  where status_operacional not in ('encerrado', 'cancelado');

-- Fila de edição: pendentes e idade do mais antigo.
create index idx_caso_etapas_fila
  on public.caso_etapas (tipo, status, created_at)
  where status in ('pendente', 'atribuida', 'em_andamento');

-- Painel: séries temporais derivadas de eventos.
create index idx_eventos_ocorrido_em  on public.eventos (ocorrido_em desc);
create index idx_eventos_tipo_ocorrido on public.eventos (tipo, ocorrido_em desc);

-- Escala: quem está de turno agora.
create index idx_escalas_janela on public.escalas (inicio, fim);


-- -----------------------------------------------------------------------------
-- 8. Triggers de updated_at
-- -----------------------------------------------------------------------------

create trigger set_updated_at before update on public.pessoas
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.maternidades
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.pacotes
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.pacote_etapas
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.equipamentos
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.casos
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.caso_etapas
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.handoffs
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.entregaveis
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.escalas
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.padroes_tempo
  for each row execute function public.set_updated_at();
-- eventos é append-only: a trigger existe por uniformidade e nunca dispara.
create trigger set_updated_at before update on public.eventos
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 9. RLS habilitado em todas as tabelas, sem exceção
--
-- Nenhuma policy é criada nesta migration. Sem policy, o efeito é negar tudo
-- para as roles anon e authenticated — o estado seguro enquanto as políticas
-- por papel não chegam. service_role e o owner continuam passando.
-- -----------------------------------------------------------------------------

alter table public.pessoas       enable row level security;
alter table public.maternidades  enable row level security;
alter table public.pacotes       enable row level security;
alter table public.pacote_etapas enable row level security;
alter table public.equipamentos  enable row level security;
alter table public.casos         enable row level security;
alter table public.caso_etapas   enable row level security;
alter table public.handoffs      enable row level security;
alter table public.entregaveis   enable row level security;
alter table public.escalas       enable row level security;
alter table public.padroes_tempo enable row level security;
alter table public.eventos       enable row level security;
