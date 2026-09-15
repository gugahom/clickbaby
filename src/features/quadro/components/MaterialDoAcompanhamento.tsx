import { useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { Dropdown, type ItemDropdown } from '@/components/ui/Dropdown'
import {
  usePessoasAtivas,
  useRegistrarMaterial,
  type CampoMaterial,
} from '../api/useAcoes'
import { mensagemDeErro } from '../lib/erros'
import type { EtapaQuadro } from '../types'

/**
 * Os CEL CLICK da operação — seis aparelhos compartilhados (glossário do
 * CLAUDE.md). É SUGESTÃO, não trava: a coluna é texto, e o vídeo que saiu do
 * celular de alguém da equipe entra digitado ("CELULAR SARAH"). O sétimo
 * aparelho é uma linha aqui, não uma migration.
 */
const CELULARES = [1, 2, 3, 4, 5, 6].map((n) => `CEL CLICK ${n}`)

/** O item que esvazia o campo. `id` vazio é o que a RPC lê como "limpar". */
const LIMPAR: ItemDropdown = { id: '', rotulo: 'Limpar' }

/**
 * O MATERIAL DO ACOMPANHAMENTO — as quatro pílulas da planilha (15/09/2026).
 *
 * CARTÃO F, CARTÃO V, BAIXOU e UPLOAD, no espaço entre o nome da etapa e os
 * botões, em toda etapa de acompanhamento. É a faixa ENTRADA da planilha que
 * ainda não tinha lugar no sistema; ver a migration 20260915134638.
 *
 * SÓ NO PC, pedido do gestor e medido: quatro pílulas ao lado do nome e de três
 * botões não cabem em 375px, e empilhá-las embaixo dobraria a altura de cada
 * linha no celular — que é onde a etapa se conclui com uma mão (seção 6). O
 * corte é por CONTAINER, não por viewport: o que decide é a largura da lista de
 * etapas, e ela muda com o painel lateral e o modo TV mesmo numa tela grande.
 *
 * DUAS POR LINHA, em grade de largura fixa: as pílulas de uma etapa alinham com
 * as da etapa de baixo, e o olho lê a coluna "Cartão F" descendo pelo card como
 * lia a coluna da planilha.
 *
 * VAZIA É CONTORNO TRACEJADO com o rótulo; PREENCHIDA ganha a cor da marca —
 * mesmo código da estação (`CampoEstacao`), que é a pergunta equivalente do lado
 * da edição. Um traço vazio convida sem gritar; quatro caixas cheias de "—" em
 * cada etapa de cada card seriam ruído.
 */
export function MaterialDoAcompanhamento({
  etapa,
  onErro,
}: {
  etapa: EtapaQuadro
  onErro: (mensagem: string | null) => void
}) {
  const registrar = useRegistrarMaterial()

  function gravar(campo: CampoMaterial, valor: string) {
    onErro(null)
    registrar
      .mutateAsync({ casoEtapaId: etapa.id, campo, valor })
      .catch((e) => onErro(mensagemDeErro(e)))
  }

  return (
    <div
      role="group"
      aria-label="Material do acompanhamento"
      className={clsx(
        'hidden w-[19.5rem] flex-shrink-0 grid-cols-2 gap-1 @2xl:grid',
        registrar.isPending && 'opacity-60',
      )}
    >
      <CampoCartao valor={etapa.cartaoFoto} onSalvar={(v) => gravar('cartao_foto', v)} />
      <SeletorCartaoVideo valor={etapa.cartaoVideo} onEscolher={(v) => gravar('cartao_video', v)} />
      <SeletorPessoa
        rotulo="Baixou"
        pergunta="Quem baixou o material"
        pessoaId={etapa.baixouPorId}
        nome={etapa.baixouPorNome}
        onEscolher={(v) => gravar('baixou', v)}
      />
      <SeletorPessoa
        rotulo="Upload"
        pergunta="Quem fez o upload"
        pessoaId={etapa.uploadPorId}
        nome={etapa.uploadPorNome}
        onEscolher={(v) => gravar('upload', v)}
      />
    </div>
  )
}

/** A forma comum das quatro: rótulo pequeno à esquerda, valor forte à direita. */
function Pilula({
  rotulo,
  valor,
  titulo,
  children,
}: {
  rotulo: string
  valor: string | null
  titulo?: string
  children?: ReactNode
}) {
  return (
    <span
      title={titulo}
      className={clsx(
        'inline-flex h-6 w-full min-w-0 items-center gap-1.5 rounded-full border px-2 text-xs transition-colors',
        valor
          ? 'border-marca/15 bg-marca-suave text-marca'
          : 'border-dashed border-border text-muted-foreground hover:border-marca hover:text-marca',
      )}
    >
      <span className="flex-shrink-0 text-[10px] font-semibold tracking-wide uppercase opacity-75">
        {rotulo}
      </span>
      {children ?? (
        <span className={clsx('min-w-0 truncate', valor ? 'font-bold' : 'opacity-60')}>
          {valor ?? '—'}
        </span>
      )}
    </span>
  )
}

/**
 * CARTÃO F — digitado, porque "14 HSC" não cabe numa lista. Mesmo gesto da
 * estação: clica, digita, sai do campo. Salva no BLUR e no Enter, não a cada
 * tecla, e ressincroniza quando o valor do servidor muda (o Quadro é ao vivo).
 */
function CampoCartao({ valor, onSalvar }: { valor: string | null; onSalvar: (v: string) => void }) {
  const doServidor = valor ?? ''
  const [texto, setTexto] = useState(doServidor)
  const [ultimoVisto, setUltimoVisto] = useState(doServidor)
  const [aberto, setAberto] = useState(false)

  // Estado derivado de prop, ressincronizado na renderização — o mesmo padrão
  // de CampoEstacao, pelo mesmo motivo.
  if (doServidor !== ultimoVisto) {
    setUltimoVisto(doServidor)
    setTexto(doServidor)
  }

  function salvar() {
    setAberto(false)
    const limpo = texto.trim()
    if (limpo === doServidor) return
    onSalvar(limpo)
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label={valor ? `Cartão F: ${valor}` : 'Anotar o cartão F'}
        className="min-w-0 cursor-pointer text-left"
      >
        <Pilula rotulo="Cartão F" valor={valor} titulo="Cartão de memória da câmera" />
      </button>
    )
  }

  return (
    <span className="inline-flex h-6 w-full min-w-0 items-center gap-1.5 rounded-full border border-marca bg-card px-2 text-xs">
      <span className="flex-shrink-0 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        Cartão F
      </span>
      <input
        type="text"
        autoFocus
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={salvar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setTexto(doServidor)
            setAberto(false)
          }
        }}
        placeholder="10"
        aria-label="Cartão F"
        // O mesmo teto da constraint do banco: recusar aqui é mais gentil que
        // deixar digitar e devolver erro.
        maxLength={12}
        className="w-full min-w-0 bg-transparent font-bold text-foreground outline-none"
      />
    </span>
  )
}

/** O teto da constraint `caso_etapas_cartao_video_valido`. */
const MAXIMO_CARTAO_VIDEO = 24

/**
 * CARTÃO V — a lista dos CEL CLICK para o caso comum, e DIGITAR para o resto
 * (15/09/2026, pedido do gestor: "tem vezes que é CELULAR SARAH").
 *
 * É um campo só, e não uma lista com um "Outro…" que abre um segundo campo: o
 * mesmo teclado que filtra "4" até sobrar o CEL CLICK 4 escreve "celular sarah"
 * quando nada da lista serve, e o último item vira "Usar “CELULAR SARAH”".
 *
 * O TEXTO LIVRE VAI EM MAIÚSCULAS, como na planilha. Sem isso "Celular Sarah" e
 * "CELULAR SARAH" seriam dois aparelhos numa busca futura — o mesmo problema
 * que o prefixo fixo resolveu na estação.
 */
function SeletorCartaoVideo({
  valor,
  onEscolher,
}: {
  valor: string | null
  onEscolher: (v: string) => void
}) {
  const itens: ItemDropdown[] = CELULARES.map((c) => ({ id: c, rotulo: c }))
  // O valor digitado antes não está na lista dos CEL CLICK, e sem esta linha o
  // visto de "escolhido" não teria onde aparecer.
  if (valor && !CELULARES.includes(valor)) itens.unshift({ id: valor, rotulo: valor })

  return (
    <Dropdown
      compacto
      larguraCheia
      buscavel
      alinhamento="direita"
      className="min-w-0"
      rotulo={valor ? `Cartão V: ${valor}` : 'Celular que filmou'}
      placeholderBusca="Número ou nome do celular"
      textoLivre={(texto) => {
        const grafia = texto.toUpperCase().slice(0, MAXIMO_CARTAO_VIDEO)
        return { id: grafia, rotulo: `Usar “${grafia}”` }
      }}
      selecionado={valor ?? undefined}
      onEscolher={(item) => onEscolher(item.id)}
      itens={valor ? [...itens, LIMPAR] : itens}
      gatilho={
        <Pilula
          rotulo="Cartão V"
          // "CEL CLICK 4" vira "CEL 4" na pílula: o CLICK é o mesmo em todos e
          // come a largura que o nome de um celular digitado precisa.
          valor={valor ? valor.replace(/^CEL CLICK /, 'CEL ') : null}
          titulo={valor ?? 'Celular que filmou'}
        />
      }
    />
  )
}

/** BAIXOU e UPLOAD — lista de pessoas ativas, com busca por digitação. */
function SeletorPessoa({
  rotulo,
  pergunta,
  pessoaId,
  nome,
  onEscolher,
}: {
  rotulo: string
  pergunta: string
  pessoaId: string | null
  nome: string | null
  onEscolher: (v: string) => void
}) {
  const { data: pessoas } = usePessoasAtivas()
  const itens: ItemDropdown[] = (pessoas ?? []).map((p) => ({ id: p.id, rotulo: p.nome }))

  return (
    <Dropdown
      compacto
      larguraCheia
      buscavel
      className="min-w-0"
      rotulo={nome ? `${pergunta}: ${nome}` : pergunta}
      selecionado={pessoaId ?? undefined}
      onEscolher={(item) => onEscolher(item.id)}
      itens={pessoaId ? [...itens, LIMPAR] : itens}
      gatilho={
        <Pilula
          rotulo={rotulo}
          // Primeiro nome na pílula — o completo vai no `title`. É a mesma regra
          // da fita do card: sobrenome empurra o resto para fora e ninguém chama
          // a colega por ele no corredor.
          valor={nome ? (nome.trim().split(/\s+/)[0] ?? nome) : null}
          titulo={nome ?? pergunta}
        />
      }
    />
  )
}
