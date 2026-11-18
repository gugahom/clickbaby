import clsx from 'clsx'
import { diaCurto, diaDoInstante, diasEntre, somarDias, textoDoPrazo, type Lead } from '../lib/leads'

// ---------------------------------------------------------------------------
// A RÉGUA DO PRAZO
// ---------------------------------------------------------------------------

/**
 * ONDE ESTA FAMÍLIA ESTÁ NO TEMPO. A planilha dizia "prioridade: atenção"; a
 * régua mostra POR QUÊ: a entrada do lead, o prazo da venda (DPP − 10), a
 * DPP, e o "hoje" caminhando entre eles. A faixa até o prazo é da venda; a
 * que vai do prazo à DPP é da repescagem.
 */
export function ReguaDoPrazo({ lead, hoje }: { lead: Lead; hoje: string }) {
  if (!lead.dpp || !lead.prazoVenda) {
    return (
      <p className="text-sm text-muted-foreground">
        Sem DPP. O prazo da venda é a data provável do parto menos 10 dias — sem ela, o lead fica sem prioridade.
        Pergunte à família e complete em “Editar”.
      </p>
    )
  }

  const entrada = diaDoInstante(lead.criadoEm)
  const inicio = [entrada, hoje, somarDias(lead.prazoVenda, -10)].sort()[0] ?? entrada
  const fim = [lead.dpp, hoje].sort().at(-1) ?? lead.dpp
  const total = Math.max(1, diasEntre(inicio, fim) + 2)
  const pos = (dia: string) => `${((diasEntre(inicio, dia) + 1) / total) * 100}%`
  const larg = (de: string, ate: string) => `${(diasEntre(de, ate) / total) * 100}%`

  const resumo = textoDoPrazo(lead)

  return (
    <div>
      <p className="mb-3 text-sm font-semibold">{resumo ? resumo[0]?.toUpperCase() + resumo.slice(1) : ''}</p>
      <div
        role="img"
        aria-label={`Entrou em ${diaCurto(entrada)}, prazo da venda em ${diaCurto(lead.prazoVenda)}, DPP em ${diaCurto(lead.dpp)}; hoje é ${diaCurto(hoje)}.`}
        className="relative h-14"
      >
        {/* A trilha: venda até o prazo, repescagem até a DPP. */}
        <div className="absolute inset-x-0 top-6 h-2 rounded-full bg-muted" />
        <div
          className="absolute top-6 h-2 rounded-l-full bg-marca/35"
          style={{ left: pos(inicio), width: larg(inicio, lead.prazoVenda) }}
        />
        <div
          className="absolute top-6 h-2 bg-acento/40"
          style={{ left: pos(lead.prazoVenda), width: larg(lead.prazoVenda, lead.dpp) }}
        />
        <Marco dia={lead.prazoVenda} pos={pos(lead.prazoVenda)} rotulo="Prazo" forte />
        <Marco dia={lead.dpp} pos={pos(lead.dpp)} rotulo="DPP" />
        {Math.abs(diasEntre(entrada, lead.prazoVenda)) >= 4 && (
          <Marco dia={entrada} pos={pos(entrada)} rotulo="Entrou" />
        )}
        {/* O HOJE: um alfinete acima da trilha, na cor da prioridade. */}
        <div className="absolute top-0 -translate-x-1/2" style={{ left: pos(hoje) }}>
          <span
            className={clsx(
              'block rounded-full px-1.5 text-[10px] leading-4 font-extrabold text-white',
              lead.prioridade === 'urgente' ? 'bg-atrasado' : lead.prioridade === 'repescagem' ? 'bg-acento-forte' : 'bg-marca',
            )}
          >
            hoje
          </span>
          <span className="mx-auto block h-3.5 w-0.5 bg-foreground/70" />
        </div>
      </div>
      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-marca/35" /> venda
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-acento/40" /> repescagem
        </span>
      </p>
    </div>
  )
}

function Marco({ dia, pos, rotulo, forte = false }: { dia: string; pos: string; rotulo: string; forte?: boolean }) {
  return (
    <div className="absolute top-5 -translate-x-1/2 text-center" style={{ left: pos }}>
      <span className={clsx('mx-auto block h-4 w-0.5', forte ? 'bg-foreground' : 'bg-foreground/40')} />
      <span className={clsx('block text-[11px] leading-tight whitespace-nowrap', forte ? 'font-bold' : 'text-muted-foreground')}>
        {rotulo} {diaCurto(dia)}
      </span>
    </div>
  )
}
