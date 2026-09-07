import { Avatar } from '@/components/ui/Avatar'
import { formatarDuracao } from '@/lib/formato'
import { ROTULO_PAPEL } from '@/features/equipe/lib/apresentacao'
import {
  MINUTOS_ATE_MARCAR_PARADA,
  ROTULO_ESTADO,
  horasParada,
  type EstadoVisivel,
} from '../lib/estados'
import { BolinhaDeStatus } from './BolinhaDeStatus'
import type { PessoaPresente } from '../api/usePresenca'

/**
 * A FRASE DE ATIVIDADE, nos três estados.
 *
 * O mesmo dado — quando a pessoa tocou trabalho pela última vez — responde a
 * três perguntas diferentes, e dizer a mesma coisa nos três seria desperdiçar
 * a única informação que a linha tem:
 *
 *   OCUPADA    o carimbo é o início do que ela está fazendo agora.
 *   DISPONÍVEL o carimbo é o fim do que ela fez por último — e é aqui que mora
 *              a marca de "parada", que foi o que o gestor pediu.
 *   AUSENTE    ela avisou que saiu; cobrar tempo parado de quem avisou seria
 *              transformar um aviso em falta.
 *
 * SEM CARIMBO NENHUM é caso à parte e merece frase própria: "não pegou nada
 * hoje" é diferente de "parada há 24h", e a segunda seria invenção — a janela
 * da consulta é de um dia (ver `useAtividadeDaEquipe`).
 */
function frase(estado: EstadoVisivel, ultimaAtividade: string | undefined): string {
  const horas = horasParada(ultimaAtividade)

  if (estado === 'ocupada') {
    return horas === null ? 'Trabalhando agora' : `Trabalhando há ${formatarDuracao(horas)}`
  }

  if (estado === 'ausente') {
    return horas === null ? 'Fora do posto' : `Fora do posto · trabalhou há ${formatarDuracao(horas)}`
  }

  if (horas === null) return 'Sem pegar trabalho hoje'
  return horas * 60 >= MINUTOS_ATE_MARCAR_PARADA
    ? `Sem pegar trabalho há ${formatarDuracao(horas)}`
    : `Pegou trabalho há ${formatarDuracao(horas)}`
}

/**
 * O CARTÃO QUE ABRE NO HOVER do avatar.
 *
 * POR QUE NÃO O `title` DO NAVEGADOR, que era o que existia: ele demora quase
 * um segundo para aparecer, sai numa caixa do sistema operacional que não
 * aceita nem retrato nem cor, e some ao menor movimento do mouse. Para "quem é
 * essa pessoa e há quanto tempo ela está parada" — que é uma pergunta que se
 * faz varrendo a fileira — isso é lento demais e feio demais.
 *
 * ABRE NO FOCO TAMBÉM (`group-focus-within`), e não só no hover: a fileira é
 * navegável por teclado, e um cartão que só existe para quem usa mouse é
 * informação que some para quem não usa.
 *
 * ANCORADO PELA DIREITA, e não centrado no avatar: a fileira mora na ponta
 * direita do cabeçalho, e um cartão de 224px centrado no último retrato
 * atravessa o chip da conta e chega na borda da tela. Crescendo para a
 * esquerda, ele cabe em qualquer posição da fileira.
 *
 * `pointer-events-none` porque ele não é clicável: é uma legenda, não um menu.
 * Sem isso, o próprio cartão intercepta o mouse e pisca ao passar por cima.
 */
export function CartaoDePresenca({
  pessoa,
  estado,
  ultimaAtividade,
  fotoUrl,
}: {
  pessoa: PessoaPresente
  estado: EstadoVisivel
  ultimaAtividade: string | undefined
  fotoUrl: string | null
}) {
  return (
    <div
      className="pointer-events-none absolute top-full right-0 z-30 mt-2 w-56 rounded-cartao border border-border bg-card p-3 text-foreground opacity-0 shadow-cartao-alto transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      role="tooltip"
    >
      <div className="flex items-center gap-2">
        <Avatar nome={pessoa.nome} fotoUrl={fotoUrl} tom="claro" className="size-9" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{pessoa.nome}</div>
          <div className="truncate text-xs text-muted-foreground">
            {ROTULO_PAPEL[pessoa.papel] ?? pessoa.papel}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1.5 border-t border-border pt-2">
        <BolinhaDeStatus estado={estado} />
        <span className="text-xs font-semibold">{ROTULO_ESTADO[estado]}</span>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        {frase(estado, ultimaAtividade)}
      </p>
    </div>
  )
}
