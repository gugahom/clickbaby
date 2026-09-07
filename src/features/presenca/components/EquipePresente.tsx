import clsx from 'clsx'
import { Avatar } from '@/components/ui/Avatar'
import { useUrlsDasFotos } from '@/features/perfil/api/useFotoDePerfil'
import { formatarDuracao } from '@/lib/formato'
import {
  MINUTOS_ATE_MARCAR_PARADA,
  ROTULO_ESTADO,
  estadoVisivel,
  horasParada,
} from '../lib/estados'
import { BolinhaDeStatus } from './BolinhaDeStatus'
import type { AtividadeDaEquipe, PessoaPresente } from '../api/usePresenca'

interface PropsEquipePresente {
  outros: PessoaPresente[]
  /** O que o trabalho conta: quem está ocupada e quando cada uma pegou algo. */
  atividade: AtividadeDaEquipe | undefined
}

/**
 * "Disponível", "Ocupada", "Disponível · parada há 3h".
 *
 * A frase de parada só aparece para quem está DISPONÍVEL: em quem está ocupada
 * ela seria falsa, e em quem se marcou ausente seria uma cobrança por um tempo
 * que a pessoa já avisou que não ia trabalhar.
 */
function descrever(
  p: PessoaPresente,
  atividade: AtividadeDaEquipe | undefined,
): { estado: ReturnType<typeof estadoVisivel>; texto: string; parada: boolean } {
  const estado = estadoVisivel(p.declarado, atividade?.ocupadas.has(p.pessoaId) ?? false)
  if (estado !== 'disponivel') {
    return { estado, texto: ROTULO_ESTADO[estado], parada: false }
  }

  const horas = horasParada(atividade?.ultimaAtividade.get(p.pessoaId))
  if (horas === null) {
    // Ninguém achou trabalho dela na janela de 24h. Não é "parada há 24h" —
    // é "não pegou nada hoje", que é uma frase diferente e mais honesta.
    return {
      estado,
      texto: `${ROTULO_ESTADO[estado]} · sem pegar trabalho hoje`,
      parada: true,
    }
  }

  const parada = horas * 60 >= MINUTOS_ATE_MARCAR_PARADA
  return {
    estado,
    texto: parada
      ? `${ROTULO_ESTADO[estado]} · sem pegar trabalho há ${formatarDuracao(horas)}`
      : ROTULO_ESTADO[estado],
    parada,
  }
}

/**
 * QUEM MAIS ESTÁ NO QUADRO AGORA, na faixa da marca.
 *
 * A referência que o gestor deu foi a planilha compartilhada do Sheets, e a
 * regra dali é a que vale aqui: aparece quem ESTÁ, não a lista de quem existe.
 * Uma fileira com as catorze pessoas, a maioria apagada, responderia "quem
 * trabalha aqui" — pergunta que ninguém faz — e ocuparia a faixa mais cara da
 * tela para isso.
 *
 * TETO DE QUATRO, e o resto vira "+N". Num turno cheio isso é o que cabe ao
 * lado do chip de conta sem espremer o nome de quem está logado; o número
 * carrega os nomes no `title`, que é onde se procura "quem é o resto".
 *
 * SOME NO MOBILE. Em 375px a faixa já disputa espaço entre a marca e o chip de
 * conta, e presença é informação de coordenação — quem está no corredor com uma
 * mão no aparelho não está escolhendo a quem passar trabalho.
 *
 * O ANEL É PRETO A 40%, e não um token de cor: o fundo aqui é um gradiente, e
 * nenhuma cor chapada acompanha os dois extremos dele. Um escurecimento
 * translúcido separa a bolinha do retrato em qualquer ponto da faixa.
 */
export function EquipePresente({ outros, atividade }: PropsEquipePresente) {
  const { data: fotos } = useUrlsDasFotos(outros.map((p) => p.fotoPath))

  if (outros.length === 0) return null

  const TETO = 4
  const visiveis = outros.slice(0, TETO)
  const resto = outros.slice(TETO)

  return (
    <div
      className="hidden items-center md:flex"
      // Uma lista para quem enxerga, uma frase para quem ouve: ler
      // "avatar, avatar, avatar" não diz nada.
      role="group"
      aria-label={`Na tela agora: ${outros
        .map((p) => `${p.nome} (${descrever(p, atividade).texto})`)
        .join(', ')}`}
    >
      {visiveis.map((p, i) => {
        const { estado, texto, parada } = descrever(p, atividade)
        return (
          <span
            key={p.pessoaId}
            className={clsx('relative', i > 0 && '-ml-2')}
            title={`${p.nome} · ${texto}`}
          >
            <Avatar
              nome={p.nome}
              fotoUrl={(p.fotoPath ? fotos?.get(p.fotoPath) : null) ?? null}
              className="size-7"
            />
            <BolinhaDeStatus
              estado={estado}
              vazada={parada}
              className="absolute right-0 bottom-0 outline-2 outline-black/40"
            />
          </span>
        )
      })}

      {resto.length > 0 && (
        <span
          className="-ml-2 inline-flex size-7 flex-shrink-0 items-center justify-center rounded-full bg-white/15 text-[11px] font-bold text-white ring-2 ring-white/25"
          title={resto.map((p) => p.nome).join(', ')}
        >
          +{resto.length}
        </span>
      )}
    </div>
  )
}
