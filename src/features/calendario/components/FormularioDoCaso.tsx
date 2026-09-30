import { useState, type ReactNode } from 'react'
import { CampoTexto } from '@/components/ui/CampoTexto'
import { Dialogo } from '@/components/ui/Dialogo'
import { Dropdown } from '@/components/ui/Dropdown'
import { useCadastros } from '@/features/quadro/api/useCadastros'
import { useCasoEditavel, useCriarCaso, useEditarCasoDoCalendario, type CasoEditavel } from '../api/useCalendario'
import { corDoGoogle, corDoParto } from '../lib/coresGoogle'
import { emBrasilia, rotuloDoDia } from '../lib/datas'

/**
 * O CASO PELO CALENDÁRIO — criar (30/09/2026, pedido do gestor: "criar casos
 * através do calendário (…) com o que já sabemos que é necessário para criar os
 * casos") e editar (mesmo dia, "poder editar").
 *
 * É O TÍTULO DO GOOGLE VIRADO FORMULÁRIO. A equipe escreve na agenda
 * "MÃE/BEBÊ - PACOTE - MATERNIDADE", com "+ CLICK HOME" quando há New Born — e
 * cada pedaço virou um campo. A diferença é que pacote e maternidade aqui são
 * ESCOLHIDOS, não digitados (seção 6): o parser do sync precisa adivinhar
 * "BABY RELS" e, quando não consegue, o caso vira rascunho pendente. Daqui ele
 * sai sempre inteiro, com o checklist certo.
 *
 * LISTA COM BUSCA, e não pílulas (segunda volta do gestor): digitar "hs" e
 * ver HSC e HNSG é mais rápido que caçar a pílula entre dezessete — e a busca
 * só FILTRA, o valor continua escolhido de uma lista fechada. Cada opção traz
 * a bolinha da cor que ela dá no Google.
 *
 * A COR VEM SOZINHA, pela regra do cadastro (BIRTH é tomate; o resto segue a
 * maternidade), e o formulário a mostra antes de salvar, junto com o título
 * que vai aparecer no Google — quem cria vê o evento como a equipe vai vê-lo.
 *
 * EDITAR abre com o caso como ele está, e o que mudar vai para o evento do
 * Google no ciclo seguinte do sync (`editar_caso`). O New Born só se marca —
 * desfazer é na seção dele, que dispensa a etapa. ARRASTAR um item no
 * calendário abre este formulário já com o dia e a hora do lugar onde ele foi
 * solto: nada muda sem a pessoa conferir e salvar.
 */
export interface Proposta {
  dia: string
  /** Nulo = manter a hora que o caso já tem. */
  hora: string | null
}

export function NovoCasoDialogo({
  diaInicial,
  onCriado,
  onFechar,
}: {
  diaInicial: string
  onCriado: (dia: string) => void
  onFechar: () => void
}) {
  return <FormularioDoCaso proposta={{ dia: diaInicial, hora: null }} onPronto={onCriado} onFechar={onFechar} />
}

/** Carrega o caso como está no banco e abre o formulário nele. */
export function EditarCasoDialogo({
  casoId,
  proposta,
  onPronto,
  onFechar,
}: {
  casoId: string
  proposta: Proposta | null
  onPronto: (dia: string) => void
  onFechar: () => void
}) {
  const caso = useCasoEditavel(casoId)
  if (!caso.data) {
    return (
      <Dialogo
        titulo="Editar caso"
        rotuloConfirmar="Fechar"
        soFechar
        erro={caso.error ? caso.error.message : null}
        onConfirmar={onFechar}
        onCancelar={onFechar}
      >
        {!caso.error && <p className="text-sm text-muted-foreground">Carregando o caso…</p>}
      </Dialogo>
    )
  }
  return <FormularioDoCaso caso={caso.data} proposta={proposta} onPronto={onPronto} onFechar={onFechar} />
}

function FormularioDoCaso({
  caso,
  proposta,
  onPronto,
  onFechar,
}: {
  caso?: CasoEditavel
  proposta: Proposta | null
  onPronto: (dia: string) => void
  onFechar: () => void
}) {
  const cadastros = useCadastros(true)
  const criar = useCriarCaso()
  const editar = useEditarCasoDoCalendario()
  const antes = caso?.previsaoEm ? emBrasilia(caso.previsaoEm) : null
  const [maeNome, setMaeNome] = useState(caso?.maeNome ?? '')
  // "BEBÊ" é o que o sync grava quando o título não tem nome (o título precisa
  // da barra): no formulário, é o campo vazio.
  const [bebeNome, setBebeNome] = useState(caso?.bebeNome && caso.bebeNome !== 'BEBÊ' ? caso.bebeNome : '')
  const [pacoteId, setPacoteId] = useState(caso?.pacoteId ?? '')
  const [maternidadeId, setMaternidadeId] = useState(caso?.maternidadeId ?? '')
  const [dia, setDia] = useState(proposta?.dia ?? antes?.dia ?? '')
  // Hora a definir abre com o campo vazio — a meia-noite guardada não é hora.
  const [hora, setHora] = useState(proposta?.hora ?? (caso?.semHora ? '' : (antes?.hora ?? '')))
  const [clickHome, setClickHome] = useState(caso?.clickHome ?? false)
  const [erro, setErro] = useState<string | null>(null)
  const ocupado = criar.isPending || editar.isPending

  const pacote = cadastros.data?.pacotes.find((p) => p.id === pacoteId)
  const maternidade = cadastros.data?.maternidades.find((m) => m.id === maternidadeId)
  const temBarra = maeNome.includes('/') || bebeNome.includes('/')
  const falta = [
    maeNome.trim() === '' && 'o nome da mãe',
    !pacote && 'o pacote',
    !maternidade && 'a maternidade',
    dia === '' && 'o dia',
  ].filter(Boolean) as string[]
  const trocouPacote = caso?.pacoteId != null && pacoteId !== caso.pacoteId
  const horaAntes = caso?.semHora ? '' : (antes?.hora ?? '')
  const mudouQuando = antes !== null && (dia !== antes.dia || hora !== horaAntes)

  // O mesmo formato que o sync escreve no Google (evento-do-caso.ts) — aqui só
  // para MOSTRAR; quem escreve de verdade é o sync.
  const titulo = `${maeNome.trim().toUpperCase() || 'MÃE'}/${bebeNome.trim().toUpperCase() || 'BEBÊ'} - ${
    pacote?.nome ?? 'PACOTE'
  }${clickHome ? ' + CLICK HOME' : ''} - ${maternidade?.sigla ?? 'MATERNIDADE'}`
  const cor = corDoGoogle(pacote?.cor_calendar ?? maternidade?.cor_calendar)

  function salvar() {
    if (falta.length > 0 || temBarra) return
    setErro(null)
    const dados = { maeNome, bebeNome, pacoteId, maternidadeId, dia, hora, clickHome }
    const feito = caso ? editar.mutateAsync({ ...dados, casoId: caso.id }) : criar.mutateAsync(dados)
    feito
      .then(() => onPronto(dia))
      .catch((e: unknown) =>
        setErro(e instanceof Error ? e.message : caso ? 'Não deu para salvar o caso.' : 'Não deu para criar o caso.'),
      )
  }

  const rotuloConfirmar = caso ? (editar.isPending ? 'Salvando…' : 'Salvar') : criar.isPending ? 'Criando…' : 'Criar caso'
  const quandoChega = !caso
    ? ' · entra na agenda em até um minuto.'
    : caso.noGoogle
      ? ' · a agenda acompanha em até um minuto.'
      : ' · este caso não tem evento no Google, então a mudança fica só aqui.'

  return (
    <Dialogo
      titulo={caso ? 'Editar caso' : 'Novo caso'}
      rotuloConfirmar={rotuloConfirmar}
      confirmarDesabilitado={falta.length > 0 || temBarra || cadastros.isPending}
      ocupado={ocupado}
      erro={erro}
      onConfirmar={salvar}
      onCancelar={onFechar}
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoTexto rotulo="Mãe" valor={maeNome} aoMudar={setMaeNome} autoFocus={!caso} />
          <CampoTexto rotulo="Bebê" valor={bebeNome} aoMudar={setBebeNome} opcional ajuda="Se ainda não tiver nome, deixe vazio." />
        </div>
        {temBarra && <p className="text-sm font-semibold text-atrasado">O nome não pode ter barra (/): ela separa mãe e bebê na agenda.</p>}

        <Escolha
          rotulo="Pacote"
          valor={pacoteId}
          aoMudar={setPacoteId}
          carregando={cadastros.isPending}
          buscarPor="Buscar pacote"
          opcoes={(cadastros.data?.pacotes ?? []).map((p) => ({ valor: p.id, rotulo: p.nome, cor: p.cor_calendar }))}
        />
        <Escolha
          rotulo="Maternidade"
          valor={maternidadeId}
          aoMudar={setMaternidadeId}
          carregando={cadastros.isPending}
          buscarPor="Buscar maternidade"
          opcoes={(cadastros.data?.maternidades ?? []).map((m) => ({
            valor: m.id,
            rotulo: `${m.sigla} — ${m.nome}`,
            cor: m.cor_calendar,
          }))}
        />
        {trocouPacote && (
          <p className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Trocar o pacote acrescenta as etapas que faltam no caso. As que ele já tem ficam — se alguma não vai
            acontecer, dispense no Quadro.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <CampoTexto rotulo="Dia" type="date" valor={dia} aoMudar={setDia} {...(dia ? { ajuda: rotuloDoDia(dia) } : {})} />
          <CampoTexto
            rotulo="Hora prevista"
            type="time"
            valor={hora}
            aoMudar={setHora}
            opcional
            ajuda={hora === '' ? 'Hora a definir: no Google fica como dia inteiro.' : 'Apague para deixar a definir.'}
          />
        </div>
        {mudouQuando && antes && (
          <p className="text-xs font-semibold text-foreground">
            Antes: {rotuloDoDia(antes.dia)}, {horaAntes ? `às ${horaAntes}` : 'hora a definir'}.
          </p>
        )}

        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border px-3">
          <input
            type="checkbox"
            checked={clickHome}
            disabled={caso?.clickHome === true}
            onChange={(e) => setClickHome(e.target.checked)}
            className="size-5 accent-marca"
          />
          <span className="text-sm">
            <span className="font-semibold text-foreground">New Born</span>
            <span className="text-muted-foreground">
              {caso?.clickHome
                ? ' — já faz parte do caso. Se não vai acontecer, dispense na seção New Born.'
                : ' — o ensaio Click Home foi vendido junto'}
            </span>
          </span>
        </label>

        <div className="rounded-xl bg-muted/50 px-3 py-2.5 text-sm">
          <div className="text-xs font-semibold text-muted-foreground">
            {caso ? 'O evento no Google Calendar vai ficar assim:' : 'Vai aparecer no Google Calendar assim:'}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span
              className="size-3 flex-shrink-0 rounded-full border border-border"
              style={{ backgroundColor: corDoParto(pacote?.cor_calendar ?? maternidade?.cor_calendar).hex }}
              aria-hidden="true"
            />
            <span className="min-w-0 truncate font-semibold text-foreground">{titulo}</span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {cor ? `Cor ${cor.nome}` : 'Cor padrão da agenda'}
            {pacote?.cor_calendar ? ' (regra do pacote)' : maternidade?.cor_calendar ? ' (regra da maternidade)' : ''}
            {quandoChega}
          </div>
        </div>

        {falta.length > 0 && !temBarra && (
          <p className="text-xs text-muted-foreground">Falta {falta.join(', ')}.</p>
        )}
      </div>
    </Dialogo>
  )
}

/**
 * Uma lista fechada com busca (o `Dropdown` da casa, `buscavel`). A bolinha de
 * cada opção é a cor que ela dá no Google; sem regra, só o contorno — a cor
 * padrão da agenda.
 */
function Escolha({
  rotulo,
  valor,
  aoMudar,
  opcoes,
  carregando,
  buscarPor,
}: {
  rotulo: string
  valor: string
  aoMudar: (v: string) => void
  opcoes: { valor: string; rotulo: string; cor: string | null }[]
  carregando: boolean
  buscarPor: string
}) {
  const bolinha = (cor: string | null): ReactNode => (
    <span
      className="block size-3 rounded-full border border-border"
      style={{ backgroundColor: cor ? corDoParto(cor).hex : 'transparent' }}
      aria-hidden="true"
    />
  )
  return (
    // <div> e não <label>, como no editor de cadastro: um label envolvendo o
    // botão do gatilho abriria a lista ao tocar no rótulo.
    <div>
      <span className="text-sm font-medium">{rotulo}</span>
      <div className="mt-1.5">
        <Dropdown
          buscavel
          larguraCheia
          placeholderBusca={buscarPor}
          rotulo={carregando ? 'Carregando…' : `Escolha ${rotulo.toLowerCase() === 'pacote' ? 'o pacote' : 'a maternidade'}`}
          desabilitado={carregando}
          selecionado={valor || undefined}
          onEscolher={(item) => aoMudar(item.id)}
          itens={opcoes.map((o) => ({ id: o.valor, rotulo: o.rotulo, icone: bolinha(o.cor) }))}
        />
      </div>
    </div>
  )
}
