// ── Fila de registros que ainda não chegaram ao banco ────────────────────────
// No galpão o sinal cai. Sem isso, o parceiro toca em "registrar", vê o erro em
// vermelho e o número se perde — ele tem que lembrar de refazer mais tarde.
//
// Aqui o registro é guardado no próprio aparelho e reenviado sozinho quando a
// conexão volta. Três decisões que valem explicar:
//
// 1. A data fica congelada no momento em que ELE registrou, não no momento em
//    que o envio deu certo. É o motivo de `registrar_producao` ter passado a
//    aceitar a data (migracao_registro_offline.sql): o dia em que a requisição
//    chega ao banco pode ser outro.
//
// 2. Cada item é enviado só quando o MESMO funcionário estiver logado. Celular
//    emprestado é comum; sem essa trava, o registro de um sairia assinado pelo
//    outro — e produção lançada na conta errada vira dinheiro na conta errada.
//
// 3. A chave é (funcionário, dia), igual à da tabela. Registrar duas vezes o
//    mesmo dia offline substitui, e reenviar o mesmo item duas vezes não
//    duplica nada, porque no banco a gravação é um upsert.

const CHAVE = 'pm_fila_producao'
const LIMITE = 30   // aparelho de trabalho, não arquivo morto

// Aparelho sem localStorage (aba anônima trancada, por exemplo) não pode
// derrubar o app: a fila vira memória volátil e o registro segue online.
const memoria = new Map()
const armazenamentoDeMemoria = {
  getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
  setItem: (k, v) => memoria.set(k, v),
}

const padrao = () => {
  try {
    if (typeof localStorage === 'undefined') return armazenamentoDeMemoria
    localStorage.setItem('pm_teste', '1')
    localStorage.removeItem('pm_teste')
    return localStorage
  } catch { return armazenamentoDeMemoria }
}

export const chaveItem = (funcId, data) => `${funcId}|${data}`

export function lerFila(store = padrao()) {
  try {
    const bruto = JSON.parse(store.getItem(CHAVE))
    return Array.isArray(bruto) ? bruto : []
  } catch { return [] }
}

// O aviso na tela do parceiro acompanha a fila por este evento — sem ele, quem
// guardou um registro só veria o aviso aparecer na próxima navegação.
export const EVENTO = 'pm-fila'

export function escreverFila(itens, store = padrao()) {
  try { store.setItem(CHAVE, JSON.stringify(itens.slice(-LIMITE))) } catch {}
  try { window.dispatchEvent(new Event(EVENTO)) } catch {}
  return itens
}

// Guarda (ou substitui) o registro de um dia. Devolve o item como ficou.
export function enfileirar({ funcId, quantidade, data, obs }, store = padrao()) {
  const item = {
    chave: chaveItem(funcId, data),
    funcId, quantidade, data,
    obs: obs || null,
    criadoEm: new Date().toISOString(),
  }
  const restante = lerFila(store).filter(i => i.chave !== item.chave)
  escreverFila([...restante, item], store)
  return item
}

export function removerDaFila(chave, store = padrao()) {
  escreverFila(lerFila(store).filter(i => i.chave !== chave), store)
}

// O que está guardado de uma pessoa só — é o que a tela dela mostra.
export const itensDe = (funcId, store = padrao()) =>
  lerFila(store).filter(i => i.funcId === funcId)

// Falha de rede é diferente de recusa do servidor. A primeira se resolve
// sozinha quando o sinal voltar; a segunda nunca vai passar por mais que se
// insista, e insistir calado deixaria o item preso para sempre.
export function classificarErro(error) {
  if (!error) return null
  const msg = String(error.message || error)
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'rede'
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(msg)) return 'rede'
  if (/sessao_invalida/i.test(msg)) return 'sessao'
  return 'recusado'
}

export function motivoLegivel(error) {
  const msg = String(error?.message || error || '')
  const antiga = msg.match(/data_antiga:(\d+)/)
  if (antiga) return `ficou guardado mais de ${antiga[1]} dias — peça para a direção lançar`
  if (/data_futura/i.test(msg)) return 'a data do aparelho está adiantada'
  if (/quantidade inválida/i.test(msg)) return 'a quantidade não foi aceita'
  if (/fechad/i.test(msg)) return 'essa quinzena já foi fechada'
  return msg || 'o banco recusou'
}

// Tenta enviar o que está guardado desta pessoa. `enviar` é injetado para o
// teste não precisar de rede — em produção é a chamada da função do banco.
// Para no primeiro problema de rede ou de sessão: se um não passou, os
// seguintes também não vão passar, e martelar o servidor não ajuda ninguém.
export async function enviarFila({ funcId, token, enviar, store = padrao() }) {
  const resultado = { enviados: 0, recusados: [], pendentes: 0, parouPor: null }
  if (!funcId || !token) {
    resultado.pendentes = itensDe(funcId, store).length
    if (resultado.pendentes) resultado.parouPor = 'sessao'
    return resultado
  }

  for (const item of itensDe(funcId, store)) {
    let erro = null
    try {
      const r = await enviar({
        p_token: token,
        p_quantidade: item.quantidade,
        p_obs: item.obs,
        p_data: item.data,
      })
      erro = r?.error || null
    } catch (e) { erro = e }

    const tipo = classificarErro(erro)
    if (!tipo) { removerDaFila(item.chave, store); resultado.enviados++; continue }
    if (tipo === 'recusado') {
      removerDaFila(item.chave, store)
      resultado.recusados.push({ data: item.data, quantidade: item.quantidade, motivo: motivoLegivel(erro) })
      continue
    }
    resultado.parouPor = tipo
    break
  }

  resultado.pendentes = itensDe(funcId, store).length
  return resultado
}
