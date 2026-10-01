import { Link, Navigate, Outlet } from 'react-router'
import type { Tela } from '@/features/auth/telas'
import { useTelas } from '@/features/auth/telas'
import { destinosDe } from '../layout/destinos'

/**
 * A PORTA DE CADA TELA, por tela e não mais por papel (30/09/2026, pedido do
 * gestor: a gestão concede e tira telas pessoa a pessoa). Substituiu as três
 * guardas por papel — `RotaDeGestao`, `RotaDoFinanceiro` e
 * `RotaAdministrativa` —, que diziam três vezes a mesma coisa de três jeitos.
 *
 * REDIRECIONA, não mostra "acesso negado": quem chega aqui sem a tela veio por
 * um link colado ou pelo endereço digitado, e a resposta útil é levar para a
 * primeira tela que a pessoa TEM. Sem nenhuma, uma frase dizendo isso — e o
 * Perfil, que é de todo mundo.
 *
 * Nas telas Relatórios e Equipe a tela é também a SEGURANÇA — o banco confere a
 * mesma lista (`tem_tela`). Nas outras, é só a porta.
 */
export function RotaDaTela({ tela }: { tela: Tela | Tela[] }) {
  const telas = useTelas()
  // Uma lista abre com QUALQUER uma delas: o relatório externo é da tela
  // Relatórios e também da Comercial (só no modo comercial — quem confere o
  // modo é a própria página, e o banco).
  if ((Array.isArray(tela) ? tela : [tela]).some((t) => telas.has(t))) return <Outlet />

  const primeira = destinosDe(telas)[0]
  if (primeira) return <Navigate to={primeira.para} replace />

  return (
    <div className="mx-auto max-w-md p-6 text-center">
      <h1 className="text-lg font-extrabold tracking-tight">Nenhuma tela liberada</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        A gestão ainda não liberou nenhuma tela para você. Fale com ela para ganhar acesso.
      </p>
      <Link to="/perfil" className="mt-4 inline-block text-sm font-semibold text-marca underline">
        Ir para o seu perfil
      </Link>
    </div>
  )
}
