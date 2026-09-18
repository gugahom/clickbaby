-- A CHECAGEM DE PERMISSÃO PASSA A RODAR UMA VEZ POR CONSULTA, E NÃO POR LINHA
-- (18/09/2026, diagnóstico do Quadro lento).
--
-- O QUE FOI MEDIDO EM PRODUÇÃO. As policies de leitura diziam só
-- `using (eh_pessoa_ativa())`, e o plano da consulta do Quadro mostrava a
-- função como FILTRO em cada varredura — `Filter: eh_pessoa_ativa()` em casos,
-- em caso_etapas (duas vezes, uma por subconsulta), em despesas, pacotes,
-- maternidades e pessoas. Ou seja: a mesma pergunta ("quem está logado é pessoa
-- ativa?"), com a mesma resposta, feita milhares de vezes por consulta — e cada
-- vez lendo o JWT e buscando em `pessoas`. Isolada, a view do Quadro levou
-- 11ms sem RLS e 44ms com ela: 4x, só disso.
--
-- O CONSERTO É O RECOMENDADO PELO PRÓPRIO SUPABASE: embrulhar a chamada num
-- `(select ...)`. O Postgres passa a tratá-la como um InitPlan — avalia uma vez,
-- guarda o resultado e reusa em todas as linhas. Vale porque as três funções
-- não dependem da linha: dependem só de quem está logado, que não muda no meio
-- da consulta.
--
-- O QUE NÃO MUDA: quem pode ler e escrever o quê. Cada policy continua com a
-- mesma condição, na mesma tabela, para o mesmo comando — `alter policy` troca
-- só a expressão, sem derrubar e recriar nada (e sem a janela em que a tabela
-- ficaria sem policy). Os testes de RLS existentes, com os casos negativos,
-- são a prova de que o comportamento é o mesmo.
--
-- A REGRA PARA O FUTURO fica trancada num teste
-- (`rls_uma_vez_por_consulta.test.sql`): policy nova que chame um desses
-- helpers sem o `select` em volta faz a suíte falhar.

-- ------------------------------------------------------------ leitura (todos)
alter policy casos_select_compartilhada        on public.casos         using ((select public.eh_pessoa_ativa()));
alter policy caso_etapas_select_compartilhada  on public.caso_etapas   using ((select public.eh_pessoa_ativa()));
alter policy despesas_select_compartilhada     on public.despesas      using ((select public.eh_pessoa_ativa()));
alter policy entregaveis_select_compartilhada  on public.entregaveis   using ((select public.eh_pessoa_ativa()));
alter policy escalas_select_compartilhada      on public.escalas       using ((select public.eh_pessoa_ativa()));
alter policy eventos_select_compartilhada      on public.eventos       using ((select public.eh_pessoa_ativa()));
alter policy feriados_leitura                  on public.feriados      using ((select public.eh_pessoa_ativa()));
alter policy handoffs_select_compartilhada     on public.handoffs      using ((select public.eh_pessoa_ativa()));
alter policy maternidades_select_compartilhada on public.maternidades  using ((select public.eh_pessoa_ativa()));
alter policy pacote_etapas_select_compartilhada on public.pacote_etapas using ((select public.eh_pessoa_ativa()));
alter policy pacotes_select_compartilhada      on public.pacotes       using ((select public.eh_pessoa_ativa()));
alter policy pessoas_select_compartilhada      on public.pessoas       using ((select public.eh_pessoa_ativa()));

-- ------------------------------------------------------------ escrita (adm)
alter policy casos_update_adm          on public.casos
  using ((select public.eh_adm())) with check ((select public.eh_adm()));
alter policy escalas_escrita_adm       on public.escalas
  using ((select public.eh_adm())) with check ((select public.eh_adm()));
alter policy feriados_escrita_adm      on public.feriados
  using ((select public.eh_adm())) with check ((select public.eh_adm()));
alter policy maternidades_escrita_adm  on public.maternidades
  using ((select public.eh_adm())) with check ((select public.eh_adm()));
alter policy pacote_etapas_escrita_adm on public.pacote_etapas
  using ((select public.eh_adm())) with check ((select public.eh_adm()));
alter policy pacotes_escrita_adm       on public.pacotes
  using ((select public.eh_adm())) with check ((select public.eh_adm()));
alter policy pessoas_escrita_adm       on public.pessoas
  using ((select public.eh_adm())) with check ((select public.eh_adm()));
