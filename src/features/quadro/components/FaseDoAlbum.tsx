import { useState } from 'react'
import clsx from 'clsx'
import { Dropdown } from '@/components/ui/Dropdown'
import { Dialogo } from '@/components/ui/Dialogo'
import { IconeDispensar } from '@/components/ui/icones'
import { useDispensarEtapa, useMoverAlbum } from '../api/useAcoes'
import { mensagemDeErro } from '../lib/erros'
import {
  ESTILO_FASE_ALBUM,
  FASES_ALBUM_NA_TELA,
  FASE_ALBUM_APROVACAO,
  ROTULO_FASE_ALBUM,
  type EtapaQuadro,
  type FaseAlbum,
} from '../types'
import { DialogoAprovacaoDoFotolivro } from './DialogoAprovacaoDoFotolivro'

/**
 * A FASE DO FOTOLIVRO — o segundo quadro do Trello, sem virar um Trello.
 *
 * (15/09/2026: a seção passou a abrir num modal com uma visão POR FASE em
 * colunas, em teste ao lado da lista — ver SecaoEmModal. A fase continua
 * mudando por aqui nas duas visões; desde 16/09 o quadro de colunas também
 * aceita arrastar com o mouse, como atalho para esta mesma RPC.)
 *
 * Mesma decisão da FaseDoVideo, e vale repetir porque aqui a tentação é maior:
 * são muitas colunas, e muitas colunas é onde um kanban parece obrigatório. Não
 * é. Um kanban serve para ver CARGA — quantos há em cada coluna, onde entope —,
 * e a pergunta de quem abre esta seção é sobre UM fotolivro: "onde está este, e
 * para onde ele vai agora". A fase é uma pílula na linha, e trocá-la é abrir a
 * lista: dois toques, em qualquer aparelho.
 *
 * O FIM NÃO SE ESCOLHE AQUI (21/09/2026, pedido do gestor). A última fase do
 * seletor é "Pronto para entrega", e ela NÃO conclui: o fotolivro vai para
 * Entregáveis e fica esperando a Morgana confirmar a entrega do livro — é a
 * confirmação que conclui a etapa e tira o cartão da seção. Entre 16/09 e 21/09
 * escolher "Pronto para entrega" concluía na hora; ver FASES_ALBUM_NA_TELA.
 *
 * "AGUARDANDO APROVAÇÃO" ABRE UM DIÁLOGO: a capa e o link que a Morgana manda
 * ao cliente são obrigatórios para entrar nela (decisão do gestor), e o banco
 * recusa sem os dois. Ver DialogoAprovacaoDoFotolivro.
 *
 * A LISTA INTEIRA, NOS DOIS SENTIDOS. Um álbum volta de "Aprovado" para "Pedido
 * de alterações" quando a família muda de ideia depois de aprovar, e isso não é
 * desfazer — é o fluxo normal.
 *
 * SEM FASE ATÉ ALGUÉM DIZER UMA. Estar nesta seção já é ser um fotolivro a
 * fazer; uma fase inventada de padrão afirmaria um estado que ninguém declarou
 * — e a primeira delas ("aguardando pagamento") é uma afirmação sobre o
 * FINANCEIRO do cliente, que é a última coisa que o sistema deve chutar.
 *
 * DISPENSAR NÃO É UMA FASE, e por isso vem separado no fim, em vermelho.
 */
const DISPENSAR = 'dispensar'

export function FaseDoAlbum({
  etapa,
  nomeDoCaso,
  onErro,
}: {
  etapa: EtapaQuadro
  /** Para o diálogo de aprovação dizer de que família é o livro. */
  nomeDoCaso: string
  onErro: (mensagem: string | null) => void
}) {
  const mover = useMoverAlbum()
  const dispensar = useDispensarEtapa()
  const [dispensando, setDispensando] = useState(false)
  const [aprovando, setAprovando] = useState(false)
  const atual = etapa.faseAlbum

  function mudarFase(fase: FaseAlbum) {
    onErro(null)
    mover
      .mutateAsync({ casoEtapaId: etapa.id, fase })
      .catch((e) => onErro(mensagemDeErro(e)))
  }

  return (
    <>
      <Dropdown
        alinhamento="direita"
        // `min-w-0`: os rótulos do fotolivro são longos ("Aguardando pagamento e
        // fotos"), e sem isto a pílula se recusa a encolher — empurra o cartão e
        // vira rolagem lateral numa coluna estreita. Com ele, o texto trunca.
        className="min-w-0"
        rotulo={
          atual
            ? `Fase do Foto/Livro: ${ROTULO_FASE_ALBUM[atual]}`
            : 'Definir a fase do Foto/Livro'
        }
        {...(atual ? { selecionado: atual } : {})}
        desabilitado={mover.isPending}
        onEscolher={(item) => {
          onErro(null)
          if (item.id === DISPENSAR) {
            setDispensando(true)
            return
          }
          // A aprovação pede capa e link antes — ver DialogoAprovacaoDoFotolivro.
          if (item.id === FASE_ALBUM_APROVACAO) {
            setAprovando(true)
            return
          }
          mudarFase(item.id as FaseAlbum)
        }}
        itens={[
          ...FASES_ALBUM_NA_TELA.map((fase) => ({
            id: fase,
            rotulo: ROTULO_FASE_ALBUM[fase],
          })),
          {
            id: DISPENSAR,
            rotulo: 'Este caso não tem Foto/Livro',
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

      {aprovando && (
        <DialogoAprovacaoDoFotolivro
          etapa={etapa}
          nomeDoCaso={nomeDoCaso}
          onFechar={() => setAprovando(false)}
        />
      )}

      {dispensando && (
        <Dialogo
          titulo="Este caso não tem Foto/Livro?"
          rotuloConfirmar={dispensar.isPending ? 'Dispensando…' : 'Dispensar o Foto/Livro'}
          confirmarDestrutivo
          ocupado={dispensar.isPending}
          onCancelar={() => setDispensando(false)}
          onConfirmar={() => {
            onErro(null)
            dispensar
              .mutateAsync({
                casoEtapaId: etapa.id,
                motivo: 'Caso não tem Foto/Livro — etapa criada por engano.',
              })
              .then(
                () => setDispensando(false),
                (e) => onErro(mensagemDeErro(e)),
              )
          }}
        >
          <p className="text-sm text-muted-foreground">
            A etapa sai desta seção e conta como resolvida. Use quando o
            Foto/Livro não faz parte do que foi vendido; se ele só ainda não
            começou, deixe em “Aguardando pagamento e fotos”.
          </p>
        </Dialogo>
      )}
    </>
  )
}
