import { useState } from 'react'
import { Dialogo } from '@/components/ui/Dialogo'
import { CampoTexto } from '@/components/ui/CampoTexto'
import { BotaoIcone } from '@/components/ui/BotaoIcone'
import { IconeCopiar } from '@/components/ui/icones'
import { useEntregaveis, type TipoEntregavel } from '../api/useAcoes'
import type { LinkExigido } from '../lib/links-da-conclusao'
import { ROTULO_ETAPA, type CasoQuadro, type EtapaQuadro } from '../types'

interface PropsConcluirComLinks {
  caso: CasoQuadro
  etapa: EtapaQuadro
  exigidos: LinkExigido[]
  ocupado: boolean
  erro: string | null
  onCancelar: () => void
  onConfirmar: (
    entregaveis: { tipo: TipoEntregavel; url: string }[],
    observacao: string,
  ) => void
}

/**
 * Concluir a etapa de edição PEDINDO o link no mesmo gesto.
 *
 * Regra do gestor em 04/09/2026: o link é pedido na conclusão da edição, e não
 * só no encerramento do caso. O motivo é operacional — quem acabou de editar
 * tem o link na mão; quem encerra o caso dias depois vai atrás dele.
 *
 * ISTO CUSTA TOQUES, e a seção 6 do CLAUDE.md diz que concluir sai em até três.
 * A conta fecha porque a etapa de edição não acontece no corredor: ela é feita
 * sentada, numa estação, com teclado — que é justamente onde colar um link é
 * barato. Nenhuma etapa de CAMPO passa por aqui; o botão delas continua sendo
 * um toque.
 *
 * QUANDO O LINK JÁ EXISTE, O DIÁLOGO PARA DE PEDIR UM (09/09/2026, pedido do
 * gestor). A rodada 2 da edição de fotos entrega o MESMO álbum da rodada 1 — a
 * família recebe um endereço só, e as fotos do banho e do fechamento sobem
 * dentro dele. Até hoje o campo vinha preenchido com esse link e nada mais: a
 * tela continuava dizendo "Link de Google" com uma caixa de texto, que é a
 * cara de "cole aqui um link novo". Quem chegava ali na segunda rodada parava
 * para pensar se devia criar outro álbum — e alguns criaram.
 *
 * Agora ele diz o que é para fazer: *adicione as fotos finais no link abaixo*,
 * com o endereço à vista e um botão de copiar. Não é campo, é instrução.
 *
 * COM SAÍDA. "Usar outro link" troca o bloco pelo campo vazio, porque existe o
 * caso legítimo de a segunda rodada ir para outro lugar — e uma tela que só
 * oferece o caminho comum vira beco no dia em que o caso é o outro.
 *
 * A RPC ignora link idêntico repetido, então reaproveitar não suja a lista da
 * família com a mesma url duas vezes.
 */
export function DialogoConcluirComLinks({
  caso,
  etapa,
  exigidos,
  ocupado,
  erro,
  onCancelar,
  onConfirmar,
}: PropsConcluirComLinks) {
  const { data: registrados } = useEntregaveis(caso.id, true)
  const [digitados, setDigitados] = useState<Record<string, string>>({})
  const [observacao, setObservacao] = useState('')

  /*
   * ENQUANTO OS LINKS NÃO CHEGAM, NÃO MOSTRA CAMPO NENHUM.
   *
   * Hoje o diálogo abre com o card aberto, e `AcoesDoCaso` já montou esta
   * mesma consulta — a resposta vem do cache, sem espera. Mas se um dia ele
   * abrir de um lugar com o cache frio, o primeiro quadro seria a caixa de
   * texto vazia dizendo "cole o link": exatamente a tela que esta mudança veio
   * tirar, e no pior momento possível, porque ela sumiria sozinha um instante
   * depois — cedo demais para alguém desconfiar e tarde demais para desfazer o
   * álbum que já foi criado.
   */
  const carregando = registrados === undefined

  /** O último link daquele tipo que o caso já tem — a sugestão do campo. */
  function sugestao(tipo: TipoEntregavel): string {
    const doTipo = (registrados ?? []).filter((l) => l.tipo === tipo)
    return doTipo.at(-1)?.url ?? ''
  }

  // Derivado, não copiado para o estado num efeito: enquanto ninguém digitou
  // nada naquele campo, ele mostra a sugestão; assim que digita — inclusive
  // apagando tudo —, o que vale é o que a pessoa escreveu.
  function valor(tipo: TipoEntregavel): string {
    return digitados[tipo] ?? sugestao(tipo)
  }

  /*
   * REAPROVEITANDO = o caso já tem link deste tipo e ninguém pediu outro.
   *
   * Derivado do MESMO estado que os campos, e não de um segundo booleano por
   * tipo: "usar outro link" grava string vazia em `digitados`, o que abre o
   * campo e zera a validação no mesmo gesto. Dois estados para a mesma decisão
   * divergem no primeiro ramo que alguém esquecer de atualizar.
   */
  function reaproveitando(tipo: TipoEntregavel): boolean {
    return digitados[tipo] === undefined && sugestao(tipo) !== ''
  }

  const completo = exigidos.every((link) => valor(link.tipo).trim() !== '')
  const todosReaproveitados =
    exigidos.length > 0 && exigidos.every((link) => reaproveitando(link.tipo))

  return (
    <Dialogo
      titulo={`Concluir ${ROTULO_ETAPA[etapa.tipo]}`}
      rotuloConfirmar="Concluir etapa"
      confirmarDesabilitado={!completo || carregando}
      ocupado={ocupado}
      erro={erro}
      onCancelar={onCancelar}
      onConfirmar={() =>
        onConfirmar(
          exigidos.map((link) => ({ tipo: link.tipo, url: valor(link.tipo).trim() })),
          observacao.trim(),
        )
      }
    >
      {/* A frase de abertura muda com o que a pessoa tem pela frente. Quando
          tudo é reaproveitado ela não está entregando link nenhum — está
          subindo arquivo num álbum que já existe, e "a etapa não fecha sem o
          link" descreveria uma trava que ela não vai encontrar. */}
      <p className="text-sm text-muted-foreground">
        {carregando
          ? 'Vendo se este caso já tem link…'
          : todosReaproveitados
            ? exigidos.length > 1
              ? 'Adicione as fotos finais nos links abaixo — são os mesmos da primeira rodada.'
              : 'Adicione as fotos finais no link abaixo — é o mesmo da primeira rodada.'
            : exigidos.length > 1
              ? 'Os links entram junto com a conclusão — a etapa não fecha sem eles.'
              : 'O link entra junto com a conclusão — a etapa não fecha sem ele.'}
      </p>

      {!carregando &&
        exigidos.map((link) =>
          reaproveitando(link.tipo) ? (
            <LinkQueJaExiste
              key={link.tipo}
              rotulo={link.rotulo}
              url={valor(link.tipo)}
              onOutro={() => setDigitados((atual) => ({ ...atual, [link.tipo]: '' }))}
            />
          ) : (
            <CampoTexto
              key={link.tipo}
              rotulo={link.rotulo}
              valor={valor(link.tipo)}
              aoMudar={(v) => setDigitados((atual) => ({ ...atual, [link.tipo]: v }))}
              type="url"
              inputMode="url"
              placeholder="https://"
              {...(link.dica ? { ajuda: link.dica } : {})}
            />
          ),
        )}

      <label className="block">
        <span className="text-sm font-medium">
          Observação
          <span className="ml-1 text-xs text-muted-foreground">(opcional)</span>
        </span>
        <textarea
          rows={2}
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          placeholder="ex.: mãe pediu fotos com a avó"
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-base"
        />
      </label>
    </Dialogo>
  )
}

/**
 * O LINK QUE JÁ EXISTE — instrução, não campo.
 *
 * O que a pessoa precisa fazer aqui não é entregar um endereço: é subir as
 * fotos da segunda rodada dentro do álbum que a primeira criou. Uma caixa de
 * texto pedia a coisa errada, e a única defesa contra criar um álbum novo era
 * reparar que o campo já vinha preenchido.
 *
 * O LINK É CLICÁVEL, com `rel="noreferrer"`: a url é credencial de acesso à
 * galeria da família (seção 10 do CLAUDE.md), e sem isso ela viajaria no
 * cabeçalho Referer para o destino.
 *
 * COPIAR pela mesma razão da lista de entregáveis: a url fica truncada, e
 * selecionar com o dedo um texto que é link abre a galeria em vez de copiar.
 * Aqui ele serve para colar no navegador e subir as fotos.
 */
function LinkQueJaExiste({
  rotulo,
  url,
  onOutro,
}: {
  rotulo: string
  url: string
  onOutro: () => void
}) {
  const [copiado, setCopiado] = useState(false)
  const [falhouCopiar, setFalhouCopiar] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url)
      setFalhouCopiar(false)
      setCopiado(true)
      // Volta ao normal sozinho: um "copiado!" permanente vira parte do
      // desenho e deixa de dizer que ACABOU de acontecer.
      window.setTimeout(() => setCopiado(false), 1800)
    } catch {
      // Contexto sem permissão de área de transferência. O link continua
      // clicável e selecionável — não é um beco.
      setFalhouCopiar(true)
    }
  }

  return (
    <div className="rounded-md border border-concluido/25 bg-concluido/8 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{rotulo}</span>
        <span className="rotulo-sobrescrito text-concluido">já criado</span>
      </div>

      <div className="mt-1 flex items-center gap-1">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 flex-1 truncate text-xs text-marca underline underline-offset-2"
        >
          {url}
        </a>
        <BotaoIcone
          rotulo={copiado ? 'Link copiado' : 'Copiar link'}
          tom={copiado ? 'positivo' : 'neutro'}
          onClick={() => void copiar()}
        >
          <IconeCopiar className="size-4" />
        </BotaoIcone>
      </div>

      {falhouCopiar && (
        <p className="mt-1 text-xs text-muted-foreground">
          Não deu para copiar. Selecione o link e copie à mão.
        </p>
      )}

      {/* A saída. Fica discreta de propósito: o caminho comum é reaproveitar,
          e um botão do mesmo peso do resto convidaria a criar álbum novo —
          que é exatamente o que este bloco veio evitar. */}
      <button
        type="button"
        onClick={onOutro}
        className="mt-1.5 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        Usar outro link
      </button>
    </div>
  )
}
