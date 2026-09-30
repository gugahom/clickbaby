import { useState } from 'react'
import clsx from 'clsx'
import { CampoTexto } from '@/components/ui/CampoTexto'
import { Dialogo } from '@/components/ui/Dialogo'
import { useCadastros } from '@/features/quadro/api/useCadastros'
import { useCriarCaso } from '../api/useCalendario'
import { corDoGoogle } from '../lib/coresGoogle'
import { rotuloDoDia } from '../lib/datas'

/**
 * NOVO CASO PELO CALENDÁRIO (30/09/2026, pedido do gestor: "criar casos através
 * do calendário (…) com o que já sabemos que é necessário para criar os casos").
 *
 * É O TÍTULO DO GOOGLE VIRADO FORMULÁRIO. A equipe escreve na agenda
 * "MÃE/BEBÊ - PACOTE - MATERNIDADE", com "+ CLICK HOME" quando há New Born — e
 * cada pedaço virou um campo. A diferença é que pacote e maternidade aqui são
 * ESCOLHIDOS, não digitados (seção 6): o parser do sync precisa adivinhar
 * "BABY RELS" e, quando não consegue, o caso vira rascunho pendente. Daqui ele
 * sai sempre inteiro, com o checklist certo.
 *
 * A COR VEM SOZINHA, pela regra do cadastro (BIRTH é tomate; o resto segue a
 * maternidade), e o formulário a mostra antes de salvar, junto com o título
 * que vai aparecer no Google — quem cria vê o evento como a equipe vai vê-lo.
 */
export function NovoCasoDialogo({
  diaInicial,
  onCriado,
  onFechar,
}: {
  diaInicial: string
  onCriado: (dia: string) => void
  onFechar: () => void
}) {
  const cadastros = useCadastros(true)
  const criar = useCriarCaso()
  const [maeNome, setMaeNome] = useState('')
  const [bebeNome, setBebeNome] = useState('')
  const [pacoteId, setPacoteId] = useState('')
  const [maternidadeId, setMaternidadeId] = useState('')
  const [dia, setDia] = useState(diaInicial)
  const [hora, setHora] = useState('')
  const [clickHome, setClickHome] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const pacote = cadastros.data?.pacotes.find((p) => p.id === pacoteId)
  const maternidade = cadastros.data?.maternidades.find((m) => m.id === maternidadeId)
  const temBarra = maeNome.includes('/') || bebeNome.includes('/')
  const falta = [
    maeNome.trim() === '' && 'o nome da mãe',
    !pacote && 'o pacote',
    !maternidade && 'a maternidade',
    dia === '' && 'o dia',
    hora === '' && 'a hora',
  ].filter(Boolean) as string[]

  // O mesmo formato que o sync escreve no Google (evento-do-caso.ts) — aqui só
  // para MOSTRAR; quem escreve de verdade é o sync.
  const titulo = `${maeNome.trim().toUpperCase() || 'MÃE'}/${bebeNome.trim().toUpperCase() || 'BEBÊ'} - ${
    pacote?.nome ?? 'PACOTE'
  }${clickHome ? ' + CLICK HOME' : ''} - ${maternidade?.sigla ?? 'MATERNIDADE'}`
  const cor = corDoGoogle(pacote?.cor_calendar ?? maternidade?.cor_calendar)

  function salvar() {
    if (falta.length > 0 || temBarra) return
    setErro(null)
    criar
      .mutateAsync({ maeNome, bebeNome, pacoteId, maternidadeId, dia, hora, clickHome })
      .then(() => onCriado(dia))
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : 'Não deu para criar o caso.'))
  }

  return (
    <Dialogo
      titulo="Novo caso"
      rotuloConfirmar={criar.isPending ? 'Criando…' : 'Criar caso'}
      confirmarDesabilitado={falta.length > 0 || temBarra || cadastros.isPending}
      ocupado={criar.isPending}
      erro={erro}
      onConfirmar={salvar}
      onCancelar={onFechar}
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoTexto rotulo="Mãe" valor={maeNome} aoMudar={setMaeNome} autoFocus />
          <CampoTexto rotulo="Bebê" valor={bebeNome} aoMudar={setBebeNome} opcional ajuda="Se ainda não tiver nome, deixe vazio." />
        </div>
        {temBarra && <p className="text-sm font-semibold text-atrasado">O nome não pode ter barra (/): ela separa mãe e bebê na agenda.</p>}

        <Escolha
          rotulo="Pacote"
          valor={pacoteId}
          aoMudar={setPacoteId}
          carregando={cadastros.isPending}
          opcoes={(cadastros.data?.pacotes ?? []).map((p) => ({ valor: p.id, rotulo: p.nome }))}
        />
        <Escolha
          rotulo="Maternidade"
          valor={maternidadeId}
          aoMudar={setMaternidadeId}
          carregando={cadastros.isPending}
          opcoes={(cadastros.data?.maternidades ?? []).map((m) => ({ valor: m.id, rotulo: m.sigla, dica: m.nome }))}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <CampoTexto rotulo="Dia" type="date" valor={dia} aoMudar={setDia} {...(dia ? { ajuda: rotuloDoDia(dia) } : {})} />
          <CampoTexto rotulo="Hora prevista" type="time" valor={hora} aoMudar={setHora} />
        </div>

        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border px-3">
          <input
            type="checkbox"
            checked={clickHome}
            onChange={(e) => setClickHome(e.target.checked)}
            className="size-5 accent-marca"
          />
          <span className="text-sm">
            <span className="font-semibold text-foreground">New Born</span>
            <span className="text-muted-foreground"> — o ensaio Click Home foi vendido junto</span>
          </span>
        </label>

        <div className="rounded-xl bg-muted/50 px-3 py-2.5 text-sm">
          <div className="text-xs font-semibold text-muted-foreground">Vai aparecer no Google Calendar assim:</div>
          <div className="mt-1 flex items-center gap-2">
            <span
              className="size-3 flex-shrink-0 rounded-full border border-border"
              style={{ backgroundColor: cor?.hex ?? 'transparent' }}
              aria-hidden="true"
            />
            <span className="min-w-0 truncate font-semibold text-foreground">{titulo}</span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {cor ? `Cor ${cor.nome}` : 'Cor padrão da agenda'}
            {pacote?.cor_calendar ? ' (regra do pacote)' : maternidade?.cor_calendar ? ' (regra da maternidade)' : ''} · entra na
            agenda em até um minuto.
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
 * Uma lista curta de escolhas em pílulas: nove pacotes e oito maternidades
 * cabem à vista, e um toque escolhe — sem abrir menu, que num diálogo pequeno
 * é um segundo painel por cima do primeiro.
 */
function Escolha({
  rotulo,
  valor,
  aoMudar,
  opcoes,
  carregando,
}: {
  rotulo: string
  valor: string
  aoMudar: (v: string) => void
  opcoes: { valor: string; rotulo: string; dica?: string }[]
  carregando: boolean
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{rotulo}</legend>
      {carregando ? (
        <p className="mt-1.5 text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {opcoes.map((o) => (
            <button
              key={o.valor}
              type="button"
              aria-pressed={valor === o.valor}
              title={o.dica}
              onClick={() => aoMudar(o.valor)}
              className={clsx(
                'min-h-10 rounded-full border px-3.5 text-sm transition-colors',
                valor === o.valor
                  ? 'border-marca bg-marca font-bold text-white'
                  : 'border-border font-medium text-foreground hover:border-marca/40 hover:bg-marca-suave',
              )}
            >
              {o.rotulo}
            </button>
          ))}
        </div>
      )}
    </fieldset>
  )
}
