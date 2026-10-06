import { Link } from 'react-router'
import { Botao } from '@/components/ui/Botao'
import { Dialogo } from '@/components/ui/Dialogo'
import { TextoFormatado } from '@/components/ui/TextoFormatado'
import { useCasoEditavel, useNoQuadro, type ItemDoCalendario } from '../api/useCalendario'
import { emBrasilia, rotuloDoDiaCompleto } from '../lib/datas'
import { aparencia } from '../lib/estilos'

/**
 * O DETALHE DE UM ITEM, ao tocar nele — o "Event Details" do exemplo.
 *
 * AS AÇÕES (30/09/2026, "poder editar, excluir"): no parto, EDITAR (adm) e
 * CANCELAR (atendimento ou adm); na hora marcada e na entrega combinada, MUDAR
 * O HORÁRIO. Quem pode o quê decide a página — aqui só aparece o botão que
 * veio. O prazo do pacote não tem ação: ele é conta, não combinado.
 *
 * O Google acompanha o que se faz no parto (ver `editar_caso` e a trigger
 * `marcar_caso_para_o_google`); enquanto não acompanhou, a linha de baixo diz.
 */
export interface AcoesDoDetalhe {
  onEditar?: () => void
  onCancelar?: () => void
  onMudarHorario?: () => void
}

const NO_GOOGLE = {
  enviando: 'Indo para o Google Calendar — entra em até um minuto.',
  atualizando: 'Atualizando o evento no Google Calendar — em até um minuto.',
}

export function DetalheDoItem({
  item,
  acoes,
  onFechar,
}: {
  item: ItemDoCalendario
  acoes: AcoesDoDetalhe
  onFechar: () => void
}) {
  const a = aparencia(item)
  const noQuadro = useNoQuadro(item.casoId)
  // Cesárea e observações só existem no parto — são do caso, não da etapa.
  const caso = useCasoEditavel(item.tipo === 'parto' ? item.casoId : null)
  const linhas: [string, string | null][] = [
    ['Quando', `${rotuloDoDiaCompleto(item.dia)}${item.hora ? `, às ${item.hora}` : item.tipo === 'parto' ? ' · hora a definir' : ' · dia todo'}`],
    ['Cesárea', caso.data?.cesareaEm ? `às ${emBrasilia(caso.data.cesareaEm).hora}` : null],
    ['Maternidade', item.maternidade],
    ['Pacote', item.pacote],
    ['Com quem', item.responsavel],
  ]
  const temAcao = acoes.onEditar ?? acoes.onCancelar ?? acoes.onMudarHorario
  return (
    <Dialogo titulo={item.nome} rotuloConfirmar="Fechar" fecharNoCanto onConfirmar={onFechar} onCancelar={onFechar}>
      <div className="space-y-4">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold"
          style={a.cheio ? { backgroundColor: a.hex, color: a.texto } : { boxShadow: `inset 0 0 0 1.5px ${a.hex}` }}
        >
          {!a.cheio && <span className="size-2 rounded-full" style={{ backgroundColor: a.hex }} />}
          {item.titulo}
          {item.vencido && ' · vencido'}
        </span>
        <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
          {linhas
            .filter((l): l is [string, string] => l[1] !== null && l[1] !== '')
            .map(([rotulo, valor]) => (
              <div key={rotulo} className="contents">
                <dt className="text-muted-foreground">{rotulo}</dt>
                <dd className="font-semibold text-foreground">{valor}</dd>
              </div>
            ))}
        </dl>
        {caso.data?.observacao && (
          <div className="rounded-xl bg-muted/50 px-3 py-2.5">
            <div className="text-xs font-semibold text-muted-foreground">Observações</div>
            <TextoFormatado valor={caso.data.observacao} className="mt-1 text-sm text-foreground" />
          </div>
        )}
        {item.google && (
          <p className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground" role="status">
            <span className="size-2 flex-shrink-0 animate-pulse rounded-full bg-marca" aria-hidden="true" />
            {NO_GOOGLE[item.google]}
          </p>
        )}
        {temAcao && (
          <div className="flex flex-wrap gap-2">
            {acoes.onEditar && (
              <Botao variante="contorno" onClick={acoes.onEditar}>
                Editar caso
              </Botao>
            )}
            {acoes.onMudarHorario && (
              <Botao variante="contorno" onClick={acoes.onMudarHorario}>
                Mudar horário
              </Botao>
            )}
            {acoes.onCancelar && (
              <Botao variante="fantasma" className="text-atrasado" onClick={acoes.onCancelar}>
                {item.rascunho ? 'Descartar rascunho' : 'Cancelar caso'}
              </Botao>
            )}
          </div>
        )}
        {/* Só quando o caso ESTÁ no Quadro — ver useNoQuadro. */}
        {noQuadro.data && (
          <Link
            to={`/?caso=${item.casoId}`}
            className="superficie-acento flex min-h-11 w-full items-center justify-center rounded-full text-sm font-bold text-white"
          >
            Abrir o caso no Quadro
          </Link>
        )}
      </div>
    </Dialogo>
  )
}
