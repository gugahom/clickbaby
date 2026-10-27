import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Dialogo } from '@/components/ui/Dialogo'
import { invalidarVendas, salvarVendaDoCaso, usePrecoDoPacote, useVendaDoCaso } from '../api/useVendaDoCaso'
import { VENDA_INTOCADA, mudancaDaVenda, tabelaAplicavel, type EstadoDaVenda } from '../lib/vendas'
import { EditorDaVenda } from './EditorDaVenda'

/**
 * LANÇAR A VENDA SEM EDITAR O CASO (20/10/2026). Até aqui a venda só entrava
 * pelo "Editar caso" do Calendário, que é do adm — e quem tem a tela Comercial
 * sem ser adm (o atendimento que vende, por exemplo) via o valor e não tinha por
 * onde lançar. É o MESMO editor do formulário, e grava pelas mesmas RPCs.
 */
export function DialogoLancarVenda({
  casoId,
  nome,
  pacoteId,
  maternidadeId,
  onFechar,
}: {
  casoId: string
  nome: string
  /** Para o preço da tabela (27/10/2026). */
  pacoteId: string | null
  maternidadeId: string | null
  onFechar: () => void
}) {
  const queryClient = useQueryClient()
  const atual = useVendaDoCaso(casoId, true)
  const preco = usePrecoDoPacote(pacoteId, maternidadeId, true)
  const [estado, setEstado] = useState<EstadoDaVenda>(VENDA_INTOCADA)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Aqui salvar É lançar a venda: o pacote da tabela entra sem o "+". Enquanto a
  // venda do banco não chega, a tabela espera — senão um pacote já lançado
  // apareceria de novo, pronto para entrar em dobro.
  const tabela = atual.data ? tabelaAplicavel(preco.preco, atual.data.linhas, estado) : null
  const venda = mudancaDaVenda(estado, atual.data?.contrato ?? null, { tabela, entraSozinho: true })
  const m = venda.mudanca
  const nadaMudou = m !== null && m.novas.length === 0 && m.removidas.length === 0 && m.contrato === undefined

  return (
    <Dialogo
      titulo="Venda do caso"
      rotuloConfirmar={salvando ? 'Salvando…' : 'Salvar'}
      confirmarDesabilitado={m === null || nadaMudou || atual.isPending}
      ocupado={salvando}
      erro={erro}
      largo
      onCancelar={onFechar}
      onConfirmar={() => {
        if (m === null) return
        setErro(null)
        setSalvando(true)
        salvarVendaDoCaso(casoId, m, 'so_venda')
          .then(() => {
            void invalidarVendas(queryClient)
            onFechar()
          })
          .catch((e: unknown) => {
            void invalidarVendas(queryClient)
            setErro(e instanceof Error ? e.message : 'Não deu para salvar a venda.')
          })
          .finally(() => setSalvando(false))
      }}
    >
      <p className="text-sm text-muted-foreground">{nome}</p>
      <EditorDaVenda
        inicial={atual.data}
        carregando={atual.isPending}
        estado={estado}
        onMudar={setEstado}
        tabela={tabela}
        entraSozinho
      />
      {venda.falta && <p className="text-sm font-semibold text-atrasado">Falta {venda.falta}.</p>}
    </Dialogo>
  )
}
