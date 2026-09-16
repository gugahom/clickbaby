/**
 * O QUE SE PERGUNTA ANTES DE TERMINAR UM VÍDEO OU UM FOTO/LIVRO.
 *
 * O texto mora aqui porque são DOIS caminhos para o mesmo fim, desde 16/09/2026:
 * escolher "Pronto para entrega" no seletor do cartão (FaseDoVideo, FaseDoAlbum)
 * e soltar o cartão na coluna de saída do quadro por fase (SecaoEmModal). Duas
 * cópias do mesmo aviso divergiriam na primeira correção — e o aviso é a última
 * coisa que alguém lê antes de uma ação que conclui a etapa.
 *
 * Num arquivo à parte, e não junto do componente, porque o Fast Refresh do Vite
 * só funciona quando um módulo de tela exporta apenas componentes.
 */
export const CONFIRMAR_FIM_DO_VIDEO = {
  titulo: 'Vídeo pronto para entrega',
  texto:
    'O link entra na lista de entregáveis do caso e o vídeo é finalizado — o cartão sai desta seção. Se a família pedir alteração depois, o caminho é “Pedir alteração no vídeo”, na linha da etapa dentro do card.',
  rotuloConfirmar: 'Finalizar com o link',
  campo: { rotulo: 'Link do vídeo', placeholder: 'https://' },
}

/** O fotolivro NÃO pede link: é objeto físico, entregue na mão da família. */
export const CONFIRMAR_FIM_DO_ALBUM = {
  titulo: 'Foto/Livro pronto para entrega?',
  texto:
    'A etapa conclui e o cartão sai desta seção. Se a família pedir alteração depois, o caminho é “Pedir alteração no Foto/Livro”, na linha da etapa dentro do card.',
  rotuloConfirmar: 'Concluir o Foto/Livro',
}
