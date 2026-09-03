import { useState } from 'react'
import { Dropdown } from '@/components/ui/Dropdown'
import { Dialogo } from '@/components/ui/Dialogo'
import { CampoTexto } from '@/components/ui/CampoTexto'
import { useCadastros } from '../api/useCadastros'
import { useEditarCaso } from '../api/useEditarCaso'
import { mensagemDeErro } from '../lib/erros'
import type { CasoQuadro } from '../types'

interface PropsEditarCasoDialogo {
  caso: CasoQuadro
  onFechar: () => void
}

/**
 * Completar o cadastro de um caso — na prática, padronizar um rascunho.
 *
 * O gesto que este diálogo existe para servir: 47 dos 88 casos vieram do
 * Calendar sem pacote ou sem maternidade, porque o parser se recusa a
 * adivinhar (seção 7). Até aqui a única saída era mexer no banco. Agora é uma
 * tela, e o caso entra no fluxo com o checklist de etapas certo — gerado pela
 * trigger, não por este formulário (ver useEditarCaso).
 *
 * Seleção, não digitação, nos dois campos que importam (seção 6): pacote e
 * maternidade são listas fechadas. Digitar "BABY RELS" às 3h criaria um caso
 * com checklist errado, que é justamente o que o rascunho existe para evitar.
 * Nome de mãe e bebê são texto porque não há de onde escolher.
 */
export function EditarCasoDialogo({ caso, onFechar }: PropsEditarCasoDialogo) {
  const { data: cadastros, isPending: carregandoCadastros } = useCadastros(true)
  const editar = useEditarCaso()
  const [erro, setErro] = useState<string | null>(null)

  const [maeNome, setMaeNome] = useState(caso.maeNome)
  const [bebeNome, setBebeNome] = useState(caso.bebeNome ?? '')
  const [pacoteId, setPacoteId] = useState(caso.pacoteId ?? '')
  const [maternidadeId, setMaternidadeId] = useState(caso.maternidadeId ?? '')

  const semNome = maeNome.trim() === ''

  function salvar() {
    setErro(null)
    editar
      .mutateAsync({
        casoId: caso.id,
        maeNome,
        bebeNome,
        pacoteId: pacoteId === '' ? null : pacoteId,
        maternidadeId: maternidadeId === '' ? null : maternidadeId,
      })
      .then(onFechar)
      .catch((e) => setErro(mensagemDeErro(e)))
  }

  return (
    <Dialogo
      titulo="Completar cadastro"
      rotuloConfirmar={editar.isPending ? 'Salvando…' : 'Salvar'}
      confirmarDesabilitado={semNome || carregandoCadastros}
      ocupado={editar.isPending}
      erro={erro}
      onConfirmar={salvar}
      onCancelar={onFechar}
    >
      <div className="space-y-4">
        {caso.ehRascunho && (
          <p className="rounded-md border border-rascunho-borda bg-rascunho-fundo px-3 py-2 text-sm text-rascunho">
            Preencher o pacote coloca o caso no fluxo e cria o checklist de etapas
            automaticamente.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto rotulo="Mãe" valor={maeNome} aoMudar={setMaeNome} />
          <CampoTexto rotulo="Bebê" valor={bebeNome} aoMudar={setBebeNome} opcional />
        </div>

        <Selecao
          rotulo="Pacote"
          valor={pacoteId}
          aoMudar={setPacoteId}
          carregando={carregandoCadastros}
          faltando={caso.faltaPacote}
          opcoes={(cadastros?.pacotes ?? []).map((p) => ({ valor: p.id, rotulo: p.nome }))}
        />

        <Selecao
          rotulo="Maternidade"
          valor={maternidadeId}
          aoMudar={setMaternidadeId}
          carregando={carregandoCadastros}
          faltando={caso.faltaMaternidade}
          opcoes={(cadastros?.maternidades ?? []).map((m) => ({
            valor: m.id,
            rotulo: `${m.sigla} — ${m.nome}`,
          }))}
        />
      </div>
    </Dialogo>
  )
}

function Selecao({
  rotulo,
  valor,
  aoMudar,
  opcoes,
  carregando,
  faltando,
}: {
  rotulo: string
  valor: string
  aoMudar: (v: string) => void
  opcoes: { valor: string; rotulo: string }[]
  carregando: boolean
  faltando: boolean
}) {
  return (
    /*
      <div> e não <label>: o gatilho agora é um <button>, e um label envolvendo
      um botão faz o clique no texto DISPARAR o botão — o painel abriria ao
      tocar no rótulo, que é exatamente onde a pessoa não clica de propósito.
    */
    <div>
      <span className="flex items-center gap-2 text-sm font-medium">
        {rotulo}
        {faltando && (
          <span className="rounded border border-rascunho-borda bg-rascunho-fundo px-1.5 py-0.5 text-[11px] font-medium text-rascunho">
            faltando
          </span>
        )}
      </span>
      <div className="mt-1.5">
        <Dropdown
          rotulo={carregando ? 'Carregando…' : '— não definido —'}
          desabilitado={carregando}
          selecionado={valor}
          onEscolher={(item) => aoMudar(item.id)}
          itens={[
            // O "nada" é um item da lista, e não uma opção vazia: num rascunho,
            // desfazer uma escolha errada precisa ser tão alcançável quanto
            // fazê-la.
            { id: '', rotulo: '— não definido —' },
            ...opcoes.map((o) => ({ id: o.valor, rotulo: o.rotulo })),
          ]}
        />
      </div>
    </div>
  )
}
