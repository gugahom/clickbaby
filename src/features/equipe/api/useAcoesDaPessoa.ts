import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { chavesEquipe } from './useEquipe'
import { mensagemDaFuncao } from './erro-da-funcao'
import { chavesQuadro } from '@/features/quadro/api/useQuadro'
import type { Database } from '@/types/database'

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
 * ESTAS TRÊS VÃO POR UPDATE DIRETO, e isso não fere a seção 4 do CLAUDE.md: ela
 * exige RPC para TRANSIÇÃO DE ESTADO de caso — status, responsável, timestamp.
 * `ativo` e `papel_sistema` são cadastro, e a policy `pessoas_escrita_adm`
 * (`FOR ALL` com `eh_adm()`) é exatamente o portão desenhado para eles.
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

  return useMutation({
    mutationFn: async ({ pessoaId, papel }: Alvo & { papel: PapelSistema }) => {
      const { error } = await supabase
        .from('pessoas')
        .update({ papel_sistema: papel })
        .eq('id', pessoaId)
      if (error) throw error
    },
    onSuccess: () => invalidar(qc),
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
