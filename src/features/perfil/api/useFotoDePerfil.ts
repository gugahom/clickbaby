import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { chavesEquipe } from '@/features/equipe/api/useEquipe'

/**
 * A foto de perfil — upload no bucket, caminho na RPC, URL assinada na leitura.
 *
 * TRÊS PASSOS, e cada um num lugar diferente de propósito:
 *
 *   1. o ARQUIVO vai direto do navegador para o bucket `avatares`, sob a policy
 *      que só deixa escrever na pasta do próprio `auth.uid()`;
 *   2. o CAMINHO vai por RPC (`definir_minha_foto`), porque RLS não filtra
 *      coluna — uma policy de "edita a própria linha" em `pessoas` abriria
 *      junto o `papel_sistema`;
 *   3. a URL não é guardada em lugar nenhum. O bucket é privado (seção 10), e
 *      URL assinada expira: gravá-la seria gravar um segredo com data de
 *      validade, e a coluna passaria a mentir depois de uma hora.
 */

const BUCKET = 'avatares'

/** 2 MB — o mesmo teto do bucket. Aqui é só para recusar antes de subir. */
export const TAMANHO_MAXIMO = 2 * 1024 * 1024

export const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp']

/**
 * Uma hora de validade.
 *
 * Curto o bastante para um link vazado não valer muito, longo o bastante para
 * um turno de trabalho não recarregar a tela atrás de retrato. A query guarda
 * o resultado por menos tempo que isso, então a URL nunca chega a expirar em
 * tela.
 */
const VALIDADE_SEGUNDOS = 60 * 60

export const chavesFoto = {
  todas: ['fotos'] as const,
  uma: (path: string) => [...chavesFoto.todas, path] as const,
  varias: (paths: string[]) => [...chavesFoto.todas, 'lote', paths.join(',')] as const,
}

/** A URL assinada de UMA foto. */
export function useUrlDaFoto(path: string | null | undefined) {
  return useQuery({
    queryKey: chavesFoto.uma(path ?? ''),
    enabled: Boolean(path),
    staleTime: (VALIDADE_SEGUNDOS - 300) * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path as string, VALIDADE_SEGUNDOS)
      if (error) throw error
      return data.signedUrl
    },
  })
}

/**
 * As URLs de várias fotos, num pedido só.
 *
 * `createSignedUrls` no plural: a Equipe mostra catorze retratos, e catorze
 * requisições para montar uma lista é o tipo de N+1 que só aparece quando a
 * equipe cresce.
 */
export function useUrlsDasFotos(paths: (string | null)[]) {
  const validos = [...new Set(paths.filter((p): p is string => Boolean(p)))].sort()

  return useQuery({
    queryKey: chavesFoto.varias(validos),
    enabled: validos.length > 0,
    staleTime: (VALIDADE_SEGUNDOS - 300) * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(validos, VALIDADE_SEGUNDOS)
      if (error) throw error

      const mapa = new Map<string, string>()
      for (const item of data ?? []) {
        if (item.path && item.signedUrl) mapa.set(item.path, item.signedUrl)
      }
      return mapa
    },
  })
}

export interface EnvioDeFoto {
  arquivo: File
  authUserId: string
  /** O retrato que está saindo, para não virar lixo no bucket. */
  anterior: string | null
}

export function useEnviarFoto() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ arquivo, authUserId, anterior }: EnvioDeFoto) => {
      if (!TIPOS_ACEITOS.includes(arquivo.type)) {
        throw new Error('A foto precisa ser JPG, PNG ou WEBP.')
      }
      if (arquivo.size > TAMANHO_MAXIMO) {
        throw new Error('A foto precisa ter no máximo 2 MB.')
      }

      /*
       * O NOME DO ARQUIVO CARREGA UM CARIMBO DE TEMPO, e isso não é enfeite.
       *
       * Um caminho fixo (`<uid>/avatar.jpg`) seria mais limpo e traria de volta
       * a foto antiga: a URL assinada da anterior continua válida por uma hora,
       * e o navegador ainda cacheia a resposta. Com nome novo a cada envio, a
       * troca aparece na hora.
       *
       * A pasta é o `auth.uid()` porque é o que a policy exige — ver a
       * migration 20260903161526.
       */
      const extensao = arquivo.type === 'image/png'
        ? 'png'
        : arquivo.type === 'image/webp'
          ? 'webp'
          : 'jpg'
      const caminho = `${authUserId}/${Date.now()}.${extensao}`

      const { error: erroUpload } = await supabase.storage
        .from(BUCKET)
        .upload(caminho, arquivo, { contentType: arquivo.type })

      if (erroUpload) throw new Error(`Não foi possível enviar a foto: ${erroUpload.message}`)

      const { error: erroRpc } = await supabase.rpc('definir_minha_foto', {
        p_foto_path: caminho,
      })

      if (erroRpc) {
        // O arquivo subiu e o perfil não aponta para ele: sobra lixo no bucket
        // que ninguém referencia. Limpa — a policy de remoção é a mesma pasta.
        await supabase.storage.from(BUCKET).remove([caminho])
        throw new Error(erroRpc.message)
      }

      /*
       * APAGA O ANTERIOR, DEPOIS de o novo estar registrado.
       *
       * Nesta ordem porque a falha aceitável é "sobrou um arquivo"; a
       * inaceitável é "apaguei o retrato e o novo não entrou". Por isso também
       * o erro aqui é engolido: o perfil já está correto, e transformar uma
       * faxina que falhou em erro de tela faria a pessoa achar que a troca não
       * funcionou.
       */
      if (anterior && anterior !== caminho) {
        await supabase.storage.from(BUCKET).remove([anterior])
      }

      return caminho
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chavesFoto.todas })
      void qc.invalidateQueries({ queryKey: chavesEquipe.todos })
      // O chip do cabeçalho lê a pessoa do contexto de auth, não do cache.
      void qc.invalidateQueries({ queryKey: ['pessoa'] })
    },
  })
}
