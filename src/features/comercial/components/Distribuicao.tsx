import { useState } from 'react'
import clsx from 'clsx'
import { Alerta } from '@/components/ui/Alerta'
import { Dialogo } from '@/components/ui/Dialogo'
import { Dropdown } from '@/components/ui/Dropdown'
import { useCadastros } from '@/features/quadro/api/useCadastros'
import {
  useDefinirVendedor,
  useMarcarRepescagem,
  usePessoasDoComercial,
  useVendedoresDasMaternidades,
} from '../api/useLeads'

const NINGUEM = 'ninguem'

/**
 * QUEM ATENDE O QUÊ — o cadastro da distribuição, de quem tem a tela Equipe
 * (o banco confere: `definir_vendedor_da_maternidade` e a escrita em
 * `pessoas`).
 *
 * O lead NASCE com o vendedor da maternidade dele (o que a planilha fazia de
 * cabeça: GNDI com um, HSC com outro). Quem faz a REPESCAGEM é marca na
 * pessoa: quando o prazo da venda passa sem fechar, o lead sai da fila do
 * vendedor e entra na dela.
 *
 * Cada escolha grava NA HORA — não há "salvar" para esquecer.
 */
export function Distribuicao({ onFechar }: { onFechar: () => void }) {
  const { data: cadastros } = useCadastros(true)
  const { data: pessoas = [] } = usePessoasDoComercial()
  const { data: vendedores = [] } = useVendedoresDasMaternidades()
  const definir = useDefinirVendedor()
  const marcar = useMarcarRepescagem()
  const [erro, setErro] = useState<string | null>(null)

  const quemRecebe = pessoas.filter((p) => p.podeReceber)
  const falhar = (e: unknown) => setErro(e instanceof Error ? e.message : String(e))

  return (
    <Dialogo titulo="Quem atende o quê" rotuloConfirmar="Fechar" soFechar largo onConfirmar={onFechar} onCancelar={onFechar}>
      <div className="space-y-6">
        {erro && <Alerta onFechar={() => setErro(null)}>{erro}</Alerta>}

        <section>
          <h3 className="text-sm font-bold">Quem atende cada maternidade</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            O lead novo vai para esta pessoa. Só aparece quem tem a tela Comercial.
          </p>
          <ul className="mt-3 divide-y divide-border rounded-painel border border-border">
            {(cadastros?.maternidades ?? []).map((m) => {
              const atual = vendedores.find((v) => v.maternidadeId === m.id)?.pessoaId ?? NINGUEM
              return (
                <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="font-bold">{m.sigla}</span>
                    <span className="ml-2 truncate text-sm text-muted-foreground">{m.nome}</span>
                  </span>
                  <div className="w-48 flex-shrink-0">
                    <Dropdown
                      rotulo="Ninguém"
                      itens={[
                        { id: NINGUEM, rotulo: 'Ninguém' },
                        ...quemRecebe.map((p) => ({ id: p.id, rotulo: p.nome })),
                      ]}
                      selecionado={atual}
                      onEscolher={(i) =>
                        definir.mutate(
                          { maternidadeId: m.id, pessoaId: i.id === NINGUEM ? null : i.id },
                          { onError: falhar },
                        )
                      }
                      alinhamento="direita"
                      larguraCheia
                      variante="campo"
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        <section>
          <h3 className="text-sm font-bold">Quem faz a repescagem</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Passou o prazo da venda (DPP − 10) sem fechar, o lead aparece na fila de quem está marcado aqui. Sem
            ninguém marcado, ele continua com o vendedor.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {quemRecebe.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={p.fazRepescagem}
                disabled={marcar.isPending}
                onClick={() => marcar.mutate({ pessoaId: p.id, ligado: !p.fazRepescagem }, { onError: falhar })}
                className={clsx(
                  'min-h-10 rounded-full border px-3.5 text-sm font-semibold transition-colors disabled:opacity-60',
                  p.fazRepescagem
                    ? 'border-acento-forte bg-acento-forte text-white'
                    : 'border-border bg-card hover:border-acento/50 hover:bg-acento-suave',
                )}
              >
                {p.nome}
              </button>
            ))}
            {quemRecebe.length === 0 && (
              <p className="text-sm text-muted-foreground">Ninguém tem a tela Comercial ainda — conceda na Equipe.</p>
            )}
          </div>
        </section>
      </div>
    </Dialogo>
  )
}
