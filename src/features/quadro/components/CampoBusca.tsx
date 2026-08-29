import { useId } from 'react'
import { IconeLupa, IconeX } from '@/components/ui/icones'

interface PropsCampoBusca {
  valor: string
  onMudar: (valor: string) => void
  /** "88 casos" vira "3 de 88" quando há busca. Some quando não há. */
  resultado?: string | undefined
}

/**
 * A busca do Quadro.
 *
 * VIVE NO CABEÇALHO, ao lado do título, e serve a aba que estiver aberta. Uma
 * busca por aba seria mais "correta" e pior de usar: quem procura a Jéssica não
 * sabe se ela está no Quadro, nos Rascunhos ou nos Concluídos — é justamente
 * por não saber que está procurando.
 *
 * SEM BOTÃO DE BUSCAR. Filtra a cada tecla, contra uma lista que já está na
 * memória: não há requisição para poupar, e um botão obrigaria a um toque a
 * mais numa tela usada com uma mão só.
 *
 * O BOTÃO DE LIMPAR só aparece com texto. Um X permanente ocuparia a calha
 * dizendo "não há nada para limpar", e num campo estreito de celular essa
 * calha é largura de digitação.
 */
export function CampoBusca({ valor, onMudar, resultado }: PropsCampoBusca) {
  const id = useId()

  return (
    <div className="relative min-w-0 flex-1">
      <label htmlFor={id} className="sr-only">
        Buscar por mãe, bebê, pacote ou maternidade
      </label>

      <IconeLupa
        className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />

      <input
        id={id}
        type="search"
        value={valor}
        onChange={(e) => onMudar(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && valor !== '') {
            // Não deixa o Esc borbulhar: numa tela com diálogo aberto ele
            // fecharia o diálogo junto, e quem apertou queria limpar a busca.
            e.stopPropagation()
            onMudar('')
          }
        }}
        placeholder="Buscar mãe, bebê, pacote…"
        // `search` nativo desenha um X próprio no WebKit, com 12px de alvo e
        // fora do nosso desenho. O nosso substitui.
        className="h-12 w-full rounded-full border border-border bg-card pr-12 pl-11 text-sm shadow-cartao transition placeholder:text-muted-foreground focus:border-acento/50 focus:ring-4 focus:ring-acento/10 focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
      />

      {valor !== '' && (
        <button
          type="button"
          onClick={() => onMudar('')}
          aria-label="Limpar busca"
          // size-11, não size-9: 44px é o mínimo da seção 6 do CLAUDE.md, e o
          // campo tem exatamente essa altura, então o alvo cabe inteiro dentro
          // dele. O ícone continua com 16px — quem cresce é a área de toque.
          className="absolute top-1/2 right-0.5 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <IconeX className="size-4" />
        </button>
      )}

      {/* O contador é o que diz que a busca funcionou. Sem ele, uma busca que
          não acha nada e uma busca que ainda não filtrou se parecem. */}
      {resultado && (
        <span
          className="pointer-events-none absolute top-full left-4 mt-0.5 text-[11px] text-muted-foreground"
          role="status"
        >
          {resultado}
        </span>
      )}
    </div>
  )
}
