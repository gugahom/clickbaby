-- O ENCONTRO DE IRMÃOS DEIXA DE ABRIR UMA RODADA DE REELS (16/09/2026, pedido
-- do gestor: "tirar encontro de irmãos como reels e colocar como uma etapa a
-- mais de acompanhamento").
--
-- A REGRA QUE SAI, e ela era verdadeira quando foi escrita. Em 03/09/2026
-- (migration 20260903193219) o gestor contou um caso do campo: o reels tinha
-- sido concluído, a família viveu o encontro depois, e o material novo não
-- tinha onde ser registrado. Reabrir a rodada do parto misturaria dois
-- trabalhos no mesmo carimbo de tempo, e o tempo de ciclo da seção 9 sairia
-- errado nos dois. A saída foi uma rodada 3 de reels, criada por trigger quando
-- o encontro concluísse — as palavras dele foram "deve ser disponibilizado o
-- reels pra editar como encontro de irmãos".
--
-- DUAS SEMANAS DE OPERAÇÃO MUDARAM A REGRA. O encontro é ACOMPANHAMENTO: é o
-- que a equipe faz junto da família, na maternidade. Nem todo encontro vira
-- vertical, e a trigger decidia por ela — toda vez que alguém registrava o
-- encontro, aparecia uma edição para fazer. Em produção são 10 reels de rodada
-- 3 para 6 encontros concluídos, e 2 deles seguem pendentes: trabalho que
-- ninguém pediu, ocupando lugar na lista de quem edita.
--
-- O QUE FICA: a etapa `encontro_irmaos`, exatamente como ela já era — trilha
-- ACOMPANHAMENTO desde 31/08 (migration 20260831133153), ordem 9, fora de todo
-- pacote, entrando por `adicionar_etapa`, e sem pré-requisito desde 09/09
-- (registrar o que já aconteceu não espera por etapa nenhuma). É isso que "uma
-- etapa a mais de acompanhamento" quer dizer: ela não some, ela só para de
-- gerar edição sozinha.
--
-- E QUANDO O ENCONTRO PRECISAR DE VERTICAL? Pelo mesmo caminho de qualquer
-- material que nasce fora do contrato: `adicionar_etapa` para o reels, ou
-- `reabrir_caso` se o caso já encerrou. A diferença é quem decide — uma pessoa,
-- olhando o material, em vez de uma trigger que decide por todos.
--
-- O QUE JÁ EXISTE NÃO SE TOCA. As 10 rodadas 3 criadas até aqui ficam onde
-- estão, com seus eventos e seus tempos: 7 são trabalho concluído, e apagar
-- registro de trabalho feito é o contrário do que este sistema faz. As 2
-- pendentes se resolvem à mão, pela tela — dispensar, se ninguém as quer.

drop trigger if exists reels_do_encontro_de_irmaos on public.caso_etapas;

drop function if exists public.gerar_reels_do_encontro_de_irmaos();

comment on column public.caso_etapas.rodada is
  'Qual passagem de edição esta etapa é. 1 = material do parto (libera com o '
  'nascimento); 2 = material do banho e do fechamento (nasce quando o '
  'fechamento conclui). O número identifica o BLOCO DE CAPTURA, não a ordem de '
  'chegada: um caso sem rodada 2 pula direto para a 3. A rodada 3 foi do '
  'ENCONTRO DE IRMÃOS entre 03/09 e 16/09/2026, criada por trigger, e não é '
  'mais — o encontro voltou a ser só uma etapa de acompanhamento. As rodadas 3 '
  'ou acima que nascerem daqui em diante vêm de reabrir_caso, e são REVISÃO; as '
  'que já existem continuam sendo o encontro.';
