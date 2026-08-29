import { useEffect, useRef, type ReactNode } from 'react'
import { Botao } from './Botao'
import { Alerta } from './Alerta'

interface PropsDialogo {
  titulo: string
  children?: ReactNode
  rotuloConfirmar: string
  confirmarDestrutivo?: boolean
  confirmarDesabilitado?: boolean
  ocupado?: boolean
  /**
   * Erro da ação. Precisa ser renderizado AQUI DENTRO: o <dialog> modal
   * inertiza o resto da página, então um alerta no painel de trás fica
   * invisível atrás do backdrop — a pessoa só veria "não aconteceu nada".
   */
  erro?: string | null
  onConfirmar: () => void
  onCancelar: () => void
}

/**
 * Confirmação para ação sem desfazer.
 *
 * Usa <dialog> nativo com showModal(): traz foco preso, Esc para fechar e
 * inertização do resto da página sem biblioteca — o mesmo motivo de não termos
 * trazido o shadcn da referência da v0.
 *
 * Só as ações que ENCERRAM o caso passam por aqui (confirmar entrega,
 * cancelar). Iniciar e concluir etapa vão direto: são o fluxo frequente, e
 * pedir confirmação neles empurraria a operação de volta para o quadro branco
 * (seção 6 do CLAUDE.md).
 */
export function Dialogo({
  titulo,
  children,
  rotuloConfirmar,
  confirmarDestrutivo = false,
  confirmarDesabilitado = false,
  ocupado = false,
  erro = null,
  onConfirmar,
  onCancelar,
}: PropsDialogo) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialogo = ref.current
    if (!dialogo?.open) dialogo?.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      // `cancel` cobre o Esc, que fecha o <dialog> sem passar por nenhum botão.
      onCancel={(e) => {
        e.preventDefault()
        if (!ocupado) onCancelar()
      }}
      /*
        O diálogo herda a mesma linguagem do cartão: raio de painel, sombra
        que alcança longe, e o título na display.
        
        O backdrop ganhou desfoque. Só escurecer separava o modal do resto por
        luminância; desfocando, o que está atrás deixa de ser legível e a
        atenção não tem para onde escapar — numa tela em que o fundo é uma
        lista de casos coloridos, isso importa mais do que numa tela lisa.
      */
      className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-painel border border-border bg-card p-0 text-foreground shadow-cartao-alto backdrop:bg-marca-forte/45 backdrop:backdrop-blur-sm"
    >
      <div className="space-y-4 p-5 md:p-6">
        <h2 className="font-display text-xl font-extrabold tracking-tight text-balance">{titulo}</h2>

        {children}

        {erro && <Alerta>{erro}</Alerta>}

        <div className="flex justify-end gap-2 pt-1">
          <Botao variante="fantasma" onClick={onCancelar} disabled={ocupado}>
            Cancelar
          </Botao>
          <Botao
            variante={confirmarDestrutivo ? 'destrutivo' : 'primario'}
            onClick={onConfirmar}
            disabled={ocupado || confirmarDesabilitado}
          >
            {ocupado ? 'Enviando…' : rotuloConfirmar}
          </Botao>
        </div>
      </div>
    </dialog>
  )
}
