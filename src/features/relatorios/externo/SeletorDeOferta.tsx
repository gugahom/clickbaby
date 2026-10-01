import { useState } from 'react'
import clsx from 'clsx'
import { Dialogo } from '@/components/ui/Dialogo'
import { Dropdown } from '@/components/ui/Dropdown'
import { FASES_COMERCIAIS, ROTULO_FASE_COMERCIAL, type FaseComercial, type OfertaComercial } from './filtros'
import { useDefinirOferta } from './useOperacao'

/**
 * A COR DIZ DE QUEM É A BOLA, como nas fases do fotolivro: âmbar quando é do
 * comercial (apresentar), azul quando espera a família (enviado), neutro no
 * "não" e verde na venda. Um degradê de progresso seria bonito e não diria o
 * que depende de quem olha.
 */
const ESTILO: Record<FaseComercial, string> = {
  apresentar: 'bg-atencao/15 text-atencao-tinta ring-1 ring-atencao/40',
  enviado: 'bg-andamento/15 text-andamento-tinta ring-1 ring-andamento/30',
  recusou: 'bg-muted text-muted-foreground ring-1 ring-border',
  vendido: 'bg-concluido text-white',
}

const PONTO: Record<FaseComercial, string> = {
  apresentar: 'bg-atencao',
  enviado: 'bg-andamento',
  recusou: 'bg-muted-foreground/50',
  vendido: 'bg-concluido',
}

const ETAPA_DA_VENDA: Partial<Record<OfertaComercial, string>> = {
  new_born: 'New Born',
  fotolivro: 'Foto/Livro',
}

/**
 * O "DEFINIR FASE" DE UMA OFERTA (01/10/2026, pedido do gestor: "como se fosse
 * um definir fase que a gente tem ali no Master"). A mesma pílula colorida das
 * seções do Quadro, e o mesmo Dropdown da casa.
 *
 * NULO É "NÃO SE APLICA" — o reels de um BABY REELS, o Foto/Livro de um MASTER
 * + ÁLBUM — e aparece como um traço, sem seletor.
 *
 * VENDIDO NO NEW BORN E NO FOTO/LIVRO PERGUNTA ANTES: ele cria a etapa no caso,
 * e o cartão aparece na seção da equipe. Um toque errado num relatório não
 * pode mandar trabalho para a ilha sem a pessoa ver.
 *
 * Sem a tela Comercial (quem só tem Relatórios), a pílula aparece e não abre.
 */
export function SeletorDeOferta({
  casoId,
  oferta,
  fase,
  podeMudar,
}: {
  casoId: string
  oferta: OfertaComercial
  fase: FaseComercial | null
  podeMudar: boolean
}) {
  const definir = useDefinirOferta()
  const [confirmando, setConfirmando] = useState<FaseComercial | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  if (fase === null) return <span className="text-muted-foreground" title="Não se aplica a este caso">—</span>

  function mudar(nova: FaseComercial) {
    setErro(null)
    definir.mutate(
      { casoId, oferta, fase: nova },
      {
        onSuccess: () => setConfirmando(null),
        onError: (e) => setErro(e instanceof Error ? e.message : String(e)),
      },
    )
  }

  const pilula = (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap transition-opacity',
        ESTILO[fase],
        definir.isPending && 'opacity-60',
      )}
    >
      {ROTULO_FASE_COMERCIAL[fase]}
    </span>
  )

  return (
    // O clique na linha abre o caso no Quadro; aqui dentro, não.
    <div onClick={(e) => e.stopPropagation()} className="inline-flex flex-col items-start gap-0.5">
      {podeMudar ? (
        <Dropdown
          compacto
          rotulo={`Fase da oferta: ${ROTULO_FASE_COMERCIAL[fase]}`}
          selecionado={fase}
          desabilitado={definir.isPending}
          onEscolher={(item) => {
            const nova = item.id as FaseComercial
            if (nova === fase) return
            if (nova === 'vendido' && ETAPA_DA_VENDA[oferta]) setConfirmando(nova)
            else mudar(nova)
          }}
          itens={FASES_COMERCIAIS.map((f) => ({
            id: f,
            rotulo: ROTULO_FASE_COMERCIAL[f],
            icone: <span className={clsx('block size-2.5 rounded-full', PONTO[f])} />,
          }))}
          gatilho={pilula}
        />
      ) : (
        pilula
      )}
      {erro && !confirmando && <span className="max-w-40 text-[11px] font-semibold text-atrasado">{erro}</span>}

      {confirmando && (
        <Dialogo
          titulo={`Marcar o ${ETAPA_DA_VENDA[oferta]} como vendido?`}
          rotuloConfirmar={definir.isPending ? 'Salvando…' : 'Marcar vendido'}
          ocupado={definir.isPending}
          erro={erro}
          onCancelar={() => setConfirmando(null)}
          onConfirmar={() => mudar(confirmando)}
        >
          <p className="text-sm text-muted-foreground">
            O caso ganha a etapa {ETAPA_DA_VENDA[oferta]}, e o cartão aparece na seção {ETAPA_DA_VENDA[oferta]} do
            Quadro para a equipe trabalhar — mesmo que o caso já tenha sido entregue.
          </p>
        </Dialogo>
      )}
    </div>
  )
}
