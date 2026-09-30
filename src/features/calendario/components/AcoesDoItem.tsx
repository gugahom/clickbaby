import { useState } from 'react'
import { CampoTexto } from '@/components/ui/CampoTexto'
import { Dialogo } from '@/components/ui/Dialogo'
import { useAgendarEtapa, useCancelarCaso } from '@/features/quadro/api/useAcoes'
import { mensagemDeErro } from '@/features/quadro/lib/erros'
import { useRecarregarCalendario, type ItemDoCalendario } from '../api/useCalendario'
import { rotuloDoDia } from '../lib/datas'

/**
 * CANCELAR PELO CALENDÁRIO — o "excluir" do pedido (30/09/2026).
 *
 * UM CASO NÃO SE APAGA: ele tem histórico em `eventos`, que é append-only
 * (invariante 3.3), e o banco recusa apagar o que tem histórico. Ele se
 * CANCELA, com motivo, pelo `cancelar_caso` de sempre — atendimento ou adm.
 *
 * E O GOOGLE ACOMPANHA: o evento fica CINZA, o card cinza que a própria equipe
 * usa para cancelar. O título fica, para a agenda continuar dizendo de quem
 * era. Rascunho pendente é outra coisa: descartar diz "isto não é caso", e o
 * evento dele não é pintado.
 */
export function CancelarCasoDialogo({ item, onFechar }: { item: ItemDoCalendario; onFechar: () => void }) {
  const cancelar = useCancelarCaso()
  const recarregar = useRecarregarCalendario()
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const rascunho = item.rascunho

  return (
    <Dialogo
      titulo={rascunho ? 'Descartar este rascunho?' : 'Cancelar este caso?'}
      rotuloConfirmar={rascunho ? 'Descartar rascunho' : 'Cancelar caso'}
      confirmarDestrutivo
      confirmarDesabilitado={motivo.trim() === ''}
      ocupado={cancelar.isPending}
      erro={erro}
      onCancelar={onFechar}
      onConfirmar={() => {
        setErro(null)
        cancelar
          .mutateAsync({ casoId: item.casoId, motivo: motivo.trim() })
          .then(() => {
            void recarregar()
            onFechar()
          })
          .catch((e: unknown) => setErro(mensagemDeErro(e)))
      }}
    >
      <div className="space-y-3 text-sm">
        <p className="font-semibold text-foreground">{item.nome}</p>
        <p className="text-muted-foreground">
          {rascunho
            ? 'O rascunho sai do Quadro e do calendário. O evento no Google fica como está.'
            : 'O caso sai do Quadro e do calendário, e o evento no Google fica cinza — o card cinza da equipe. Não há como desfazer pelo sistema.'}
        </p>
        <CampoTexto
          rotulo="Motivo"
          valor={motivo}
          aoMudar={setMotivo}
          autoFocus
          placeholder={rascunho ? 'ex.: não é um caso, é uma reunião' : 'ex.: família desistiu do pacote'}
        />
      </div>
    </Dialogo>
  )
}

/**
 * MUDAR O HORÁRIO DE UMA ETAPA — o banho, o fechamento, o prazo combinado do
 * vídeo, do Foto/Livro e do New Born. É o `agendar_etapa` que o card do Quadro
 * já usa, aberto a qualquer pessoa ativa, e ele NÃO toca no Google: a agenda do
 * Google só tem o evento do parto.
 */
export function MudarHorarioDialogo({
  item,
  proposta,
  onFechar,
}: {
  item: ItemDoCalendario
  proposta: { dia: string; hora: string | null } | null
  onFechar: () => void
}) {
  const agendar = useAgendarEtapa()
  const recarregar = useRecarregarCalendario()
  const [dia, setDia] = useState(proposta?.dia ?? item.dia)
  const [hora, setHora] = useState(proposta?.hora ?? item.hora ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const mudou = dia !== item.dia || hora !== (item.hora ?? '')

  return (
    <Dialogo
      titulo={`Mudar horário: ${item.titulo}`}
      rotuloConfirmar={agendar.isPending ? 'Salvando…' : 'Salvar'}
      confirmarDesabilitado={dia === '' || hora === '' || !mudou}
      ocupado={agendar.isPending}
      erro={erro}
      onCancelar={onFechar}
      onConfirmar={() => {
        if (!item.etapaId) return
        setErro(null)
        agendar
          .mutateAsync({ casoEtapaId: item.etapaId, previsaoEm: `${dia}T${hora}:00-03:00` })
          .then(() => {
            void recarregar()
            onFechar()
          })
          .catch((e: unknown) => setErro(mensagemDeErro(e)))
      }}
    >
      <div className="space-y-3">
        <p className="text-sm font-semibold text-foreground">{item.nome}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoTexto rotulo="Dia" type="date" valor={dia} aoMudar={setDia} {...(dia ? { ajuda: rotuloDoDia(dia) } : {})} />
          <CampoTexto rotulo="Hora" type="time" valor={hora} aoMudar={setHora} />
        </div>
        {mudou && (
          <p className="text-xs font-semibold text-foreground">
            Antes: {rotuloDoDia(item.dia)}
            {item.hora ? `, às ${item.hora}` : ''}.
          </p>
        )}
      </div>
    </Dialogo>
  )
}
