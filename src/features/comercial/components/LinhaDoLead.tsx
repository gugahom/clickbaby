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
 * UMA FAMÍLIA NA FILA. O toque no nome abre a ficha; os dois botões da
 * direita são os gestos de quem está trabalhando a fila — abrir a conversa e
 * registrar o que aconteceu —, para o vendedor não precisar abrir a ficha a
 * cada lead.
 */
export function LinhaDoLead({
  lead,
  hoje,
  mostrarVendedor,
  onAbrir,
  onContato,
}: {
  lead: Lead
  hoje: string
  mostrarVendedor: boolean
  onAbrir: () => void
  onContato: () => void
}) {
  const aberto = estaAberto(lead)
  const prazo = aberto ? textoDoPrazo(lead) : null

  const contatos =
    lead.totalContatos === 0
      ? 'nenhum contato'
      : `${lead.totalContatos} ${lead.totalContatos === 1 ? 'contato' : 'contatos'}${
          lead.ultimoContatoEm ? ` · último ${haQuantoTempo(lead.ultimoContatoEm, hoje)}` : ''
        }`

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 sm:flex-nowrap md:px-4">
      <button
        type="button"
        onClick={onAbrir}
        className="flex min-w-0 flex-1 basis-full items-center gap-3 rounded-lg text-left sm:basis-auto"
      >
        <ContagemDoPrazo lead={lead} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[15px] font-bold">{nomeDoLead(lead)}</span>
            {lead.maternidadeSigla && (
              <span className="flex-shrink-0 rounded-full bg-marca-suave px-2 py-0.5 text-[11px] font-bold text-marca">
                {lead.maternidadeSigla}
              </span>
            )}
            {!aberto && <PilulaSituacao lead={lead} />}
          </span>
          <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground sm:line-clamp-1">
            {[
              prazo,
              ROTULO_ORIGEM[lead.origem],
              contatos,
              mostrarVendedor ? (lead.vendedorNome ?? 'sem vendedor') : null,
            ]
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
            className="inline-flex size-11 flex-shrink-0 items-center justify-center rounded-full border border-border bg-card text-concluido-tinta hover:bg-concluido/10"
          >
            <IconeConversa className="size-5" />
          </a>
          <button
            type="button"
            onClick={onContato}
            className={clsx(
              'inline-flex min-h-11 flex-shrink-0 items-center rounded-full px-4 text-sm font-bold whitespace-nowrap',
              'bg-marca text-white hover:bg-marca-forte',
            )}
          >
            Registrar contato
          </button>
        </div>
      )}
    </li>
  )
}
