import { useState } from 'react'
import clsx from 'clsx'
import { Botao } from '@/components/ui/Botao'
import { CampoTexto } from '@/components/ui/CampoTexto'
import { Dialogo } from '@/components/ui/Dialogo'
import { IconeAdicionar, IconeX } from '@/components/ui/icones'
import { hojeNoFuso } from '@/lib/formato'
import type { PessoaDaEquipe } from '../api/useEquipe'
import {
  duracaoEmMinutos,
  somarDia,
  useEscalaDaPessoa,
  useLancarPlantoes,
  useRemoverPlantao,
  type NovoPlantao,
} from '../api/useEscala'
import { diaCurto, horaEmBrasilia } from '../lib/apresentacao'

/** Quantos dias para a frente a ficha mostra. */
const JANELA = 28

const horas = (minutos: number) => {
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
}

/**
 * A ESCALA DE PLANTÃO DA PESSOA (30/09/2026, pedido do gestor). A ficha mostra
 * as próximas quatro semanas e lança plantões — um dia, ou vários de uma vez
 * pelo ritmo 12x36 ou por dia da semana. Apagar é um toque no X; não há
 * editar, porque um plantão trocado é outro plantão.
 *
 * É A ESCALA PLANEJADA, não ponto (seção 9 do CLAUDE.md): o relatório interno
 * a compara com as horas de etapa, e só isso.
 */
export function EscalaDaPessoa({ pessoa }: { pessoa: PessoaDaEquipe }) {
  const hoje = hojeNoFuso()
  const ate = somarDia(hoje, JANELA - 1)
  const { data, isPending, error } = useEscalaDaPessoa(pessoa.id, hoje, ate)
  const remover = useRemoverPlantao()
  const [lancando, setLancando] = useState(false)

  const plantoes = data ?? []
  const total = plantoes.reduce(
    (acc, p) => acc + Math.round((new Date(p.fim).getTime() - new Date(p.inicio).getTime()) / 60_000),
    0,
  )

  return (
    <section className="rounded-cartao border border-border bg-card p-4 shadow-cartao">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="rotulo-sobrescrito text-acento">Escala</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Próximas 4 semanas
            {plantoes.length > 0 && ` · ${plantoes.length} ${plantoes.length === 1 ? 'plantão' : 'plantões'}, ${horas(total)}`}
          </p>
        </div>
        <Botao variante="contorno" onClick={() => setLancando(true)} className="flex-shrink-0">
          <IconeAdicionar className="size-4" />
          Lançar
        </Botao>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-atrasado">Não deu para carregar a escala.</p>
      ) : isPending ? (
        <p className="mt-3 text-sm text-muted-foreground">Carregando…</p>
      ) : plantoes.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
          Nenhum plantão lançado. Lance um dia ou uma sequência inteira.
        </p>
      ) : (
        <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto">
          {plantoes.map((p) => (
            <li key={p.id} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/50">
              <span
                className={clsx('size-2 flex-shrink-0 rounded-full', p.turno === 'noturno' ? 'bg-marca' : 'bg-atencao')}
                aria-hidden="true"
              />
              <span className="w-20 flex-shrink-0 text-sm font-semibold capitalize tabular-nums">{diaCurto(p.data)}</span>
              <span className="flex-1 text-sm tabular-nums text-foreground/80">
                {horaEmBrasilia(p.inicio)}–{horaEmBrasilia(p.fim)}
                <span className="ml-1.5 text-xs text-muted-foreground">{p.turno === 'noturno' ? 'noite' : 'dia'}</span>
              </span>
              <button
                type="button"
                onClick={() => remover.mutate(p.id)}
                disabled={remover.isPending}
                aria-label={`Apagar o plantão de ${diaCurto(p.data)}`}
                className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-atrasado/10 hover:text-atrasado"
              >
                <IconeX className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {lancando && <LancarPlantoes pessoa={pessoa} hoje={hoje} onFechar={() => setLancando(false)} />}
    </section>
  )
}

type Repeticao = 'um' | '12x36' | 'semana'

const DIAS_DA_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const PRESETS = [
  { rotulo: 'Dia · 07–19', inicio: '07:00', fim: '19:00' },
  { rotulo: 'Noite · 19–07', inicio: '19:00', fim: '07:00' },
]

/**
 * O DIÁLOGO DE LANÇAR. O ritmo 12x36 é plantão dia sim, dia não, a partir do
 * primeiro dia; "dias da semana" repete nos dias marcados. Os dois vão até a
 * data escolhida, e a prévia diz quantos plantões vão entrar antes de salvar.
 * Um plantão que já existe (mesmo dia e turno) fica como está.
 */
function LancarPlantoes({ pessoa, hoje, onFechar }: { pessoa: PessoaDaEquipe; hoje: string; onFechar: () => void }) {
  const lancar = useLancarPlantoes()
  const [inicio, setInicio] = useState(hoje)
  const [horaInicio, setHoraInicio] = useState('07:00')
  const [horaFim, setHoraFim] = useState('19:00')
  const [repeticao, setRepeticao] = useState<Repeticao>('12x36')
  const [dias, setDias] = useState<number[]>([1, 2, 3, 4, 5])
  const [ate, setAte] = useState(somarDia(hoje, JANELA - 1))
  const [erro, setErro] = useState<string | null>(null)

  const plantoes: NovoPlantao[] = []
  if (inicio && horaInicio && horaFim) {
    if (repeticao === 'um') {
      plantoes.push({ data: inicio, horaInicio, horaFim })
    } else {
      // Teto de um ano: um "até" digitado errado não pode lançar mil plantões.
      for (let i = 0, d = inicio; d <= ate && i < 366; i++, d = somarDia(inicio, i)) {
        const semana = new Date(`${d}T12:00:00Z`).getUTCDay()
        if (repeticao === '12x36' ? i % 2 === 0 : dias.includes(semana)) plantoes.push({ data: d, horaInicio, horaFim })
      }
    }
  }
  const minutos = horaInicio && horaFim ? duracaoEmMinutos(horaInicio, horaFim) : 0

  function salvar() {
    setErro(null)
    lancar.mutate(
      { pessoaId: pessoa.id, plantoes },
      { onSuccess: onFechar, onError: (e) => setErro(e instanceof Error ? e.message : String(e)) },
    )
  }

  return (
    <Dialogo
      titulo={`Lançar plantões — ${pessoa.nome}`}
      rotuloConfirmar={
        lancar.isPending
          ? 'Lançando…'
          : plantoes.length === 1
            ? 'Lançar 1 plantão'
            : `Lançar ${plantoes.length} plantões`
      }
      confirmarDesabilitado={plantoes.length === 0 || minutos === 0}
      ocupado={lancar.isPending}
      erro={erro}
      onConfirmar={salvar}
      onCancelar={onFechar}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => {
            const ativo = horaInicio === p.inicio && horaFim === p.fim
            return (
              <button
                key={p.rotulo}
                type="button"
                aria-pressed={ativo}
                onClick={() => {
                  setHoraInicio(p.inicio)
                  setHoraFim(p.fim)
                }}
                className={clsx(
                  'min-h-9 rounded-full border px-3.5 text-sm font-semibold',
                  ativo ? 'border-marca bg-marca text-white' : 'border-border hover:border-marca/40',
                )}
              >
                {p.rotulo}
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <CampoTexto rotulo="Começa" type="time" valor={horaInicio} aoMudar={setHoraInicio} />
          <CampoTexto
            rotulo="Termina"
            type="time"
            valor={horaFim}
            aoMudar={setHoraFim}
            {...(horaFim && horaInicio && horaFim <= horaInicio ? { ajuda: 'No dia seguinte.' } : {})}
          />
        </div>

        <fieldset>
          <legend className="text-sm font-medium">Repetir</legend>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {(
              [
                ['um', 'Só um dia'],
                ['12x36', '12x36'],
                ['semana', 'Dias da semana'],
              ] as const
            ).map(([id, rotulo]) => (
              <button
                key={id}
                type="button"
                aria-pressed={repeticao === id}
                onClick={() => setRepeticao(id)}
                className={clsx(
                  'min-h-11 rounded-xl border px-2 text-sm font-semibold',
                  repeticao === id ? 'border-marca bg-marca-suave text-marca' : 'border-border hover:border-marca/40',
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>
        </fieldset>

        {repeticao === 'semana' && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Dias da semana">
            {DIAS_DA_SEMANA.map((rotulo, i) => {
              const marcado = dias.includes(i)
              return (
                <button
                  key={rotulo}
                  type="button"
                  aria-pressed={marcado}
                  onClick={() => setDias((atual) => (marcado ? atual.filter((x) => x !== i) : [...atual, i]))}
                  className={clsx(
                    'min-h-9 min-w-11 rounded-full border px-2 text-sm font-semibold',
                    marcado ? 'border-marca bg-marca text-white' : 'border-border hover:border-marca/40',
                  )}
                >
                  {rotulo}
                </button>
              )
            })}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <CampoTexto rotulo={repeticao === 'um' ? 'Dia' : 'A partir de'} type="date" valor={inicio} aoMudar={setInicio} />
          {repeticao !== 'um' && <CampoTexto rotulo="Até" type="date" valor={ate} aoMudar={setAte} />}
        </div>

        <p className="rounded-xl bg-muted/50 px-3 py-2 text-sm">
          {plantoes.length === 0
            ? 'Nenhum plantão nesse intervalo.'
            : `${plantoes.length} ${plantoes.length === 1 ? 'plantão' : 'plantões'} de ${horas(minutos)} — ${horas(
                minutos * plantoes.length,
              )} no total. O que já estiver lançado no mesmo dia e turno fica como está.`}
        </p>
      </div>
    </Dialogo>
  )
}
