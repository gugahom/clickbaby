import clsx from 'clsx'
import { BotaoIcone } from '@/components/ui/BotaoIcone'
import { Botao } from '@/components/ui/Botao'
import {
  IconeAtribuir,
  IconeCheck,
  IconePause,
  IconePlay,
} from '@/components/ui/icones'
import { rotularDia } from '@/lib/formato'
import { corDoCaso } from '@/features/quadro/lib/cores-calendar'
import { CLASSE_URGENCIA, type Urgencia } from '@/features/quadro/lib/sla'
import { formatarDuracaoCurta, segundosTrabalhados } from '../lib/tempo'
import type { ItemFila } from '../types'

export interface AcoesItem {
  onAtribuir: (item: ItemFila) => void
  onAssumir: (item: ItemFila) => void
  onIniciar: (item: ItemFila) => void
  onPausar: (item: ItemFila) => void
  onConcluir: (item: ItemFila) => void
}

interface PropsItem {
  item: ItemFila
  hoje: string
  agora: Date
  /** Id da pessoa logada: separa "assumir" de "atribuir a outra". */
  pessoaId: string | null
  /** Distribuir para OUTRA pessoa é da coordenação — ver nota em FilaPage. */
  podeDistribuir: boolean
  ocupado: boolean
  acoes: AcoesItem
}

export function ItemDaFila({
  item,
  hoje,
  agora,
  pessoaId,
  podeDistribuir,
  ocupado,
  acoes,
}: PropsItem) {
  const titulo = item.bebeNome ? `${item.maeNome} · ${item.bebeNome}` : item.maeNome
  const emAndamento = item.etapaStatus === 'em_andamento'
  const pausada = item.etapaStatus === 'pausada'
  const minha = item.responsavelId !== null && item.responsavelId === pessoaId

  const trabalhados = segundosTrabalhados(
    item.iniciadoEm,
    item.pausaAcumulada,
    item.pausadoEm,
    agora,
  )

  const prazo = estadoPrazo(item, agora)

  return (
    <li
      className={clsx(
        'flex items-stretch gap-3 border-b border-border px-3 py-3 transition-colors last:border-b-0',
        emAndamento && 'bg-marca-suave',
      )}
    >
      <div
        className="w-1.5 flex-shrink-0 rounded-full"
        style={{ backgroundColor: corDoCaso(item.corCalendar) }}
        aria-hidden="true"
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="truncate text-sm font-semibold">{titulo}</span>
          <span className={clsx('text-sm font-medium', CLASSE_URGENCIA[prazo.urgencia])}>
            {prazo.rotulo}
          </span>
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {item.pacoteNome && <span>{item.pacoteNome}</span>}
          {item.maternidadeSigla && <span className="font-mono">{item.maternidadeSigla}</span>}
          {item.dia && <span>· {rotularDia(item.dia, hoje)}</span>}
          {item.naUti && <span className="font-medium text-andamento">· na UTI</span>}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs">
          {item.responsavelNome ? (
            <span className={clsx('font-medium', minha ? 'text-marca' : 'text-foreground')}>
              {minha ? 'Você' : item.responsavelNome}
            </span>
          ) : (
            <span className="text-muted-foreground">Sem responsável</span>
          )}

          {/* O cronômetro é o número que a medição usa: relógio menos pausas.
              Aparece sempre que houve início, inclusive parado — ali ele para
              de andar, que é justamente o que precisa ficar visível. */}
          {trabalhados !== null && (
            <span className={clsx(pausada ? 'text-muted-foreground' : 'text-concluido')}>
              · {formatarDuracaoCurta(trabalhados)} de trabalho
              {pausada && ' (pausado)'}
            </span>
          )}

          {item.estacao && (
            <span className="rounded bg-muted px-1 py-0.5 font-mono">{item.estacao}</span>
          )}
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-1">
        {/* Assumir: qualquer pessoa puxa trabalho para si. É a "visão da
            operadora para assumir" da tela C do plano. */}
        {!minha && (
          <Botao
            onClick={() => acoes.onAssumir(item)}
            disabled={ocupado || item.etapaStatus === 'em_andamento'}
            title={
              item.etapaStatus === 'em_andamento'
                ? 'Já está em andamento com outra pessoa.'
                : undefined
            }
            className="px-2.5 text-xs"
          >
            Assumir
          </Botao>
        )}

        {podeDistribuir && (
          <BotaoIcone
            rotulo="Atribuir a outra pessoa"
            disabled={ocupado || item.etapaStatus === 'em_andamento'}
            {...(item.etapaStatus === 'em_andamento'
              ? { motivo: 'Já começou — use o handoff no Quadro.' }
              : {})}
            onClick={() => acoes.onAtribuir(item)}
          >
            <IconeAtribuir className="size-[18px]" />
          </BotaoIcone>
        )}

        {emAndamento ? (
          <BotaoIcone
            rotulo="Pausar edição"
            tom="acao"
            disabled={ocupado}
            onClick={() => acoes.onPausar(item)}
          >
            <IconePause className="size-4" />
          </BotaoIcone>
        ) : (
          <BotaoIcone
            rotulo={pausada ? 'Retomar edição' : 'Iniciar edição'}
            tom="acao"
            disabled={ocupado}
            onClick={() => acoes.onIniciar(item)}
          >
            <IconePlay className="size-4" />
          </BotaoIcone>
        )}

        {/* A TRAVA, refletida. A regra dura vive na RPC (migration
            20260825051226): concluir edição sem ter iniciado é recusado no
            banco. Aqui o botão só some antes da hora, para a pessoa não
            descobrir a regra por mensagem de erro. */}
        <BotaoIcone
          rotulo="Concluir edição"
          tom="positivo"
          disabled={ocupado || item.iniciadoEm === null}
          {...(item.iniciadoEm === null
            ? { motivo: 'Inicie a edição antes — o tempo de trabalho precisa ser medido.' }
            : {})}
          onClick={() => acoes.onConcluir(item)}
        >
          <IconeCheck className="size-[18px]" />
        </BotaoIcone>
      </div>
    </li>
  )
}

/**
 * Prazo do item. Reusa as classes de urgência do Quadro para a fila e o Quadro
 * falarem a mesma língua de cor.
 */
function estadoPrazo(
  item: ItemFila,
  agora: Date,
): { urgencia: Urgencia; rotulo: string } {
  if (item.slaPausado) return { urgencia: 'pausado', rotulo: 'SLA pausado' }
  if (!item.venceEm) return { urgencia: 'sem_prazo', rotulo: 'aguardando nascimento' }

  const horas = (new Date(item.venceEm).getTime() - agora.getTime()) / 3_600_000
  if (horas < 0) {
    return { urgencia: 'atrasado', rotulo: `atrasado ${formatarHoras(-horas)}` }
  }

  // Faixas relativas ao prazo do PRÓPRIO pacote: 12h restantes num BIRTH de 24h
  // é metade do prazo; num MASTER de 7 dias é quase nada. Sem isso, "BIRTH
  // primeiro" viraria hardcode, que a seção 12 do CLAUDE.md proíbe.
  const fracao = horas / (item.prazoEntregaHoras ?? 48)
  const urgencia: Urgencia =
    fracao <= 0.25 ? 'urgente' : fracao <= 0.5 ? 'atencao' : 'tranquilo'

  return { urgencia, rotulo: `vence em ${formatarHoras(horas)}` }
}

function formatarHoras(horas: number): string {
  if (horas < 1) return `${Math.round(horas * 60)}min`
  if (horas < 48) return `${Math.round(horas)}h`
  return `${Math.round(horas / 24)}d`
}
