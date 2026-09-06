import { useState } from 'react'
import { Dialogo } from '@/components/ui/Dialogo'
import type { CasoQuadro, EtapaQuadro } from '../types'

interface ItemChecklistEntrega {
  id: string
  rotulo: string
}

/** A única que vale para todo caso: sempre há fotos para entregar. */
const CHECKLIST_ENTREGA_BASE: ItemChecklistEntrega[] = [
  { id: 'fotos_completas', rotulo: 'Fotos completas no Google' },
]

/**
 * O reels, quando o caso TEM reels.
 *
 * Era item fixo, porque "reels existe em todos os pacotes" (seção 2 do
 * CLAUDE.md). Deixou de valer para o MASTER em 03/09/2026, por decisão do
 * gestor — e pedir a conferência de um reels que não existe é ensinar a marcar
 * caixa sem olhar, que estraga a única coisa que este checklist faz.
 *
 * A condição olha as ETAPAS DO CASO, não o slug do pacote. É mais robusto e é o
 * que o CLAUDE.md manda: um MASTER que vender o vertical ganha a etapa por
 * `adicionar_etapa` e volta a ter a caixa, sem ninguém lembrar de mexer aqui.
 */
const CHECKLIST_ENTREGA_REELS: ItemChecklistEntrega[] = [
  { id: 'reels_completo', rotulo: 'Reels completo no Google' },
]

/**
 * SÓ NO BIRTH E BIRTH+REELS (31/08/2026, a pedido do gestor).
 *
 * Os dois pacotes entregam pelo mesmo formato — link único de foto+vídeo,
 * "cadeado" — e nascem sem contrato fechado (é a tentativa de venda
 * pós-parto, seção 2 do CLAUDE.md). O "com final" é a versão que a família
 * recebe depois de decidir se compra, com o encerramento do vídeo incluso;
 * o sem final é o que sai primeiro, para apresentar o material.
 *
 * `pacoteSlug` e não `pacoteNome`: BIRTH e BIRTH+REELS são dois slugs
 * (`birth`, `birth-reels`) que começam pelo mesmo prefixo — comparar o
 * NOME exigiria listar as duas grafias e reencontrar a mesma armadilha se
 * um terceiro pacote de BIRTH nascer um dia.
 */
const CHECKLIST_ENTREGA_BIRTH: ItemChecklistEntrega[] = [
  { id: 'cadeado_fv', rotulo: 'Link CADEADO F+V no Google' },
  { id: 'cadeado_fv_final', rotulo: 'Link CADEADO F+V com final no Google' },
]

interface PropsDialogoConfirmarEntrega {
  caso: CasoQuadro
  /**
   * ENVIO é quem terminou o trabalho dizendo "pode entregar"; CONFIRMACAO é o
   * ADM dizendo "entreguei". A conferência é a MESMA lista nos dois — e é o
   * ponto: quem edita marca o que produziu, quem entrega marca o que viu. Duas
   * pessoas olhando a mesma lista pegam o que uma sozinha deixaria passar.
   */
  modo: 'envio' | 'confirmacao'
  /** Para saber se este caso tem reels — ver CHECKLIST_ENTREGA_REELS. */
  etapas: EtapaQuadro[]
  ocupado: boolean
  erro: string | null
  onCancelar: () => void
  onConfirmar: () => void
}

/**
 * O checklist que HABILITA o botão, não que registra dado nenhum.
 *
 * O gestor pediu isto depois de reparar que "Confirmar entrega" virava um
 * segundo clique de confirmação sem checar NADA — a pessoa podia confirmar
 * sem ter de fato subido as fotos. As caixas aqui são a conferência final,
 * item por item, antes do gesto que não tem volta.
 *
 * DE PROPÓSITO NÃO VIRA COLUNA NOVA NO BANCO. O que a RPC exige continua
 * sendo o mesmo de sempre — pelo menos um entregável registrado
 * (podeConfirmarEntrega, lib/acoes.ts). Este checklist é a certeza de QUEM
 * está confirmando, não um registro que o sistema audita depois; guardar
 * cada caixinha marcada criaria uma segunda fonte de verdade sobre o que
 * foi entregue, competindo com os links de `entregaveis` que já são essa
 * fonte.
 */
export function DialogoConfirmarEntrega({
  caso,
  modo,
  etapas,
  ocupado,
  erro,
  onCancelar,
  onConfirmar,
}: PropsDialogoConfirmarEntrega) {
  const ehBirth = caso.pacoteSlug?.startsWith('birth') ?? false
  const temReels = etapas.some((e) => e.tipo === 'reels')
  const itens = [
    ...CHECKLIST_ENTREGA_BASE,
    ...(temReels ? CHECKLIST_ENTREGA_REELS : []),
    ...(ehBirth ? CHECKLIST_ENTREGA_BIRTH : []),
  ]

  const [conferidos, setConferidos] = useState<Set<string>>(new Set())

  function alternar(id: string) {
    setConferidos((atual) => {
      const proximo = new Set(atual)
      if (proximo.has(id)) proximo.delete(id)
      else proximo.add(id)
      return proximo
    })
  }

  return (
    <Dialogo
      titulo={
        modo === 'envio'
          ? 'Enviar para Entregáveis?'
          : 'Confirmar entrega e encerrar o caso?'
      }
      rotuloConfirmar={modo === 'envio' ? 'Enviar' : 'Confirmar entrega'}
      confirmarDestrutivo={modo === 'confirmacao'}
      confirmarDesabilitado={itens.some((item) => !conferidos.has(item.id))}
      ocupado={ocupado}
      erro={erro}
      onCancelar={onCancelar}
      onConfirmar={onConfirmar}
    >
      <p className="text-sm text-muted-foreground">
        {caso.maeNome}
        {caso.bebeNome ? ` · ${caso.bebeNome}` : ''}.{' '}
        {modo === 'envio'
          ? 'O caso sai do Quadro e vai para Entregáveis, onde o ADM confere e entrega.'
          : 'Os links passam a contar como confirmados e o caso é encerrado. Não há como desfazer.'}
      </p>

      <ul className="space-y-0.5">
        {itens.map((item) => (
          <li key={item.id}>
            {/* min-h-11: a linha inteira é o alvo de toque (seção 6 do
                CLAUDE.md), não só o quadrado de 16px do checkbox. */}
            <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md px-1 text-sm font-medium transition-colors hover:bg-muted">
              <input
                type="checkbox"
                checked={conferidos.has(item.id)}
                onChange={() => alternar(item.id)}
                className="size-5 flex-shrink-0 rounded border-border accent-marca"
              />
              {item.rotulo}
            </label>
          </li>
        ))}
      </ul>
    </Dialogo>
  )
}
