import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import { agendarRecargaDoCaso, agendarRecargaDoQuadro } from './recarga'
import { casoDaEtapa } from './atualizar-por-caso'
import type { FaseAlbum, FaseVideoMaster, TermoStatus } from '../types'

export type TipoEntregavel = Database['public']['Enums']['tipo_entregavel']
export type EtapaTipo = Database['public']['Enums']['etapa_tipo']

export interface EntregavelResumo {
  id: string
  tipo: TipoEntregavel
  url: string
  criado_em: string
  confirmado_em: string | null
}

/**
 * Toda transição de estado passa por RPC — nunca `.update()` direto
 * (seção 4 do CLAUDE.md). A escrita direta nem sequer é possível: depois da
 * migration 20260822072158, `authenticated` não tem GRANT de UPDATE em
 * caso_etapas, e em casos só nas 9 colunas de dado. A máquina de estado é
 * inalcançável fora das RPCs, por privilégio e não só por convenção.
 *
 * NENHUMA mutação mexe em estado local de etapa. Depois da RPC, a fonte da
 * verdade é o banco: invalida a query do Quadro e a tela redesenha com o que
 * voltou. É isso que faz o SLA aparecer sozinho ao concluir o nascimento —
 * `vence_em` é derivado na view, ninguém calcula no cliente.
 */

function useAcaoDoQuadro<TVars>(executar: (vars: TVars) => Promise<void>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: executar,
    onSuccess: (_resultado, vars) => {
      // As quatro coisas que uma ação muda: o Quadro, os links do caso, as
      // despesas e o histórico. Esquecer o histórico o deixava congelado por
      // 30s (o staleTime global) — a pessoa agia e o log não mostrava a própria
      // ação.
      //
      // O QUADRO E O HISTÓRICO ENTRAM NA FILA COMPARTILHADA com o Realtime
      // (18/09/2026): recarregar aqui E no eco do Realtime fazia quem agia
      // baixar o Quadro inteiro duas vezes por toque. Ver recarga.ts.
      //
      // E SÓ O CASO DA AÇÃO, quando dá para saber qual é — quase sempre dá. A
      // ação que não diz (apagar um link ou uma despesa pelo id deles) recarrega
      // tudo, como antes: é rara, e não vale uma consulta a mais para descobrir.
      const casoId = casoDaAcao(queryClient, vars)
      if (casoId) agendarRecargaDoCaso(queryClient, casoId)
      else agendarRecargaDoQuadro(queryClient)
      void queryClient.invalidateQueries({ queryKey: ['entregaveis'] })
      void queryClient.invalidateQueries({ queryKey: ['despesas'] })
    },
  })
}

/** O caso sobre o qual a ação agiu: pelo `casoId`, ou pela etapa em memória. */
function casoDaAcao(queryClient: QueryClient, vars: unknown): string | null {
  if (typeof vars !== 'object' || vars === null) return null
  const campos = vars as Record<string, unknown>
  if (typeof campos.casoId === 'string') return campos.casoId
  if (typeof campos.casoEtapaId === 'string') return casoDaEtapa(queryClient, campos.casoEtapaId)
  return null
}

/** Erro do PostgREST já vem tipado; só precisa virar throw para o TanStack. */
async function chamar(nome: string, args: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.rpc(
    nome as Parameters<typeof supabase.rpc>[0],
    args as never,
  )
  if (error) throw error
}

export function useIniciarEtapa() {
  return useAcaoDoQuadro<{ casoEtapaId: string }>(({ casoEtapaId }) =>
    chamar('iniciar_etapa', { p_caso_etapa_id: casoEtapaId }),
  )
}

export function useConcluirEtapa() {
  // p_observacao é opcional na RPC e a tela não pede: concluir precisa sair em
  // até 3 toques (seção 6 do CLAUDE.md). O parâmetro fica exposto aqui para
  // quando houver uma tela de detalhe do caso com campo de observação.
  return useAcaoDoQuadro<{ casoEtapaId: string; observacao?: string }>(
    ({ casoEtapaId, observacao }) =>
      chamar('concluir_etapa', {
        p_caso_etapa_id: casoEtapaId,
        p_observacao: observacao ?? null,
      }),
  )
}

/**
 * APAGA um link de entrega.
 *
 * Qualquer pessoa ativa pode chamar — quem colou o link errado é quem percebe
 * primeiro, e chamar o ADM para desfazer um engano de digitação criaria fila
 * para um gesto de dois segundos. Link JÁ CONFIRMADO o banco recusa: ele faz
 * parte de uma entrega fechada.
 */
export function useRemoverEntregavel() {
  return useAcaoDoQuadro<{ entregavelId: string; motivo?: string }>(
    ({ entregavelId, motivo }) =>
      chamar('remover_entregavel', {
        p_entregavel_id: entregavelId,
        ...(motivo === undefined ? {} : { p_motivo: motivo }),
      }),
  )
}

/**
 * DEVOLVE o caso de Entregáveis para o Quadro, com motivo.
 *
 * É o avesso de `confirmar_entrega` e pede o mesmo papel: as duas são as duas
 * saídas da mesma conferência — "está bom, entreguei" e "não está bom, refaça".
 * Não mexe nas etapas; o trabalho continua concluído, o que voltou foi a
 * entrega.
 */
export function useDevolverParaOQuadro() {
  return useAcaoDoQuadro<{ casoId: string; motivo: string }>(({ casoId, motivo }) =>
    chamar('devolver_para_o_quadro', { p_caso_id: casoId, p_motivo: motivo }),
  )
}

/**
 * ENVIA o caso pronto para a aba Entregas.
 *
 * Chamável por qualquer pessoa ativa, e é o ponto do desenho: quem acabou de
 * editar é quem sabe que acabou. Quem CONFIRMA a entrega depois é outra
 * pessoa — atendimento ou adm —, e essa parte é a RPC `confirmar_entrega`.
 *
 * Idempotente do lado do banco: dois toques não reescrevem quem enviou.
 */
export function useLiberarParaEntrega() {
  return useAcaoDoQuadro<{ casoId: string }>(({ casoId }) =>
    chamar('liberar_para_entrega', { p_caso_id: casoId }),
  )
}

/**
 * Designa responsável a uma etapa que ainda não começou. Distinta de
 * transferir: ali houve passagem de trabalho e vira linha em `handoffs`; aqui
 * nada foi passado porque nada começou.
 */
export function useAtribuirEtapa() {
  return useAcaoDoQuadro<{ casoEtapaId: string; paraPessoaId: string }>(
    ({ casoEtapaId, paraPessoaId }) =>
      chamar('atribuir_etapa', {
        p_caso_etapa_id: casoEtapaId,
        p_para_pessoa_id: paraPessoaId,
      }),
  )
}

export function useTransferirEtapa() {
  return useAcaoDoQuadro<{
    casoEtapaId: string
    paraPessoaId: string
    motivo?: string
  }>(({ casoEtapaId, paraPessoaId, motivo }) =>
    chamar('transferir_etapa', {
      p_caso_etapa_id: casoEtapaId,
      p_para_pessoa_id: paraPessoaId,
      p_motivo: motivo?.trim() || null,
    }),
  )
}

/**
 * Confirmar entrega encerra o caso.
 *
 * Até a migration 20260825014102 esta função registrava um entregável de
 * MENTIRA antes de confirmar — a RPC exige ao menos um link e não havia tela
 * para colar o de verdade. Isso gravava uma url falsa numa tabela cujo conteúdo
 * o CLAUDE.md trata como credencial. O placeholder morreu junto com o
 * DialogoEntregaveis, que cola o link real.
 *
 * Qualquer pessoa ativa confirma: quem gera os links são as fotógrafas.
 */
export function useConfirmarEntrega() {
  return useAcaoDoQuadro<{ casoId: string }>(({ casoId }) =>
    chamar('confirmar_entrega', { p_caso_id: casoId }),
  )
}

/**
 * O termo de uso de imagem (22/09/2026). Atendimento ou adm, em caso de
 * qualquer estado: a resposta é dada ao confirmar a entrega e se corrige
 * depois, inclusive num caso já encerrado. Ver lib/termo.ts.
 */
export function useRegistrarTermo() {
  return useAcaoDoQuadro<{ casoId: string; termo: TermoStatus }>(({ casoId, termo }) =>
    chamar('registrar_termo', { p_caso_id: casoId, p_termo: termo }),
  )
}

export function useRegistrarEntregavel() {
  return useAcaoDoQuadro<{ casoId: string; tipo: TipoEntregavel; url: string }>(
    ({ casoId, tipo, url }) =>
      chamar('registrar_entregavel', {
        p_caso_id: casoId,
        p_tipo: tipo,
        p_url: url.trim(),
      }),
  )
}

/**
 * Links de UM caso, buscados só quando o card está aberto.
 *
 * Deliberadamente fora da carga principal do Quadro: `entregaveis.url` é
 * credencial de acesso à galeria da família (seção 10 do CLAUDE.md). Trazer a
 * url de 80 casos para desenhar zero delas seria manter no cliente o que a tela
 * nem mostra. Um card aberto por vez, uma query.
 */
export function useEntregaveis(casoId: string, habilitado: boolean) {
  return useQuery({
    queryKey: ['entregaveis', casoId],
    enabled: habilitado,
    queryFn: async (): Promise<EntregavelResumo[]> => {
      const { data, error } = await supabase
        .from('entregaveis')
        .select('id, tipo, url, criado_em, confirmado_em')
        .eq('caso_id', casoId)
        .order('criado_em')
      if (error) throw error
      return data ?? []
    },
  })
}

export function usePausarEtapa() {
  return useAcaoDoQuadro<{ casoEtapaId: string }>(({ casoEtapaId }) =>
    chamar('pausar_etapa', { p_caso_etapa_id: casoEtapaId }),
  )
}

export function useMoverParaUti() {
  return useAcaoDoQuadro<{ casoId: string }>(({ casoId }) =>
    chamar('mover_para_uti', { p_caso_id: casoId }),
  )
}

export function useRetornarDaUti() {
  return useAcaoDoQuadro<{ casoId: string }>(({ casoId }) =>
    chamar('retornar_da_uti', { p_caso_id: casoId }),
  )
}

/**
 * Marca em qual PC a etapa está sendo editada. Texto livre ("pc-1"); em branco
 * limpa. Ver registrar_estacao na migration 20260827181322.
 */
export function useRegistrarEstacao() {
  return useAcaoDoQuadro<{ casoEtapaId: string; estacao: string }>(
    ({ casoEtapaId, estacao }) =>
      chamar('registrar_estacao', {
        p_caso_etapa_id: casoEtapaId,
        p_estacao: estacao,
      }),
  )
}

export type CampoMaterial = Database['public']['Enums']['campo_material']

/**
 * Grava UM campo do material do acompanhamento — cartão F, CEL CLICK, quem
 * baixou, quem subiu. Um campo por chamada de propósito: duas pessoas mexendo
 * em campos diferentes da mesma etapa não se sobrescrevem. Em branco limpa.
 * Ver registrar_material_da_etapa na migration 20260915134638.
 */
export function useRegistrarMaterial() {
  return useAcaoDoQuadro<{ casoEtapaId: string; campo: CampoMaterial; valor: string }>(
    ({ casoEtapaId, campo, valor }) =>
      chamar('registrar_material_da_etapa', {
        p_caso_etapa_id: casoEtapaId,
        p_campo: campo,
        p_valor: valor,
      }),
  )
}

/**
 * Desfaz a conclusão de uma etapa: volta para em_andamento e limpa
 * concluido_em, preservando iniciado_em. Ver reabrir_etapa na migration
 * 20260827172830.
 */
export function useReabrirEtapa() {
  return useAcaoDoQuadro<{ casoEtapaId: string; motivo?: string }>(
    ({ casoEtapaId, motivo }) =>
      chamar('reabrir_etapa', {
        p_caso_etapa_id: casoEtapaId,
        p_motivo: motivo ?? null,
      }),
  )
}

/**
 * Escreve (ou apaga, com texto vazio) a observação de uma etapa, em qualquer
 * status. Não é transição de estado — ver anotar_etapa na migration
 * 20260827155728.
 */
export function useAnotarEtapa() {
  return useAcaoDoQuadro<{ casoEtapaId: string; observacao: string }>(
    ({ casoEtapaId, observacao }) =>
      chamar('anotar_etapa', {
        p_caso_etapa_id: casoEtapaId,
        p_observacao: observacao,
      }),
  )
}

/**
 * Anuncia quem assume a etapa na virada de turno, sem trocar o responsável.
 * `proximaPessoaId: null` cancela o plano.
 */
export function usePlanejarRendicao() {
  return useAcaoDoQuadro<{ casoEtapaId: string; proximaPessoaId: string | null }>(
    ({ casoEtapaId, proximaPessoaId }) =>
      chamar('planejar_rendicao', {
        p_caso_etapa_id: casoEtapaId,
        p_proxima_pessoa_id: proximaPessoaId,
      }),
  )
}

/**
 * Acrescenta ao caso uma etapa que o pacote dele não previa — o banho vendido
 * na hora, o fechamento que passou a existir.
 *
 * Substitui `useAdicionarVideo`, que era isto com o tipo cravado em vídeo.
 * Ver a migration 20260830063452: o pacote do caso NÃO muda, e a RPC recusa
 * rascunho sem pacote.
 */
export function useAdicionarEtapa() {
  return useAcaoDoQuadro<{ casoId: string; tipo: EtapaTipo }>(({ casoId, tipo }) =>
    chamar('adicionar_etapa', { p_caso_id: casoId, p_tipo: tipo }),
  )
}

/**
 * Leva o vídeo horizontal do MASTER de uma fase à outra.
 *
 * Uma RPC para o fluxo inteiro, nos dois sentidos — ver a migration
 * 20260901051232. A tela não precisa saber qual transição é qual: manda a
 * fase de destino e o banco valida (recusa etapa que não é `edicao_video`,
 * recusa caso terminal, e é idempotente na fase atual).
 */
export function useMoverVideoMaster() {
  return useAcaoDoQuadro<{ casoEtapaId: string; fase: FaseVideoMaster }>(
    ({ casoEtapaId, fase }) =>
      chamar('mover_video_master', { p_caso_etapa_id: casoEtapaId, p_fase: fase }),
  )
}

/**
 * TERMINA A EDIÇÃO DO VÍDEO DO MASTER (migration 20260921211604).
 *
 * Os dois links que o gestor exige — o do vídeo e o WeTransfer — e a ida para
 * "Pronto para entrega", numa transação só. O vídeo NÃO conclui: fica na seção
 * e aparece em Entregáveis, e só a confirmação da Morgana o tira de lá. Até
 * 21/09 havia `finalizar_video_master`, que pedia um link só e concluía na hora.
 */
export function useEnviarVideoParaEntrega() {
  return useAcaoDoQuadro<{ casoEtapaId: string; linkVideo: string; linkWetransfer: string }>(
    ({ casoEtapaId, linkVideo, linkWetransfer }) =>
      chamar('enviar_video_para_entrega', {
        p_caso_etapa_id: casoEtapaId,
        p_link_video: linkVideo.trim(),
        p_link_wetransfer: linkWetransfer.trim(),
      }),
  )
}

/**
 * A MORGANA CONFIRMA A ENTREGA DO VÍDEO, em Entregáveis: a etapa conclui, os
 * dois links viram confirmados, e o cartão sai da seção MASTER.
 */
export function useConfirmarEntregaDoVideo() {
  return useAcaoDoQuadro<{ casoEtapaId: string }>(({ casoEtapaId }) =>
    chamar('confirmar_entrega_do_video', { p_caso_etapa_id: casoEtapaId }),
  )
}

/**
 * Move o fotolivro na esteira (migration 20260910150425).
 *
 * Mesma forma do `useMoverVideoMaster` acima: a tela manda a fase de destino e
 * o banco valida. A diferença está no que a RPC faz com ela — `mover_album`
 * escreve TAMBÉM o status da etapa, para a fase e o relógio nunca discordarem.
 */
export function useMoverAlbum() {
  return useAcaoDoQuadro<{ casoEtapaId: string; fase: FaseAlbum }>(
    ({ casoEtapaId, fase }) =>
      chamar('mover_album', { p_caso_etapa_id: casoEtapaId, p_fase: fase }),
  )
}

/** Os formatos da capa: "png simples, podendo até ser um print da tela". */
export const TIPOS_DA_CAPA = ['image/png', 'image/jpeg', 'image/webp']

/**
 * 5 MB. O bucket aceita bem mais (é o de vídeo de parto); este teto é da capa,
 * que é uma imagem só, e existe para recusar antes de subir.
 */
export const TAMANHO_MAXIMO_DA_CAPA = 5 * 1024 * 1024

/**
 * MANDA O FOTOLIVRO PARA APROVAÇÃO DO CLIENTE (migration 20260921202848).
 *
 * Dois passos, como a foto de perfil: o ARQUIVO vai direto do navegador para o
 * bucket privado `midias`, na pasta desta etapa (é o que a policy de upload
 * confere); o CAMINHO e o link vão pela RPC, que grava os dois e move a fase na
 * mesma transação.
 *
 * `arquivo` nulo reaproveita a capa que já está gravada — é o caminho de volta
 * depois de um pedido de alterações em que a capa não mudou.
 *
 * O NOME DO ARQUIVO LEVA CARIMBO DE TEMPO, pela mesma razão do retrato: um
 * caminho fixo traria de volta a capa antiga do cache do navegador. A antiga
 * fica no bucket — sem policy de remoção, ninguém apaga a capa de outra pessoa.
 */
export function useEnviarFotolivroParaAprovacao() {
  return useAcaoDoQuadro<{
    casoEtapaId: string
    link: string
    arquivo: File | null
    capaAtual: string | null
  }>(async ({ casoEtapaId, link, arquivo, capaAtual }) => {
    let capa = capaAtual

    if (arquivo) {
      if (!TIPOS_DA_CAPA.includes(arquivo.type)) {
        throw new Error('A capa precisa ser uma imagem PNG, JPG ou WEBP.')
      }
      if (arquivo.size > TAMANHO_MAXIMO_DA_CAPA) {
        throw new Error('A imagem da capa precisa ter no máximo 5 MB.')
      }
      const extensao =
        arquivo.type === 'image/png' ? 'png' : arquivo.type === 'image/webp' ? 'webp' : 'jpg'
      capa = `fotolivro/${casoEtapaId}/${Date.now()}.${extensao}`

      const { error } = await supabase.storage
        .from('midias')
        .upload(capa, arquivo, { contentType: arquivo.type })
      if (error) throw new Error(`Não foi possível enviar a capa: ${error.message}`)
    }

    if (!capa) throw new Error('Falta a imagem da capa do Foto/Livro.')

    await chamar('enviar_fotolivro_para_aprovacao', {
      p_caso_etapa_id: casoEtapaId,
      p_link: link.trim(),
      p_capa: capa,
    })
  })
}

/**
 * "ENVIADO AO CLIENTE" (migration 20260921202848): a Morgana mandou a prova, e o
 * fotolivro sai de Entregáveis. Na seção ele continua em "Aguardando aprovação".
 */
export function useMarcarFotolivroEnviado() {
  return useAcaoDoQuadro<{ casoEtapaId: string }>(({ casoEtapaId }) =>
    chamar('marcar_fotolivro_enviado', { p_caso_etapa_id: casoEtapaId }),
  )
}

/**
 * A URL assinada da CAPA. Uma hora, como o retrato: a capa tem foto do bebê
 * (seção 10 do CLAUDE.md), e o link não vale muito se vazar. A query guarda o
 * resultado por menos que isso, então a URL nunca expira em tela.
 */
export function useUrlDaCapa(caminho: string | null) {
  return useQuery({
    queryKey: ['capa-do-fotolivro', caminho ?? ''],
    enabled: Boolean(caminho),
    staleTime: 55 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from('midias')
        .createSignedUrl(caminho as string, 60 * 60)
      if (error) throw error
      return data.signedUrl
    },
  })
}

/**
 * PEDIDO DE ALTERAÇÃO do vídeo ou do Foto/Livro (migration 20260916215022).
 *
 * Devolve SÓ a etapa para a fase de alteração e guarda o que a família pediu,
 * na mesma transação — o caso continua encerrado. É o que o diálogo de
 * reabertura chama quando o que foi marcado é uma das duas etapas com seção
 * própria; para todas as outras ele continua chamando `reabrir_caso`, que cria
 * rodada nova e devolve o cartão ao Quadro.
 */
export function usePedirAlteracaoDaEtapa() {
  return useAcaoDoQuadro<{ casoEtapaId: string; motivo: string }>(
    ({ casoEtapaId, motivo }) =>
      chamar('pedir_alteracao_da_etapa', {
        p_caso_etapa_id: casoEtapaId,
        p_motivo: motivo,
      }),
  )
}

export function useCancelarCaso() {
  return useAcaoDoQuadro<{ casoId: string; motivo: string }>(({ casoId, motivo }) =>
    chamar('cancelar_caso', { p_caso_id: casoId, p_motivo: motivo }),
  )
}

export interface PessoaOpcao {
  id: string
  nome: string
}

/**
 * Pessoas ativas, para o seletor do handoff. Vem do banco: hoje são os usuários
 * de desenvolvimento, e quando o cadastro real do cliente entrar funciona igual,
 * sem tocar nesta tela.
 *
 * Cache longo de propósito: cadastro muda em escala de semanas, e a lista é
 * aberta no meio de um handoff — não é hora de esperar rede.
 */
/**
 * Traz de volta um caso encerrado, com o motivo e as etapas a refazer.
 *
 * O motivo não é burocracia: ele vira a observação de cada etapa criada, e é
 * o que a editora lê para saber o que a família pediu. A RPC recusa em branco.
 */
export function useReabrirCaso() {
  return useAcaoDoQuadro<{ casoId: string; motivo: string; etapas: EtapaTipo[] }>(
    ({ casoId, motivo, etapas }) =>
      chamar('reabrir_caso', {
        p_caso_id: casoId,
        p_motivo: motivo,
        p_etapas: etapas,
      }),
  )
}

/**
 * Desfaz um cancelamento feito pelo SYNC do Calendar. O banco recusa o que a
 * equipe cancelou e quem não é atendimento ou adm; o status volta derivado das
 * etapas.
 */
export function useRestaurarCaso() {
  return useAcaoDoQuadro<{ casoId: string; motivo: string }>(({ casoId, motivo }) =>
    chamar('restaurar_caso_cancelado_pelo_sync', {
      p_caso_id: casoId,
      p_motivo: motivo,
    }),
  )
}

/**
 * Marca a etapa como DISPENSADA — ela não vai acontecer neste caso.
 *
 * É o que destrava um BIRTH sem fechamento: dispensada conta como resolvida na
 * trava de encerramento, então o caso passa a poder fechar. Reversível pelo
 * mesmo botão de desfazer da conclusão.
 */
export function useDispensarEtapa() {
  return useAcaoDoQuadro<{ casoEtapaId: string; motivo?: string }>(
    ({ casoEtapaId, motivo }) =>
      chamar('dispensar_etapa', {
        p_caso_etapa_id: casoEtapaId,
        p_motivo: motivo ?? null,
      }),
  )
}

/** A hora combinada de uma etapa (banho, fechamento). `null` limpa. */
export function useAgendarEtapa() {
  return useAcaoDoQuadro<{ casoEtapaId: string; previsaoEm: string | null }>(
    ({ casoEtapaId, previsaoEm }) =>
      chamar('agendar_etapa', {
        p_caso_etapa_id: casoEtapaId,
        p_previsao_em: previsaoEm,
      }),
  )
}

export function usePessoasAtivas() {
  return useQuery({
    queryKey: ['pessoas', 'ativas'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PessoaOpcao[]> => {
      const { data, error } = await supabase
        .from('pessoas')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome')
      if (error) throw error
      return data ?? []
    },
  })
}

/* ===========================================================================
 * DESPESAS DO CASO (12/09/2026, pedido do gestor)
 *
 * O Uber das fotógrafas sai do cartão da empresa e hoje é somado por caso numa
 * faixa de colunas da planilha. Ver a migration 20260913022926 para o modelo e
 * para por que o módulo financeiro voltou depois de ter sido removido.
 * =========================================================================== */

export type TipoDespesa = Database['public']['Enums']['tipo_despesa']
export type MomentoDespesa = Database['public']['Enums']['momento_despesa']

export interface DespesaResumo {
  id: string
  tipo: TipoDespesa
  momento: MomentoDespesa | null
  valor: number
  descricao: string | null
  registrado_em: string
  /** De quem foi o gasto. Null só se a pessoa sumir do cadastro. */
  pessoaNome: string | null
}

/**
 * Despesas de UM caso, buscadas só com o card aberto.
 *
 * Mesma regra dos entregáveis, por outro motivo: valor não é credencial, mas
 * somar oitenta casos para desenhar zero deles é tráfego à toa numa tela que a
 * operação abre num celular, no corredor.
 */
export function useDespesas(casoId: string, habilitado: boolean) {
  return useQuery({
    queryKey: ['despesas', casoId],
    enabled: habilitado,
    queryFn: async (): Promise<DespesaResumo[]> => {
      const { data, error } = await supabase
        .from('despesas')
        .select(
          // O HINT DE FK É OBRIGATÓRIO AQUI: `despesas` aponta para `pessoas`
          // DUAS vezes (pessoa_id e registrado_por), e sem dizer qual delas o
          // PostgREST recusa a consulta inteira por ambiguidade.
          'id, tipo, momento, valor, descricao, registrado_em, pessoa:pessoas!despesas_pessoa_id_fkey(nome)',
        )
        .eq('caso_id', casoId)
        .order('registrado_em')
        .order('id')
      if (error) throw error

      return (data ?? []).map((d) => ({
        id: d.id,
        tipo: d.tipo,
        momento: d.momento,
        valor: Number(d.valor),
        descricao: d.descricao,
        registrado_em: d.registrado_em,
        pessoaNome: d.pessoa?.nome ?? null,
      }))
    },
  })
}

/**
 * Lança um gasto do caso.
 *
 * `pessoaId` omitido = a despesa é de quem está lançando, que é o caminho
 * comum: a fotógrafa desceu do Uber e registra a própria corrida.
 */
export function useRegistrarDespesa() {
  return useAcaoDoQuadro<{
    casoId: string
    tipo: TipoDespesa
    valor: number
    pessoaId?: string
    momento?: MomentoDespesa
    descricao?: string
  }>(({ casoId, tipo, valor, pessoaId, momento, descricao }) =>
    chamar('registrar_despesa', {
      p_caso_id: casoId,
      p_tipo: tipo,
      p_valor: valor,
      p_pessoa_id: pessoaId ?? null,
      p_momento: momento ?? null,
      p_descricao: descricao ?? null,
    }),
  )
}

/** Apaga um lançamento. Não existe editar — apaga e lança de novo. */
export function useRemoverDespesa() {
  return useAcaoDoQuadro<{ despesaId: string; motivo?: string }>(
    ({ despesaId, motivo }) =>
      chamar('remover_despesa', {
        p_despesa_id: despesaId,
        ...(motivo === undefined ? {} : { p_motivo: motivo }),
      }),
  )
}
