// Vocabulario visual da tela de CQ: a cor da etiqueta do tipo e a cor do
// aproveitamento. Funcoes puras, usadas pelo formulario, pela tabela e pela
// analise — por isso saíram de dentro do componente.
export const badgeTipo = (t) => ({ Original: 'b-blue', Menta: 'b-green', Ouro: 'b-gold', Outro: 'b-amber' }[t] || 'b-amber')

export const taxaCor = (t) => t >= 90 ? 'var(--green)' : t >= 70 ? 'var(--gold-light)' : 'var(--red)'
