import { useState } from 'react'
import { Dialogo } from '@/components/ui/Dialogo'
import { CampoTexto } from '@/components/ui/CampoTexto'
import { Dropdown } from '@/components/ui/Dropdown'
import { useCriarPessoa } from '../api/useCriarPessoa'

/**
 * Cadastro de pessoa — conta de acesso e linha em `pessoas`, num gesto só.
 *
 * O DOMÍNIO DO E-MAIL É FIXO. Todas as contas vivem em @clickbaby.com.br, e
 * digitar o domínio catorze vezes só cria chance de errar uma. O campo pede a
 * parte antes do arroba e mostra o resto como sufixo — o mesmo princípio de
 * "seleção, não digitação" da seção 6, aplicado ao pedaço que não varia.
 *
 * O PAPEL PADRÃO É OPERAÇÃO, e essa é a escolha certa para o caso comum: das
 * catorze pessoas cadastradas, onze são operação. Gestão é a exceção, e
 * exceção se escolhe.
 *
 * A SENHA NÃO APARECE AQUI. Quem a define é a Edge Function, no servidor. Se
 * este formulário a mandasse, ela viajaria no bundle e qualquer chamador
 * poderia escolher a senha de uma conta alheia.
 */
const DOMINIO = 'clickbaby.com.br'

const PAPEIS = [
  { id: 'operador', rotulo: 'Operação' },
  { id: 'atendimento', rotulo: 'Atendimento' },
  { id: 'comercial', rotulo: 'Comercial' },
  { id: 'coordenacao', rotulo: 'Coordenação' },
  { id: 'financeiro', rotulo: 'Financeiro' },
  { id: 'gestao', rotulo: 'Gestão' },
]

export function NovaPessoaDialogo({ onFechar }: { onFechar: () => void }) {
  const criar = useCriarPessoa()
  const [nome, setNome] = useState('')
  const [usuario, setUsuario] = useState('')
  const [apelido, setApelido] = useState('')
  const [papel, setPapel] = useState('operador')
  const [erro, setErro] = useState<string | null>(null)

  // Sugere o login a partir do nome enquanto ninguém digitou o campo à mão.
  // Sugerir não é decidir: assim que a pessoa toca no campo, a sugestão para
  // de mandar — senão corrigir "dy" para "dyelly" seria impossível.
  const [usuarioTocado, setUsuarioTocado] = useState(false)
  const login = usuarioTocado ? usuario : sugerirUsuario(nome)

  const valido = nome.trim() !== '' && login.trim() !== ''

  function salvar() {
    setErro(null)
    criar
      .mutateAsync({
        nome: nome.trim(),
        email: `${login.trim()}@${DOMINIO}`,
        apelidos: apelido.trim() === '' ? [] : [apelido.trim()],
        papelSistema: papel,
      })
      .then(onFechar)
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)))
  }

  const rotuloPapel = PAPEIS.find((p) => p.id === papel)?.rotulo ?? papel

  return (
    <Dialogo
      titulo="Cadastrar pessoa"
      rotuloConfirmar={criar.isPending ? 'Criando…' : 'Criar acesso'}
      confirmarDesabilitado={!valido}
      ocupado={criar.isPending}
      erro={erro}
      onConfirmar={salvar}
      onCancelar={onFechar}
    >
      <div className="space-y-4">
        <CampoTexto
          rotulo="Nome"
          valor={nome}
          aoMudar={setNome}
          ajuda="Como ela aparece no Quadro e nos handoffs."
          autoFocus
        />

        <label className="block">
          <span className="text-sm font-medium">Login</span>
          <div className="mt-1.5 flex items-stretch">
            <input
              value={login}
              onChange={(e) => {
                setUsuarioTocado(true)
                setUsuario(e.target.value)
              }}
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="min-h-12 min-w-0 flex-1 rounded-l-md border border-r-0 border-border bg-background/60 px-3 text-base transition-colors focus:border-marca focus:bg-card"
            />
            <span className="inline-flex min-h-12 flex-shrink-0 items-center rounded-r-md border border-border bg-muted px-3 text-sm text-muted-foreground">
              @{DOMINIO}
            </span>
          </div>
          <span className="mt-1 block text-xs text-muted-foreground">
            Senha inicial padrão. Ela troca no primeiro acesso, em Editar conta.
          </span>
        </label>

        <CampoTexto
          rotulo="Apelido"
          valor={apelido}
          aoMudar={setApelido}
          opcional
          ajuda="Como a equipe chama essa pessoa, se for diferente do nome."
        />

        <div>
          <span className="text-sm font-medium">Papel</span>
          <div className="mt-1.5">
            <Dropdown
              rotulo="Papel no sistema"
              selecionado={papel}
              onEscolher={(item) => setPapel(item.id)}
              itens={PAPEIS}
              larguraCheia
              gatilho={
                <span className="inline-flex min-h-12 w-full items-center justify-between rounded-md border border-border bg-background/60 px-3 text-base">
                  {rotuloPapel}
                </span>
              }
            />
          </div>
          <span className="mt-1 block text-xs text-muted-foreground">
            Operação é quem trabalha nas etapas. Só gestão enxerga esta tela.
          </span>
        </div>
      </div>
    </Dialogo>
  )
}

/**
 * "Maria Eduarda" vira "maria": primeiro nome, sem acento, minúsculo.
 *
 * É o padrão que as catorze contas existentes seguem — e por isso uma
 * SUGESTÃO, não uma regra. A Dyelly é chamada de Dy e entra por `dyelly@`;
 * fixar a derivação obrigaria a inventar uma exceção no código para uma
 * pessoa. O campo continua editável.
 */
function sugerirUsuario(nome: string): string {
  const primeiro = nome.trim().split(/\s+/)[0] ?? ''
  return primeiro
    // NFD separa "é" em "e" + acento; o filtro seguinte, que só deixa
    // passar letra e número ASCII, come o acento junto. Uma linha a menos
    // que uma classe de combinantes escrita à mão — que, além de ilegível,
    // é a que costuma sobreviver errada a um copiar-e-colar.
    .normalize('NFD')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
}
