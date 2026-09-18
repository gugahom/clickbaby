import { useEffect, useId, useRef, useState } from 'react'
import clsx from 'clsx'
import { Avatar } from '@/components/ui/Avatar'
import { useUrlsDasFotos } from '@/features/perfil/api/useFotoDePerfil'
import { ROTULO_ESTADO, estadoVisivel, type EstadoVisivel } from '../lib/estados'
import { BolinhaDeStatus } from './BolinhaDeStatus'
import { PainelDaEquipe, type LinhaDePresenca } from './PainelDaEquipe'
import type { AtividadeDaEquipe, PessoaPresente } from '../api/usePresenca'

interface PropsEquipePresente {
  outros: PessoaPresente[]
  /** O que o trabalho conta: quem está ocupada e quando cada uma pegou algo. */
  atividade: AtividadeDaEquipe | undefined
  /**
   * Quem está logado NESTE aparelho. Vem de fora porque o cabeçalho já tem os
   * três dados (pessoa, estado visível e foto assinada) e buscá-los de novo
   * aqui seria uma segunda URL assinada para o mesmo retrato.
   */
  eu: { pessoaId: string; nome: string; papel: string; estado: EstadoVisivel; fotoUrl: string | null } | null
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
 * A FILEIRA VIROU GATILHO (17/09/2026, pedido do gestor): clicar abre o painel
 * com TODO MUNDO que está na tela, estado e frase de atividade por extenso —
 * ver `PainelDaEquipe`. O teto de quatro retratos continua existindo, agora só
 * como desenho do gatilho: é o que cabe ao lado do chip de conta sem espremer
 * o nome de quem está logado.
 *
 * SOME NO MOBILE, e a razão de 06/09 continua de pé: em 375px a faixa disputa
 * espaço entre a marca e o chip de conta, e presença é informação de
 * COORDENAÇÃO — quem está no corredor com uma mão no aparelho não está
 * escolhendo a quem passar trabalho. O espaço que sobra ali é do sino, que é
 * justamente o que interessa a quem está em campo.
 *
 * O ANEL É PRETO A 40%, e não um token de cor: o fundo aqui é um gradiente, e
 * nenhuma cor chapada acompanha os dois extremos dele. Um escurecimento
 * translúcido separa a bolinha do retrato em qualquer ponto da faixa.
 *
 * A LINHA DIVISÓRIA é a borda DESTE componente, e não um `divide-x` no
 * cabeçalho: aqui ela desaparece junto com a fileira — no mobile e quando não
 * há mais ninguém conectado. No pai, sobraria uma linha sem nada de um lado.
 */
export function EquipePresente({ outros, atividade, eu }: PropsEquipePresente) {
  const { data: fotos } = useUrlsDasFotos(outros.map((p) => p.fotoPath))
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)
  const idPainel = useId()

  /*
   * FECHA NO ESC E NO CLIQUE DE FORA. O painel não é um `<dialog>`: ele não
   * prende o foco nem escurece a tela, porque é uma consulta de passagem — e
   * um modal para "quem está aí" pararia o trabalho de quem só queria olhar.
   * O preço é ter que fechar à mão, e são estas dez linhas.
   */
  useEffect(() => {
    if (!aberto) return

    function foraDaqui(e: MouseEvent) {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false)
    }
    function noEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false)
    }

    document.addEventListener('mousedown', foraDaqui)
    document.addEventListener('keydown', noEsc)
    return () => {
      document.removeEventListener('mousedown', foraDaqui)
      document.removeEventListener('keydown', noEsc)
    }
  }, [aberto])

  if (outros.length === 0 && eu === null) return null

  const TETO = 4
  const visiveis = outros.slice(0, TETO)
  const resto = outros.length - visiveis.length

  const linhas: LinhaDePresenca[] = [
    ...(eu
      ? [
          {
            pessoaId: eu.pessoaId,
            nome: eu.nome,
            papel: eu.papel,
            estado: eu.estado,
            fotoUrl: eu.fotoUrl,
            ultimaAtividade: atividade?.ultimaAtividade.get(eu.pessoaId),
            souEu: true,
          },
        ]
      : []),
    ...outros
      .map((p) => ({
        pessoaId: p.pessoaId,
        nome: p.nome,
        papel: p.papel,
        estado: estadoVisivel(p.declarado, atividade?.ocupadas.has(p.pessoaId) ?? false),
        fotoUrl: (p.fotoPath ? fotos?.get(p.fotoPath) : null) ?? null,
        ultimaAtividade: atividade?.ultimaAtividade.get(p.pessoaId),
      }))
      // Ocupada primeiro: a lista responde "quem está livre para pegar a
      // próxima", e essa pergunta se lê de baixo para cima.
      .sort((a, b) => {
        const peso = (e: EstadoVisivel) => (e === 'ocupada' ? 0 : e === 'disponivel' ? 1 : 2)
        return peso(a.estado) - peso(b.estado) || a.nome.localeCompare(b.nome)
      }),
  ]

  return (
    <div ref={caixa} className="relative hidden border-r border-white/20 pr-3 md:block">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-controls={idPainel}
        aria-haspopup="dialog"
        // Uma lista para quem enxerga, uma frase para quem ouve: ler
        // "avatar, avatar, avatar" não diz nada.
        aria-label={`Na tela agora: ${linhas
          .map((l) => `${l.nome} (${ROTULO_ESTADO[l.estado]})`)
          .join(', ')}`}
        className="flex cursor-pointer items-center rounded-full p-0.5 transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
      >
        {visiveis.map((p, i) => {
          const estado = estadoVisivel(
            p.declarado,
            atividade?.ocupadas.has(p.pessoaId) ?? false,
          )
          const foto = (p.fotoPath ? fotos?.get(p.fotoPath) : null) ?? null
          return (
            <span key={p.pessoaId} className={clsx('relative', i > 0 && '-ml-2')}>
              <Avatar nome={p.nome} fotoUrl={foto} className="size-7" />
              <BolinhaDeStatus
                estado={estado}
                className="absolute right-0 bottom-0 outline-2 outline-black/40"
              />
            </span>
          )
        })}

        {resto > 0 && (
          <span className="-ml-2 inline-flex size-7 flex-shrink-0 items-center justify-center rounded-full bg-white/15 text-[11px] font-bold text-white ring-2 ring-white/25">
            +{resto}
          </span>
        )}
      </button>

      {aberto && (
        <div
          id={idPainel}
          role="dialog"
          aria-label="Quem está na tela agora"
          className="absolute top-full right-3 z-40 mt-2 w-80 overflow-hidden rounded-cartao border border-border bg-card text-foreground shadow-cartao-alto"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border bg-acento-suave px-3 py-2">
            <span className="rotulo-sobrescrito text-acento-forte">Na tela agora</span>
            <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-contador px-1.5 text-xs font-bold tabular-nums text-white">
              {linhas.length}
            </span>
          </div>
          <PainelDaEquipe linhas={linhas} />
          {/* O que a presença NÃO é. A frase existe porque a pergunta aparece
              toda vez que alguém vê uma lista de gente com horas do lado —
              ver a seção 9 do CLAUDE.md. */}
          <p className="border-t border-border px-3 py-2 text-[11px] leading-snug text-muted-foreground">
            Quem está com a tela aberta agora. Nada disto é gravado.
          </p>
        </div>
      )}
    </div>
  )
}
