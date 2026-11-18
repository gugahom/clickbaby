import { useState } from 'react'
import clsx from 'clsx'
import { Alerta } from '@/components/ui/Alerta'
import { Dropdown } from '@/components/ui/Dropdown'
import { useTelas } from '@/features/auth/telas'
import { useCadastros } from '@/features/quadro/api/useCadastros'
import {
  useDefinirVendedor,
  useMarcarRepescagem,
  usePessoasDoComercial,
  useVendedoresDasMaternidades,
} from '../api/useLeads'

const NINGUEM = 'ninguem'

/**
 * A DISTRIBUIÇÃO: quem atende cada maternidade e quem faz a repescagem. Era o
 * diálogo "Quem atende o quê" e virou página do CRM (18/11/2026), porque é
 * configuração da venda e todo mundo do comercial quer saber de quem é cada
 * maternidade.
 *
 * TODO MUNDO LÊ; SÓ A TELA EQUIPE MUDA — o banco confere a mesma coisa
 * (`definir_vendedor_da_maternidade` e a escrita em `pessoas`). Cada escolha
 * grava na hora, sem "salvar" para esquecer.
 */
export function ConfiguracoesDoCrm() {
  const telas = useTelas()
  const podeMudar = telas.has('equipe')
  const { data: cadastros } = useCadastros(true)
  const { data: pessoas = [] } = usePessoasDoComercial()
  const { data: vendedores = [] } = useVendedoresDasMaternidades()
  const definir = useDefinirVendedor()
  const marcar = useMarcarRepescagem()
  const [erro, setErro] = useState<string | null>(null)

  const quemRecebe = pessoas.filter((p) => p.podeReceber)
  const falhar = (e: unknown) => setErro(e instanceof Error ? e.message : String(e))
  const nome = (id: string | null) => pessoas.find((p) => p.id === id)?.nome ?? null

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight md:text-[28px]">Distribuição</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Para quem vai cada lead novo, e quem trabalha a repescagem.
          {!podeMudar && ' Só quem tem a tela Equipe muda isto.'}
        </p>
      </header>

      {erro && (
        <div className="mt-4">
          <Alerta onFechar={() => setErro(null)}>{erro}</Alerta>
        </div>
      )}

      <section aria-labelledby="titulo-maternidades" className="mt-6 overflow-hidden rounded-painel border border-border bg-card shadow-cartao">
        <div className="border-b border-border px-5 py-4">
          <h2 id="titulo-maternidades" className="text-[15px] font-extrabold tracking-tight">
            Quem atende cada maternidade
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            O lead novo nasce com esta pessoa. Na lista só aparece quem tem a tela Comercial.
          </p>
        </div>
        <ul className="divide-y divide-border">
          {(cadastros?.maternidades ?? []).map((m) => {
            const atual = vendedores.find((v) => v.maternidadeId === m.id)?.pessoaId ?? null
            return (
              <li key={m.id} className="flex items-center gap-4 px-5 py-2.5">
                <span className="w-24 flex-shrink-0 font-mono text-sm font-bold">{m.sigla}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{m.nome}</span>
                <div className="w-52 flex-shrink-0">
                  {podeMudar ? (
                    <Dropdown
                      rotulo="Ninguém"
                      itens={[{ id: NINGUEM, rotulo: 'Ninguém' }, ...quemRecebe.map((p) => ({ id: p.id, rotulo: p.nome }))]}
                      selecionado={atual ?? NINGUEM}
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
                  ) : (
                    <span className={clsx('block text-right text-sm font-semibold', !atual && 'text-muted-foreground')}>
                      {nome(atual) ?? 'Ninguém'}
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-labelledby="titulo-repescagem" className="mt-6 rounded-painel border border-border bg-card p-5 shadow-cartao">
        <h2 id="titulo-repescagem" className="text-[15px] font-extrabold tracking-tight">
          Quem faz a repescagem
        </h2>
        <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
          Passou o prazo da venda (DPP − 10) sem fechar, o lead sai da carteira do vendedor e entra na de quem está
          marcado aqui. Sem ninguém marcado, ele continua com o vendedor.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {quemRecebe.map((p) =>
            podeMudar ? (
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
            ) : (
              p.fazRepescagem && (
                <span
                  key={p.id}
                  className="rounded-full bg-acento-forte px-3.5 py-2 text-sm font-semibold text-white"
                >
                  {p.nome}
                </span>
              )
            ),
          )}
          {quemRecebe.length === 0 && (
            <p className="text-sm text-muted-foreground">Ninguém tem a tela Comercial ainda — conceda na Equipe.</p>
          )}
          {!podeMudar && !quemRecebe.some((p) => p.fazRepescagem) && (
            <p className="text-sm text-muted-foreground">Ninguém marcado.</p>
          )}
        </div>
      </section>
    </div>
  )
}
