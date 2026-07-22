import { useState, useEffect, useMemo, useCallback } from 'react'
import { format, subDays } from 'date-fns'
import { supabase } from './supabase'
import { useConfig } from './hooks'
import { getHoje, getQuinzenaAtual, fmtNum, fmtData } from './utils'

// Alertas proativos do admin: produção que não chegou na revisão (trajeto
// Barretos → Orlândia), contestações abertas, estoque baixo e quinzena sem
// fechamento. Centralizado aqui pra badge do menu e tela de Alertas baterem.
export function useAlertasProativos(enabled) {
  const { diasSemRevisao, estoqueMinimo, quinzenaD1, quinzenaD2 } = useConfig()
  const [dados, setDados] = useState({ regs: [], cq: [], contestacoes: [], fechamentos: [], entradaDisplays: 0, saidaDisplays: 0 })

  const fetch = useCallback(async () => {
    if (!enabled) return
    const ini = format(subDays(new Date(), 14), 'yyyy-MM-dd')
    const [regs, cq, cont, fech, entr, said] = await Promise.all([
      supabase.from('registros_producao').select('func_id, data, quantidade, funcionarios(nome)').gte('data', ini),
      supabase.from('controle_qualidade').select('func_id, data'),
      supabase.from('controle_qualidade').select('func_id, data, contestacao, funcionarios(nome)').eq('contestacao_status', 'aberta'),
      supabase.from('fechamentos').select('data_fim, status').eq('status', 'fechado'),
      supabase.from('controle_qualidade').select('display'),
      supabase.from('expedicoes').select('displays'),
    ])
    setDados({
      regs: regs.data || [],
      cq: cq.data || [],
      contestacoes: cont.data || [],
      fechamentos: fech.data || [],
      entradaDisplays: (entr.data || []).reduce((s, r) => s + (r.display || 0), 0),
      saidaDisplays: (said.data || []).reduce((s, r) => s + (r.displays || 0), 0),
    })
  }, [enabled])

  // Busca ao abrir, ao voltar o foco e a cada 5 minutos
  useEffect(() => {
    if (!enabled) return
    fetch()
    const onFocus = () => fetch()
    window.addEventListener('focus', onFocus)
    const t = setInterval(fetch, 5 * 60 * 1000)
    return () => { window.removeEventListener('focus', onFocus); clearInterval(t) }
  }, [enabled, fetch])

  const alertas = useMemo(() => {
    if (!enabled) return []
    const hoje = getHoje()
    const limite = format(subDays(new Date(), diasSemRevisao), 'yyyy-MM-dd')
    const lista = []

    // Produção declarada que nunca apareceu na revisão (possível sumiço no trajeto)
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

    // Contestações abertas aguardando o admin
    const contPorDia = new Map()
    dados.contestacoes.forEach(c => contPorDia.set(`${c.func_id}|${c.data}`, c))
    contPorDia.forEach(c => lista.push({
      id: `cont|${c.func_id}|${c.data}`,
      nivel: 'aviso',
      icone: '⚑',
      titulo: `Contestação aberta — ${c.funcionarios?.nome || 'Funcionário'} (${fmtData(c.data)})`,
      detalhe: c.contestacao || 'Resolver na tela Revisão & Empacote.',
    }))

    // Estoque abaixo do mínimo configurado (0 = desativado)
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
    const qz = getQuinzenaAtual(quinzenaD1, quinzenaD2)
    const fimAnterior = format(subDays(new Date(qz.inicio + 'T12:00'), 1), 'yyyy-MM-dd')
    const fechada = dados.fechamentos.some(f => f.data_fim >= fimAnterior)
    if (!fechada) lista.push({
      id: `fech|${fimAnterior}`,
      nivel: 'aviso',
      icone: '🔒',
      titulo: `Quinzena encerrada em ${fmtData(fimAnterior)} ainda sem fechamento`,
      detalhe: 'Depois de pagar, feche o período em Fechamento & Auditoria para travar os registros.',
    })

    return lista
  }, [enabled, dados, diasSemRevisao, estoqueMinimo, quinzenaD1, quinzenaD2])

  // Notificação do navegador (uma vez por alerta crítico novo)
  useEffect(() => {
    if (!enabled || !('Notification' in window) || Notification.permission !== 'granted') return
    const criticos = alertas.filter(a => a.nivel === 'critico')
    if (!criticos.length) return
    let vistos = []
    try { vistos = JSON.parse(localStorage.getItem('pm_alertas_notificados') || '[]') } catch { vistos = [] }
    const novos = criticos.filter(a => !vistos.includes(a.id))
    if (!novos.length) return
    new Notification('🚨 Palheiros Midas — Alerta', {
      body: novos.length === 1 ? novos[0].titulo : `${novos.length} alertas críticos: ` + novos.map(a => a.titulo).join(' · '),
      icon: '/pwa-192.png',
    })
    localStorage.setItem('pm_alertas_notificados', JSON.stringify([...vistos, ...novos.map(a => a.id)].slice(-200)))
  }, [enabled, alertas])

  return { alertas, total: alertas.length, criticos: alertas.filter(a => a.nivel === 'critico').length, refetch: fetch }
}
