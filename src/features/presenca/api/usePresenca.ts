import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/contexto'
import { chavesQuadro } from '@/features/quadro/api/useQuadro'
import type { EstadoDeclarado } from '../lib/estados'

/**
 * QUEM ESTÁ AQUI AGORA, pelo Presence do Realtime.
 *
 * POR QUE NÃO TEM TABELA
 * Presença é efêmera por natureza: notebook fechado, bateria no fim, elevador
 * sem sinal. Gravar isso produziria uma tabela que erra sozinha e que alguém
 * um dia somaria como jornada — e jornada está fora de escopo (seção 9 do
 * CLAUDE.md). O canal do Realtime já resolve exatamente este problema: quem
 * está conectado aparece, quem cai some, e nada sobrevive à sessão.
 *
 * A ESCOLHA MANUAL vive no `localStorage`, e isso é o que o CLAUDE.md permite:
 * preferência de UI, não dado de domínio. O motivo de guardar é prático — quem
 * se marcou ausente e recarregou a página não deveria voltar como disponível
 * sem ter dito nada.
 */

const CANAL = 'presenca'
const CHAVE_LOCAL = 'clickbaby:presenca'

export interface PessoaPresente {
  pessoaId: string
  nome: string
  fotoPath: string | null
  /** `papel_sistema`. Vem pelo canal porque o cartão de hover mostra quem é. */
  papel: string
  declarado: EstadoDeclarado
}

function lerEscolha(): EstadoDeclarado {
  try {
    return localStorage.getItem(CHAVE_LOCAL) === 'ausente' ? 'ausente' : 'disponivel'
  } catch {
    // Aba anônima, armazenamento bloqueado. Quem entrou está disponível.
    return 'disponivel'
  }
}

function guardarEscolha(estado: EstadoDeclarado) {
  try {
    localStorage.setItem(CHAVE_LOCAL, estado)
  } catch {
    // Não poder lembrar não é motivo para não funcionar agora.
  }
}

export interface AtividadeDaEquipe {
  /** Quem tem etapa em andamento agora. */
  ocupadas: Set<string>
  /** Quando cada pessoa tocou trabalho pela última vez (ISO). */
  ultimaAtividade: Map<string, string>
}

/**
 * O QUE O TRABALHO CONTA SOBRE CADA PESSOA — a metade automática do estado.
 *
 * Duas coisas saem da mesma consulta:
 *   - quem está OCUPADA (tem etapa em andamento);
 *   - quando cada uma PEGOU TRABALHO pela última vez, que é o que responde
 *     "está disponível, mas parada há quanto tempo?".
 *
 * "PEGAR TRABALHO" É O MAIOR ENTRE `iniciado_em` E `concluido_em`, e não só o
 * início: quem concluiu uma etapa há dez minutos estava trabalhando até ali.
 * É a mesma definição que a ficha da Equipe usa para "última atividade" — duas
 * definições dariam dois números para a mesma pergunta em duas telas.
 *
 * A JANELA É DE 24 HORAS, mais as etapas em andamento de qualquer idade. Sem
 * corte, esta consulta puxaria toda `caso_etapas` com responsável — milhares de
 * linhas — no cabeçalho de todas as telas. Quem não aparece na janela é quem
 * não pega trabalho há mais de um dia, e para essa a resposta ("mais de 24h")
 * não precisa de precisão.
 *
 * A chave começa com `chavesQuadro.todos` de propósito: toda ação do Quadro já
 * invalida essa família, e o Realtime do Quadro também. Sem isso, dar play numa
 * etapa mudaria o card na hora e a bolinha só no próximo intervalo — a mesma
 * informação em dois relógios diferentes.
 */
export function useAtividadeDaEquipe() {
  return useQuery({
    queryKey: [...chavesQuadro.todos, 'atividade'],
    staleTime: 30 * 1000,
    queryFn: async (): Promise<AtividadeDaEquipe> => {
      const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      const { data, error } = await supabase
        .from('caso_etapas')
        .select('responsavel_id, status, iniciado_em, concluido_em')
        .not('responsavel_id', 'is', null)
        .or(
          `status.eq.em_andamento,iniciado_em.gte.${desde},concluido_em.gte.${desde}`,
        )

      if (error) throw error

      const ocupadas = new Set<string>()
      const ultimaAtividade = new Map<string, string>()

      for (const linha of data ?? []) {
        const id = linha.responsavel_id
        if (!id) continue
        if (linha.status === 'em_andamento') ocupadas.add(id)

        for (const quando of [linha.iniciado_em, linha.concluido_em]) {
          if (!quando) continue
          const atual = ultimaAtividade.get(id)
          if (atual === undefined || quando > atual) ultimaAtividade.set(id, quando)
        }
      }

      return { ocupadas, ultimaAtividade }
    },
  })
}

export function usePresenca() {
  const { pessoa } = useAuth()
  const [declarado, setDeclarado] = useState<EstadoDeclarado>(lerEscolha)
  const [presentes, setPresentes] = useState<PessoaPresente[]>([])

  const pessoaId = pessoa?.id ?? null
  const nome = pessoa?.nome ?? ''
  const fotoPath = pessoa?.fotoPath ?? null
  const papel = pessoa?.papelSistema ?? 'operador'

  useEffect(() => {
    if (!pessoaId) return

    // `key` = id da pessoa: duas abas da MESMA pessoa viram uma presença só, em
    // vez de dois avatares dela no cabeçalho. Nos seis CEL CLICK compartilhados
    // isso acontece o tempo todo.
    const canal = supabase.channel(CANAL, {
      config: { presence: { key: pessoaId } },
    })

    function sincronizar() {
      const estado = canal.presenceState<PessoaPresente>()
      const lista: PessoaPresente[] = []
      for (const entradas of Object.values(estado)) {
        // Várias abas da mesma pessoa: a última a chegar é a que vale, porque é
        // onde ela mexeu no menu por último.
        const ultima = entradas.at(-1)
        if (ultima) lista.push(ultima)
      }
      lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      setPresentes(lista)
    }

    canal
      .on('presence', { event: 'sync' }, sincronizar)
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return
        void canal.track({ pessoaId, nome, fotoPath, papel, declarado: lerEscolha() })
      })

    return () => {
      void supabase.removeChannel(canal)
    }
    // `declarado` FICA DE FORA das dependências de propósito: trocar de estado
    // não pode derrubar e recriar o canal — quem olha veria a pessoa sumir e
    // voltar. A troca é publicada pelo efeito abaixo, no canal que já existe.

  }, [pessoaId, nome, fotoPath, papel])

  // A publicação da troca, no canal vivo.
  useEffect(() => {
    if (!pessoaId) return
    const canal = supabase.getChannels().find((c) => c.topic === `realtime:${CANAL}`)
    if (!canal) return
    void canal.track({ pessoaId, nome, fotoPath, papel, declarado })
  }, [declarado, pessoaId, nome, fotoPath, papel])

  const definir = useCallback((estado: EstadoDeclarado) => {
    guardarEscolha(estado)
    setDeclarado(estado)
  }, [])

  // A própria pessoa sai da lista: o avatar dela já está ali ao lado, no chip
  // do menu, com a mesma bolinha. Repetir seria dizer duas vezes a coisa que
  // ela menos precisa saber.
  const outros = useMemo(
    () => presentes.filter((p) => p.pessoaId !== pessoaId),
    [presentes, pessoaId],
  )

  return { outros, declarado, definir }
}
