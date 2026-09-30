import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import clsx from 'clsx'
import { Botao } from '@/components/ui/Botao'
import { useAuth } from '@/features/auth/contexto'
import { podeEditarCadastro } from '@/features/quadro/lib/acoes'
import { Segmentado } from '@/features/relatorios/components/Segmentado'
import { useCalendario, type Feriado, type ItemDoCalendario } from './api/useCalendario'
import { ControleDoFeriado } from './components/ControleDoFeriado'
import { DetalheDoItem } from './components/DetalheDoItem'
import { FiltrosDoCalendario } from './components/FiltrosDoCalendario'
import { NovoCasoDialogo } from './components/NovoCasoDialogo'
import { VisaoDia, VisaoLista, VisaoMes, VisaoSemana } from './components/Visoes'
import { corDoParto } from './lib/coresGoogle'
import {
  deslocar,
  hojeEmBrasilia,
  periodoDaVisao,
  rotuloDaSemana,
  rotuloDoDiaCompleto,
  rotuloDoMes,
  type Visao,
} from './lib/datas'
import { TIPOS } from './lib/estilos'

/**
 * O CALENDÁRIO (30/09/2026, o item 5 da fila do gestor).
 *
 * O DESENHO É O DO EXEMPLO QUE O GESTOR MANDOU ("nosso calendário vai virar"
 * um `EventManager` de shadcn): quatro visões — mês, semana e dia em grade de
 * horas, lista —, busca, filtros em menu com as etiquetas dos ativos, cartão
 * de detalhes no hover e detalhe completo no toque. AS PEÇAS SÃO DA CASA, como
 * no sino e na barra lateral: o exemplo traria sete pacotes (Radix, cva,
 * lucide…) e um segundo sistema de botões, diálogos e selects ao lado dos
 * nossos.
 *
 * FICOU DE FORA do exemplo, e de propósito: ARRASTAR para reagendar, editar e
 * apagar. Um caso ligado ao Google é relido pelo sync a cada 25 segundos, e uma
 * hora mudada aqui voltaria sozinha. Reagendar pelo calendário pede que o
 * sistema atualize o evento no Google — é a próxima etapa.
 *
 * AS CORES SÃO AS DO GOOGLE (a regra do cadastro: BIRTH vermelho, o resto pela
 * maternidade), todo item de um caso na cor dele. O que vem pela frente é cor
 * cheia; o que passou é fundo branco com a bolinha — ver `aparencia`.
 *
 * CRIA CASO (adm): "+ Novo caso", e o sync escreve o evento no Google.
 *
 * QUEM VÊ: todos menos as fotógrafas (decisão do gestor), pela
 * `RotaAdministrativa`. A visão e o dia moram no endereço.
 */
const NOMES_DAS_VISOES: Record<Visao, string> = { mes: 'Mês', semana: 'Semana', dia: 'Dia', lista: 'Lista' }
const VISOES: Visao[] = ['mes', 'semana', 'dia', 'lista']

const semAcento = (t: string) =>
  t
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

const chaveDaCor = (i: ItemDoCalendario) => i.corDoGoogle ?? 'padrao'

export function CalendarioPage() {
  const { pessoa } = useAuth()
  const [params, setParams] = useSearchParams()
  const [hoje] = useState(hojeEmBrasilia)
  const verDaUrl = params.get('ver') as Visao | null
  const visao: Visao = verDaUrl && VISOES.includes(verDaUrl) ? verDaUrl : 'mes'
  const dataDaUrl = params.get('dia')
  const escolhido = dataDaUrl && /^\d{4}-\d{2}-\d{2}$/.test(dataDaUrl) ? dataDaUrl : hoje
  const ehAdm = podeEditarCadastro(pessoa?.papelSistema ?? '')

  const [busca, setBusca] = useState('')
  const [cores, setCores] = useState<string[]>([])
  const [tipos, setTipos] = useState<string[]>([])
  const [maternidades, setMaternidades] = useState<string[]>([])
  const [aberto, setAberto] = useState<ItemDoCalendario | null>(null)
  // O dia com que o formulário de caso novo abre; nulo = fechado.
  const [novoCasoEm, setNovoCasoEm] = useState<string | null>(null)

  const periodo = periodoDaVisao(visao, escolhido)
  const calendario = useCalendario(periodo.inicio, periodo.fim)

  const irPara = (dia: string, v: Visao = visao) =>
    setParams((atual) => {
      const p = new URLSearchParams(atual)
      p.set('dia', dia)
      if (v === 'mes') p.delete('ver')
      else p.set('ver', v)
      return p
    })

  const todos = useMemo(() => calendario.data?.itens ?? [], [calendario.data])

  // As opções dos filtros saem do que ESTÁ no período — uma maternidade sem
  // nada neste mês não ocupa lugar no menu.
  const opcoesDeCor = useMemo(() => {
    const vistas = new Map<string, { rotulo: string; cor: string }>()
    for (const i of todos) {
      const c = corDoParto(i.corDoGoogle)
      vistas.set(chaveDaCor(i), { rotulo: c.nome, cor: c.hex })
    }
    return [...vistas].map(([valor, o]) => ({ valor, ...o })).sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
  }, [todos])
  const opcoesDeMaternidade = useMemo(
    () =>
      [...new Set(todos.map((i) => i.maternidade).filter((m): m is string => m !== null))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR'))
        .map((m) => ({ valor: m, rotulo: m })),
    [todos],
  )

  const termo = semAcento(busca.trim())
  const visiveis = todos.filter(
    (i) =>
      (cores.length === 0 || cores.includes(chaveDaCor(i))) &&
      (tipos.length === 0 || tipos.includes(i.tipo)) &&
      (maternidades.length === 0 || (i.maternidade !== null && maternidades.includes(i.maternidade))) &&
      (termo === '' ||
        semAcento([i.nome, i.titulo, i.maternidade, i.pacote, i.responsavel].filter(Boolean).join(' ')).includes(termo)),
  )
  const porDia = new Map<string, ItemDoCalendario[]>()
  for (const item of visiveis) porDia.set(item.dia, [...(porDia.get(item.dia) ?? []), item])
  const feriados = new Map<string, Feriado>((calendario.data?.feriados ?? []).map((f) => [f.data, f]))

  const titulo =
    visao === 'mes' || visao === 'lista'
      ? rotuloDoMes(escolhido)
      : visao === 'semana'
        ? rotuloDaSemana(periodo.inicio, periodo.fim)
        : rotuloDoDiaCompleto(escolhido)

  const comum = { hoje, porDia, feriados, onAbrir: setAberto, onIrParaDia: (d: string) => irPara(d, 'dia') }

  return (
    <div className="mx-auto w-full max-w-[100rem] space-y-4 p-3 md:p-6">
      {/* O cabeçalho do exemplo: título e navegação à esquerda, visões e o botão de criar à direita. */}
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="min-w-[12rem] text-2xl font-extrabold tracking-tight" aria-live="polite">
            {titulo}
          </h1>
          <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1">
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
          {calendario.isFetching && <span className="text-xs text-muted-foreground">Atualizando…</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmentado
            rotulo="Visão do calendário"
            opcoes={VISOES.map((v) => ({ id: v, conteudo: NOMES_DAS_VISOES[v] }))}
            ativa={visao}
            onTrocar={(v) => irPara(escolhido, v)}
          />
          {ehAdm && (
            <Botao variante="primario" onClick={() => setNovoCasoEm(escolhido)}>
              + Novo caso
            </Botao>
          )}
        </div>
      </header>

      <FiltrosDoCalendario
        busca={busca}
        onBuscar={setBusca}
        grupos={[
          { id: 'cores', titulo: 'Cores', opcoes: opcoesDeCor, marcados: cores, onMudar: setCores },
          {
            id: 'tipos',
            titulo: 'Tipos',
            opcoes: TIPOS.map((t) => ({ valor: t.id, rotulo: t.legenda })),
            marcados: tipos,
            onMudar: setTipos,
          },
          {
            id: 'maternidades',
            titulo: 'Maternidades',
            opcoes: opcoesDeMaternidade,
            marcados: maternidades,
            onMudar: setMaternidades,
          },
        ]}
      />

      {calendario.error ? (
        <p className="rounded-painel border border-atrasado/40 bg-card p-4 text-sm text-atrasado">
          Não deu para carregar o calendário: {calendario.error.message}
        </p>
      ) : calendario.isPending ? (
        <p className="py-24 text-center text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <div className={clsx('transition-opacity', calendario.isPlaceholderData && 'opacity-60')}>
          {visao === 'mes' && <VisaoMes {...comum} dias={periodo.dias} mes={escolhido.slice(0, 7)} />}
          {visao === 'semana' && <VisaoSemana {...comum} dias={periodo.dias} />}
          {visao === 'lista' && <VisaoLista {...comum} dias={periodo.dias} />}
          {visao === 'dia' && (
            <VisaoDia
              dia={escolhido}
              hoje={hoje}
              porDia={porDia}
              feriados={feriados}
              onAbrir={setAberto}
              acoes={
                ehAdm && (
                  <>
                    <ControleDoFeriado key={escolhido} dia={escolhido} feriado={feriados.get(escolhido)} />
                    <Botao variante="primario" onClick={() => setNovoCasoEm(escolhido)}>
                      + Novo caso neste dia
                    </Botao>
                  </>
                )
              }
            />
          )}
        </div>
      )}

      {aberto && <DetalheDoItem item={aberto} onFechar={() => setAberto(null)} />}
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
