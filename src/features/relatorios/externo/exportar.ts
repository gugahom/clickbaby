import { baixarCsv, montarCsv, numeroParaCsv } from '@/lib/csv'
import { dataCurta } from '../lib/metricas'
import {
  OFERTAS,
  ROTULO_DO_LINK,
  ROTULO_FASE_COMERCIAL,
  rotuloDoEquipamento,
  rotuloFixo,
  type FiltrosDaOperacao,
  type Ordem,
} from './filtros'
import {
  COLUNA_DO_EIXO,
  graoDoTempo,
  linhasNoTempo,
  ordenarPorDimensao,
  rotuloDaLinha,
  type Eixo,
  type LinhaDoGrafico,
} from './grafico'
import { lerGraficoDaOperacao, lerTodosOsCasos } from './useOperacao'

/**
 * A PLANILHA DO RECORTE (30/09/2026, pedido do gestor). Duas, conforme o que se
 * quer levar:
 *   * OS CASOS — todos os do recorte, não só a página da tela, uma linha cada;
 *   * OS NÚMEROS — a tabela por trás do gráfico: um pedaço (dia, mês,
 *     maternidade…) por linha, com os seis números do recorte.
 * O formato é o da planilha de Despesas (`lib/csv`): `;`, vírgula decimal e BOM,
 * para abrir direto no Excel em português.
 *
 * A planilha dos casos leva NOME DE MÃE E BEBÊ, e é por isso que ela só existe
 * aqui, atrás da gestão (seção 10 do CLAUDE.md): o arquivo sai do sistema, e
 * quem o baixa passa a responder por ele.
 *
 * OS LINKS VÃO SÓ PELO TIPO (30/09/2026, decisão do gestor): a coluna diz
 * "Google Photos, WeTransfer", nunca o endereço. O link é a chave da galeria da
 * família, e um arquivo encaminhado abriria todas elas. Na tela, sim, ele é
 * clicável — lá quem vê é a gestão logada.
 */

const ADICIONAL: Record<string, string> = { new_born: 'New Born', fotolivro: 'Foto/Livro', video_master: 'Vídeo MASTER' }
const SIM_NAO = (v: boolean) => (v ? 'Sim' : 'Não')
const horas = (h: number | null) => (h === null ? '' : String(h).replace('.', ','))

function nomeDoArquivo(f: FiltrosDaOperacao, sufixo: string): string {
  const periodo = f.de || f.ate ? `${f.de ?? 'inicio'}_a_${f.ate ?? 'hoje'}` : 'todo-o-periodo'
  return `operacao_${periodo}${sufixo}.csv`
}

export async function exportarCasos(f: FiltrosDaOperacao, ordem: Ordem): Promise<number> {
  const casos = await lerTodosOsCasos(f, ordem)
  const csv = montarCsv(
    [
      'Data',
      'Mãe',
      'Bebê',
      'Maternidade',
      'Pacote',
      'Situação',
      'Prazo',
      'Horas do parto ao envio',
      'Despesas (R$)',
      'Termo de imagem',
      'Parto por',
      'Adicionais',
      'Passou pela UTI',
      'Voltou para ajuste',
      'Links',
      'Equipamento',
      // No modo comercial, a fase de cada oferta (01/10/2026) — a planilha que o
      // comercial usava, de volta ao Excel quando ele quiser.
      ...(f.comercial ? [...OFERTAS.map((o) => `Oferta de ${o.rotulo}`), 'Retorno agendado'] : []),
    ],
    casos.map((c) => [
      c.dia ? dataCurta(c.dia) : '',
      c.maeNome,
      c.bebeNome ?? '',
      c.maternidadeSigla ?? '',
      c.pacoteNome ?? '',
      rotuloFixo('situacoes', c.situacao) ?? c.situacao,
      rotuloFixo('prazos', c.prazo) ?? c.prazo,
      horas(c.horasAteEnvio),
      numeroParaCsv(c.totalDespesas),
      rotuloFixo('termos', c.termo) ?? c.termo,
      c.fotografouOParto ?? '',
      c.adicionais.map((a) => ADICIONAL[a] ?? a).join(', '),
      SIM_NAO(c.passouUti),
      SIM_NAO(c.reaberto),
      [...new Set(c.links.map((l) => ROTULO_DO_LINK[l.tipo] ?? l.tipo))].join(', '),
      c.equipamentos.map(rotuloDoEquipamento).join(', '),
      ...(f.comercial
        ? OFERTAS.map((o) => {
            const fase = c.ofertas[o.id]
            return fase ? ROTULO_FASE_COMERCIAL[fase] : 'Não se aplica'
          })
        : []),
      ...(f.comercial ? [c.retornoComercial ? dataCurta(c.retornoComercial) : ''] : []),
    ]),
  )
  baixarCsv(nomeDoArquivo(f, f.comercial ? '_comercial' : ''), csv)
  return casos.length
}

export async function exportarNumeros(f: FiltrosDaOperacao, eixo: Eixo): Promise<void> {
  const grao = graoDoTempo(f)
  const brutas = await lerGraficoDaOperacao(f, eixo === 'tempo' ? grao : eixo)
  const linhas: LinhaDoGrafico[] =
    eixo === 'tempo' ? linhasNoTempo(brutas, f, grao) : ordenarPorDimensao(eixo, brutas, 'casos')
  const primeira = (l: LinhaDoGrafico) =>
    eixo !== 'tempo' ? rotuloDaLinha(eixo, l) : grao === 'dia' ? dataCurta(l.chave) : l.chave.slice(5, 7) + '/' + l.chave.slice(0, 4)
  const csv = montarCsv(
    [
      eixo === 'tempo' ? (grao === 'dia' ? 'Dia' : 'Mês') : COLUNA_DO_EIXO[eixo],
      'Casos',
      'Partos',
      'Enviados',
      'No prazo',
      '% no prazo',
      'Mediana do parto ao envio (h)',
      'Despesas (R$)',
      'Cancelados',
    ],
    linhas.map((l) => [
      primeira(l),
      String(l.casos),
      String(l.partos),
      String(l.enviados),
      String(l.noPrazo),
      l.enviados > 0 ? String(Math.round((100 * l.noPrazo) / l.enviados)) : '',
      horas(l.medianaHorasAteEnvio),
      numeroParaCsv(l.totalDespesas),
      String(l.cancelados),
    ]),
  )
  baixarCsv(nomeDoArquivo(f, eixo === 'tempo' ? `_por-${grao}` : `_por-${eixo.replace('_', '-')}`), csv)
}
