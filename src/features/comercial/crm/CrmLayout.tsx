import { useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router'
import clsx from 'clsx'
import { Gaveta } from '@/components/ui/Gaveta'
import { hojeNoFuso } from '@/lib/formato'
import { useAuth } from '@/features/auth/contexto'
import { useLeads, usePessoasDoComercial } from '../api/useLeads'
import { DialogoContato } from '../components/DialogosDoLead'
import { DialogoLead } from '../components/DialogoLead'
import { PainelDoLead } from '../components/PainelDoLead'
import { ehMeu, estaAberto, grupoDoHoje, type Lead, type ResultadoContato } from '../lib/leads'
import { BarraDoCrm } from './BarraDoCrm'
import { CabecalhoDoCrm } from './CabecalhoDoCrm'
import { CrmContexto, type ContextoDoCrm, type Escopo } from './contexto'
import { paginaDoCaminho } from './navegacao'
import { PaletaDeComandos } from './PaletaDeComandos'

/*
 * PREFERÊNCIAS DE TELA, no aparelho: a lente (Meus · Equipe) e a barra
 * recolhida. Não é dado de domínio — perder é só voltar ao padrão.
 */
const CHAVE_ESCOPO = 'clickbaby:comercial-escopo'
const CHAVE_BARRA = 'clickbaby:crm-barra-recolhida'

function ler(chave: string): string | null {
  try {
    return window.localStorage.getItem(chave)
  } catch {
    return null
  }
}

function gravar(chave: string, valor: string) {
  try {
    window.localStorage.setItem(chave, valor)
  } catch {
    // Sem armazenamento a preferência só não é lembrada.
  }
}

/**
 * O CRM DO COMERCIAL (18/11/2026, pedido do gestor: "um CRM premium"). É uma
 * página PRÓPRIA, fora da moldura do Quadro: barra lateral com as páginas do
 * CRM, cabeçalho com a busca rápida, e o conteúdo da página no meio.
 *
 * O desenho veio de olhar os CRMs de referência e ficar com o que serve a esta
 * venda — que é uma venda com prazo de NASCIMENTO e que acontece no WhatsApp:
 *  - do Pipedrive, a ideia de que todo negócio aberto tem um PRÓXIMO PASSO, e
 *    a fila ordenada por ele (o "Início" e o "sem próximo passo");
 *  - do Close, as listas que se esvaziam sozinhas conforme o trabalho anda (as
 *    visões da página de Leads);
 *  - do HubSpot e do Twenty, a ficha numa gaveta ao lado da lista;
 *  - do Attio e do Twenty, a busca rápida no Ctrl K;
 *  - do Kommo, que é o CRM de WhatsApp do Brasil, o lugar reservado para as
 *    Conversas (fase D).
 *
 * Os dados chegam UMA vez, aqui, e as páginas recortam — ver `contexto.ts`.
 */
export function CrmLayout() {
  const hoje = hojeNoFuso()
  const { pessoa } = useAuth()
  const [params, setParams] = useSearchParams()
  const navegar = useNavigate()
  const { pathname } = useLocation()
  const { data: leads = [], isPending, isError, error } = useLeads()
  const { data: pessoas = [] } = usePessoasDoComercial()

  const [escopoEscolhido, setEscopoEscolhido] = useState<Escopo | null>(() => {
    const v = ler(CHAVE_ESCOPO)
    return v === 'meus' || v === 'equipe' ? v : null
  })
  const [recolhida, setRecolhida] = useState(() => ler(CHAVE_BARRA) === '1')
  const [menuAberto, setMenuAberto] = useState(false)
  const [paleta, setPaleta] = useState(false)
  const [novo, setNovo] = useState(false)
  const [contato, setContato] = useState<{ id: string; resultado?: ResultadoContato } | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // QUEM É "MEU". A marca da repescagem vem da lista de pessoas, e não da
  // sessão: a gestão marca alguém e a fila muda sem ninguém recarregar.
  const eu = pessoas.find((p) => p.id === pessoa?.id)
  const euFacoRepescagem = eu?.fazRepescagem ?? false
  const alguemFazRepescagem = pessoas.some((p) => p.fazRepescagem && p.podeReceber)
  const meu = useCallback(
    (l: Lead) => (pessoa ? ehMeu(l, pessoa.id, euFacoRepescagem, alguemFazRepescagem) : false),
    [pessoa, euFacoRepescagem, alguemFazRepescagem],
  )

  // Sem escolha guardada: quem tem carteira abre nos "Meus"; quem não tem (a
  // gestão, quase sempre), na Equipe.
  const temCarteira = leads.some((l) => estaAberto(l) && meu(l))
  const escopo: Escopo = escopoEscolhido ?? (temCarteira ? 'meus' : 'equipe')
  const visiveis = useMemo(() => (escopo === 'meus' ? leads.filter(meu) : leads), [escopo, leads, meu])

  const leadAberto = params.get('lead')
  const lead = leads.find((l) => l.id === leadAberto) ?? null

  const abrirLead = useCallback(
    (id: string, frase?: string) => {
      setAviso(frase ?? null)
      setParams((antes) => {
        const p = new URLSearchParams(antes)
        p.set('lead', id)
        return p
      })
    },
    [setParams],
  )

  const fecharLead = useCallback(() => {
    setAviso(null)
    setParams((antes) => {
      const p = new URLSearchParams(antes)
      p.delete('lead')
      return p
    })
  }, [setParams])

  // A BUSCA RÁPIDA abre com Ctrl K / ⌘ K de qualquer lugar, e com "/" quando
  // ninguém está digitando — o mesmo par do Twenty e do GitHub.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (document.querySelector('dialog[open]')) return
      const alvo = e.target as HTMLElement | null
      const digitando = alvo?.closest('input, textarea, [contenteditable=true]')
      if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        setPaleta(true)
      } else if (e.key === '/' && !digitando && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        setPaleta(true)
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [])

  const contagens = useMemo(
    () => ({
      '': visiveis.filter((l) => grupoDoHoje(l, hoje) !== null).length,
      leads: visiveis.filter(estaAberto).length,
    }),
    [visiveis, hoje],
  )

  const pagina = paginaDoCaminho(pathname)
  const mostrarEscopo = Boolean(pagina && !pagina.emBreve && pagina.id !== 'configuracoes')

  const ctx: ContextoDoCrm = {
    leads,
    visiveis,
    carregando: isPending,
    erro: isError ? (error instanceof Error ? error.message : String(error)) : null,
    escopo,
    hoje,
    pessoas,
    leadAberto,
    abrirLead,
    registrarContato: (l, resultado) => setContato({ id: l.id, ...(resultado ? { resultado } : {}) }),
    novoLead: () => setNovo(true),
  }

  const leadDoContato = contato ? leads.find((l) => l.id === contato.id) : undefined

  return (
    <CrmContexto.Provider value={ctx}>
      <div className="flex h-full bg-background text-foreground">
        <aside
          aria-label="CRM"
          className={clsx(
            'superficie-barra hidden flex-shrink-0 transition-[width] duration-[260ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none md:block',
            recolhida ? 'w-[4.25rem]' : 'w-[17rem]',
          )}
        >
          <BarraDoCrm
            modo="trilho"
            recolhida={recolhida}
            contagens={contagens}
            onAlternar={() => {
              setRecolhida((r) => {
                gravar(CHAVE_BARRA, r ? '0' : '1')
                return !r
              })
            }}
            onFechar={() => undefined}
          />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <CabecalhoDoCrm
            titulo={pagina?.rotulo ?? 'Comercial'}
            escopo={escopo}
            mostrarEscopo={mostrarEscopo}
            onEscopo={(e) => {
              setEscopoEscolhido(e)
              gravar(CHAVE_ESCOPO, e)
            }}
            onMenu={() => setMenuAberto(true)}
            onBuscar={() => setPaleta(true)}
            onNovoLead={() => setNovo(true)}
          />
          {/* `relative`: os absolutos de dentro se medem por aqui, e não pela
              janela — a mesma lição do `main` do AppShell (29/09/2026). */}
          <main className="relative min-h-0 flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>

      {menuAberto && (
        <Gaveta rotulo="Menu do CRM" className="superficie-barra" onFechar={() => setMenuAberto(false)}>
          <BarraDoCrm
            modo="gaveta"
            recolhida={false}
            contagens={contagens}
            onAlternar={() => undefined}
            onFechar={() => setMenuAberto(false)}
          />
        </Gaveta>
      )}

      {paleta && (
        <PaletaDeComandos
          leads={leads}
          onFechar={() => setPaleta(false)}
          onAbrirLead={(id) => abrirLead(id)}
          onNovoLead={() => setNovo(true)}
          onNavegar={(para) => void navegar(para)}
        />
      )}

      {lead && (
        <PainelDoLead
          lead={lead}
          aviso={aviso}
          onFechar={fecharLead}
          onRegistrarContato={() => setContato({ id: lead.id })}
        />
      )}

      {contato && leadDoContato && (
        <DialogoContato
          lead={leadDoContato}
          resultadoInicial={contato.resultado}
          onFechar={() => setContato(null)}
        />
      )}

      {novo && (
        <DialogoLead
          onFechar={() => setNovo(false)}
          onCriado={(id, jaExistia) => {
            setNovo(false)
            abrirLead(
              id,
              jaExistia ? 'Este telefone já tinha um lead aberto: esta é a ficha dele, e nenhum lead novo foi criado.' : undefined,
            )
          }}
        />
      )}
    </CrmContexto.Provider>
  )
}
