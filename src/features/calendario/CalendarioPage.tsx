import { useState } from 'react'
import { useSearchParams } from 'react-router'
import clsx from 'clsx'
import { Botao } from '@/components/ui/Botao'
import { useAuth } from '@/features/auth/contexto'
import { podeEditarCadastro } from '@/features/quadro/lib/acoes'
import { Segmentado } from '@/features/relatorios/components/Segmentado'
import { useCalendario, type Feriado, type ItemDoCalendario, type TipoDeItem } from './api/useCalendario'
import { AgendaDoDia } from './components/AgendaDoDia'
import { NovoCasoDialogo } from './components/NovoCasoDialogo'
import { ColunasDaSemana, GradeDoMes } from './components/GradeDoCalendario'
import {
  deslocar,
  hojeEmBrasilia,
  periodoDaVisao,
  rotuloDaSemana,
  rotuloDoMes,
  type Visao,
} from './lib/datas'
import { TIPOS } from './lib/estilos'

/**
 * O CALENDÁRIO (30/09/2026, o item 5 da fila do gestor). Primeira etapa de
 * três, combinada com o usuário: aqui ele MOSTRA o que o sistema já sabe — a
 * previsão de cada parto, a hora marcada de banho e fechamento, o prazo
 * combinado do vídeo, do Foto/Livro e do New Born, e o vencimento do prazo do
 * pacote de quem ainda não foi enviado. E marca FERIADO, que a tabela esperava
 * desde 27/08 (dívida #9).
 *
 * CRIA CASO desde 30/09/2026 (segunda volta, "ele está entrando para
 * substituir"): o ADM marca o parto aqui, e o sync escreve o evento no Google
 * — que continua completo como contingência. Ver `NovoCasoDialogo`. A ESCALA
 * de plantão (na seção Equipe) é a próxima etapa.
 *
 * QUEM VÊ: todos menos as fotógrafas (decisão do gestor) — o mesmo recorte da
 * aba Concluídos (`podeVerConcluidos`). É regra de TELA: a RLS não mudou.
 *
 * O LAYOUT É O DO RELATÓRIO INTERNO: a grade à esquerda escolhe o dia, e a
 * agenda à direita diz o que ele tem, por extenso. Nada de modal por cima da
 * grade — o gestor pediu menos espaço vazio, não mais camadas.
 *
 * A visão e o dia moram no ENDEREÇO: um link leva a pessoa para a mesma semana.
 */
export function CalendarioPage() {
  const { pessoa } = useAuth()
  const [params, setParams] = useSearchParams()
  const [hoje] = useState(hojeEmBrasilia)
  const visao: Visao = params.get('ver') === 'semana' ? 'semana' : 'mes'
  const dataDaUrl = params.get('dia')
  const escolhido = dataDaUrl && /^\d{4}-\d{2}-\d{2}$/.test(dataDaUrl) ? dataDaUrl : hoje
  const [escondidos, setEscondidos] = useState<Set<TipoDeItem>>(new Set())
  // O dia com que o formulário de caso novo abre; nulo = fechado.
  const [novoCasoEm, setNovoCasoEm] = useState<string | null>(null)
  const ehAdm = podeEditarCadastro(pessoa?.papelSistema ?? '')

  const periodo = periodoDaVisao(visao, escolhido)
  const calendario = useCalendario(periodo.inicio, periodo.fim)

  const irPara = (dia: string, v: Visao = visao) =>
    setParams(
      (atual) => {
        const p = new URLSearchParams(atual)
        p.set('dia', dia)
        if (v === 'semana') p.set('ver', 'semana')
        else p.delete('ver')
        return p
      },
      { replace: false },
    )

  const visiveis = (calendario.data?.itens ?? []).filter((i) => !escondidos.has(i.tipo))
  const porDia = new Map<string, ItemDoCalendario[]>()
  for (const item of visiveis) porDia.set(item.dia, [...(porDia.get(item.dia) ?? []), item])
  const feriados = new Map<string, Feriado>((calendario.data?.feriados ?? []).map((f) => [f.data, f]))
  const contagem = (tipo: TipoDeItem) => (calendario.data?.itens ?? []).filter((i) => i.tipo === tipo).length

  function alternar(tipo: TipoDeItem) {
    setEscondidos((atual) => {
      const novo = new Set(atual)
      if (novo.has(tipo)) novo.delete(tipo)
      else novo.add(tipo)
      return novo
    })
  }

  const titulo = visao === 'mes' ? rotuloDoMes(escolhido) : rotuloDaSemana(periodo.inicio, periodo.fim)

  return (
    <div className="mx-auto w-full max-w-[100rem] space-y-4 p-3 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight">Calendário</h1>
        <p className="text-sm text-muted-foreground">
          Partos, horas marcadas e prazos de todos os casos. Toque num dia para ver o que ele tem.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-painel border border-border bg-card p-1">
          <Botao variante="fantasma" onClick={() => irPara(deslocar(visao, escolhido, -1))} aria-label="Anterior">
            ‹
          </Botao>
          <Botao variante="fantasma" onClick={() => irPara(hoje)} disabled={escolhido === hoje}>
            Hoje
          </Botao>
          <Botao variante="fantasma" onClick={() => irPara(deslocar(visao, escolhido, 1))} aria-label="Próximo">
            ›
          </Botao>
        </div>
        <h2 className="min-w-[12rem] text-lg font-bold tracking-tight text-foreground" aria-live="polite">
          {titulo}
        </h2>
        <Segmentado
          rotulo="Visão do calendário"
          opcoes={[
            { id: 'mes', conteudo: 'Mês' },
            { id: 'semana', conteudo: 'Semana' },
          ]}
          ativa={visao}
          onTrocar={(v) => irPara(escolhido, v)}
        />
        {calendario.isFetching && <span className="text-xs text-muted-foreground">Atualizando…</span>}
        {ehAdm && (
          <Botao variante="primario" className="ml-auto" onClick={() => setNovoCasoEm(escolhido)}>
            + Novo caso
          </Botao>
        )}
      </div>

      {/* A LEGENDA É O FILTRO: tocar num tipo esconde ou mostra. */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Mostrar no calendário">
        {TIPOS.map((t) => {
          const ligado = !escondidos.has(t.id)
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={ligado}
              onClick={() => alternar(t.id)}
              className={clsx(
                'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                ligado ? 'border-border bg-card text-foreground' : 'border-dashed border-border text-muted-foreground line-through',
              )}
            >
              <span className={clsx('size-2.5 rounded-full', t.marca, !ligado && 'opacity-40')} aria-hidden="true" />
              {t.legenda}
              <span className="text-muted-foreground tabular-nums">{contagem(t.id)}</span>
            </button>
          )
        })}
      </div>

      {calendario.error ? (
        <p className="rounded-painel border border-atrasado/40 bg-card p-4 text-sm text-atrasado">
          Não deu para carregar o calendário: {calendario.error.message}
        </p>
      ) : (
        <div
          className={clsx(
            'grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]',
            calendario.isPlaceholderData && 'opacity-60 transition-opacity',
          )}
        >
          <div className="min-w-0">
            {calendario.isPending ? (
              <p className="py-24 text-center text-sm text-muted-foreground">Carregando…</p>
            ) : visao === 'mes' ? (
              <GradeDoMes
                dias={periodo.dias}
                mes={escolhido.slice(0, 7)}
                hoje={hoje}
                escolhido={escolhido}
                porDia={porDia}
                feriados={feriados}
                onEscolher={(d) => irPara(d)}
              />
            ) : (
              <ColunasDaSemana
                dias={periodo.dias}
                hoje={hoje}
                escolhido={escolhido}
                porDia={porDia}
                feriados={feriados}
                onEscolher={(d) => irPara(d)}
              />
            )}
          </div>
          <div className="xl:sticky xl:top-4">
            <AgendaDoDia
              dia={escolhido}
              itens={porDia.get(escolhido) ?? []}
              feriado={feriados.get(escolhido)}
              podeMarcarFeriado={ehAdm}
              onNovoCaso={ehAdm ? () => setNovoCasoEm(escolhido) : undefined}
            />
          </div>
        </div>
      )}
      {novoCasoEm && (
        <NovoCasoDialogo
          diaInicial={novoCasoEm}
          onFechar={() => setNovoCasoEm(null)}
          onCriado={(dia) => {
            setNovoCasoEm(null)
            irPara(dia)
          }}
        />
      )}
    </div>
  )
}
