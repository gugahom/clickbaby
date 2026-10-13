import clsx from 'clsx'
import { Dropdown } from '@/components/ui/Dropdown'
import { useAuth } from '@/features/auth/contexto'
import { useRegistrarPagamentoClickHome } from '../api/useAcoes'
import { podeEncerrarCaso } from '../lib/acoes'
import { mensagemDeErro } from '../lib/erros'
import { ROTULO_PAGAMENTO_CLICK_HOME, type EtapaQuadro, type PagamentoClickHome } from '../types'

/**
 * O PAGAMENTO DO NEW BORN (13/10/2026, pedido do gestor: "eu preciso saber se
 * tem que cobrar esse cliente ou não, para a gente não ter aquela insegurança
 * na hora da entrega").
 *
 * Verde é "pago", vermelho é "a cobrar", e tracejado é "ninguém informou" — o
 * mesmo arranjo do termo de imagem. Quem informa é atendimento ou adm (o banco
 * confere); para os outros a pílula só mostra.
 */
const ESTILO_PAGAMENTO_CLICK_HOME: Record<PagamentoClickHome, string> = {
  pago: 'bg-concluido text-white',
  a_cobrar: 'bg-atrasado text-white',
}

export function PagamentoDoClickHome({
  etapa,
  onErro,
}: {
  etapa: EtapaQuadro
  onErro: (mensagem: string | null) => void
}) {
  const { pessoa } = useAuth()
  const informa = podeEncerrarCaso(pessoa?.papelSistema ?? 'operador')
  const registrar = useRegistrarPagamentoClickHome()
  const atual = etapa.pagamentoClickHome

  const pilula = (
    <span
      className={clsx(
        'inline-flex h-6 flex-shrink-0 items-center rounded-full px-2.5 text-xs font-bold',
        atual ? ESTILO_PAGAMENTO_CLICK_HOME[atual] : 'border border-dashed border-border text-muted-foreground',
        informa && !atual && 'hover:border-marca hover:text-marca',
        registrar.isPending && 'opacity-60',
      )}
    >
      {atual ? ROTULO_PAGAMENTO_CLICK_HOME[atual] : informa ? 'Pagamento?' : 'Pagamento não informado'}
    </span>
  )

  if (!informa) return pilula

  return (
    <Dropdown
      alinhamento="direita"
      rotulo={atual ? `Pagamento do New Born: ${ROTULO_PAGAMENTO_CLICK_HOME[atual]}` : 'Informar o pagamento do New Born'}
      {...(atual ? { selecionado: atual } : {})}
      desabilitado={registrar.isPending}
      onEscolher={(item) => {
        onErro(null)
        registrar
          .mutateAsync({ casoEtapaId: etapa.id, pagamento: item.id as PagamentoClickHome })
          .catch((e) => onErro(mensagemDeErro(e)))
      }}
      itens={[
        { id: 'pago', rotulo: 'Pago' },
        { id: 'a_cobrar', rotulo: 'A cobrar' },
      ]}
      gatilho={pilula}
    />
  )
}
