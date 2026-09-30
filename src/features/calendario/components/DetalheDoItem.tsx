import { Link } from 'react-router'
import { Dialogo } from '@/components/ui/Dialogo'
import type { ItemDoCalendario } from '../api/useCalendario'
import { rotuloDoDiaCompleto } from '../lib/datas'
import { aparencia } from '../lib/estilos'

/**
 * O DETALHE DE UM ITEM, ao tocar nele — o "Event Details" do exemplo.
 *
 * SÓ LEITURA, por enquanto, e de propósito: o exemplo edita, arrasta e apaga,
 * mas um caso que veio do Google (ou que o sistema já escreveu lá) é relido
 * pelo sync a cada 25 segundos, e uma hora mudada aqui VOLTARIA sozinha. Mudar
 * a hora pelo calendário precisa que o sistema também atualize o evento no
 * Google — é a próxima etapa. Até lá, o caminho é o de sempre: abrir o caso.
 */
export function DetalheDoItem({ item, onFechar }: { item: ItemDoCalendario; onFechar: () => void }) {
  const a = aparencia(item)
  const linhas: [string, string | null][] = [
    ['Quando', `${rotuloDoDiaCompleto(item.dia)}${item.hora ? `, às ${item.hora}` : ' · dia todo'}`],
    ['Maternidade', item.maternidade],
    ['Pacote', item.pacote],
    ['Com quem', item.responsavel],
    ['Cor na agenda', a.nome],
  ]
  return (
    <Dialogo titulo={item.nome} rotuloConfirmar="Fechar" soFechar onConfirmar={onFechar} onCancelar={onFechar}>
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
        <Link
          to={`/?caso=${item.casoId}`}
          className="superficie-acento flex min-h-11 w-full items-center justify-center rounded-full text-sm font-bold text-white"
        >
          Abrir o caso no Quadro
        </Link>
      </div>
    </Dialogo>
  )
}
