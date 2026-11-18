import clsx from 'clsx'
import { IconeConversa } from '@/components/ui/icones'
import {
  ROTULO_ORIGEM,
  estaAberto,
  haQuantoTempo,
  linkDoWhatsapp,
  nomeDoLead,
  textoDoPrazo,
  type Lead,
} from '../lib/leads'
import { ContagemDoPrazo, PilulaRetorno, PilulaSituacao } from './Pilulas'

/**
 * UMA FAMÍLIA NA FILA. Tocar no nome abre a ficha; os dois botões da direita
 * são os gestos de quem trabalha a fila — abrir a conversa e registrar o que
 * aconteceu — para não precisar abrir a ficha a cada lead.
 *
 * QUIETA DE PROPÓSITO (18/11/2026, "ficou tudo muito amontoado"): o botão de
 * registrar é de contorno, e não azul cheio — numa fila de dez linhas, dez
 * botões cheios viram uma parede. Quem chama a atenção na linha é a contagem
 * do prazo, que é o que decide a ordem.
 */
export function LinhaDoLead({
  lead,
  hoje,
  mostrarVendedor,
  selecionado = false,
  onAbrir,
  onContato,
}: {
  lead: Lead
  hoje: string
  mostrarVendedor: boolean
  selecionado?: boolean
  onAbrir: () => void
  onContato: () => void
}) {
  const aberto = estaAberto(lead)
  const prazo = aberto ? textoDoPrazo(lead) : null

  const contatos =
    lead.totalContatos === 0
      ? 'nenhum contato'
      : `${lead.totalContatos} ${lead.totalContatos === 1 ? 'contato' : 'contatos'}${
          lead.ultimoContatoEm ? `, o último ${haQuantoTempo(lead.ultimoContatoEm, hoje)}` : ''
        }`

  return (
    <li
      className={clsx(
        'group flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 transition-colors sm:flex-nowrap md:px-4',
        selecionado ? 'bg-marca-suave/70' : 'hover:bg-muted/50',
      )}
    >
      <button
        type="button"
        onClick={onAbrir}
        aria-current={selecionado ? 'true' : undefined}
        className="flex min-w-0 flex-1 basis-full items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-marca/40 sm:basis-auto"
      >
        <ContagemDoPrazo lead={lead} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[15px] font-bold">{nomeDoLead(lead)}</span>
            {lead.maternidadeSigla && (
              <span className="flex-shrink-0 rounded-md bg-muted px-1.5 py-px font-mono text-[11px] font-bold text-muted-foreground">
                {lead.maternidadeSigla}
              </span>
            )}
            {!aberto && <PilulaSituacao lead={lead} />}
          </span>
          <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground sm:line-clamp-1">
            {[prazo, ROTULO_ORIGEM[lead.origem], contatos, mostrarVendedor ? (lead.vendedorNome ?? 'sem vendedor') : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
      </button>

      {aberto && (
        <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
          {lead.proximoRetornoEm && (
            <span className="mr-auto sm:mr-1">
              <PilulaRetorno quando={lead.proximoRetornoEm} hoje={hoje} />
            </span>
          )}
          <a
            href={linkDoWhatsapp(lead.telefone)}
            target="_blank"
            rel="noreferrer"
            aria-label={`Abrir a conversa com ${lead.maeNome} no WhatsApp`}
            title="Abrir no WhatsApp"
            className="grid size-11 flex-shrink-0 place-items-center rounded-full text-concluido-tinta transition-colors hover:bg-concluido/10 md:size-9"
          >
            <IconeConversa className="size-5 md:size-[18px]" />
          </a>
          <button
            type="button"
            onClick={onContato}
            className="inline-flex min-h-11 flex-shrink-0 items-center rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold whitespace-nowrap transition-colors hover:border-marca/40 hover:bg-marca-suave hover:text-marca md:min-h-9"
          >
            Registrar contato
          </button>
        </div>
      )}
    </li>
  )
}
