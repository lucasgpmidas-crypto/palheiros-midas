// As funções de gravação do banco recusam quem não tem sessão válida. Para quem
// está usando, "sessao_invalida" não quer dizer nada — o que aconteceu é que o
// acesso caiu e é preciso entrar de novo.
const traduzErro = (error) => {
  const msg = error?.message || ''
  if (msg.includes('sessao_invalida')) return 'Seu acesso expirou. Entre de novo com seu PIN.'
  return msg || 'erro desconhecido'
}

export { traduzErro }
