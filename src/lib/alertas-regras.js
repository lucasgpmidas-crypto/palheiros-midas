import { format, subDays } from 'date-fns'
import { fmtNum, fmtData } from './utils'

// Monta a lista de alertas a partir do que ja veio do banco. Fica fora do hook
// e recebe `hoje` e o inicio da quinzena em vez de ler o relogio por dentro:
// era isso que impedia testar a regra sem subir React nem banco. Quem decide o
// que aparece para o admin — inclusive acusar producao sumida no trajeto — nao
// pode ser a unica parte do sistema sem teste.
export function montarAlertas({ dados, cfg, hoje, quinzenaInicio }) {
  const { diasSemRevisao, estoqueMinimo } = cfg
  const limite = format(subDays(new Date(hoje + 'T12:00'), diasSemRevisao), 'yyyy-MM-dd')
  const lista = []

  // Producao declarada que nunca apareceu na revisao (possivel sumico no trajeto)
  const temCQ = new Set(dados.cq.map(c => `${c.func_id}|${c.data}`))
  dados.regs
    .filter(r => r.data <= limite && r.data < hoje && !temCQ.has(`${r.func_id}|${r.data}`))
    .sort((a, b) => a.data.localeCompare(b.data))
    .forEach(r => lista.push({
      id: `semrev|${r.func_id}|${r.data}`,
      nivel: 'critico',
      icone: '🚨',
      titulo: `${r.funcionarios?.nome || 'Funcionário'} — ${fmtNum(r.quantidade)} un. sem revisão desde ${fmtData(r.data)}`,
      detalhe: `Produção declarada há ${diasSemRevisao}+ dias e nada chegou na revisão. Confira se o lote saiu de Barretos e chegou em Orlândia.`,
    }))

  // Contestacoes abertas aguardando o admin
  const contPorDia = new Map()
  dados.contestacoes.forEach(c => contPorDia.set(`${c.func_id}|${c.data}`, c))
  contPorDia.forEach(c => lista.push({
    id: `cont|${c.func_id}|${c.data}`,
    nivel: 'aviso',
    icone: '⚑',
    titulo: `Contestação aberta — ${c.funcionarios?.nome || 'Funcionário'} (${fmtData(c.data)})`,
    detalhe: c.contestacao || 'Resolver na tela Revisão & Empacote.',
  }))

  // Estoque abaixo do minimo configurado (0 = desativado)
  if (estoqueMinimo > 0) {
    const saldo = dados.entradaDisplays - dados.saidaDisplays
    if (saldo < estoqueMinimo) lista.push({
      id: `estoque|${saldo}`,
      nivel: 'aviso',
      icone: '📦',
      titulo: `Estoque baixo: ${fmtNum(saldo)} displays (mínimo: ${fmtNum(estoqueMinimo)})`,
      detalhe: 'Saldo total de displays abaixo do mínimo definido em Configurações.',
    })
  }

  // Quinzena anterior encerrada e ainda sem fechamento
  const fimAnterior = format(subDays(new Date(quinzenaInicio + 'T12:00'), 1), 'yyyy-MM-dd')
  const fechada = dados.fechamentos.some(f => f.data_fim >= fimAnterior)
  if (!fechada) lista.push({
    id: `fech|${fimAnterior}`,
    nivel: 'aviso',
    icone: '🔒',
    titulo: `Quinzena encerrada em ${fmtData(fimAnterior)} ainda sem fechamento`,
    detalhe: 'Depois de pagar, feche o período em Fechamento & Auditoria para travar os registros.',
  })

  return lista
}
