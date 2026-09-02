import clsx from 'clsx'
import { Avatar } from '@/components/ui/Avatar'
import { DIAS_DE_JANELA, useEquipe, type PessoaDaEquipe } from './api/useEquipe'

/**
 * A tela de Equipe — quem existe no sistema, e o que cada uma tem em mãos.
 *
 * Ela nasce com as 11 contas das fotógrafas e do ADM (02/09/2026). Até então o
 * sistema tinha três pessoas e a operação inteira acontecia em nome delas; o
 * dado de produtividade estava sendo gravado em `eventos` desde o primeiro
 * dia sem ter onde aparecer.
 *
 * É DE LEITURA, e isso é deliberado nesta fatia. Criar conta exige a
 * `service_role`, que não pode ir para o front — precisa de uma Edge Function
 * (dívida #1 do CLAUDE.md). Enquanto ela não existe, esta tela responde as
 * perguntas que já dá para responder com o que o cliente enxerga, em vez de
 * oferecer um botão que não teria como funcionar.
 *
 * A ORDEM É POR TRABALHO ABERTO, não alfabética. A pergunta de quem abre esta
 * tela numa terça à noite é "quem está com o quê agora"; um índice remissivo
 * responde outra coisa. Quem não tem nada em mãos desce, mas continua na
 * lista — sumir com ela esconderia justamente quem está ociosa.
 */
export function EquipePage() {
  const { data, isPending, error } = useEquipe()

  const pessoas = [...(data ?? [])].sort(
    (a, b) =>
      Number(b.ativo) - Number(a.ativo) ||
      b.emAndamento - a.emAndamento ||
      b.concluidasNaJanela - a.concluidasNaJanela ||
      a.nome.localeCompare(b.nome),
  )

  const comAcesso = pessoas.filter((p) => p.temAcesso).length
  const trabalhando = pessoas.filter((p) => p.emAndamento > 0).length

  return (
    <div className="flex h-full flex-col">
      <header className="flex-shrink-0 border-b border-border/70 bg-background/80 px-3 py-4 backdrop-blur-md md:px-5">
        <p className="rotulo-sobrescrito text-acento">Gestão</p>
        <h1 className="mt-0.5 text-lg font-extrabold tracking-tight md:text-2xl">
          Equipe
        </h1>
        {!isPending && !error && (
          <p className="mt-1 text-sm text-muted-foreground">
            {pessoas.length} {pessoas.length === 1 ? 'pessoa' : 'pessoas'} ·{' '}
            {comAcesso} com acesso ·{' '}
            {trabalhando === 0
              ? 'ninguém com etapa em mãos agora'
              : `${trabalhando} com etapa em mãos agora`}
          </p>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-5">
        {error ? (
          <Aviso titulo="Não foi possível carregar a equipe">
            {error instanceof Error ? error.message : 'Erro desconhecido.'}
          </Aviso>
        ) : isPending ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : pessoas.length === 0 ? (
          <Aviso titulo="Ninguém cadastrado">
            Nenhuma pessoa em <code>pessoas</code>. Sem isso o Quadro aparece vazio
            para todo mundo — a RLS exige o vínculo.
          </Aviso>
        ) : (
          <ul className="mx-auto max-w-4xl space-y-2">
            {pessoas.map((p) => (
              <LinhaDaEquipe key={p.id} pessoa={p} />
            ))}
          </ul>
        )}

        {/* O que a tela NÃO diz, dito na tela. Sem esta linha, quem procura o
            e-mail de alguém conclui que a informação não existe — quando ela
            existe e só não está aqui ainda. */}
        {!isPending && !error && pessoas.length > 0 && (
          <p className="mx-auto mt-4 max-w-4xl text-xs text-muted-foreground">
            O e-mail de login não aparece aqui: ele vive em <code>auth.users</code>,
            fora do alcance do aplicativo. “Com acesso” significa que a pessoa tem
            conta vinculada e consegue entrar.
          </p>
        )}
      </div>
    </div>
  )
}

const ROTULO_PAPEL: Record<string, string> = {
  operador: 'Operação',
  comercial: 'Comercial',
  coordenacao: 'Coordenação',
  atendimento: 'Atendimento',
  financeiro: 'Financeiro',
  gestao: 'Gestão',
}

function LinhaDaEquipe({ pessoa }: { pessoa: PessoaDaEquipe }) {
  const apelido = pessoa.apelidos[0]

  return (
    <li
      className={clsx(
        'flex items-center gap-3 rounded-cartao border border-border bg-card p-3 shadow-cartao md:gap-4 md:p-4',
        !pessoa.ativo && 'opacity-60',
      )}
    >
      <Avatar nome={pessoa.nome} tom="claro" className="size-10" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-base font-extrabold tracking-tight md:text-lg">
            {pessoa.nome}
          </span>
          {apelido && (
            <span className="text-sm text-muted-foreground">“{apelido}”</span>
          )}
          {/* Só a gestão ganha selo. "Operação" é o padrão e marcá-lo em onze
              linhas de catorze faria a exceção desaparecer no meio. */}
          {pessoa.papelSistema !== 'operador' && (
            <span className="rounded-full bg-marca-suave px-2 py-0.5 text-[11px] font-bold text-marca">
              {ROTULO_PAPEL[pessoa.papelSistema] ?? pessoa.papelSistema}
            </span>
          )}
          {!pessoa.temAcesso && (
            <span className="rounded-full border border-rascunho-borda px-2 py-0.5 text-[11px] font-semibold text-rascunho">
              sem acesso
            </span>
          )}
          {!pessoa.ativo && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              inativa
            </span>
          )}
        </div>

        <p className="mt-0.5 text-sm text-muted-foreground">
          {pessoa.ultimaAtividade
            ? `Última atividade ${relativo(pessoa.ultimaAtividade)}`
            : 'Nenhuma etapa registrada ainda'}
        </p>
      </div>

      <div className="flex flex-shrink-0 items-center gap-4 text-right">
        <Numero
          valor={pessoa.emAndamento}
          rotulo="em mãos"
          destaque={pessoa.emAndamento > 0}
        />
        <Numero valor={pessoa.concluidasNaJanela} rotulo={`em ${DIAS_DE_JANELA}d`} />
      </div>
    </li>
  )
}

function Numero({
  valor,
  rotulo,
  destaque = false,
}: {
  valor: number
  rotulo: string
  destaque?: boolean
}) {
  return (
    <div className="min-w-[3.5rem]">
      <p
        className={clsx(
          'text-xl font-extrabold tabular-nums',
          destaque ? 'text-andamento-tinta' : valor === 0 ? 'text-muted-foreground' : '',
        )}
      >
        {valor}
      </p>
      <p className="rotulo-sobrescrito text-[10px] text-muted-foreground">{rotulo}</p>
    </div>
  )
}

/** "há 2h", "há 3 dias", "agora". Precisão de minuto não serve a esta tela. */
function relativo(iso: string): string {
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutos < 5) return 'agora'
  if (minutos < 60) return `há ${minutos}min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `há ${horas}h`
  const dias = Math.floor(horas / 24)
  return dias === 1 ? 'ontem' : `há ${dias} dias`
}

function Aviso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md rounded-cartao border border-border bg-card p-6 text-center">
      <h2 className="font-semibold">{titulo}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
    </div>
  )
}
