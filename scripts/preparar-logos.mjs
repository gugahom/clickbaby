/**
 * Prepara os assets de marca a partir dos arquivos originais do cliente.
 *
 * POR QUE ISTO É UM SCRIPT
 * Os originais têm 5835px de largura e ~190KB cada. Nenhuma tela usa mais que
 * ~400px, e o logo do cabeçalho carrega em toda navegação. Quando o cliente
 * mandar uma versão nova, o próximo a mexer precisa saber exatamente o que foi
 * feito — daí o script, e não um passo perdido no histórico de um chat.
 *
 * O QUE ELE GERA
 *   public/logo-clickbaby.png        colorida, 1200px  -> login
 *   public/logo-clickbaby-preta.png  preta,    1200px  -> cabeçalho do Quadro
 *   public/favicon.png               só o diafragma, 256px quadrado
 *
 * O favicon recorta APENAS a lente colorida, não o logo inteiro. A 16px, a
 * silhueta da câmera e a caligrafia viram borrão; o diafragma é circular e tem
 * as duas cores da marca, então sobrevive ao tamanho. O recorte é achado pelos
 * pixels rosa/azul, não por coordenada fixa, para não quebrar se a arte mudar
 * de proporção.
 *
 * Sem dependência nova: PNG é zlib mais desfiltragem de scanline, e o Node já
 * traz zlib. Instalar sharp para três arquivos que se geram uma vez por ano
 * seria trocar 40KB de asset por megabytes de node_modules.
 *
 * Uso:  node scripts/preparar-logos.mjs <pasta-com-os-originais>
 *       (espera LOGO_COLOR.png e LOGO_PRETA.png lá dentro)
 */

import { deflateSync, inflateSync } from 'node:zlib'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const origem = process.argv[2]

if (!origem) {
  console.error('Uso: node scripts/preparar-logos.mjs <pasta-com-os-originais>')
  process.exit(1)
}

// -----------------------------------------------------------------------
// PNG: leitura
// -----------------------------------------------------------------------

function lerPng(caminho) {
  const d = readFileSync(caminho)
  let pos = 8
  const pedacos = []
  let larg, alt, bits, tipoCor

  while (pos < d.length) {
    const tam = d.readUInt32BE(pos)
    const tipo = d.toString('ascii', pos + 4, pos + 8)
    if (tipo === 'IHDR') {
      larg = d.readUInt32BE(pos + 8)
      alt = d.readUInt32BE(pos + 12)
      bits = d[pos + 16]
      tipoCor = d[pos + 17]
    } else if (tipo === 'IDAT') {
      pedacos.push(d.subarray(pos + 8, pos + 8 + tam))
    } else if (tipo === 'IEND') break
    pos += 12 + tam
  }

  if (bits !== 8) throw new Error(`${caminho}: só trato bit depth 8, veio ${bits}`)
  const canais = { 0: 1, 2: 3, 4: 2, 6: 4 }[tipoCor]
  if (!canais) throw new Error(`${caminho}: tipo de cor ${tipoCor} não suportado`)

  const bruto = inflateSync(Buffer.concat(pedacos))
  const bpp = canais
  const largBytes = larg * bpp
  const linhas = []
  let anterior = Buffer.alloc(largBytes)
  let p = 0

  for (let y = 0; y < alt; y++) {
    const filtro = bruto[p++]
    const linha = Buffer.from(bruto.subarray(p, p + largBytes))
    p += largBytes
    for (let i = 0; i < largBytes; i++) {
      const a = i >= bpp ? linha[i - bpp] : 0
      const b = anterior[i]
      const c = i >= bpp ? anterior[i - bpp] : 0
      let x = linha[i]
      if (filtro === 1) x += a
      else if (filtro === 2) x += b
      else if (filtro === 3) x += (a + b) >> 1
      else if (filtro === 4) {
        const pa = Math.abs(b - c)
        const pb = Math.abs(a - c)
        const pc = Math.abs(a + b - 2 * c)
        x += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      linha[i] = x & 0xff
    }
    linhas.push(linha)
    anterior = linha
  }

  return { larg, alt, canais, linhas }
}

// -----------------------------------------------------------------------
// PNG: escrita
// -----------------------------------------------------------------------

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function bloco(tipo, dados) {
  const cabeca = Buffer.alloc(4)
  cabeca.writeUInt32BE(dados.length)
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados])
  const fim = Buffer.alloc(4)
  fim.writeUInt32BE(crc32(corpo))
  return Buffer.concat([cabeca, corpo, fim])
}

function gravarPng(caminho, { larg, alt, canais, linhas }) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(larg, 0)
  ihdr.writeUInt32BE(alt, 4)
  ihdr[8] = 8
  ihdr[9] = canais === 4 ? 6 : 2
  const bruto = Buffer.concat(linhas.map((l) => Buffer.concat([Buffer.from([0]), l])))
  writeFileSync(
    caminho,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      bloco('IHDR', ihdr),
      bloco('IDAT', deflateSync(bruto, { level: 9 })),
      bloco('IEND', Buffer.alloc(0)),
    ]),
  )
}

// -----------------------------------------------------------------------
// Redução por média de caixa, com alfa pré-multiplicado
//
// Sem pré-multiplicar, a borda do traço mistura a cor com o preto invisível
// dos pixels transparentes e aparece um halo escuro em volta das letras.
// -----------------------------------------------------------------------

function reduzir(img, novaLarg, recorte) {
  const { canais, linhas } = img
  const cx = recorte ? recorte.x : 0
  const cy = recorte ? recorte.y : 0
  const cw = recorte ? recorte.larg : img.larg
  const ch = recorte ? recorte.alt : img.alt

  const fator = cw / novaLarg
  const novaAlt = Math.max(1, Math.round(ch / fator))
  const saida = []

  for (let y = 0; y < novaAlt; y++) {
    const y0 = cy + Math.floor(y * fator)
    const y1 = Math.min(cy + ch, Math.max(y0 + 1, cy + Math.floor((y + 1) * fator)))
    const linha = Buffer.alloc(novaLarg * canais)

    for (let x = 0; x < novaLarg; x++) {
      const x0 = cx + Math.floor(x * fator)
      const x1 = Math.min(cx + cw, Math.max(x0 + 1, cx + Math.floor((x + 1) * fator)))
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let n = 0

      for (let yy = y0; yy < y1; yy++) {
        if (yy < 0 || yy >= img.alt) continue
        const src = linhas[yy]
        for (let xx = x0; xx < x1; xx++) {
          if (xx < 0 || xx >= img.larg) continue
          const o = xx * canais
          const al = canais === 4 ? src[o + 3] : 255
          r += src[o] * al
          g += src[o + 1] * al
          b += src[o + 2] * al
          a += al
          n++
        }
      }

      if (n === 0) n = 1
      const am = Math.round(a / n)
      const o = x * canais
      const div = Math.max(am, 1) * n
      linha[o] = Math.min(255, Math.round(r / div))
      linha[o + 1] = Math.min(255, Math.round(g / div))
      linha[o + 2] = Math.min(255, Math.round(b / div))
      if (canais === 4) linha[o + 3] = am
    }
    saida.push(linha)
  }

  return { larg: novaLarg, alt: novaAlt, canais, linhas: saida }
}

// -----------------------------------------------------------------------
// Onde está o diafragma: caixa dos pixels rosa/azul da METADE ESQUERDA.
//
// A metade importa: a palavra ESTÚDIO também é rosa, e sem esse limite a caixa
// esticaria da lente até o texto, do outro lado da arte.
// -----------------------------------------------------------------------

function caixaDoDiafragma(img) {
  const { larg, alt, canais, linhas } = img
  let x0 = larg
  let y0 = alt
  let x1 = 0
  let y1 = 0

  for (let y = 0; y < alt; y++) {
    const l = linhas[y]
    for (let x = 0; x < Math.floor(larg / 2); x++) {
      const o = x * canais
      if (canais === 4 && l[o + 3] < 200) continue
      const r = l[o]
      const g = l[o + 1]
      const b = l[o + 2]
      const rosa = r > 220 && g > 110 && g < 190 && b > 170 && b < 230
      const azul = r > 130 && r < 190 && g > 150 && g < 205 && b > 190
      if (!rosa && !azul) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }

  if (x1 <= x0 || y1 <= y0) throw new Error('não achei os pixels da lente na metade esquerda')

  // Quadrado em volta do centro da lente, com folga — o diafragma é redondo e
  // encostá-lo na borda do favicon o faz parecer cortado.
  const lado = Math.round(Math.max(x1 - x0, y1 - y0) * 1.18)
  const meioX = Math.round((x0 + x1) / 2)
  const meioY = Math.round((y0 + y1) / 2)
  return {
    x: Math.max(0, meioX - Math.round(lado / 2)),
    y: Math.max(0, meioY - Math.round(lado / 2)),
    larg: lado,
    alt: lado,
  }
}

// -----------------------------------------------------------------------

const alvos = [
  ['LOGO_COLOR.png', 'logo-clickbaby.png', 1200],
  ['LOGO_PRETA.png', 'logo-clickbaby-preta.png', 1200],
]

let colorida = null

for (const [nomeOrigem, nomeDestino, largura] of alvos) {
  const caminho = join(origem, nomeOrigem)
  if (!existsSync(caminho)) {
    console.error(`Não encontrei ${caminho}`)
    process.exit(1)
  }
  const img = lerPng(caminho)
  if (nomeOrigem === 'LOGO_COLOR.png') colorida = img
  const menor = reduzir(img, largura)
  const destino = join(raiz, 'public', nomeDestino)
  gravarPng(destino, menor)
  const antes = readFileSync(caminho).length
  const depois = readFileSync(destino).length
  console.log(
    `  ${nomeDestino.padEnd(28)} ${img.larg}x${img.alt} -> ${menor.larg}x${menor.alt}  ` +
      `${(antes / 1024).toFixed(0)}KB -> ${(depois / 1024).toFixed(0)}KB`,
  )
}

const caixa = caixaDoDiafragma(colorida)
const favicon = reduzir(colorida, 256, caixa)
gravarPng(join(raiz, 'public', 'favicon.png'), favicon)
const tamFav = readFileSync(join(raiz, 'public', 'favicon.png')).length
console.log(
  `  ${'favicon.png'.padEnd(28)} recorte ${caixa.larg}x${caixa.alt} em (${caixa.x},${caixa.y}) ` +
    `-> 256x256  ${(tamFav / 1024).toFixed(0)}KB`,
)
