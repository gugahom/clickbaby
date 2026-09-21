import { useState } from 'react'
import clsx from 'clsx'
import { IconeAtribuir } from '@/components/ui/icones'
import { useAtribuirEtapa, useTransferirEtapa } from '../api/useAcoes'
import { podeAtribuir, podeTransferir } from '../lib/acoes'
import { mensagemDeErro } from '../lib/erros'
import type { EtapaQuadro } from '../types'
import { DialogoPessoa } from './DialogoPessoa'

/**
 * QUEM EDITA, NO PRÓPRIO CARTÃO DA SEÇÃO (21/09/2026, pedido do gestor:
 * "possibilidade de atribuição de edição para as funcionárias na seção
 * MASTER"; o Foto/Livro ganhou junto, por decisão dele).
 *
 * O vídeo e o fotolivro NÃO se operam pelo card do Quadro — a linha mostra "na
 * seção Master" no lugar dos botões —, então a coordenação não tinha onde
 * dizer quem pega cada um. Agora é uma pílula com o nome de quem está com o
 * trabalho, ou "Atribuir" quando não há ninguém.
 *
 * AS MESMAS DUAS PORTAS DO CARD, pela mesma regra (`podeAtribuir`,
 * `podeTransferir`): antes de o trabalho começar é ATRIBUIR — planejamento, sem
 * motivo —; depois é HANDOFF, que vira linha em `handoffs` e pede motivo
 * (invariante 3.2: responsável não se troca em silêncio).
 */
export function AtribuicaoDaSecao({
  etapa,
  onErro,
}: {
  etapa: EtapaQuadro
  onErro: (mensagem: string | null) => void
}) {
  const atribuir = useAtribuirEtapa()
  const transferir = useTransferirEtapa()
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const designacao = podeAtribuir(etapa)
  const handoff = podeTransferir(etapa)
  const acao = designacao.habilitada ? 'atribuir' : handoff.habilitada ? 'transferir' : null
  const primeiroNome = etapa.responsavelNome?.trim().split(/\s+/)[0] ?? null
  const ocupado = atribuir.isPending || transferir.isPending

  return (
    <>
      <button
        type="button"
        disabled={acao === null || ocupado}
        title={
          acao === null
            ? (designacao.motivo ?? handoff.motivo)
            : primeiroNome
              ? `Com ${etapa.responsavelNome} — trocar quem edita`
              : 'Atribuir quem edita'
        }
        onClick={() => {
          onErro(null)
          setErro(null)
          setAberto(true)
        }}
        // A pílula É o alvo; o min-h-11 em volta garante os 44px de toque.
        className="inline-flex min-h-11 cursor-pointer items-center disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span
          className={clsx(
            'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold transition-colors',
            primeiroNome
              ? 'bg-andamento/12 text-andamento-tinta hover:bg-andamento/20'
              : // Sem ninguém: tracejado e voz de convite, como o "Definir fase".
                'border border-dashed border-border text-muted-foreground hover:border-marca hover:text-marca',
          )}
        >
          <IconeAtribuir className="size-3.5" />
          {primeiroNome ?? 'Atribuir'}
        </span>
      </button>

      {aberto && acao && (
        <DialogoPessoa
          titulo={acao === 'atribuir' ? 'Quem edita?' : 'Passar para outra pessoa'}
          contexto={
            acao === 'atribuir'
              ? etapa.responsavelNome
                ? `Designado agora: ${etapa.responsavelNome}. O trabalho ainda não começou, então isto é redistribuição, não handoff.`
                : 'Ninguém designado ainda. A pessoa escolhida vê isto no sino como trabalho dela.'
              : `Com ${etapa.responsavelNome ?? '—'} agora. A passagem fica registrada no histórico.`
          }
          rotuloConfirmar={acao === 'atribuir' ? 'Atribuir' : 'Transferir'}
          excluirPessoaId={etapa.responsavelId}
          comMotivo={acao === 'transferir'}
          ocupado={ocupado}
          erro={erro}
          onCancelar={() => setAberto(false)}
          onConfirmar={(paraPessoaId, motivo) => {
            setErro(null)
            const promessa =
              acao === 'atribuir'
                ? atribuir.mutateAsync({ casoEtapaId: etapa.id, paraPessoaId })
                : transferir.mutateAsync({ casoEtapaId: etapa.id, paraPessoaId, motivo })
            promessa.then(
              () => setAberto(false),
              (e) => setErro(mensagemDeErro(e)),
            )
          }}
        />
      )}
    </>
  )
}
