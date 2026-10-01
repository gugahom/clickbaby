import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { chavesEquipe } from './useEquipe'
import { mensagemDaFuncao } from './erro-da-funcao'
import { chavesQuadro } from '@/features/quadro/api/useQuadro'
import type { Database } from '@/types/database'
import type { Tela } from '@/features/auth/telas'
import { useAuth } from '@/features/auth/contexto'
import { TAMANHO_MAXIMO, TIPOS_ACEITOS, chavesFoto } from '@/features/perfil/api/useFotoDePerfil'

/** O enum do banco, para o update não aceitar um papel que não existe. */
export type PapelSistema = Database['public']['Enums']['papel_sistema']

/**
 * O que a gestão pode fazer com uma pessoa.
 *
 * DESATIVAR É A AÇÃO PRINCIPAL, E EXCLUIR É A EXCEÇÃO — o contrário do que um
 * cadastro costuma oferecer. As onze chaves estrangeiras que apontam para
 * `pessoas` são `on delete restrict` de propósito: o histórico de quem fez o
 * quê é o produto (invariante 3.2), e um handoff que perde uma das pontas deixa
 * de ser um handoff. Quem já trabalhou sai da OPERAÇÃO, não do cadastro.
 *
 * `ativo = false` é o que a RLS lê: `eh_pessoa_ativa()` passa a devolver false,
 * a pessoa perde o Quadro inteiro e some das listas de atribuição — mas
 * continua nomeada em cada etapa que executou.
 *
 * VÃO POR UPDATE DIRETO, e isso não fere a seção 4 do CLAUDE.md: ela exige RPC
 * para TRANSIÇÃO DE ESTADO de caso — status, responsável, timestamp. `ativo`,
 * `papel_sistema`, nome, apelidos e telas são cadastro, e a policy
 * `pessoas_escrita_equipe` (quem tem a tela Equipe, desde 30/09/2026 — antes
 * era `eh_adm()`) é o portão desenhado para eles. A FOTO vai por RPC, porque o
 * caminho do arquivo precisa ser conferido.
 */

interface Alvo {
  pessoaId: string
}

function invalidar(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: chavesEquipe.todos })
  // O Quadro mostra nome de responsável e lista pessoas para atribuir; uma
  // pessoa desativada precisa sumir de lá sem esperar o próximo refresh.
  void qc.invalidateQueries({ queryKey: chavesQuadro.todos })
}

/**
 * Quem está logado mexeu em SI MESMO (nome, papel, telas, foto): o cabeçalho e
 * a navegação leem a pessoa do contexto de auth, que só se relê quando pedido.
 */
function useRelerSeForEu() {
  const { pessoa, recarregarPessoa } = useAuth()
  return (pessoaId: string) => {
    if (pessoa?.id === pessoaId) void recarregarPessoa()
  }
}

export function useDefinirAtivo() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ pessoaId, ativo }: Alvo & { ativo: boolean }) => {
      const { error } = await supabase
        .from('pessoas')
        .update({ ativo })
        .eq('id', pessoaId)
      if (error) throw error
    },
    onSuccess: () => invalidar(qc),
  })
}

export function useDefinirPapel() {
  const qc = useQueryClient()
  const reler = useRelerSeForEu()

  return useMutation({
    mutationFn: async ({ pessoaId, papel }: Alvo & { papel: PapelSistema }) => {
      const { error } = await supabase
        .from('pessoas')
        .update({ papel_sistema: papel })
        .eq('id', pessoaId)
      if (error) throw error
    },
    onSuccess: (_r, { pessoaId }) => {
      invalidar(qc)
      reler(pessoaId)
    },
  })
}

/**
 * O NOME E O APELIDO (30/09/2026, pedido do gestor: a gestão "poder mudar a
 * foto, o nome"). O apelido é o primeiro da lista `apelidos` — a tela só mostra
 * esse; os outros, se existirem, ficam.
 */
export function useEditarNome() {
  const qc = useQueryClient()
  const reler = useRelerSeForEu()

  return useMutation({
    mutationFn: async ({ pessoaId, nome, apelidos }: Alvo & { nome: string; apelidos: string[] }) => {
      const limpo = nome.trim()
      if (limpo === '') throw new Error('O nome não pode ficar vazio.')
      const { error } = await supabase
        .from('pessoas')
        .update({ nome: limpo, apelidos })
        .eq('id', pessoaId)
      if (error) throw error
    },
    onSuccess: (_r, { pessoaId }) => {
      invalidar(qc)
      reler(pessoaId)
    },
  })
}

/**
 * AS TELAS DA PESSOA (30/09/2026). `null` volta ao padrão do papel. O banco
 * recusa tirar a tela Equipe da última pessoa que a tem, e grava quem mudou o
 * quê em `eventos` (migration 20260930232424).
 */
export function useDefinirTelas() {
  const qc = useQueryClient()
  const reler = useRelerSeForEu()

  return useMutation({
    mutationFn: async ({ pessoaId, telas }: Alvo & { telas: Tela[] | null }) => {
      const { error } = await supabase.from('pessoas').update({ telas }).eq('id', pessoaId)
      if (error) throw error
    },
    onSuccess: (_r, { pessoaId }) => {
      invalidar(qc)
      reler(pessoaId)
    },
  })
}

/**
 * A FOTO DE OUTRA PESSOA, pela Equipe. O arquivo vai para
 * `avatares/equipe/<pessoa_id>/`, a pasta que a policy da Equipe abre, e o
 * caminho passa pela RPC que confere a pasta. Nome novo a cada envio, pelo
 * mesmo motivo da foto própria (a URL assinada da antiga ainda vale uma hora).
 */
export function useTrocarFotoDaPessoa() {
  const qc = useQueryClient()
  const reler = useRelerSeForEu()

  return useMutation({
    mutationFn: async ({ pessoaId, arquivo }: Alvo & { arquivo: File }) => {
      if (!TIPOS_ACEITOS.includes(arquivo.type)) throw new Error('A foto precisa ser JPG, PNG ou WEBP.')
      if (arquivo.size > TAMANHO_MAXIMO) throw new Error('A foto precisa ter no máximo 2 MB.')

      const extensao = arquivo.type === 'image/png' ? 'png' : arquivo.type === 'image/webp' ? 'webp' : 'jpg'
      const caminho = `equipe/${pessoaId}/${Date.now()}.${extensao}`

      const { error: erroUpload } = await supabase.storage
        .from('avatares')
        .upload(caminho, arquivo, { contentType: arquivo.type })
      if (erroUpload) throw new Error(`Não foi possível enviar a foto: ${erroUpload.message}`)

      const { error } = await supabase.rpc('definir_foto_da_pessoa', { p_pessoa_id: pessoaId, p_foto_path: caminho })
      if (error) {
        // O arquivo subiu e ninguém aponta para ele: limpa.
        await supabase.storage.from('avatares').remove([caminho])
        throw new Error(error.message)
      }
    },
    onSuccess: (_r, { pessoaId }) => {
      invalidar(qc)
      void qc.invalidateQueries({ queryKey: chavesFoto.todas })
      reler(pessoaId)
    },
  })
}

/**
 * Apaga a pessoa E a conta de acesso dela.
 *
 * Vai pela Edge Function e não por `.delete()` porque as duas coisas precisam
 * cair juntas: apagar só a linha de `pessoas` deixaria um usuário de auth que
 * ainda loga e cai na tela de "usuário sem pessoa vinculada", com o e-mail
 * queimado para sempre — e apagar só a conta deixaria uma pessoa no cadastro
 * que ninguém consegue usar. Remover usuário do GoTrue exige `service_role`.
 *
 * O banco recusa se ela já trabalhou, e é isso que se quer: a tela esconde o
 * botão quando sabe (`temHistorico`), mas a garantia é a FK.
 */
export function useExcluirPessoa() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ pessoaId }: Alvo) => {
      const { error } = await supabase.functions.invoke('admin-pessoas', {
        method: 'DELETE',
        body: { pessoaId },
      })
      if (error) throw new Error((await mensagemDaFuncao(error)) ?? error.message)
    },
    onSuccess: () => invalidar(qc),
  })
}
