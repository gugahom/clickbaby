import { useState } from 'react'
import clsx from 'clsx'
import { Dropdown } from '@/components/ui/Dropdown'
import { Dialogo } from '@/components/ui/Dialogo'
import { IconeDispensar } from '@/components/ui/icones'
import { useDispensarEtapa, useMoverAlbum } from '../api/useAcoes'
import { mensagemDeErro } from '../lib/erros'
import {
  ESTILO_FASE_ALBUM,
  FASES_ALBUM,
  ROTULO_FASE_ALBUM,
  type EtapaQuadro,
  type FaseAlbum,
} from '../types'

/**
 * A FASE DO FOTOLIVRO — o segundo quadro do Trello, sem virar um Trello.
 *
 * Mesma decisão da FaseDoVideo, e vale repetir porque aqui a tentação é maior:
 * são DEZ colunas, e dez colunas é onde um kanban parece obrigatório. Não é. Um
 * kanban serve para ver CARGA — quantos há em cada coluna, onde entope —, e a
 * pergunta de quem abre esta seção é sobre UM fotolivro: "onde está este, e
 * para onde ele vai agora". A fase é uma pílula na linha, e trocá-la é abrir a
 * lista. Dois toques, sem arrastar.
 *
 * A LISTA INTEIRA, NOS DOIS SENTIDOS. Um álbum volta de "Aprovado" para "Pedido
 * de alterações" quando a família muda de ideia depois de aprovar, e isso não é
 * desfazer — é o fluxo normal. Uma lista que só oferecesse o próximo passo
 * esconderia metade do que acontece de verdade.
 *
 * SEM FASE ATÉ ALGUÉM DIZER UMA. Estar nesta seção já é ser um fotolivro a
 * fazer; uma fase inventada de padrão afirmaria um estado que ninguém declarou
 * — e a primeira delas ("aguardando pagamento") é uma afirmação sobre o
 * FINANCEIRO do cliente, que é a última coisa que o sistema deve chutar.
 *
 * DISPENSAR NÃO É UMA FASE, e por isso vem separado no fim, em vermelho. Ele
 * existe pelo mesmo motivo que existe no vídeo: a seção é o único lugar onde o
 * fotolivro se opera, e sem ele um álbum que não deveria existir — vendido e
 * depois cancelado, ou acrescentado por engano — ficaria sem saída.
 */
const DISPENSAR = 'dispensar'

export function FaseDoAlbum({
  etapa,
  onErro,
}: {
  etapa: EtapaQuadro
  onErro: (mensagem: string | null) => void
}) {
  const mover = useMoverAlbum()
  const dispensar = useDispensarEtapa()
  const [dispensando, setDispensando] = useState(false)
  const atual = etapa.faseAlbum

  return (
    <>
      <Dropdown
        alinhamento="direita"
        rotulo={
          atual
            ? `Fase do fotolivro: ${ROTULO_FASE_ALBUM[atual]}`
            : 'Definir a fase do fotolivro'
        }
        {...(atual ? { selecionado: atual } : {})}
        desabilitado={mover.isPending}
        onEscolher={(item) => {
          onErro(null)
          if (item.id === DISPENSAR) {
            setDispensando(true)
            return
          }
          mover
            .mutateAsync({ casoEtapaId: etapa.id, fase: item.id as FaseAlbum })
            .catch((e) => onErro(mensagemDeErro(e)))
        }}
        itens={[
          ...FASES_ALBUM.map((fase) => ({
            id: fase,
            rotulo: ROTULO_FASE_ALBUM[fase],
          })),
          {
            id: DISPENSAR,
            rotulo: 'Este caso não tem fotolivro',
            icone: <IconeDispensar className="size-4" />,
            destrutivo: true,
          },
        ]}
        gatilho={
          <span
            className={clsx(
              // A pílula É o alvo; o min-h-11 do Dropdown já garante os 44px de
              // altura de toque em volta dela.
              'inline-flex max-w-full items-center gap-1 truncate rounded-full px-2.5 py-1 text-xs font-bold transition-colors',
              atual
                ? ESTILO_FASE_ALBUM[atual]
                : // Sem fase: contorno tracejado e voz de convite, não de
                  // estado. Mesma linguagem do "Acrescentar etapa" — a borda
                  // pontilhada diz "aqui falta algo" sem inventar um status.
                  'border border-dashed border-border text-muted-foreground hover:border-marca hover:text-marca',
              mover.isPending && 'opacity-60',
            )}
          >
            {atual ? ROTULO_FASE_ALBUM[atual] : 'Definir fase'}
          </span>
        }
      />

      {dispensando && (
        <Dialogo
          titulo="Este caso não tem fotolivro?"
          rotuloConfirmar={dispensar.isPending ? 'Dispensando…' : 'Dispensar o fotolivro'}
          confirmarDestrutivo
          ocupado={dispensar.isPending}
          onCancelar={() => setDispensando(false)}
          onConfirmar={() => {
            onErro(null)
            dispensar
              .mutateAsync({
                casoEtapaId: etapa.id,
                motivo: 'Caso não tem fotolivro — etapa criada por engano.',
              })
              .then(
                () => setDispensando(false),
                (e) => onErro(mensagemDeErro(e)),
              )
          }}
        >
          <p className="text-sm text-muted-foreground">
            A etapa sai desta seção e conta como resolvida. Use quando o
            fotolivro não faz parte do que foi vendido; se ele só ainda não
            começou, deixe em “Aguardando pagamento e fotos”.
          </p>
        </Dialogo>
      )}
    </>
  )
}
