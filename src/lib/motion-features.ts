/**
 * Motor de animação do `motion`, isolado num módulo próprio.
 *
 * Existe só para virar um chunk separado: o `LazyMotion` em main.tsx importa
 * isto DINAMICAMENTE, então o motor sai do bundle inicial e chega depois da
 * primeira pintura. Importar `domAnimation` direto no main.tsx funcionaria
 * igual em tela, mas o Rollup o deixaria no chunk principal — que é o que se
 * está tentando evitar.
 *
 * `domAnimation` cobre gestos (whileTap/whileHover) e saída (AnimatePresence),
 * que é tudo o que os botões usam. `domMax` acrescentaria layout e drag, que
 * não existem aqui.
 */
export { domAnimation as default } from 'motion/react'
