import { useState } from 'react'
import clsx from 'clsx'
import { Dialogo } from '@/components/ui/Dialogo'
import { IconeCalendario } from '@/components/ui/icones'
import { formatarDataHora, hojeNoFuso } from '@/lib/formato'
import { useAgendarClickHome } from '../api/useAcoes'
import { mensagemDeErro } from '../lib/erros'
import { FASES_CLICK_HOME_QUE_AGENDAM, type EtapaQuadro } from '../types'

/**
 * O AGENDAMENTO DO ENSAIO NEW BORN (13/10/2026, pedido do gestor: "eu tenho um
 * botãozinho para eu agendar ela (...) aí sim ela viria pro agendado e no dia do
 * agendamento ela apareceria no painel para mim novamente").
 *
 * A data é o `previsao_em` da etapa — o mesmo que o Calendário mostra como
 * "Ensaio New Born". No cartão do New Born ele ocupa o lugar da pílula de PRAZO,
 * que era o mesmo campo com outro nome. `agendar_click_home` grava a data e leva
 * a fase a "Agendado" de uma vez.
 *
 * Depois que a edição começou, a pílula só MOSTRA a data: o ensaio aconteceu, e
 * o banco recusa remarcar.
 */
export function AgendamentoDoClickHome({
  etapa,
  nomeDoCaso,
  onErro,
}: {
  etapa: EtapaQuadro
  nomeDoCaso: string
  onErro: (mensagem: string | null) => void
}) {
  const [aberto, setAberto] = useState(false)
  const agenda = FASES_CLICK_HOME_QUE_AGENDAM.has(etapa.faseClickHome)
  const temData = etapa.previsaoEm !== null

  const pilula = (
    <>
      <IconeCalendario className="size-3.5" />
      {temData ? `Ensaio ${formatarDataHora(etapa.previsaoEm)}` : 'Agendar ensaio'}
    </>
  )

  if (!agenda) {
    return temData ? (
      <span className="inline-flex h-6 flex-shrink-0 items-center gap-1 rounded-full bg-muted px-2 text-xs font-semibold text-muted-foreground">
        {pilula}
      </span>
    ) : null
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          onErro(null)
          setAberto(true)
        }}
        aria-label={temData ? `Ensaio marcado para ${formatarDataHora(etapa.previsaoEm)}. Reagendar` : 'Agendar o ensaio'}
        className={clsx(
          // Alvo de 44px sem engordar a pastilha — ver CampoEstacao.
          'relative inline-flex h-6 flex-shrink-0 cursor-pointer items-center gap-1 rounded-full px-2 text-xs font-semibold transition-colors',
          "before:absolute before:top-1/2 before:left-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']",
          temData
            ? 'bg-marca-suave text-marca'
            : 'border border-dashed border-atencao/60 text-atencao-tinta hover:border-marca hover:text-marca',
        )}
      >
        {pilula}
      </button>
      {aberto && <DialogoAgendarEnsaio etapa={etapa} nomeDoCaso={nomeDoCaso} onFechar={() => setAberto(false)} />}
    </>
  )
}

/**
 * O diálogo do agendamento — também o que abre quando o cartão é solto na coluna
 * "Agendado" da seção, e o "Reagendar" do cartão do ensaio no Quadro.
 * Dia e hora separados, os dois obrigatórios: o ensaio é na casa da família, e
 * "dia tal, hora a ver" não é agendamento.
 */
export function DialogoAgendarEnsaio({
  etapa,
  nomeDoCaso,
  onFechar,
}: {
  etapa: EtapaQuadro
  nomeDoCaso: string
  onFechar: () => void
}) {
  const agendar = useAgendarClickHome()
  const inicial = paraCampos(etapa.previsaoEm)
  const [dia, setDia] = useState(inicial.dia)
  const [hora, setHora] = useState(inicial.hora)
  const [erro, setErro] = useState<string | null>(null)

  return (
    <Dialogo
      titulo={etapa.previsaoEm ? 'Reagendar o ensaio New Born' : 'Agendar o ensaio New Born'}
      rotuloConfirmar={agendar.isPending ? 'Salvando…' : 'Agendar'}
      confirmarDesabilitado={dia === '' || hora === ''}
      ocupado={agendar.isPending}
      erro={erro}
      onCancelar={onFechar}
      onConfirmar={() => {
        setErro(null)
        agendar
          // Com o fuso de Brasília explícito: sem ele, o fuso do aparelho
          // decidiria a hora do ensaio.
          .mutateAsync({ casoEtapaId: etapa.id, quando: `${dia}T${hora}:00-03:00` })
          .then(onFechar, (e) => setErro(mensagemDeErro(e)))
      }}
    >
      <p className="text-sm text-muted-foreground">
        {nomeDoCaso}. No dia marcado, o ensaio aparece no Quadro; o cartão vai para “Agendado”.
        {etapa.previsaoEm ? ` Antes: ${formatarDataHora(etapa.previsaoEm)}.` : ''}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm font-medium">Dia</span>
          <input
            type="date"
            autoFocus
            value={dia}
            min={hojeNoFuso()}
            onChange={(e) => setDia(e.target.value)}
            className="mt-1.5 min-h-12 w-full rounded-md border border-border bg-background px-3 text-base tabular-nums"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Hora</span>
          <input
            type="time"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            className="mt-1.5 min-h-12 w-full rounded-md border border-border bg-background px-3 text-base tabular-nums"
          />
        </label>
      </div>
    </Dialogo>
  )
}

/** O instante gravado, em dia e hora de Brasília — os campos do diálogo. */
function paraCampos(iso: string | null): { dia: string; hora: string } {
  if (!iso) return { dia: '', hora: '' }
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? ''
  return { dia: `${p('year')}-${p('month')}-${p('day')}`, hora: `${p('hour')}:${p('minute')}` }
}
