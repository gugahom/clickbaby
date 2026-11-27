import { useState } from 'react'
import clsx from 'clsx'
import { Alerta } from '@/components/ui/Alerta'
import { IconeCheck } from '@/components/ui/icones'
import type { PessoaDaEquipe } from '../api/useEquipe'
import { useDefinirAviso, type ColunaDeAviso } from '../api/useAcoesDaPessoa'

/**
 * O QUE CHAMA A PESSOA NO SINO (05/11/2026, pedido do gestor; o Foto/Livro em
 * 27/11/2026). Quem manda a galeria do New Born, quem diagrama o fotolivro,
 * quem manda a prova ao cliente e quem paga a gráfica não têm o nome no card,
 * então a gestão diz aqui quem é, e nenhum nome fica cravado no código. Cada
 * toque salva na hora, como as telas logo acima.
 */
interface Aviso {
  coluna: ColunaDeAviso
  campo:
    | 'avisaEscolhaNewBorn'
    | 'avisaEdicaoNewBorn'
    | 'avisaDiagramacaoFotolivro'
    | 'avisaEnvioFotolivro'
    | 'avisaGraficaFotolivro'
  rotulo: string
  descricao: string
}

const GRUPOS: { titulo: string; avisos: Aviso[] }[] = [
  {
    titulo: 'Sino do New Born',
    avisos: [
      {
        coluna: 'avisa_escolha_new_born',
        campo: 'avisaEscolhaNewBorn',
        rotulo: 'Mandar a escolha para a família',
        descricao: 'O sino chama quando a galeria fica pronta, até marcar o envio.',
      },
      {
        coluna: 'avisa_edicao_new_born',
        campo: 'avisaEdicaoNewBorn',
        rotulo: 'Editar o New Born',
        descricao: 'O sino chama na primeira edição e na edição da seleção, até o play.',
      },
    ],
  },
  {
    titulo: 'Sino do Foto/Livro',
    avisos: [
      {
        coluna: 'avisa_diagramacao_fotolivro',
        campo: 'avisaDiagramacaoFotolivro',
        rotulo: 'Diagramar o Foto/Livro',
        descricao: 'O sino chama em “Aguardando diagramação” e em “Pedido de alterações”.',
      },
      {
        coluna: 'avisa_envio_fotolivro',
        campo: 'avisaEnvioFotolivro',
        rotulo: 'Mandar a prova ao cliente',
        descricao: 'O sino chama em “Enviar para aprovação” e em “Alterações realizadas”.',
      },
      {
        coluna: 'avisa_grafica_fotolivro',
        campo: 'avisaGraficaFotolivro',
        rotulo: 'Pagar e mandar para a gráfica',
        descricao: 'O sino chama quando o Foto/Livro é aprovado pelo cliente.',
      },
    ],
  },
]

export function AvisosDaPessoa({ pessoa }: { pessoa: PessoaDaEquipe }) {
  const definir = useDefinirAviso()
  const [erro, setErro] = useState<string | null>(null)

  return (
    <section className="rounded-cartao border border-border bg-card p-4 shadow-cartao">
      {erro && (
        <div className="mb-3">
          <Alerta onFechar={() => setErro(null)}>{erro}</Alerta>
        </div>
      )}

      {GRUPOS.map((grupo, i) => (
        <div key={grupo.titulo} className={i > 0 ? 'mt-5' : undefined}>
          <h3 className="rotulo-sobrescrito text-acento">{grupo.titulo}</h3>

          <ul className="mt-3 space-y-1.5">
            {grupo.avisos.map((a) => {
              const ligado = pessoa[a.campo]
              return (
                <li key={a.coluna}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={ligado}
                    disabled={definir.isPending}
                    onClick={() => {
                      setErro(null)
                      definir.mutate(
                        { pessoaId: pessoa.id, coluna: a.coluna, ligado: !ligado },
                        { onError: (e) => setErro(e instanceof Error ? e.message : String(e)) },
                      )
                    }}
                    className={clsx(
                      'flex min-h-11 w-full items-start gap-3 rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-60',
                      ligado ? 'border-marca/40 bg-marca-suave' : 'border-border hover:border-marca/30',
                    )}
                  >
                    <span
                      className={clsx(
                        'mt-0.5 grid size-5 flex-shrink-0 place-items-center rounded border',
                        ligado ? 'border-marca bg-marca text-white' : 'border-border bg-background',
                      )}
                      aria-hidden="true"
                    >
                      {ligado && <IconeCheck className="size-3.5" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-foreground">{a.rotulo}</span>
                      <span className="block text-xs text-muted-foreground">{a.descricao}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}
