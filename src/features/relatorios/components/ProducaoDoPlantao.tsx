import { useState } from 'react'
import { Dialogo } from '@/components/ui/Dialogo'
import { ROTULO_ETAPA, rotuloDaRodada } from '@/features/quadro/types'
import type { Plantao } from '@/features/equipe/api/useEscala'
import { diaCurto, horaEmBrasilia } from '@/features/equipe/lib/apresentacao'
import { useProducaoDoPlantao, type EtapaDoPlantao } from '../api/useProducaoDoPlantao'

/** "Reels · B+F" da segunda rodada em diante, como no Quadro. */
function nomeDaEtapa(e: EtapaDoPlantao): string {
  const base = ROTULO_ETAPA[e.tipo]
  return e.rodada > 1 ? `${base} · ${rotuloDaRodada(e.tipo, e.rodada)}` : base
}

/** As etapas somadas por nome, na ordem em que apareceram. */
function contagem(etapas: EtapaDoPlantao[]): { nome: string; quantas: number }[] {
  const mapa = new Map<string, number>()
  for (const e of etapas) mapa.set(nomeDaEtapa(e), (mapa.get(nomeDaEtapa(e)) ?? 0) + 1)
  return [...mapa].map(([nome, quantas]) => ({ nome, quantas }))
}

/**
 * O RESUMO DO PLANTÃO (11/11/2026, pedido do gestor): "eu clico no plantão e me
 * mostra um resumo — fotografou 2 nascimentos, editou 2 reels, editou um
 * master". A contagem em cima, os casos embaixo. Ver `useProducaoDoPlantao`.
 *
 * MORA NO RELATÓRIO INTERNO (mesmo dia, segunda volta: "juntar tudo num lugar
 * só quando diz respeito a trabalho realizado"), no perfil da pessoa, ao lado
 * das horas de plantão. A primeira versão abria pela escala da Equipe.
 */
export function ProducaoDoPlantao({
  pessoaId,
  nome,
  plantao,
  onFechar,
}: {
  pessoaId: string
  nome: string
  plantao: Plantao
  onFechar: () => void
}) {
  const { data, isPending, error } = useProducaoDoPlantao(pessoaId, plantao.inicio, plantao.fim)
  // O relógio de quando o resumo abriu: o diálogo vive minutos, não horas.
  const [agora] = useState(() => Date.now())
  const futuro = new Date(plantao.inicio).getTime() > agora
  const concluidas = data?.concluidas ?? []
  const abertas = data?.abertas ?? []

  return (
    <Dialogo
      titulo={`Plantão de ${nome.split(' ')[0]}`}
      rotuloConfirmar="Fechar"
      soFechar
      onConfirmar={onFechar}
      onCancelar={onFechar}
    >
      <p className="text-sm text-muted-foreground capitalize">
        {diaCurto(plantao.data)} · {horaEmBrasilia(plantao.inicio)}–{horaEmBrasilia(plantao.fim)}
      </p>

      {futuro ? (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
          Este plantão ainda não aconteceu.
        </p>
      ) : error ? (
        <p className="text-sm text-atrasado">Não deu para carregar a produção do plantão.</p>
      ) : isPending ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : concluidas.length === 0 && abertas.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
          Nenhuma etapa no nome dela concluída ou começada neste horário.
        </p>
      ) : (
        <>
          {concluidas.length > 0 && (
            <section>
              <h4 className="rotulo-sobrescrito text-acento">Concluiu · {concluidas.length}</h4>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {contagem(concluidas).map((c) => (
                  <li key={c.nome} className="rounded-full bg-marca-suave px-2.5 py-1 text-sm font-semibold text-marca">
                    {c.quantas} {c.nome}
                  </li>
                ))}
              </ul>
              <ul className="mt-3 space-y-1">
                {concluidas.map((e) => (
                  <li key={e.id} className="flex items-baseline gap-2 text-sm">
                    <span className="w-12 flex-shrink-0 tabular-nums text-muted-foreground">
                      {e.concluidoEm ? horaEmBrasilia(e.concluidoEm) : ''}
                    </span>
                    <span className="font-semibold">{nomeDaEtapa(e)}</span>
                    <span className="min-w-0 truncate text-muted-foreground">{e.casoNome}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {abertas.length > 0 && (
            <section>
              <h4 className="rotulo-sobrescrito text-acento">Começou e ficou aberto · {abertas.length}</h4>
              <ul className="mt-2 space-y-1">
                {abertas.map((e) => (
                  <li key={e.id} className="flex items-baseline gap-2 text-sm">
                    <span className="font-semibold">{nomeDaEtapa(e)}</span>
                    <span className="min-w-0 truncate text-muted-foreground">{e.casoNome}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="text-xs text-muted-foreground">
            Conta as etapas com o nome dela. O que foi registrado depois do plantão fica fora.
          </p>
        </>
      )}
    </Dialogo>
  )
}
