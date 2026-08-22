import { Navigate, Outlet } from 'react-router'
import { Botao } from '@/components/ui/Botao'
import { useAuth } from '@/features/auth/contexto'

export function RotaProtegida() {
  const { carregando, session, pessoa, sair } = useAuth()

  if (carregando) {
    return (
      <p className="p-8 text-center text-sm text-muted-foreground">Verificando sessão…</p>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  /*
   * Autenticado, mas sem linha em `pessoas`.
   *
   * A RLS (eh_pessoa_ativa) exige um vínculo pessoas.auth_user_id + ativo. Sem
   * ele, TODA consulta devolve zero linha em vez de erro — a tela apareceria
   * vazia, como se não houvesse casos. Este bloco existe para transformar essa
   * falha silenciosa numa mensagem que diz o que fazer.
   */
  if (!pessoa) {
    return (
      <div className="mx-auto max-w-md space-y-3 p-8 text-center">
        <h1 className="font-semibold">Usuário sem pessoa vinculada</h1>
        <p className="text-sm text-muted-foreground">
          A sessão está válida, mas nenhum registro em <code>pessoas</code> aponta para
          este usuário (<code>{session.user.email}</code>). A RLS devolve zero linha nesse
          estado, então o Quadro apareceria vazio em vez de dar erro.
        </p>
        <p className="text-sm text-muted-foreground">
          No ambiente local, rode <code>npm run seed:auth</code> para criar os usuários de
          desenvolvimento e seus vínculos.
        </p>
        <Botao onClick={() => void sair()}>Sair</Botao>
      </div>
    )
  }

  return <Outlet />
}
