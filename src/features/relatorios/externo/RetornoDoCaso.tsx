import { useState } from 'react'
import clsx from 'clsx'
import { Dialogo } from '@/components/ui/Dialogo'
import { IconeCalendario } from '@/components/ui/icones'
import { hojeNoFuso } from '@/lib/formato'
import { dataCurta, somarDias } from '../lib/metricas'
import { useDefinirRetorno } from './useOperacao'

/**
 * O RETORNO AGENDADO (05/10/2026, pedido do gestor). A última coluna do modo
 * comercial: a data de voltar a procurar a família que disse "agora não" — "no
 * futuro eu pretendo até usar esse campo com mensagens automáticas de whatsapp".
 *
 * A COR DIZ SE É HOJE: vencido em vermelho, hoje e próximos 7 dias em âmbar, o
 * resto neutro. Sem data, um "Reagendar" tracejado — convite, não buraco.
 *
 * O DIÁLOGO TEM ATALHOS (+7 dias, +15, +30, +3 meses) porque "não agora" quase
 * sempre vira "daqui a um mês", e um calendário para isso são cinco toques.
 */
const ATALHOS = [
  { rotulo: '+7 dias', dias: 7 },
  { rotulo: '+15 dias', dias: 15 },
  { rotulo: '+30 dias', dias: 30 },
  { rotulo: '+3 meses', dias: 90 },
]

export function RetornoDoCaso({
  casoId,
  nome,
  retorno,
  podeMudar,
}: {
  casoId: string
  nome: string
  /** 'YYYY-MM-DD', ou nulo sem retorno agendado. */
  retorno: string | null
  podeMudar: boolean
}) {
  const hoje = hojeNoFuso()
  const [aberto, setAberto] = useState(false)
  const [data, setData] = useState(retorno ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const definir = useDefinirRetorno()

  const vencido = retorno !== null && retorno < hoje
  const perto = retorno !== null && !vencido && retorno <= somarDias(hoje, 7)

  function abrir() {
    setData(retorno ?? somarDias(hoje, 30))
    setErro(null)
    setAberto(true)
  }

  function salvar(valor: string | null) {
    setErro(null)
    definir.mutate(
      { casoId, retorno: valor },
      { onSuccess: () => setAberto(false), onError: (e) => setErro(e instanceof Error ? e.message : String(e)) },
    )
  }

  const pilula = retorno ? (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap tabular-nums',
        vencido
          ? 'bg-atrasado text-white'
          : perto
            ? 'bg-atencao/15 text-atencao-tinta ring-1 ring-atencao/40'
            : 'bg-muted text-foreground ring-1 ring-border',
      )}
      title={vencido ? 'Retorno vencido' : perto ? 'Retorno nos próximos dias' : 'Retorno agendado'}
    >
      <IconeCalendario className="size-3.5" />
      {retorno === hoje ? 'Hoje' : dataCurta(retorno)}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-muted-foreground">
      Reagendar
    </span>
  )

  return (
    // O clique na linha abre o caso no Quadro; aqui dentro, não.
    <div onClick={(e) => e.stopPropagation()} className="inline-flex">
      {podeMudar ? (
        <button
          type="button"
          onClick={abrir}
          aria-label={retorno ? `Retorno agendado para ${dataCurta(retorno)}. Mudar` : 'Reagendar retorno'}
          className="cursor-pointer rounded-full transition-opacity hover:opacity-80"
        >
          {pilula}
        </button>
      ) : retorno ? (
        pilula
      ) : (
        <span className="text-muted-foreground">—</span>
      )}

      {aberto && (
        <Dialogo
          titulo="Reagendar retorno"
          rotuloConfirmar={definir.isPending ? 'Salvando…' : 'Agendar'}
          confirmarDesabilitado={data === '' || data === retorno}
          ocupado={definir.isPending}
          erro={erro}
          onCancelar={() => setAberto(false)}
          onConfirmar={() => salvar(data)}
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Quando procurar de novo a família de <span className="font-semibold text-foreground">{nome}</span>.
            </p>
            <div className="flex flex-wrap gap-2">
              {ATALHOS.map((a) => {
                const valor = somarDias(hoje, a.dias)
                return (
                  <button
                    key={a.rotulo}
                    type="button"
                    aria-pressed={data === valor}
                    onClick={() => setData(valor)}
                    className={clsx(
                      'min-h-9 rounded-full border px-3.5 text-sm font-semibold',
                      data === valor ? 'border-marca bg-marca text-white' : 'border-border hover:border-marca/40',
                    )}
                  >
                    {a.rotulo}
                  </button>
                )
              })}
            </div>
            <label className="block">
              <span className="text-sm font-medium">Data do retorno</span>
              <input
                type="date"
                value={data}
                min={hoje}
                onChange={(e) => setData(e.target.value)}
                className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-base tabular-nums"
              />
            </label>
            {retorno && (
              <button
                type="button"
                onClick={() => salvar(null)}
                disabled={definir.isPending}
                className="text-sm font-semibold text-atrasado hover:underline disabled:opacity-60"
              >
                Tirar o retorno
              </button>
            )}
          </div>
        </Dialogo>
      )}
    </div>
  )
}
