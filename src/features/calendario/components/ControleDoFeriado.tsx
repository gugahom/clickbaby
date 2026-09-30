import { useState } from 'react'
import { Botao } from '@/components/ui/Botao'
import { useMarcarFeriado, useTirarFeriado, type Feriado } from '../api/useCalendario'

/**
 * MARCAR E TIRAR FERIADO, no cabeçalho da visão do dia — só o ADM (espelho de
 * `eh_adm()`, a policy da tabela). Ele não é enfeite: um dia marcado deixa de
 * contar como dia útil, e o prazo dos dois MASTER anda para frente. O `title`
 * do botão diz isso antes do clique.
 */
export function ControleDoFeriado({ dia, feriado }: { dia: string; feriado: Feriado | undefined }) {
  const marcar = useMarcarFeriado()
  const tirar = useTirarFeriado()
  const [aberto, setAberto] = useState(false)
  const [descricao, setDescricao] = useState('')
  const erro = marcar.error ?? tirar.error
  const aviso = 'Feriado não conta como dia útil: o prazo dos pacotes MASTER pula este dia.'

  return (
    <div className="flex flex-wrap items-center gap-2">
      {feriado ? (
        <Botao variante="contorno" onClick={() => tirar.mutate(dia)} disabled={tirar.isPending} title={aviso}>
          {tirar.isPending ? 'Tirando…' : 'Não é feriado'}
        </Botao>
      ) : aberto ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (descricao.trim() === '') return
            marcar.mutate({ data: dia, descricao }, { onSuccess: () => setAberto(false) })
          }}
        >
          <label htmlFor="feriado-descricao" className="sr-only">
            Nome do feriado
          </label>
          <input
            id="feriado-descricao"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex.: Finados"
            autoFocus
            className="h-10 w-40 min-w-0 rounded-xl border border-border bg-background px-3 text-sm"
          />
          <Botao type="submit" variante="primario" disabled={marcar.isPending || descricao.trim() === ''}>
            {marcar.isPending ? 'Marcando…' : 'Marcar'}
          </Botao>
          <Botao type="button" variante="fantasma" onClick={() => setAberto(false)}>
            Cancelar
          </Botao>
        </form>
      ) : (
        <Botao variante="contorno" onClick={() => setAberto(true)} title={aviso}>
          Marcar feriado
        </Botao>
      )}
      {erro && <span className="text-xs font-semibold text-atrasado">{erro.message}</span>}
    </div>
  )
}
