import { useState } from 'react'
import { Dialogo } from '@/components/ui/Dialogo'
import { Dropdown } from '@/components/ui/Dropdown'
import { usePessoasAtivas } from '../api/useAcoes'

/*
 * Saiu de AcoesDoCaso em 21/09/2026: a seção MASTER e a FOTO/LIVRO passaram a
 * atribuir e passar adiante pelo próprio cartão (AtribuicaoDaSecao), e a
 * pergunta "quem fica com isto?" é a mesma do card do Quadro.
 */

export interface PropsDialogoPessoa {
  titulo: string
  contexto: string
  rotuloConfirmar: string
  /** Some da lista: a RPC recusa designar para quem já é responsável. */
  excluirPessoaId: string | null
  /** Só o handoff pede motivo — atribuir é planejamento, não precisa justificar. */
  comMotivo?: boolean
  ocupado: boolean
  erro: string | null
  onCancelar: () => void
  onConfirmar: (paraPessoaId: string, motivo: string) => void
}

/**
 * Escolha de pessoa, usada por atribuir e por handoff.
 *
 * As duas ações fazem a mesma pergunta — "quem fica com isto?" — e mudam no que
 * significam: atribuir designa trabalho que não começou, handoff registra
 * trabalho que mudou de mão. Uma tela só, dois textos.
 */
export function DialogoPessoa({
  titulo,
  contexto,
  rotuloConfirmar,
  excluirPessoaId,
  comMotivo = false,
  ocupado,
  erro,
  onCancelar,
  onConfirmar,
}: PropsDialogoPessoa) {
  const { data: pessoas, isPending } = usePessoasAtivas()
  const [paraPessoaId, setParaPessoaId] = useState('')
  const [motivo, setMotivo] = useState('')

  const opcoes = (pessoas ?? []).filter((p) => p.id !== excluirPessoaId)

  return (
    <Dialogo
      titulo={titulo}
      rotuloConfirmar={rotuloConfirmar}
      confirmarDesabilitado={paraPessoaId === ''}
      ocupado={ocupado}
      erro={erro}
      onCancelar={onCancelar}
      onConfirmar={() => onConfirmar(paraPessoaId, motivo)}
    >
      <p className="text-sm text-muted-foreground">{contexto}</p>

      <div>
        <span className="text-sm font-medium">Pessoa</span>
        <div className="mt-1">
          <Dropdown
            rotulo={isPending ? 'Carregando…' : 'Selecione uma pessoa'}
            buscavel
            desabilitado={isPending}
            selecionado={paraPessoaId}
            onEscolher={(item) => setParaPessoaId(item.id)}
            itens={opcoes.map((p) => ({ id: p.id, rotulo: p.nome }))}
          />
        </div>
      </div>

      {comMotivo && (
        <label className="block">
          <span className="text-sm font-medium">
            Motivo <span className="font-normal text-muted-foreground">(opcional)</span>
          </span>
          <input
            type="text"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="ex.: troca de turno"
            className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 text-base"
          />
        </label>
      )}
    </Dialogo>
  )
}
