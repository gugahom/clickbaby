import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * A tela de Equipe, em DUAS queries.
 *
 *   1. `pessoas` — o cadastro.
 *   2. `caso_etapas` — o trabalho, agregado por responsável em memória.
 *
 * Agregar no cliente e não no banco é escolha de tamanho, não de gosto: são
 * 14 pessoas e ~1.100 etapas. Uma view com `group by` seria mais correta em
 * escala e custaria uma migration, um GRANT e um teste pgTAP — e o número que
 * ela devolveria hoje é o mesmo. Quando a equipe crescer ou a janela virar
 * "todo o histórico", a conta muda e a view passa a valer.
 *
 * O QUE ESTA TELA NÃO CONSEGUE MOSTRAR
 * O e-mail de login vive em `auth.users`, que o cliente não alcança — e é
 * assim de propósito. Para exibi-lo aqui seria preciso uma view
 * `security definer` restrita a `eh_adm()`, com GRANT e teste próprios. Fica
 * para a próxima fatia; até lá a tela diz apenas se a pessoa TEM acesso.
 * Prometer o e-mail com um palpite derivado do nome seria pior que não
 * mostrar: o dia em que um endereço fugisse do padrão, a tela mentiria sem
 * avisar.
 */

/** A janela de "trabalho recente". Um mês cobre o ciclo de cobrança e o SLA. */
export const DIAS_DE_JANELA = 30

export interface PessoaDaEquipe {
  id: string
  nome: string
  apelidos: string[]
  papelSistema: string
  ativo: boolean
  temAcesso: boolean
  /** Etapas em andamento ou pausadas agora, com ela. */
  emAndamento: number
  /** Etapas concluídas por ela na janela. */
  concluidasNaJanela: number
  /** Última vez que uma etapa dela começou ou terminou; null se nunca. */
  ultimaAtividade: string | null
}

export const chavesEquipe = {
  todos: ['equipe'] as const,
  lista: () => [...chavesEquipe.todos, 'lista'] as const,
}

interface LinhaPessoa {
  id: string
  nome: string
  apelidos: string[] | null
  papel_sistema: string
  ativo: boolean
  auth_user_id: string | null
}

interface LinhaEtapa {
  responsavel_id: string | null
  status: string
  iniciado_em: string | null
  concluido_em: string | null
}

async function carregarEquipe(): Promise<PessoaDaEquipe[]> {
  const { data: linhas, error } = await supabase
    .from('pessoas')
    .select('id, nome, apelidos, papel_sistema, ativo, auth_user_id')
    .order('nome')

  if (error) throw error

  const { data: etapas, error: erroEtapas } = await supabase
    .from('caso_etapas')
    .select('responsavel_id, status, iniciado_em, concluido_em')
    .not('responsavel_id', 'is', null)

  if (erroEtapas) throw erroEtapas

  const corte = new Date(Date.now() - DIAS_DE_JANELA * 24 * 60 * 60 * 1000)
  const porPessoa = new Map<string, { andamento: number; feitas: number; ultima: string | null }>()

  for (const e of (etapas ?? []) as LinhaEtapa[]) {
    if (!e.responsavel_id) continue
    const atual = porPessoa.get(e.responsavel_id) ?? {
      andamento: 0,
      feitas: 0,
      ultima: null,
    }

    if (e.status === 'em_andamento' || e.status === 'pausada') atual.andamento += 1
    if (e.status === 'concluida' && e.concluido_em && new Date(e.concluido_em) >= corte) {
      atual.feitas += 1
    }

    // A última atividade olha os dois carimbos: uma etapa começada hoje e não
    // concluída é atividade, e uma concluída sem `iniciado_em` (registro
    // retroativo de campo) também.
    for (const quando of [e.iniciado_em, e.concluido_em]) {
      if (quando && (atual.ultima === null || quando > atual.ultima)) atual.ultima = quando
    }

    porPessoa.set(e.responsavel_id, atual)
  }

  return ((linhas ?? []) as LinhaPessoa[]).map((p) => {
    const dela = porPessoa.get(p.id)
    return {
      id: p.id,
      nome: p.nome,
      apelidos: p.apelidos ?? [],
      papelSistema: p.papel_sistema,
      ativo: p.ativo,
      temAcesso: p.auth_user_id !== null,
      emAndamento: dela?.andamento ?? 0,
      concluidasNaJanela: dela?.feitas ?? 0,
      ultimaAtividade: dela?.ultima ?? null,
    }
  })
}

export function useEquipe() {
  return useQuery({
    queryKey: chavesEquipe.lista(),
    queryFn: carregarEquipe,
    staleTime: 60_000,
  })
}
