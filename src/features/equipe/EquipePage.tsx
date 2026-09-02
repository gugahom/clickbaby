import { useRef, useState } from 'react'
import clsx from 'clsx'
import { Avatar } from '@/components/ui/Avatar'
import { Botao } from '@/components/ui/Botao'
import { IconeAdicionar } from '@/components/ui/icones'
import { useEquipe, type Lugar, type PessoaDaEquipe } from './api/useEquipe'
import { NovaPessoaDialogo } from './components/NovaPessoaDialogo'
import { FichaDaPessoa } from './components/FichaDaPessoa'
import { COR_LUGAR, ROTULO_PAPEL, relativo } from './lib/apresentacao'

/**
 * A Equipe como ESCALA, não como cadastro.
 *
 * A primeira versão desta tela era uma lista alfabética de cartões brancos
 * centralizada na página — a forma que qualquer admin de qualquer sistema tem,
 * e que não dizia nada sobre esta operação. O gestor leu como genérica, com
 * razão.
 *
 * A pergunta que esta tela responde é a de quem distribui trabalho numa equipe
 * em escala 24/7: QUEM ESTÁ COM O QUÊ AGORA. Por isso a lista é agrupada pelo
 * estado ao vivo, e os grupos têm os nomes que a operação usa — em campo (na
 * maternidade) e na ilha (na estação de edição), que são as duas trilhas do
 * banco e os dois lugares físicos do trabalho. Alfabético é índice remissivo;
 * responde "onde está a Ingrid", que ninguém pergunta olhando uma equipe de
 * catorze.
 *
 * MESTRE E DETALHE, e não uma lista larga. A coluna da esquerda é a escala; a
 * da direita é a ficha de quem estiver selecionada, que é onde as métricas
 * vivem. É a mesma forma do Quadro — lista à esquerda, painel à direita —, e
 * usar a mesma forma é o que faz as duas telas parecerem o mesmo produto.
 */
type Grupo = 'parada' | 'campo' | 'ilha' | 'livre' | 'sem-acesso' | 'inativa'

/**
 * PARADAS VEM PRIMEIRO, e isso é a tela toda numa linha.
 *
 * Uma pessoa com etapa pausada não está ocupada — o trabalho dela parou e
 * ninguém foi avisado. É o único estado desta lista que pede uma decisão
 * agora, e por isso encabeça. Quem está em campo ou na ilha está bem; quem
 * está livre também. Ordenar por "quem precisa de mim" e não por hierarquia é
 * o que separa uma escala de um organograma.
 */
const ORDEM_DOS_GRUPOS: Grupo[] = [
  'parada',
  'campo',
  'ilha',
  'livre',
  'sem-acesso',
  'inativa',
]

const TITULO_DO_GRUPO: Record<Grupo, string> = {
  parada: 'Paradas',
  campo: 'Em campo',
  ilha: 'Na ilha',
  livre: 'Livres',
  'sem-acesso': 'Sem acesso',
  inativa: 'Inativas',
}

/**
 * A legenda ensina o vocabulário UMA vez e sai da frente.
 *
 * "Em campo" e "na ilha" são as palavras da operação, não do sistema — quem
 * chega nesta tela pela primeira vez precisa de três palavras para amarrá-las
 * ao mundo real. Depois disso ninguém as lê, e é por isso que elas são miúdas
 * e cinzas em vez de virarem subtítulo.
 */
const LEGENDA_DO_GRUPO: Record<Grupo, string> = {
  parada: 'com etapa pausada, sem ninguém tocando',
  campo: 'na maternidade',
  ilha: 'na edição',
  livre: 'sem nada em mãos',
  'sem-acesso': 'sem conta para entrar',
  inativa: 'fora da operação',
}

function grupoDe(p: PessoaDaEquipe): Grupo {
  if (!p.ativo) return 'inativa'
  if (!p.temAcesso) return 'sem-acesso'
  if (p.tudoPausado) return 'parada'
  if (p.lugarAgora === 'campo') return 'campo'
  if (p.lugarAgora === 'ilha') return 'ilha'
  return 'livre'
}

export function EquipePage() {
  const { data, isPending, error } = useEquipe()
  const [cadastrando, setCadastrando] = useState(false)
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null)
  const ficha = useRef<HTMLDivElement>(null)

  const pessoas = data ?? []

  const grupos = ORDEM_DOS_GRUPOS.map((grupo) => ({
    grupo,
    // Dentro do grupo: quem carrega mais primeiro, depois por nome. Numa
    // escala, "quem está mais cheia" é a informação que decide a próxima
    // distribuição.
    pessoas: pessoas
      .filter((p) => grupoDe(p) === grupo)
      .sort(
        (a, b) =>
          b.emAndamento - a.emAndamento ||
          b.concluidasNaJanela - a.concluidasNaJanela ||
          a.nome.localeCompare(b.nome),
      ),
  })).filter((g) => g.pessoas.length > 0)

  // Derivada, não sincronizada por efeito: a primeira da primeira coluna já
  // vem selecionada, e um id que sumiu (pessoa desativada, lista recarregada)
  // cai de volta nela em vez de deixar a ficha vazia.
  const emOrdem = grupos.flatMap((g) => g.pessoas)
  const selecionada =
    emOrdem.find((p) => p.id === selecionadaId) ?? emOrdem[0] ?? null

  const emCampo = pessoas.filter((p) => grupoDe(p) === 'campo').length
  const naIlha = pessoas.filter((p) => grupoDe(p) === 'ilha').length

  function selecionar(id: string) {
    setSelecionadaId(id)
    // No celular a ficha vive abaixo de uma lista de catorze linhas; sem isto,
    // tocar num nome não mostraria nada acontecendo.
    if (window.matchMedia('(max-width: 1023px)').matches) {
      ficha.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex-shrink-0 border-b border-border/70 bg-background/80 px-3 py-4 backdrop-blur-md md:px-5">
        <div className="mx-auto flex max-w-6xl items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="rotulo-sobrescrito text-acento">Gestão</p>
            <h1 className="mt-0.5 text-lg font-extrabold tracking-tight md:text-2xl">
              Equipe
            </h1>
            {!isPending && !error && (
              <p className="mt-1 text-sm text-muted-foreground">
                {pessoas.length} {pessoas.length === 1 ? 'pessoa' : 'pessoas'} ·{' '}
                <ContagemAoVivo emCampo={emCampo} naIlha={naIlha} />
              </p>
            )}
          </div>

          <Botao onClick={() => setCadastrando(true)} className="flex-shrink-0">
            <IconeAdicionar className="size-4" />
            Cadastrar pessoa
          </Botao>
        </div>
      </header>

      {cadastrando && <NovaPessoaDialogo onFechar={() => setCadastrando(false)} />}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-5">
        {error ? (
          <Aviso titulo="Não foi possível carregar a equipe">
            {error instanceof Error ? error.message : 'Erro desconhecido.'}
          </Aviso>
        ) : isPending ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : pessoas.length === 0 ? (
          <Aviso titulo="Ninguém cadastrado">
            Sem pessoa em <code>pessoas</code>, o Quadro aparece vazio para todo
            mundo — a RLS exige o vínculo. Comece por “Cadastrar pessoa”.
          </Aviso>
        ) : (
          <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start">
            <div className="space-y-5">
              {grupos.map(({ grupo, pessoas: doGrupo }) => (
                <section key={grupo}>
                  <h2 className="flex flex-wrap items-baseline gap-x-2 px-1">
                    <span className="rotulo-sobrescrito text-acento">
                      {TITULO_DO_GRUPO[grupo]}
                    </span>
                    <span className="text-sm font-bold tabular-nums text-muted-foreground">
                      {doGrupo.length}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {LEGENDA_DO_GRUPO[grupo]}
                    </span>
                  </h2>

                  <ul className="mt-2 space-y-1.5">
                    {doGrupo.map((p) => (
                      <li key={p.id}>
                        <LinhaDaEquipe
                          pessoa={p}
                          selecionada={selecionada?.id === p.id}
                          onEscolher={() => selecionar(p.id)}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            <div ref={ficha} className="lg:sticky lg:top-4">
              {selecionada && <FichaDaPessoa pessoa={selecionada} />}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** "3 em campo · 2 na ilha" — ou a verdade quando não há ninguém trabalhando. */
function ContagemAoVivo({ emCampo, naIlha }: { emCampo: number; naIlha: number }) {
  if (emCampo === 0 && naIlha === 0) return <>ninguém com etapa aberta agora</>

  return (
    <>
      {emCampo > 0 && (
        <span className={COR_LUGAR.campo.texto}>
          <strong className="font-bold tabular-nums">{emCampo}</strong> em campo
        </span>
      )}
      {emCampo > 0 && naIlha > 0 && ' · '}
      {naIlha > 0 && (
        <span className={COR_LUGAR.ilha.texto}>
          <strong className="font-bold tabular-nums">{naIlha}</strong> na ilha
        </span>
      )}
    </>
  )
}

function LinhaDaEquipe({
  pessoa,
  selecionada,
  onEscolher,
}: {
  pessoa: PessoaDaEquipe
  selecionada: boolean
  onEscolher: () => void
}) {
  const apelido = pessoa.apelidos[0]

  return (
    <button
      type="button"
      onClick={onEscolher}
      aria-current={selecionada ? 'true' : undefined}
      className={clsx(
        'flex w-full items-center gap-3 rounded-cartao border p-2.5 text-left transition-all md:p-3',
        // A selecionada ganha a espinha da marca à esquerda — o mesmo recurso
        // do cartão do Quadro, onde a barra colorida diz "é este". Reusar
        // ensina uma linguagem em vez de inventar duas.
        selecionada
          ? 'border-marca/40 bg-card shadow-cartao-alto ring-1 ring-marca/20'
          : 'border-transparent bg-card/60 hover:border-border hover:bg-card',
        !pessoa.ativo && 'opacity-60',
      )}
    >
      <Avatar
        nome={pessoa.nome}
        tom="claro"
        className={clsx('size-9', selecionada && 'ring-marca/30')}
      />

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2">
          <span className="font-bold tracking-tight">{pessoa.nome}</span>
          {apelido && (
            <span className="text-xs text-muted-foreground">“{apelido}”</span>
          )}
          {pessoa.papelSistema !== 'operador' && (
            <span className="rounded-full bg-marca-suave px-1.5 py-0.5 text-[10px] font-bold text-marca">
              {ROTULO_PAPEL[pessoa.papelSistema] ?? pessoa.papelSistema}
            </span>
          )}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {pessoa.fazendoAgora
            ? pessoa.fazendoAgora
            : pessoa.ultimaAtividade
              ? `Última atividade ${relativo(pessoa.ultimaAtividade)}`
              : 'Nenhuma etapa ainda'}
        </p>
      </div>

      {pessoa.emAndamento > 0 ? (
        <Carga
          quantidade={pessoa.emAndamento}
          lugar={pessoa.lugarAgora}
          pausada={pessoa.tudoPausado}
        />
      ) : (
        <span className="flex-shrink-0 text-xs tabular-nums text-muted-foreground">
          {pessoa.concluidasNaJanela > 0 ? `${pessoa.concluidasNaJanela} em 30d` : '—'}
        </span>
      )}
    </button>
  )
}

/** Quantas etapas ela está segurando. É o número que decide a próxima entrega. */
function Carga({
  quantidade,
  lugar,
  pausada,
}: {
  quantidade: number
  lugar: Lugar | null
  pausada: boolean
}) {
  const cor = lugar ? COR_LUGAR[lugar] : COR_LUGAR.campo

  return (
    <span
      className={clsx(
        'inline-flex size-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-extrabold tabular-nums',
        // Parada rouba a cor do lugar: o âmbar é o mesmo da pílula de etapa
        // pausada no Quadro, e quem já viu um card sabe o que ele quer dizer.
        pausada ? 'bg-atencao/15 text-atencao-tinta' : clsx(cor.fundo, cor.texto),
      )}
      title={
        pausada
          ? `${quantidade} ${quantidade === 1 ? 'etapa pausada' : 'etapas pausadas'}`
          : `${quantidade} ${quantidade === 1 ? 'etapa' : 'etapas'} em mãos`
      }
    >
      {quantidade}
    </span>
  )
}

function Aviso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md rounded-cartao border border-border bg-card p-6 text-center">
      <h2 className="font-semibold">{titulo}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
    </div>
  )
}
