-- =============================================================================
-- O MATERIAL DO ACOMPANHAMENTO — cartão F, cartão V, baixou e upload.
--
-- PEDIDO DO GESTOR (15/09/2026), para "zerar a planilha". A faixa ENTRADA da
-- planilha mensal tem, ao lado de FOTO e VÍDEO (quem fotografou e quem filmou),
-- quatro colunas que o sistema ainda não sabia guardar:
--
--   CARTÃO F  o cartão de memória da câmera ("10", "14 HSC")
--   CARTÃO V  o celular que filmou ("CEL CLICK 4", ou "CELULAR SARAH")
--   BAIXOU    quem descarregou o material do cartão
--   UPLOAD    quem subiu o material
--
-- É o rastro físico do material: sem ele, quando uma foto some ninguém sabe em
-- que cartão procurar nem a quem perguntar. FOTO e VÍDEO não entram aqui porque
-- o sistema já responde: são o responsável da etapa.
--
-- METADE DISTO JÁ EXISTIA, DORMINDO. O schema inicial (20260819192042) nasceu
-- com `baixou_por` e `subiu_por` em `caso_etapas`, com FK e índice, justamente
-- para estas duas colunas da planilha — e nenhuma RPC nem tela jamais escreveu
-- nelas (conferido no remoto em 15/09/2026: zero linhas preenchidas). Esta
-- migration as REAPROVEITA em vez de criar `upload_por` ao lado de `subiu_por`:
-- duas colunas para a mesma pergunta divergiriam no primeiro dia. O que o
-- schema inicial modelava como FK para `equipamentos` (cartao_id,
-- equipamento_captura_id) caiu junto com o cadastro de equipamentos na
-- 20260820041026, e volta aqui como valor simples.
--
-- POR ETAPA, E NÃO POR CASO. A planilha repete essas colunas para cada bloco de
-- captura, e o gestor pediu os campos "em cada andamento": o cartão do parto não
-- é o cartão do fechamento, e quem baixou um não é necessariamente quem baixou o
-- outro. É o mesmo lugar da `estacao`, que é a pergunta equivalente do lado da
-- edição ("em que PC").
--
-- SÓ NO ACOMPANHAMENTO. Nas etapas de edição não existe cartão nem download: o
-- material já chegou. A constraint abaixo trava isso no banco, e a RPC recusa
-- antes com uma mensagem que diz o porquê.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Qual campo — enum, e não uma RPC que grava os quatro juntos
--
-- Duas pessoas preenchendo campos diferentes da mesma etapa ao mesmo tempo (o
-- Quadro é ao vivo) sobrescreveriam uma à outra com o valor velho que cada tela
-- tinha. Com um campo por chamada, cada gesto escreve só o que mudou.
--
-- Os valores seguem os CABEÇALHOS DA PLANILHA ("upload", não "subiu"): é o
-- vocabulário de quem usa a tela. A coluna de `upload` é `subiu_por`.
-- -----------------------------------------------------------------------------

create type public.campo_material as enum (
  'cartao_foto',
  'cartao_video',
  'baixou',
  'upload'
);

comment on type public.campo_material is
  'Qual campo do material do acompanhamento registrar_material_da_etapa escreve: cartao_foto (CARTÃO F), cartao_video (CARTÃO V), baixou (coluna baixou_por), upload (coluna subiu_por).';


-- -----------------------------------------------------------------------------
-- 2. Colunas
-- -----------------------------------------------------------------------------

alter table public.caso_etapas
  -- TEXTO CURTO, e não inteiro: a planilha tem "14 HSC" e "1 - HSC" — a HSC
  -- tem cartões próprios, e o número sozinho seria outro cartão. Doze
  -- caracteres cabem isso e não cabem um bilhete; para bilhete existe o aviso
  -- da etapa.
  add column cartao_foto text,

  -- TEXTO, e não o número do CEL CLICK. A primeira versão desta migration (mesmo
  -- dia, nunca aplicada) guardava só o número; o gestor lembrou que às vezes o
  -- vídeo sai do celular de alguém da equipe — "CELULAR SARAH". A tela oferece
  -- a lista dos CEL CLICK e aceita digitar o que não está nela, então o teto de
  -- seis aparelhos também não mora aqui.
  add column cartao_video text,

  add constraint caso_etapas_cartao_foto_valido
    check (cartao_foto is null or length(btrim(cartao_foto)) between 1 and 12),

  add constraint caso_etapas_cartao_video_valido
    check (cartao_video is null or length(btrim(cartao_video)) between 1 and 24),

  add constraint caso_etapas_material_so_no_acompanhamento
    check (
      trilha = 'acompanhamento'
      or (cartao_foto is null and cartao_video is null and baixou_por is null and subiu_por is null)
    );

comment on column public.caso_etapas.cartao_foto is
  'CARTÃO F da planilha: o cartão de memória da câmera ("10", "14 HSC"). Só em etapa de acompanhamento. Escrita por registrar_material_da_etapa.';
comment on column public.caso_etapas.cartao_video is
  'CARTÃO V da planilha: o celular que filmou — "CEL CLICK 4" pela lista, ou texto livre ("CELULAR SARAH") quando não é aparelho da empresa. Só em etapa de acompanhamento.';
comment on column public.caso_etapas.baixou_por is
  'BAIXOU da planilha: quem descarregou o material do cartão. Existe desde o schema inicial e passou a ser escrita em 20260915134638. Só em etapa de acompanhamento.';
comment on column public.caso_etapas.subiu_por is
  'UPLOAD da planilha: quem subiu o material. Existe desde o schema inicial e passou a ser escrita em 20260915134638 (campo "upload" da RPC). Só em etapa de acompanhamento.';

-- Os índices das duas FKs (idx_caso_etapas_baixou_por e idx_caso_etapas_subiu_por)
-- vieram com o schema inicial.


-- -----------------------------------------------------------------------------
-- 3. registrar_material_da_etapa
--
-- O MESMO FORMATO DE `registrar_estacao`: não é transição de estado, não toca
-- status nem relógio, aceita etapa em qualquer status e caso em qualquer estado.
-- A planilha é preenchida DEPOIS — o cartão é baixado quando a fotógrafa volta
-- da maternidade, e o upload acontece horas mais tarde. Travar em "etapa aberta"
-- impediria justamente o registro que o pedido existe para fazer.
--
-- Valor em branco LIMPA o campo. Valor igual ao gravado não faz nada — nem
-- evento: o campo salva no blur, e um clique fora sem mudança não é um fato.
-- -----------------------------------------------------------------------------

create or replace function public.registrar_material_da_etapa(
  p_caso_etapa_id uuid,
  p_campo         public.campo_material,
  p_valor         text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_autor     uuid;
  v_etapa     public.caso_etapas%rowtype;
  v_limpo     text;
  v_pessoa    uuid;
  v_anterior  text;
  v_novo      text;
begin
  select p.id into v_autor
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_autor is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  if p_campo is null then
    raise exception 'Informe qual campo do material registrar.';
  end if;

  select * into v_etapa
  from public.caso_etapas ce
  where ce.id = p_caso_etapa_id
  for update;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_etapa.trilha <> 'acompanhamento' then
    raise exception 'Cartão, baixou e upload só existem nas etapas de acompanhamento — na edição o material já chegou.';
  end if;

  v_limpo := nullif(btrim(coalesce(p_valor, '')), '');

  case p_campo
    when 'cartao_foto' then
      if v_limpo is not null and length(v_limpo) > 12 then
        raise exception 'O cartão F aceita no máximo 12 caracteres.';
      end if;

      v_anterior := v_etapa.cartao_foto;
      v_novo     := v_limpo;

      if v_novo is not distinct from v_anterior then
        return;
      end if;

      update public.caso_etapas set cartao_foto = v_novo where id = p_caso_etapa_id;

    when 'cartao_video' then
      if v_limpo is not null and length(v_limpo) > 24 then
        raise exception 'O cartão V aceita no máximo 24 caracteres.';
      end if;

      v_anterior := v_etapa.cartao_video;
      v_novo     := v_limpo;

      if v_novo is not distinct from v_anterior then
        return;
      end if;

      update public.caso_etapas set cartao_video = v_novo where id = p_caso_etapa_id;

    when 'baixou', 'upload' then
      if v_limpo is not null then
        begin
          v_pessoa := v_limpo::uuid;
        exception
          when invalid_text_representation then
            raise exception 'Pessoa inválida.';
        end;

        -- Só pessoa ATIVA entra agora. Quem saiu da equipe continua aparecendo
        -- onde já estava gravado (a FK é restrict), mas não recebe trabalho novo
        -- — a mesma regra do dropdown, que lista só as ativas.
        if not exists (select 1 from public.pessoas p where p.id = v_pessoa and p.ativo) then
          raise exception 'Pessoa % não encontrada ou inativa.', v_pessoa;
        end if;
      end if;

      if p_campo = 'baixou' then
        v_anterior := v_etapa.baixou_por::text;
      else
        v_anterior := v_etapa.subiu_por::text;
      end if;
      v_novo := v_pessoa::text;

      if v_novo is not distinct from v_anterior then
        return;
      end if;

      if p_campo = 'baixou' then
        update public.caso_etapas set baixou_por = v_pessoa where id = p_caso_etapa_id;
      else
        update public.caso_etapas set subiu_por = v_pessoa where id = p_caso_etapa_id;
      end if;
  end case;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_etapa.caso_id,
    p_caso_etapa_id,
    v_autor,
    'material_registrado',
    -- Número de cartão e id de pessoa não abrem porta nenhuma — ao contrário da
    -- url do entregável, podem ir no payload, e é aqui que "quem trocou o cartão
    -- do parto de 10 para 14" sobrevive à próxima correção.
    jsonb_build_object(
      'caso_etapa_id', p_caso_etapa_id,
      'caso_id', v_etapa.caso_id,
      'campo', p_campo,
      'valor', v_novo,
      'valor_anterior', v_anterior
    ),
    now()
  );
end;
$$;

comment on function public.registrar_material_da_etapa(uuid, public.campo_material, text) is
  'Grava UM campo do material do acompanhamento (cartao_foto, cartao_video, baixou -> baixou_por, upload -> subiu_por) numa etapa de acompanhamento. Qualquer pessoa ativa. Em branco limpa; valor igual não gera evento. Não é transição de estado — não toca status nem relógio.';

revoke all on function public.registrar_material_da_etapa(uuid, public.campo_material, text) from public;
revoke all on function public.registrar_material_da_etapa(uuid, public.campo_material, text) from anon;
grant execute on function public.registrar_material_da_etapa(uuid, public.campo_material, text) to authenticated;
