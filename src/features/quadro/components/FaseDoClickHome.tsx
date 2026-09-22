import { useState } from 'react'
import clsx from 'clsx'
import { Dropdown } from '@/components/ui/Dropdown'
import { Dialogo } from '@/components/ui/Dialogo'
import { IconeDispensar } from '@/components/ui/icones'
import { useDispensarEtapa, useMoverClickHome } from '../api/useAcoes'
import { mensagemDeErro } from '../lib/erros'
import {
  ESTILO_FASE_CLICK_HOME,
  FASES_CLICK_HOME_NA_TELA,
  FASE_CLICK_HOME_ESCOLHA,
  ROTULO_FASE_CLICK_HOME,
  type EtapaQuadro,
  type FaseClickHome,
} from '../types'
import { DialogoGaleriaDoClickHome } from './DialogoGaleriaDoClickHome'

/**
 * A FASE DO CLICK HOME — as cinco colunas do quadro do ensaio newborn
 * (22/09/2026, pedido do gestor).
 *
 * Mesmo desenho da fase do vídeo e do fotolivro, e pelo mesmo motivo: a
 * pergunta de quem abre a seção é sobre UM ensaio ("onde está este, e para onde
 * vai agora"), não sobre carga por coluna. A pílula é o alvo; trocar é abrir a
 * lista.
 *
 * O FIM NÃO SE ESCOLHE AQUI. A última fase do seletor é "Enviar para escolha",
 * e ela não conclui nada: o ensaio aparece em Entregáveis e espera a Morgana
 * confirmar. Ver FASES_CLICK_HOME_NA_TELA.
 *
 * "ENVIAR PARA ESCOLHA" ABRE UM DIÁLOGO, porque sem o link da galeria a fase
 * não significa nada — e o banco recusa sem ele.
 *
 * SEM FASE ATÉ ALGUÉM DIZER UMA: estar na seção já é ser um ensaio a fazer, e
 * uma fase de padrão afirmaria um estado que ninguém declarou.
 */
const DISPENSAR = 'dispensar'

export function FaseDoClickHome({
  etapa,
  nomeDoCaso,
  onErro,
}: {
  etapa: EtapaQuadro
  /** Para o diálogo da galeria dizer de que família é o ensaio. */
  nomeDoCaso: string
  onErro: (mensagem: string | null) => void
}) {
  const mover = useMoverClickHome()
  const dispensar = useDispensarEtapa()
  const [dispensando, setDispensando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const atual = etapa.faseClickHome

  return (
    <>
      <Dropdown
        alinhamento="direita"
        className="min-w-0"
        rotulo={
          atual
            ? `Fase do Click Home: ${ROTULO_FASE_CLICK_HOME[atual]}`
            : 'Definir a fase do Click Home'
        }
        {...(atual ? { selecionado: atual } : {})}
        desabilitado={mover.isPending}
        onEscolher={(item) => {
          onErro(null)
          if (item.id === DISPENSAR) {
            setDispensando(true)
            return
          }
          if (item.id === FASE_CLICK_HOME_ESCOLHA) {
            setEnviando(true)
            return
          }
          mover
            .mutateAsync({ casoEtapaId: etapa.id, fase: item.id as FaseClickHome })
            .catch((e) => onErro(mensagemDeErro(e)))
        }}
        itens={[
          ...FASES_CLICK_HOME_NA_TELA.map((fase) => ({
            id: fase,
            rotulo: ROTULO_FASE_CLICK_HOME[fase],
          })),
          {
            id: DISPENSAR,
            rotulo: 'Este caso não tem Click Home',
            icone: <IconeDispensar className="size-4" />,
            destrutivo: true,
          },
        ]}
        gatilho={
          <span
            className={clsx(
              'inline-flex max-w-full items-center gap-1 truncate rounded-full px-2.5 py-1 text-xs font-bold transition-colors',
              atual
                ? ESTILO_FASE_CLICK_HOME[atual]
                : 'border border-dashed border-border text-muted-foreground hover:border-marca hover:text-marca',
              mover.isPending && 'opacity-60',
            )}
          >
            {atual ? ROTULO_FASE_CLICK_HOME[atual] : 'Definir fase'}
          </span>
        }
      />

      {enviando && (
        <DialogoGaleriaDoClickHome
          etapa={etapa}
          nomeDoCaso={nomeDoCaso}
          onFechar={() => setEnviando(false)}
        />
      )}

      {dispensando && (
        <Dialogo
          titulo="Este caso não tem Click Home?"
          rotuloConfirmar={dispensar.isPending ? 'Dispensando…' : 'Dispensar o Click Home'}
          confirmarDestrutivo
          ocupado={dispensar.isPending}
          onCancelar={() => setDispensando(false)}
          onConfirmar={() => {
            onErro(null)
            dispensar
              .mutateAsync({
                casoEtapaId: etapa.id,
                motivo: 'Caso não tem Click Home — etapa criada por engano.',
              })
              .then(
                () => setDispensando(false),
                (e) => onErro(mensagemDeErro(e)),
              )
          }}
        >
          <p className="text-sm text-muted-foreground">
            A etapa sai desta seção e conta como resolvida. Use quando o ensaio
            não faz parte do que foi vendido — o título do evento no Calendar
            pode ter trazido o adicional por engano. Se ele só ainda não
            aconteceu, deixe em “Aguardando edição”.
          </p>
        </Dialogo>
      )}
    </>
  )
}
