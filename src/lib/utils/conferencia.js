// Sugere empacotamento: quantas displays/maços cabem e o que sobra avulso
export const sugerirEmpacote = (qtd, uniDisplay, uniMaco) => {
  const displays = Math.floor((qtd || 0) / uniDisplay)
  const resto = (qtd || 0) % uniDisplay
  const macos = Math.floor(resto / uniMaco)
  const avulso = resto % uniMaco
  return { displays, macos, avulso }
}

// A revisadora conta vários dias de uma vez e o descarte vai tudo numa caixa só:
// ela sabe quanto entregou por dia (está na etiqueta do lote), mas não sabe de qual
// dia caiu cada cigarro reprovado. Então o aprovado total é rateado proporcionalmente
// ao entregue de cada dia, e a sobra do arredondamento fica no maior lote.
// Isso não mexe em dinheiro nenhum: paga-se o entregue, e a qualidade da quinzena é
// (soma do aprovado ÷ soma do entregue) — idêntica com ou sem rateio.
export const ratearRevisado = (itens, revisadoTotal) => {
  const totalEntregue = itens.reduce((s, i) => s + (i.entregue || 0), 0)
  if (totalEntregue <= 0) return itens.map(i => ({ ...i, revisada: 0 }))
  const alvo = Math.min(revisadoTotal, totalEntregue)
  const com = itens.map(i => {
    const exato = (i.entregue || 0) / totalEntregue * alvo
    return { ...i, revisada: Math.floor(exato) }
  })
  // Distribui o que sobrou do arredondamento, começando pelo maior lote
  let resto = alvo - com.reduce((s, i) => s + i.revisada, 0)
  const ordem = [...com].sort((a, b) => b.entregue - a.entregue)
  let k = 0
  while (resto > 0 && ordem.length) {
    const alvoItem = ordem[k % ordem.length]
    if (alvoItem.revisada < alvoItem.entregue) { alvoItem.revisada++; resto-- }
    k++
    if (k > ordem.length * 2 + alvo) break   // trava de segurança
  }
  return com
}

// Divide uma quantidade INTEIRA (displays, maços) entre vários lotes, proporcional
// ao peso de cada um. Não existe meio display: quem tem a maior fração sobrando leva
// a unidade extra, e a soma fecha exatamente com o total informado.
export const ratearInteiro = (pesos, total) => {
  const soma = pesos.reduce((s, p) => s + p, 0)
  if (soma <= 0 || total <= 0) return pesos.map(() => 0)
  const exatos = pesos.map(p => p / soma * total)
  const base = exatos.map(Math.floor)
  let resto = total - base.reduce((s, b) => s + b, 0)
  const ordem = exatos
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac)
  let k = 0
  while (resto > 0 && ordem.length) { base[ordem[k % ordem.length].i]++; resto--; k++ }
  return base
}

// Status da conferência produção × revisão/embalagem, com a mesma regra de tolerância
// usada em Alertas, Conferência e Dashboard — evita a fórmula divergir entre as telas.
// pendenteEmbalagem: revisão já foi lançada, mas ninguém completou a etapa de displays ainda.
export const statusConferencia = ({ temCQ, pendenteEmbalagem, base, perda, empacotado, tolerancia }) => {
  if (!temCQ) return 'aguardando'
  if (pendenteEmbalagem) return 'aguardando_embalagem'
  const diferenca = base - perda - empacotado
  const limite = Math.round(base * tolerancia / 100)
  if (Math.abs(diferenca) <= limite) return 'ok'
  return diferenca > 0 ? 'falta' : 'sobra'
}
