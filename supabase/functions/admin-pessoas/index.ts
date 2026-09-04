// Edge Function que CRIA pessoa: conta de auth + linha em `pessoas`, vinculadas.
//
// POR QUE ISTO EXISTE
// Criar usuário no GoTrue exige a `service_role`, e ela não pode ir para o
// front (seção 8 do CLAUDE.md) — é a chave que ignora RLS no projeto inteiro.
// Até hoje o cadastro só acontecia por script rodado à mão
// (scripts/cadastrar-pessoa-producao.mjs). Esta função é o mesmo trabalho num
// lugar onde a tela alcança, com a chave presa do lado do servidor.
//
// DUAS CAMADAS DE AUTORIZAÇÃO, e as duas são necessárias:
//
//   1. `verify_jwt = true` no config.toml — o gateway exige credencial válida
//      do projeto. NÃO basta: a anon key é válida e é pública.
//   2. A checagem aqui dentro: o chamador precisa ser uma pessoa ATIVA com
//      `papel_sistema = 'gestao'`. Ela é feita com o JWT DO CHAMADOR, sob RLS,
//      antes de a `service_role` ser usada para qualquer coisa.
//
// A ordem importa. A `service_role` só é instanciada depois de o chamador
// passar — assim não existe caminho em que a chave privilegiada é usada com o
// pedido de alguém que não devia estar aqui.

// VERSÃO TRAVADA, e não `@2`. Com o intervalo aberto, cada deploy resolve a
// versão do dia — o local e a produção rodam bibliotecas diferentes sem ninguém
// pedir, e um comportamento interno que muda entre versões vira um bug que só
// existe em produção. É a mesma versão que o front usa (package.json).
import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { cabecalhosCors, responderPreflight } from "../_shared/cors.ts";

/**
 * Senha de primeiro acesso, combinada com o gestor.
 *
 * Fica no SERVIDOR e não na tela de propósito. Não é segredo — a equipe
 * inteira a conhece, é para isso que ela serve —, mas mandá-la do front
 * significaria que o valor viaja no bundle e que qualquer chamador poderia
 * escolher a senha de uma conta alheia. Aqui, quem define é sempre esta linha.
 *
 * Ela é PROVISÓRIA por contrato: a pessoa troca no primeiro acesso, pela tela
 * de conta. O sistema ainda não FORÇA a troca — o GoTrue não tem esse gesto
 * nativo, e forjá-lo com um flag próprio pediria uma coluna e uma guarda de
 * rota. Está registrado como pendência, não como esquecimento.
 */
const SENHA_INICIAL = "@Clickbaby1";

const PAPEIS_VALIDOS = [
  "operador",
  "comercial",
  "coordenacao",
  "atendimento",
  "financeiro",
  "gestao",
] as const;

type Papel = (typeof PAPEIS_VALIDOS)[number];

interface Pedido {
  nome?: unknown;
  email?: unknown;
  apelidos?: unknown;
  papelSistema?: unknown;
  /** Só no DELETE. */
  pessoaId?: unknown;
}

/**
 * Fabrica o `responder` DESTE pedido, já com os cabeçalhos de CORS dentro.
 *
 * É uma fábrica e não uma função solta porque os cabeçalhos dependem da origem
 * de quem chamou, e porque TODA resposta precisa deles — inclusive as de erro.
 * Uma 409 sem CORS chega ao front como falha de rede, e a mensagem em português
 * que esta função escreveu se perde antes de alguém ler.
 */
function criarResponder(req: Request) {
  const cors = cabecalhosCors(req.headers.get("Origin"));
  return (corpo: unknown, status: number): Response =>
    new Response(JSON.stringify(corpo), { status, headers: cors });
}

Deno.serve(async (req) => {
  // ANTES DE QUALQUER COISA: o navegador manda um OPTIONS de preflight antes do
  // POST, e ele não carrega corpo nem sessão. Caindo na checagem de método logo
  // abaixo, volta 405 sem CORS — e o POST de verdade nunca chega a sair.
  const preflight = responderPreflight(req);
  if (preflight) return preflight;

  const responder = criarResponder(req);

  if (req.method !== "POST" && req.method !== "DELETE") {
    return responder({ erro: "Use POST para criar ou DELETE para excluir." }, 405);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const servico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !servico) {
    return responder({ erro: "Função mal configurada." }, 500);
  }

  const autorizacao = req.headers.get("Authorization") ?? "";

  // ---------------------------------------------------------------------
  // Camada 2: quem está pedindo? Com o JWT DELE, sob RLS.
  // ---------------------------------------------------------------------
  const comoChamador = createClient(url, anon, {
    global: { headers: { Authorization: autorizacao } },
    auth: { persistSession: false },
  });

  // O TOKEN VAI EXPLÍCITO. `getUser()` sem argumento procura a sessão guardada
  // pelo próprio cliente — e aqui não há nenhuma (`persistSession: false`), então
  // ele depende de a biblioteca cair no header `Authorization` que passamos em
  // `global`. Esse fallback é interno, não documentado, e muda entre versões:
  // com `npm:...@2` solto, era a diferença entre 201 no local e 401 em produção.
  // `getUser(token)` é a forma que a documentação de Edge Functions usa e não
  // depende de nada disso.
  const token = autorizacao.replace(/^Bearer\s+/i, "").trim();
  if (token === "") {
    return responder({ erro: "Faltou a credencial da sessão no pedido." }, 401);
  }

  const { data: usuario, error: erroSessao } = await comoChamador.auth.getUser(
    token,
  );
  if (erroSessao || !usuario?.user) {
    // A mensagem do GoTrue vai junto de propósito: "JWT expired" e "invalid
    // claim" pedem coisas diferentes de quem está na frente da tela, e sem ela
    // todo 401 vira o mesmo "Sessão inválida" que não deixa ninguém agir. Não há
    // dado pessoal aqui, e quem lê já tinha um token deste projeto na mão.
    return responder(
      {
        erro: erroSessao
          ? `Sessão inválida: ${erroSessao.message}. Saia e entre de novo.`
          : "Sessão inválida. Saia e entre de novo.",
      },
      401,
    );
  }

  const { data: quemPede } = await comoChamador
    .from("pessoas")
    .select("id, papel_sistema, ativo")
    .eq("auth_user_id", usuario.user.id)
    .maybeSingle();

  if (!quemPede?.ativo || quemPede.papel_sistema !== "gestao") {
    // 403 e não 404: o chamador está autenticado e a rota existe. Esconder
    // isso não protegeria nada e atrapalharia quem está depurando.
    return responder({ erro: "Só a gestão cadastra pessoas." }, 403);
  }

  // ---------------------------------------------------------------------
  // O pedido
  // ---------------------------------------------------------------------
  let corpo: Pedido;
  try {
    corpo = await req.json();
  } catch {
    return responder({ erro: "Corpo não é JSON." }, 400);
  }

  // ---------------------------------------------------------------------
  // EXCLUIR — a pessoa e a conta de acesso dela, juntas.
  //
  // As duas caem na mesma chamada porque separá-las produz os dois piores
  // estados possíveis: uma conta órfã que loga e cai em "usuário sem pessoa
  // vinculada" (com o e-mail queimado, porque o GoTrue recusa recriá-lo), ou
  // uma pessoa no cadastro que ninguém consegue usar.
  //
  // A ORDEM IMPORTA: primeiro a linha de `pessoas`, depois a conta. Se a FK
  // recusar — e ela recusa para quem já trabalhou, `on delete restrict` —, a
  // conta continua de pé e nada se perdeu. Na ordem inversa, a recusa da FK
  // deixaria a pessoa sem acesso e sem aviso.
  // ---------------------------------------------------------------------
  if (req.method === "DELETE") {
    const pessoaId = typeof corpo.pessoaId === "string" ? corpo.pessoaId : "";
    if (pessoaId === "") return responder({ erro: "Informe a pessoa." }, 400);

    if (pessoaId === quemPede.id) {
      return responder({ erro: "Você não pode excluir a própria conta." }, 400);
    }

    const comoServico = createClient(url, servico, {
      auth: { persistSession: false },
    });

    const { data: alvo } = await comoServico
      .from("pessoas")
      .select("nome, auth_user_id")
      .eq("id", pessoaId)
      .maybeSingle();

    if (!alvo) return responder({ erro: "Pessoa não encontrada." }, 404);

    const { error: erroApagar } = await comoServico
      .from("pessoas")
      .delete()
      .eq("id", pessoaId);

    if (erroApagar) {
      const porHistorico = (erroApagar.message ?? "").toLowerCase().includes(
        "violates foreign key",
      );
      return responder(
        {
          erro: porHistorico
            ? `${alvo.nome} já trabalhou em casos e não pode ser excluída — o histórico de quem fez o quê não pode perder uma ponta. Desative em vez de excluir.`
            : `Não foi possível excluir: ${erroApagar.message}`,
        },
        porHistorico ? 409 : 400,
      );
    }

    if (alvo.auth_user_id) {
      await comoServico.auth.admin.deleteUser(alvo.auth_user_id);
    }

    return responder({ excluida: alvo.nome }, 200);
  }

  const nome = typeof corpo.nome === "string" ? corpo.nome.trim() : "";
  const email = typeof corpo.email === "string"
    ? corpo.email.trim().toLowerCase()
    : "";
  const papel = typeof corpo.papelSistema === "string"
    ? corpo.papelSistema
    : "operador";
  const apelidos = Array.isArray(corpo.apelidos)
    ? corpo.apelidos
      .filter((a): a is string => typeof a === "string")
      .map((a) => a.trim())
      .filter(Boolean)
    : [];

  if (nome === "") return responder({ erro: "Informe o nome." }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return responder({ erro: "E-mail inválido." }, 400);
  }
  if (!PAPEIS_VALIDOS.includes(papel as Papel)) {
    return responder({ erro: `Papel "${papel}" não existe.` }, 400);
  }

  // ---------------------------------------------------------------------
  // Agora sim, a chave privilegiada.
  // ---------------------------------------------------------------------
  const comoServico = createClient(url, servico, {
    auth: { persistSession: false },
  });

  const { data: criado, error: erroAuth } = await comoServico.auth.admin
    .createUser({
      email,
      password: SENHA_INICIAL,
      // Sem isto a pessoa precisa clicar num link de confirmação que ninguém
      // vai receber: estes e-mails são caixas corporativas que a equipe não
      // abre, e o cadastro é presencial.
      email_confirm: true,
    });

  if (erroAuth || !criado?.user) {
    const jaExiste = (erroAuth?.message ?? "").toLowerCase().includes(
      "already",
    );
    return responder(
      {
        erro: jaExiste
          ? `Já existe uma conta com ${email}.`
          : `Não foi possível criar a conta: ${erroAuth?.message ?? "erro desconhecido"}`,
      },
      jaExiste ? 409 : 400,
    );
  }

  const { data: pessoa, error: erroPessoa } = await comoServico
    .from("pessoas")
    .insert({
      nome,
      apelidos,
      papel_sistema: papel,
      auth_user_id: criado.user.id,
      ativo: true,
    })
    .select("id, nome, apelidos, papel_sistema, ativo")
    .single();

  if (erroPessoa) {
    // A conta de auth já nasceu. Sem este desfazer, sobra um usuário órfão que
    // consegue logar e cai na tela de "usuário sem pessoa vinculada" — e a
    // próxima tentativa com o mesmo e-mail bate em "já existe", travando o
    // cadastro para sempre sem dizer por quê.
    await comoServico.auth.admin.deleteUser(criado.user.id);
    return responder(
      { erro: `Conta desfeita — não foi possível cadastrar a pessoa: ${erroPessoa.message}` },
      400,
    );
  }

  return responder({ pessoa, email }, 201);
});
