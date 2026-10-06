import { useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { CampoTexto } from '@/components/ui/CampoTexto'
import { Dialogo } from '@/components/ui/Dialogo'
import { Dropdown } from '@/components/ui/Dropdown'
import { EditorDeTexto } from '@/components/ui/EditorDeTexto'
import { useCadastros } from '@/features/quadro/api/useCadastros'
import { useCasoEditavel, useCriarCaso, useEditarCasoDoCalendario, type CasoEditavel } from '../api/useCalendario'
import { corDoGoogle, corDoParto } from '../lib/coresGoogle'
import { emBrasilia, rotuloDoDia } from '../lib/datas'
import { CLASSE_TERMO, EXPLICACAO_TERMO, OPCOES_TERMO, ROTULO_TERMO, termoSugerido } from '@/features/quadro/lib/termo'
import { IconeCheck } from '@/components/ui/icones'
import type { TermoStatus } from '@/features/quadro/types'

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
 *
 * EM DUAS COLUNAS, TUDO À VISTA (30/09/2026, pedido do gestor: "não gosto de
 * ele ficar extenso verticalmente e ter que ter um scroll"). À esquerda, o que
 * é o TÍTULO do evento — quem, pacote, onde, quando — e a prévia do Google; à
 * direita, o que se soma a ele — adicionais, termo e observações. No celular
 * as duas empilham, como antes.
 *
 * O TERMO DE IMAGEM JÁ NO CADASTRO (mesmo pedido): a pergunta mora também na
 * confirmação da entrega, e quem já sabe a resposta ao marcar o parto não
 * precisa esperar o fim do caso. É opcional aqui — sem resposta, a
 * confirmação continua cobrando — e o BIRTH abre em "Sem contrato", como lá.
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
  const [cesarea, setCesarea] = useState(caso?.cesareaEm ? emBrasilia(caso.cesareaEm).hora : '')
  const [observacao, setObservacao] = useState(caso?.observacao ?? '')
  const [clickHome, setClickHome] = useState(caso?.clickHome ?? false)
  const [fotolivro, setFotolivro] = useState(caso?.temFotolivro ?? false)
  // O termo ESCOLHIDO; enquanto ninguém tocou, vale o do caso ou a sugestão do
  // pacote (BIRTH = sem contrato), que acompanha a troca de pacote.
  const [termoEscolhido, setTermoEscolhido] = useState<TermoStatus | null | undefined>(undefined)
  const [erro, setErro] = useState<string | null>(null)
  const ocupado = criar.isPending || editar.isPending

  const pacote = cadastros.data?.pacotes.find((p) => p.id === pacoteId)
  // O MASTER + ÁLBUM já traz o Foto/Livro: a caixa aparece marcada e presa.
  const livroNoPacote = pacote ? /ALBUM/.test(pacote.nome.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase()) : false
  const termo =
    termoEscolhido !== undefined ? termoEscolhido : (caso?.termo ?? termoSugerido(pacote?.slug ?? null))
  const maternidade = cadastros.data?.maternidades.find((m) => m.id === maternidadeId)
  // EVENTO e NEWBORN (30/09/2026) não são parto: o evento guarda "EVENTO" como
  // mãe e o NOME do evento no lugar do bebê, e nenhum dos dois leva adicional.
  const ehEvento = pacote?.nome === 'EVENTO'
  const ehNewborn = pacote?.nome === 'NEWBORN'
  const maeEfetiva = ehEvento ? 'EVENTO' : maeNome
  const temBarra = maeEfetiva.includes('/') || bebeNome.includes('/')
  const falta = [
    !ehEvento && maeNome.trim() === '' && 'o nome da mãe',
    ehEvento && bebeNome.trim() === '' && 'o nome do evento',
    !pacote && 'o pacote',
    !maternidade && 'a maternidade',
    dia === '' && 'o dia',
  ].filter(Boolean) as string[]
  const trocouPacote = caso?.pacoteId != null && pacoteId !== caso.pacoteId
  const horaAntes = caso?.semHora ? '' : (antes?.hora ?? '')
  const mudouQuando = antes !== null && (dia !== antes.dia || hora !== horaAntes)

  // O mesmo formato que o sync escreve no Google (evento-do-caso.ts) — aqui só
  // para MOSTRAR; quem escreve de verdade é o sync.
  const sigla = maternidade?.sigla ?? 'MATERNIDADE'
  const bebeTitulo = bebeNome.trim().toUpperCase() || 'BEBÊ'
  const titulo = ehEvento
    ? `EVENTO/${bebeNome.trim().toUpperCase() || 'NOME DO EVENTO'} - ${sigla}`
    : ehNewborn
      ? `NEWBORN/${maeNome.trim().toUpperCase() || 'MÃE'}/${bebeTitulo} - ${sigla}`
      : `${maeNome.trim().toUpperCase() || 'MÃE'}/${bebeTitulo} - ${pacote?.nome ?? 'PACOTE'}${
          clickHome ? ' + CLICK HOME' : ''
        } - ${sigla}`
  const cor = corDoGoogle(pacote?.cor_calendar ?? maternidade?.cor_calendar)

  function salvar() {
    if (falta.length > 0 || temBarra) return
    setErro(null)
    const dados = {
      maeNome: maeEfetiva,
      bebeNome,
      pacoteId,
      maternidadeId,
      dia,
      hora,
      cesarea: ehEvento || ehNewborn ? '' : cesarea,
      observacao,
      clickHome: clickHome && !ehEvento && !ehNewborn,
      fotolivro: fotolivro && !ehEvento && !ehNewborn,
      termo,
    }
    const feito = caso
      ? editar.mutateAsync({ ...dados, casoId: caso.id, termoAntes: caso.termo })
      : criar.mutateAsync(dados)
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
      largo
      onConfirmar={salvar}
      onCancelar={onFechar}
    >
      <div className="grid gap-x-6 gap-y-4 md:grid-cols-[minmax(0,8fr)_minmax(0,6fr)]">
        {/* O TÍTULO DO EVENTO: quem, pacote, onde, quando — e como fica no Google. */}
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {!ehEvento && <CampoTexto rotulo="Mãe" valor={maeNome} aoMudar={setMaeNome} autoFocus={!caso} />}
            {ehEvento ? (
              <CampoTexto rotulo="Nome do evento" valor={bebeNome} aoMudar={setBebeNome} ajuda="Ex.: MKT, 60 ANOS, ENFERMAGEM." />
            ) : (
              <CampoTexto rotulo="Bebê" valor={bebeNome} aoMudar={setBebeNome} opcional ajuda="Sem nome ainda? Deixe vazio." />
            )}
          </div>
          {temBarra && <p className="text-sm font-semibold text-atrasado">O nome não pode ter barra (/): ela separa mãe e bebê na agenda.</p>}

          <div className="grid gap-3 sm:grid-cols-2">
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
          </div>
          {trocouPacote && (
            <p className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Trocar o pacote acrescenta as etapas que faltam no caso. As que ele já tem ficam — se alguma não vai
              acontecer, dispense no Quadro.
            </p>
          )}

          <div
            className={clsx(
              'grid gap-3',
              ehEvento || ehNewborn
                ? 'grid-cols-2'
                : 'grid-cols-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]',
            )}
          >
            <CampoTexto rotulo="Dia" type="date" valor={dia} aoMudar={setDia} {...(dia ? { ajuda: rotuloDoDia(dia) } : {})} />
            <CampoTexto
              rotulo="Hora prevista"
              type="time"
              valor={hora}
              aoMudar={setHora}
              opcional
              ajuda={hora === '' ? 'A definir: dia inteiro no Google.' : 'Apague para deixar a definir.'}
            />
            {!ehEvento && !ehNewborn && (
              <CampoTexto rotulo="Cesárea" type="time" valor={cesarea} aoMudar={setCesarea} opcional ajuda="Hora da cirurgia." />
            )}
          </div>
          {mudouQuando && antes && (
            <p className="text-xs font-semibold text-foreground">
              Antes: {rotuloDoDia(antes.dia)}, {horaAntes ? `às ${horaAntes}` : 'hora a definir'}.
            </p>
          )}

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
        </div>

        {/* O QUE SE SOMA AO CASO: adicionais, termo, observações. */}
        <div className="space-y-3">
          {!ehEvento && !ehNewborn && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Marcador
                rotulo="New Born"
                marcado={clickHome}
                travado={caso?.clickHome === true}
                aoMudar={setClickHome}
                ajuda={caso?.clickHome ? 'Já no caso — dispense na seção.' : 'Click Home vendido junto'}
              />
              <Marcador
                rotulo="Foto/Livro"
                marcado={fotolivro || livroNoPacote}
                travado={caso?.temFotolivro === true || livroNoPacote}
                aoMudar={setFotolivro}
                ajuda={
                  livroNoPacote ? 'Já vem no pacote.' : caso?.temFotolivro ? 'Já no caso — dispense na seção.' : 'Fotolivro vendido junto'
                }
              />
            </div>
          )}

          <fieldset>
            <legend className="text-sm font-medium">
              Termo de imagem <span className="font-normal text-muted-foreground">(opcional)</span>
            </legend>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {OPCOES_TERMO.map((t) => {
                const ativo = termo === t
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={ativo}
                    // Tocar no marcado desmarca: "ninguém perguntou ainda" é
                    // uma resposta válida no cadastro.
                    onClick={() => setTermoEscolhido(ativo ? null : t)}
                    // O desenho do seletor da confirmação de entrega (`SeletorDeTermo`),
                    // com um ✓ na escolhida: "Sem contrato" é neutro, e sem o ✓
                    // marcado e desmarcado quase não se distinguiam.
                    className={clsx(
                      'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border px-3 text-sm font-bold transition-colors',
                      ativo
                        ? clsx('border-transparent', CLASSE_TERMO[t])
                        : 'border-border text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {ativo && <IconeCheck className="size-4 flex-shrink-0" />}
                    {ROTULO_TERMO[t]}
                  </button>
                )
              })}
            </div>
            <span className="mt-1 block text-xs text-muted-foreground">
              {termo === null
                ? 'Sem resposta, a confirmação da entrega continua perguntando.'
                : `${EXPLICACAO_TERMO[termo]}${caso?.termo && termo !== caso.termo ? ` Antes: ${ROTULO_TERMO[caso.termo]}.` : ''}`}
            </span>
          </fieldset>

          {/* <div> e não <label>: um rótulo sem `for` aciona o primeiro
              controle de dentro, e aqui ele seria o botão de negrito. */}
          <div>
            <span className="text-sm font-medium">
              Observações <span className="font-normal text-muted-foreground">(opcional)</span>
            </span>
            <EditorDeTexto
              valor={observacao}
              onMudar={setObservacao}
              rotulo="Observações"
              linhas={ehEvento || ehNewborn ? 6 : 4}
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              {!caso || caso.criadoPeloSistema
                ? 'Vai na descrição do evento no Google, com a formatação.'
                : 'Fica no sistema. A descrição do evento no Google é da equipe e não muda.'}
            </span>
          </div>
        </div>

        {falta.length > 0 && !temBarra && (
          <p className="text-xs text-muted-foreground md:col-span-2">Falta {falta.join(', ')}.</p>
        )}
      </div>
    </Dialogo>
  )
}

/** Uma caixa de marcar do tamanho de um alvo de dedo, com uma linha de ajuda. */
function Marcador({
  rotulo,
  marcado,
  travado,
  aoMudar,
  ajuda,
}: {
  rotulo: string
  marcado: boolean
  travado: boolean
  aoMudar: (v: boolean) => void
  ajuda: string
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-1.5">
      <input
        type="checkbox"
        checked={marcado}
        disabled={travado}
        onChange={(e) => aoMudar(e.target.checked)}
        className="size-5 flex-shrink-0 accent-marca"
      />
      <span className="min-w-0 text-sm leading-tight">
        <span className="block font-semibold text-foreground">{rotulo}</span>
        <span className="block text-xs text-muted-foreground">{ajuda}</span>
      </span>
    </label>
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
