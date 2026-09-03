import { useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { Avatar } from '@/components/ui/Avatar'
import { Botao } from '@/components/ui/Botao'
import { IconeAdicionar } from '@/components/ui/icones'
import { useEquipe, type PessoaDaEquipe } from './api/useEquipe'
import { NovaPessoaDialogo } from './components/NovaPessoaDialogo'
import { FichaDaPessoa } from './components/FichaDaPessoa'
import { COR_LUGAR, ROTULO_LUGAR, ROTULO_PAPEL, relativo } from './lib/apresentacao'

/**
 * A EQUIPE É UM CADASTRO — e desta vez de propósito.
 *
 * A versão anterior agrupava pelo estado ao vivo (paradas, em campo, na ilha,
 * livres) e existia para servir uma coluna de métricas, removida a pedido do
 * gestor. Sem ela, agrupar por estado organizava a tela em torno de uma
 * pergunta que a tela não responde mais — e "Livres" e "Paradas" saíram por
 * pedido explícito: aquela informação vai ter outro destino.
 *
 * O que sobra é a divisão que a GESTÃO usa quando vem aqui, administrativa e
 * não operacional: quem está na equipe, quem foi cadastrada e não consegue
 * entrar, e quem saiu. As duas últimas são exceções que pedem ação; por isso
 * ficam separadas e no fim, em vez de diluídas na lista.
 *
 * O estado ao vivo não sumiu — virou um selo na linha. Continua útil ("a
 * Ingrid está na ilha agora"), só deixou de ser o eixo.
 *
 * MESTRE E DETALHE, como o Quadro: lista à esquerda, ficha à direita. Usar a
 * mesma forma é o que faz as duas telas parecerem o mesmo produto.
 */
type Grupo = 'equipe' | 'sem-acesso' | 'inativa'

const ORDEM_DOS_GRUPOS: Grupo[] = ['equipe', 'sem-acesso', 'inativa']

const TITULO_DO_GRUPO: Record<Grupo, string> = {
  equipe: 'Equipe',
  'sem-acesso': 'Sem acesso',
  inativa: 'Inativas',
}

/** Vazia no grupo principal: "Equipe" não precisa de tradução. */
const LEGENDA_DO_GRUPO: Record<Grupo, string> = {
  equipe: '',
  'sem-acesso': 'cadastradas, mas sem conta para entrar',
  inativa: 'fora da operação',
}

function grupoDe(p: PessoaDaEquipe): Grupo {
  if (!p.ativo) return 'inativa'
  if (!p.temAcesso) return 'sem-acesso'
  return 'equipe'
}

export function EquipePage() {
  const { data, isPending, error } = useEquipe()
  const [cadastrando, setCadastrando] = useState(false)
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null)
  const ficha = useRef<HTMLDivElement>(null)

  const pessoas = data ?? []

  const grupos = ORDEM_DOS_GRUPOS.map((grupo) => ({
    grupo,
    // Alfabética. Num cadastro a pergunta é "cadê a Ingrid", e ela se responde
    // pelo nome — ordenar por carga faria a lista se reorganizar sozinha
    // enquanto a pessoa procura.
    pessoas: pessoas
      .filter((p) => grupoDe(p) === grupo)
      .sort((a, b) => a.nome.localeCompare(b.nome)),
  })).filter((g) => g.pessoas.length > 0)

  // Derivada, não sincronizada por efeito: a primeira já vem selecionada, e um
  // id que sumiu (pessoa excluída, lista recarregada) cai de volta nela em vez
  // de deixar a ficha vazia.
  const emOrdem = grupos.flatMap((g) => g.pessoas)
  const selecionada = emOrdem.find((p) => p.id === selecionadaId) ?? emOrdem[0] ?? null

  const trabalhando = pessoas.filter((p) => p.emAndamento > 0 && !p.tudoPausado).length
  const semAcesso = pessoas.filter((p) => p.ativo && !p.temAcesso).length

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
                {trabalhando === 0
                  ? 'ninguém com etapa aberta agora'
                  : `${trabalhando} com etapa aberta agora`}
                {semAcesso > 0 && (
                  // Só aparece quando existe, e é o único número desta linha
                  // que pede ação: alguém cadastrada que não consegue entrar
                  // não vai reclamar até precisar do sistema.
                  <>
                    {' · '}
                    <span className="font-semibold text-rascunho">
                      {semAcesso} sem acesso
                    </span>
                  </>
                )}
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
                    {LEGENDA_DO_GRUPO[grupo] && (
                      <span className="text-xs text-muted-foreground">
                        {LEGENDA_DO_GRUPO[grupo]}
                      </span>
                    )}
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
        // A selecionada ganha anel da marca — o mesmo recurso do cartão do
        // Quadro, onde a cor diz "é este". Reusar ensina uma linguagem em vez
        // de inventar duas.
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
          {apelido && <span className="text-xs text-muted-foreground">“{apelido}”</span>}
          {pessoa.papelSistema !== 'operador' && (
            <span className="rounded-full bg-marca-suave px-1.5 py-0.5 text-[10px] font-bold text-marca">
              {ROTULO_PAPEL[pessoa.papelSistema] ?? pessoa.papelSistema}
            </span>
          )}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {pessoa.ultimaAtividade
            ? `Última atividade ${relativo(pessoa.ultimaAtividade)}`
            : 'Nenhuma etapa ainda'}
        </p>
      </div>

      <EstadoDaLinha pessoa={pessoa} />
    </button>
  )
}

/**
 * O estado ao vivo, do tamanho de um selo.
 *
 * Ele deixou de organizar a lista e virou atributo da linha — mas continua
 * sendo a única coisa aqui que muda sozinha durante o turno, e por isso é o
 * único elemento colorido da linha. Quem não tem nada aberto não ganha selo:
 * a ausência já é a resposta, e um selo "livre" em nove linhas de catorze
 * gastaria a cor onde ela não informa.
 */
function EstadoDaLinha({ pessoa }: { pessoa: PessoaDaEquipe }) {
  if (pessoa.emAndamento === 0) return null

  if (pessoa.tudoPausado) {
    return (
      <Selo className="bg-atencao/15 text-atencao-tinta">
        {pessoa.emAndamento} pausada{pessoa.emAndamento > 1 ? 's' : ''}
      </Selo>
    )
  }

  const lugar = pessoa.lugarAgora
  const cor = lugar ? COR_LUGAR[lugar] : COR_LUGAR.campo

  return (
    <Selo className={clsx(cor.fundo, cor.texto)}>
      <span className={clsx('size-1.5 rounded-full', cor.barra)} aria-hidden="true" />
      {lugar ? ROTULO_LUGAR[lugar] : 'Aberta'}
      {pessoa.emAndamento > 1 && (
        <span className="tabular-nums opacity-70">{pessoa.emAndamento}</span>
      )}
    </Selo>
  )
}

function Selo({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={clsx(
        'inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold',
        className,
      )}
    >
      {children}
    </span>
  )
}

function Aviso({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-md rounded-cartao border border-border bg-card p-6 text-center">
      <h2 className="font-semibold">{titulo}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
    </div>
  )
}
