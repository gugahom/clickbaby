import { useState } from 'react'
import clsx from 'clsx'
import { Dialogo } from '@/components/ui/Dialogo'
import { IconeCalendario } from '@/components/ui/icones'
import { formatarDataHora } from '@/lib/formato'
import { useRelogioDeMinuto } from '@/lib/useRelogio'
import { useAgendarEtapa } from '../api/useAcoes'
import { mensagemDeErro } from '../lib/erros'
import type { EtapaQuadro } from '../types'

/**
 * O PRAZO DESTE VÍDEO — ou deste fotolivro (16/09/2026, pedido do gestor).
 *
 * No Trello da equipe cada cartão de vídeo tem uma "Data Entrega", que fica
 * vermelha quando passa. É essa data: a combinada com a família para AQUELE
 * trabalho, que não é a mesma coisa que o SLA do pacote.
 *
 * POR QUE NÃO É O SLA. O prazo do MASTER são dez dias úteis contados do
 * nascimento (seção 9 do CLAUDE.md), e ele responde "a empresa cumpriu o que
 * vendeu?". Esta data responde outra pergunta — "para quando a gente prometeu
 * ESTE vídeo?" — e nasce de uma combinação caso a caso, muitas vezes depois do
 * caso encerrar. As duas convivem; o SLA continua derivado do pacote e ninguém
 * o edita aqui.
 *
 * `agendar_etapa` JÁ EXISTIA para a hora do banho e do fechamento, e é a mesma
 * pergunta: `caso_etapas.previsao_em` é data PLANEJADA, a única que a invariante
 * 3.4 deixa vir do cliente. A RPC recusa etapa concluída ou dispensada — prazo
 * de trabalho que já acabou não é promessa, é arquivo.
 *
 * FUSO: o campo `datetime-local` fala no fuso do NAVEGADOR e a pílula formata
 * em America/Sao_Paulo (`formatarDataHora`), que é onde a operação inteira
 * acontece. Num aparelho com fuso trocado os dois discordariam — e aí o certo é
 * o da pílula, que é o horário de Curitiba.
 */
export function PrazoDaEtapa({
  etapa,
  onErro,
}: {
  etapa: EtapaQuadro
  onErro: (mensagem: string | null) => void
}) {
  const agendar = useAgendarEtapa()
  const [aberto, setAberto] = useState(false)
  const [campo, setCampo] = useState(() => paraCampo(etapa.previsaoEm))
  const [erro, setErro] = useState<string | null>(null)

  // O mesmo relógio que faz o SLA andar sozinho, de minuto em minuto: ler a
  // hora durante a renderização daria um valor que muda sem ninguém pedir — é o
  // que a regra `react-hooks/purity` cobra, e o motivo de este hook existir.
  const agora = useRelogioDeMinuto()
  const resolvida = etapa.status === 'concluida' || etapa.status === 'dispensada'
  const atrasado =
    etapa.previsaoEm !== null &&
    !resolvida &&
    new Date(etapa.previsaoEm).getTime() < agora.getTime()

  function salvar(previsaoEm: string | null) {
    setErro(null)
    onErro(null)
    agendar
      .mutateAsync({ casoEtapaId: etapa.id, previsaoEm })
      .then(
        () => setAberto(false),
        (e) => setErro(mensagemDeErro(e)),
      )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setErro(null)
          setCampo(paraCampo(etapa.previsaoEm))
          setAberto(true)
        }}
        aria-label={
          etapa.previsaoEm
            ? `Prazo de entrega: ${formatarDataHora(etapa.previsaoEm)}`
            : 'Definir o prazo de entrega'
        }
        className={clsx(
          // Alvo de 44px sem engordar a pastilha — ver CampoEstacao.
          'relative inline-flex h-6 flex-shrink-0 cursor-pointer items-center gap-1 rounded-full px-2 text-xs font-semibold transition-colors',
          "before:absolute before:top-1/2 before:left-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']",
          etapa.previsaoEm
            ? atrasado
              ? // Vermelho é "precisa de alguém agora", e um prazo vencido é
                // exatamente isso. Sem pulso: o pulso é do chamado (etapa
                // atribuída e aviso), e três coisas pulsando não chamam nenhuma.
                'bg-atrasado text-card'
              : 'bg-marca-suave text-marca'
            : 'border border-dashed border-border text-muted-foreground hover:border-marca hover:text-marca',
          agendar.isPending && 'opacity-60',
        )}
      >
        <IconeCalendario className="size-3.5" />
        {etapa.previsaoEm ? formatarDataHora(etapa.previsaoEm) : 'Prazo'}
      </button>

      {aberto && (
        <Dialogo
          titulo="Prazo de entrega"
          rotuloConfirmar="Salvar prazo"
          confirmarDesabilitado={campo.trim() === '' || paraIso(campo) === null}
          ocupado={agendar.isPending}
          erro={erro}
          onCancelar={() => setAberto(false)}
          onConfirmar={() => salvar(paraIso(campo))}
        >
          <p className="text-sm text-muted-foreground">
            A data combinada para ESTE trabalho. Ela aparece no cartão e fica
            vermelha quando passa — o prazo do pacote continua sendo outro, e
            ninguém o edita aqui.
          </p>

          <label className="block">
            <span className="text-sm font-medium">Quando entregar</span>
            <input
              type="datetime-local"
              autoFocus
              value={campo}
              onChange={(e) => setCampo(e.target.value)}
              className="mt-1.5 min-h-12 w-full rounded-md border border-border bg-background px-3 text-base"
            />
          </label>

          {etapa.previsaoEm && (
            <button
              type="button"
              onClick={() => salvar(null)}
              disabled={agendar.isPending}
              className="text-sm font-semibold text-atrasado underline underline-offset-2"
            >
              Tirar o prazo
            </button>
          )}
        </Dialogo>
      )}
    </>
  )
}

/** ISO do banco -> "2026-09-15T09:40", que é o que o `datetime-local` entende. */
function paraCampo(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const doisDigitos = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}` +
    `T${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`
  )
}

/** E a volta. Data impossível (o campo aceita digitação) devolve null. */
function paraIso(campo: string): string | null {
  if (campo.trim() === '') return null
  const d = new Date(campo)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
