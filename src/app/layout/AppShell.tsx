import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import clsx from 'clsx'
import { Avatar } from '@/components/ui/Avatar'
import { Logo } from '@/components/ui/Logo'
import { Dropdown } from '@/components/ui/Dropdown'
import { Chevron, IconeCaneta, IconeMonitor, IconeSair } from '@/components/ui/icones'
import { ehAmbienteLocal } from '@/lib/supabase'
import { useAuth } from '@/features/auth/contexto'
import { useModoTv } from '@/features/quadro/lib/useModoTv'
// A tabela de rótulos é UMA. Havia uma cópia idêntica aqui, e ela ficou para
// trás no dia em que "operador" virou "Fotógrafo(a)" — o chip do cabeçalho
// diria "Operação" enquanto a Equipe já dizia outra coisa.
import { ROTULO_PAPEL } from '@/features/equipe/lib/apresentacao'
import { useUrlDaFoto } from '@/features/perfil/api/useFotoDePerfil'
import { usePresenca, useAtividadeDaEquipe } from '@/features/presenca/api/usePresenca'
import { EquipePresente } from '@/features/presenca/components/EquipePresente'
import { Sino } from '@/features/notificacoes/components/Sino'
import { BolinhaDeStatus } from '@/features/presenca/components/BolinhaDeStatus'
import {
  ROTULO_ESTADO,
  estadoVisivel,
  type EstadoDeclarado,
} from '@/features/presenca/lib/estados'
import { useTelaLarga } from '@/features/quadro/lib/useTelaLarga'
import { destinosDe } from './destinos'
import { useTelas } from '@/features/auth/telas'
import { BarraLateral } from './BarraLateral'
import { FaixaDeNavegacao } from './FaixaDeNavegacao'

/**
 * A faixa da marca — quarta versão, e a primeira que ancora a tela.
 *
 * O HISTÓRICO importa para não desfazer o que já foi aprendido. Era uma tira
 * cinza de 12px, lida como barra de planilha. Virou índigo cheia, para a tela
 * parecer aplicativo. Voltou a branca quando o CHÃO virou pastel — e porque a
 * logo é cinza sobre transparente, e sobre índigo sumia.
 *
 * Agora ela é escura de novo, e o problema da logo continua real: a solução é
 * a variante `clara`, que é a preta invertida (ver Logo.tsx). O que mudou para
 * a faixa escura voltar a fazer sentido é que ela deixou de ser um bloco de
 * cor chapada: é um gradiente das duas cores da marca, o azul da íris indo
 * para o rosa, ambos escurecidos. Ela não compete com o chão pastel — ela o
 * fecha por cima, como a moldura de um quadro.
 *
 * A NAVEGAÇÃO TEM DUAS FORMAS desde 28/09/2026 (pedido do gestor): barra
 * lateral no computador, faixa horizontal no celular. As duas leem a MESMA
 * lista (`destinosDe`), porque a alternativa era escrever as regras de papel
 * duas vezes e ver a próxima tela entrar só numa delas. O porquê de cada forma
 * está em `BarraLateral` e em `FaixaDeNavegacao`.
 */
export function AppShell() {
  const { pessoa, sair } = useAuth()
  // Para onde esta pessoa pode ir: as telas dela, que as guardas de rota
  // conferem do mesmo jeito — ver `destinos.ts`.
  const destinos = destinosDe(useTelas())
  const telaLarga = useTelaLarga()
  // O modo TV é do Quadro. Na Equipe o botão continuaria visível e não mudaria
  // nada — um interruptor ligado a nada ensina que ele às vezes não funciona.
  const noQuadro = useLocation().pathname === '/'
  const navegar = useNavigate()

  /*
   * A NAVEGAÇÃO NÃO EXISTE PARA QUEM SÓ OPERA (28/09/2026, regra do gestor:
   * "essa sidebar fica invisível para as fotógrafas, visto que elas precisam
   * de acesso apenas para a operação").
   *
   * A condição é só uma: ter MAIS DE UM destino. Quem tem apenas o Quadro não
   * vê barra nem faixa em tela nenhuma — nem no Perfil, onde até aqui a
   * navegação aparecia só para oferecer o caminho de volta.
   *
   * ESSE CAMINHO DE VOLTA NÃO PODE SUMIR JUNTO, e é o cuidado desta mudança: a
   * tela de Perfil sem saída foi um defeito real, corrigido em 03/09/2026, e
   * "beco curto" continua sendo beco. Quem o oferece agora é a MARCA do
   * cabeçalho, que virou link para o Quadro — o gesto que todo site tem, que
   * vale para todo mundo e não custa pixel nenhum de tela.
   *
   * Isto NÃO fere a invariante 3.1: ela proíbe filtrar TRABALHO por tipo de
   * pessoa, e aqui é permissão de TELA por papel administrativo, como a Equipe
   * (gestão), as Despesas (financeiro) e os Concluídos. Quem opera não perde
   * acesso a nada — as telas da gestão nunca foram dela, e a RLS não mudou.
   */
  const temNavegacao = destinos.length > 1
  const [modoTv, alternarModoTv] = useModoTv()
  const temBotaoTv = telaLarga && noQuadro
  // O retrato no chip do cabeçalho: num aparelho compartilhado que troca de mão
  // a cada turno, é o jeito mais rápido de responder "quem está logado aqui".
  const { data: minhaFoto } = useUrlDaFoto(pessoa?.fotoPath)

  // Presença: quem está aqui agora (canal do Realtime, nada gravado) e quem
  // tem etapa em andamento (derivado do trabalho). Os dois juntos dão a
  // bolinha — ver features/presenca/lib/estados.ts.
  const { outros, declarado, definir } = usePresenca()
  const { data: atividade } = useAtividadeDaEquipe()
  const meuEstado = estadoVisivel(
    declarado,
    atividade?.ocupadas.has(pessoa?.id ?? '') ?? false,
  )

  return (
    <div className="flex h-full flex-col">
      <header className="superficie-cabecalho flex-shrink-0 text-white">
        {/* `relative`: no celular é ESTA linha que posiciona o painel do sino,
            para ele encostar nas margens da tela em vez de sair pela esquerda.
            Ver o comentário em Sino.tsx. */}
        <div className="relative flex items-center justify-between gap-3 px-3 py-3 md:px-5">
          <div className="flex min-w-0 items-center gap-3">
            {/*
              A MARCA LEVA AO QUADRO (28/09/2026). Ela existia como enfeite e
              agora é o caminho de casa de quem não tem navegação nenhuma — a
              fotógrafa na tela de Perfil, que antes dependia da faixa. É o
              gesto que todo site tem, e por isso não precisa ser ensinado.

              `clara` e não `preta`: a mesma silhueta, invertida.
            */}
            <NavLink
              to="/"
              end
              aria-label="Ir para o Quadro"
              className="inline-flex flex-shrink-0 items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <Logo variante="clara" className="h-7 max-w-[9.5rem] md:h-8 md:max-w-[12rem]" prioridade />
            </NavLink>

            {/* Ambiente: evita demonstrar contra o remoto por engano. Sobre a
                faixa escura, o LOCAL fica em vidro e o REMOTO em vermelho
                cheio — só o segundo precisa gritar. */}
            <span
              className={clsx(
                'rounded-full px-2 py-0.5 font-mono text-[10px] tracking-wide',
                ehAmbienteLocal
                  ? 'bg-white/15 text-white/80'
                  : 'bg-atrasado text-white',
              )}
            >
              {ehAmbienteLocal ? 'LOCAL' : 'REMOTO'}
            </span>
          </div>

          {/*
            A DATA SAIU e o "sair" foi para dentro.
            
            A data era referência rápida, mas o sobrescrito logo abaixo do
            título já diz "Sábado, 29 de agosto" por extenso — duas datas na
            mesma dobra, uma delas abreviada, e nenhuma das duas ganhava por
            isso.
            
            O "sair" era o único botão permanente do canto, e o único gesto
            realmente perigoso que ficava a um toque de distância num aparelho
            compartilhado. Agora ele vive dentro do menu do usuário, que é onde
            se procura por ele — e onde as próximas ações de conta vão caber
            sem inventar mais um canto.
          */}
          {/* Presença e conta andam JUNTAS, num grupo só. Soltas, o
              justify-between do cabeçalho jogaria a fileira de avatares para o
              meio da faixa, longe do chip — e ali ela lê como outra coisa, não
              como "quem está comigo nesta tela". */}
          <div className="flex flex-shrink-0 items-center gap-3">
            {/*
              O INTERRUPTOR DO MODO TV SUBIU PARA CÁ (28/09/2026), quando a
              navegação desceu para a barra lateral. Ele nunca foi navegação:
              ajusta a TELA em que se está, como a conta e a presença ao lado —
              e sozinho na antiga faixa ele deixaria uma barra inteira de 44px
              com um botão no canto, que lê como algo que não carregou.

              SÓ ONDE O LAYOUT CABE (`telaLarga`, 1536px) e só no Quadro: um
              botão que existe e não faz nada é pior que botão nenhum, e quem
              apertasse num notebook de 1280px concluiria que a função está
              quebrada.

              O rótulo diz o DESTINO, não o estado — "Modo TV" é o que acontece
              ao apertar. Se está ligado, dizem o `aria-pressed`, o
              preenchimento e a tela inteira em duas colunas.
            */}
            {temBotaoTv && (
              <button
                type="button"
                onClick={alternarModoTv}
                aria-pressed={modoTv}
                className={clsx(
                  'inline-flex min-h-10 flex-shrink-0 items-center gap-2 rounded-full pr-3 pl-2.5 text-sm font-semibold transition-colors',
                  modoTv
                    ? 'bg-white text-marca-forte hover:bg-white/90'
                    : 'bg-white/10 text-white/80 hover:bg-white/20 hover:text-white',
                )}
              >
                <IconeMonitor className="size-4" />
                Modo TV
                <span
                  className={clsx(
                    'text-[11px] font-medium',
                    modoTv ? 'text-marca-forte/60' : 'text-white/55',
                  )}
                >
                  {modoTv ? 'ligado' : 'desligado'}
                </span>
              </button>
            )}

            {/* Quem mais está no Quadro agora — a mesma vizinhança dos
                colaboradores de uma planilha compartilhada, que foi a
                referência do gestor. */}
            <EquipePresente
              outros={outros}
              atividade={atividade}
              // Eu entro na lista do painel: a pergunta é "quem está aqui", e
              // quem está lendo também está.
              eu={
                pessoa
                  ? {
                      pessoaId: pessoa.id,
                      nome: pessoa.nome,
                      papel: pessoa.papelSistema,
                      estado: meuEstado,
                      fotoUrl: minhaFoto ?? null,
                    }
                  : null
              }
            />

            {/* O SINO FICA ENTRE a presença e o chip de conta, que é onde o
                gestor pediu — e é o lugar em que todo mundo já procura por
                ele. Ao contrário da presença, ele EXISTE no mobile: quem está
                no corredor não escolhe a quem passar trabalho, mas precisa
                saber que uma etapa foi atribuída ao seu nome. */}
            <Sino />

            {pessoa && (
            <Dropdown
              alinhamento="direita"
              rotulo={`Conta de ${pessoa.nome}`}
              onEscolher={(item) => {
                if (item.id === 'disponivel' || item.id === 'ausente') {
                  definir(item.id as EstadoDeclarado)
                }
                if (item.id === 'perfil') void navegar('/perfil')
                if (item.id === 'sair') void sair()
              }}
              selecionado={declarado}
              // "Editar conta" ANTES de "Sair", e não é ordem alfabética: num
              // aparelho compartilhado, sair é o gesto mais frequente e o mais
              // perigoso de acertar sem querer. Ele fica por último, longe do
              // polegar que acabou de abrir o menu.
              itens={[
                /* O ESTADO VEM PRIMEIRO, e não é ordem arbitrária: é o item
                   que se troca várias vezes por turno, enquanto "editar
                   perfil" se usa uma vez na vida. O menu do Discord que o
                   gestor mandou faz o mesmo — o estado no topo, a conta
                   embaixo.

                   Dois estados só, por decisão dele. "Ocupada" NÃO entra aqui
                   porque não se escolhe: ela nasce de ter etapa em andamento,
                   e oferecê-la como opção deixaria a pessoa mentir sobre o
                   trabalho — que é exatamente o que a medição não pode. */
                {
                  id: 'disponivel',
                  rotulo: ROTULO_ESTADO.disponivel,
                  icone: <BolinhaDeStatus estado="disponivel" />,
                },
                {
                  id: 'ausente',
                  rotulo: ROTULO_ESTADO.ausente,
                  icone: <BolinhaDeStatus estado="ausente" />,
                },
                { id: 'perfil', rotulo: 'Editar perfil', icone: <IconeCaneta className="size-4" /> },
                { id: 'sair', rotulo: 'Sair da conta', icone: <IconeSair className="size-4" />, destrutivo: true },
              ]}
              gatilho={
                <span className="flex min-w-0 items-center gap-2 rounded-full bg-white/10 py-1 pr-2 pl-1 transition-colors hover:bg-white/20">
                  {/* A bolinha no próprio retrato: sem ela, a pessoa escolhe
                      "ausente" no menu e não tem como saber que pegou. */}
                  <span className="relative flex-shrink-0">
                    <Avatar nome={pessoa.nome} fotoUrl={minhaFoto ?? null} />
                    <BolinhaDeStatus
                      estado={meuEstado}
                      className="absolute right-0 bottom-0 ring-2 ring-black/40"
                    />
                  </span>
                  {/* O nome some no mobile e sobra o avatar, que já carrega as
                      iniciais e o nome completo no title. */}
                  <span className="hidden min-w-0 text-left leading-tight sm:block">
                    <span className="block truncate text-sm font-semibold">{pessoa.nome}</span>
                    <span className="block truncate text-[11px] text-white/65">
                      {ROTULO_PAPEL[pessoa.papelSistema] ?? pessoa.papelSistema}
                    </span>
                  </span>
                  <Chevron className="size-4 flex-shrink-0 text-white/60" />
                </span>
              }
            />
            )}
          </div>
        </div>

        {/*
          A FAIXA SÓ EXISTE NO CELULAR desde 28/09/2026 — no computador ela deu
          lugar à barra lateral, logo abaixo. As duas leem a mesma lista de
          destinos; o porquê de cada forma está nos dois componentes.
        */}
        {temNavegacao && <FaixaDeNavegacao destinos={destinos} />}
      </header>

      {/*
        O CONTEÚDO E A BARRA dividem a linha de baixo. A barra reserva a
        largura dela e cresce por cima quando o ponteiro chega — ver
        `BarraLateral`.

        A BARRA E O MODO TV COEXISTEM (28/09/2026, correção do gestor: "eles
        preferem o modo de visualização do modo TV"). A primeira versão escondia
        a barra no modo TV, supondo que ele só vive na TV da sala — e a suposição
        estava errada: é a visualização que a gestão usa no dia a dia, então
        escondê-la tirava a navegação justamente de quem navega.

        A conta de espaço fecha. Em 1280px o modo TV já encolhe a coluna lateral
        para 18rem, sobrando ~496px por coluna; a barra recolhida leva 56px
        dessa sobra (468 por coluna) e, fixa, 208 (392) — ambos acima dos 356px
        que motivaram aquele ajuste. E o grid do Quadro é `minmax(0,1fr)`: ele
        se mede pelo espaço que recebe, não pela janela.
      */}
      <div className="flex min-h-0 flex-1">
        {temNavegacao && <BarraLateral destinos={destinos} />}

        {/* A PÁGINA ROLA AQUI DENTRO, e não na janela (29/09/2026, pedido do
            gestor: "a sidebar acompanhe quando a página crescer"). Rolando a
            janela, esta fileira tinha a altura da TELA e o conteúdo a
            ultrapassava — a barra lateral, esticada pela fileira, acabava no
            meio da página e embaixo dela aparecia o fundo. Com a rolagem no
            `main`, a fileira é sempre a altura da tela, a barra vai até o chão,
            e o cabeçalho fica parado de brinde. O Quadro não muda: ele já é
            `h-full` com rolagens próprias por dentro.
            O `relative` NÃO É ENFEITE (29/09/2026, segunda volta): sem ele, todo
            elemento absoluto de dentro — os rótulos `sr-only` das tabelas, por
            exemplo — se media pela JANELA e não pelo `main`, e os que moravam no
            fim de uma página comprida esticavam o documento. Aparecia uma
            segunda barra de rolagem, e rolar por ela subia o app inteiro,
            deixando o fundo à mostra embaixo da barra lateral. */}
        <main className="relative min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
