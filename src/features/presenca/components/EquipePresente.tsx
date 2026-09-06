import clsx from 'clsx'
import { Avatar } from '@/components/ui/Avatar'
import { useUrlsDasFotos } from '@/features/perfil/api/useFotoDePerfil'
import { ROTULO_ESTADO, estadoVisivel } from '../lib/estados'
import { BolinhaDeStatus } from './BolinhaDeStatus'
import type { PessoaPresente } from '../api/usePresenca'

interface PropsEquipePresente {
  outros: PessoaPresente[]
  /** Ids de quem tem etapa em andamento — a metade automática do estado. */
  ocupadas: Set<string>
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
export function EquipePresente({ outros, ocupadas }: PropsEquipePresente) {
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
        .map(
          (p) =>
            `${p.nome} (${ROTULO_ESTADO[estadoVisivel(p.declarado, ocupadas.has(p.pessoaId))]})`,
        )
        .join(', ')}`}
    >
      {visiveis.map((p, i) => {
        const estado = estadoVisivel(p.declarado, ocupadas.has(p.pessoaId))
        return (
          <span
            key={p.pessoaId}
            className={clsx('relative', i > 0 && '-ml-2')}
            title={`${p.nome} · ${ROTULO_ESTADO[estado]}`}
          >
            <Avatar
              nome={p.nome}
              fotoUrl={(p.fotoPath ? fotos?.get(p.fotoPath) : null) ?? null}
              className="size-7"
            />
            <BolinhaDeStatus
              estado={estado}
              className="absolute right-0 bottom-0 ring-2 ring-black/40"
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
