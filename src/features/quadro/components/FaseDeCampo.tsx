import clsx from 'clsx'
import { Dropdown } from '@/components/ui/Dropdown'
import { useMoverFaseDeCampo } from '../api/useAcoes'
import { mensagemDeErro } from '../lib/erros'
import {
  ESTILO_FASE_CAMPO,
  FASES_DA_ETAPA,
  ROTULO_FASE_CAMPO,
  type EtapaQuadro,
  type FaseCampo,
} from '../types'

/**
 * EM QUE PÉ ESTÁ O TRABALHO DE CAMPO (28/09/2026, pedido do gestor).
 *
 * Mesmo desenho das outras fases do sistema — pílula como alvo, lista ao
 * tocar —, e pelo mesmo motivo: a pergunta é sobre UM caso ("onde este está, e
 * para onde vai agora"). O que muda aqui é o que a fase significa: no fotolivro
 * e no New Born ela escreve o status junto, porque lá a maior parte da esteira
 * é espera; aqui as cinco fases são trabalho acontecendo, e o status continua
 * sendo do play/pause. Uma coisa não mexe na outra.
 *
 * LISTA E NÃO "AVANÇAR". Um botão de um toque que pula para a próxima fase
 * seria mais rápido no corredor, e erra sem volta: quem toca duas vezes por
 * engano registra um nascimento que não houve, e não existe RPC que apague
 * fase. A lista deixa voltar, e voltar é o conserto.
 *
 * SEM FASE ATÉ ALGUÉM DIZER UMA (decisão do gestor): a etapa iniciada mostra
 * "Definir fase" tracejado, em vez de afirmar um estado que ninguém declarou.
 */
export function FaseDeCampo({
  etapa,
  onErro,
}: {
  etapa: EtapaQuadro
  onErro: (mensagem: string | null) => void
}) {
  const mover = useMoverFaseDeCampo()
  const fases = FASES_DA_ETAPA[etapa.tipo]
  const atual = etapa.faseCampo

  // Etapa sem fase no banco (banho, fechamento, edição): nada a oferecer. A
  // lista é a mesma que a constraint conhece — ver FASES_DA_ETAPA.
  if (!fases) return null

  return (
    <Dropdown
      alinhamento="esquerda"
      className="min-w-0"
      rotulo={atual ? `Fase: ${ROTULO_FASE_CAMPO[atual]}` : 'Definir a fase do trabalho'}
      {...(atual ? { selecionado: atual } : {})}
      desabilitado={mover.isPending}
      onEscolher={(item) => {
        onErro(null)
        mover
          .mutateAsync({ casoEtapaId: etapa.id, fase: item.id as FaseCampo })
          .catch((e) => onErro(mensagemDeErro(e)))
      }}
      itens={fases.map((fase) => ({ id: fase, rotulo: ROTULO_FASE_CAMPO[fase] }))}
      gatilho={
        <span
          className={clsx(
            'inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[11px] font-bold transition-colors',
            atual
              ? ESTILO_FASE_CAMPO[atual]
              : 'border border-dashed border-border text-muted-foreground hover:border-marca hover:text-marca',
            mover.isPending && 'opacity-60',
          )}
        >
          {atual ? ROTULO_FASE_CAMPO[atual] : 'Definir fase'}
        </span>
      }
    />
  )
}
