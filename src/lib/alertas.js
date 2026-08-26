import { useState, useEffect, useMemo, useCallback } from 'react'
import { format, subDays } from 'date-fns'
import { supabase, buscarPaginado } from './supabase'
import { useConfig } from './hooks'
import { getHoje, getQuinzenaAtual } from './utils'
import { montarAlertas } from './alertas-regras'

// Alertas proativos do admin: produção que não chegou na revisão (trajeto
// Barretos → Orlândia), contestações abertas, estoque baixo e quinzena sem
// fechamento. Centralizado aqui pra badge do menu e tela de Alertas baterem.
export function useAlertasProativos(enabled) {
  const { diasSemRevisao, estoqueMinimo, quinzenaD1, quinzenaD2 } = useConfig()
  const [dados, setDados] = useState({ regs: [], cq: [], contestacoes: [], fechamentos: [], entradaDisplays: 0, saidaDisplays: 0 })

  const fetch = useCallback(async () => {
    if (!enabled) return
    const ini = format(subDays(new Date(), 14), 'yyyy-MM-dd')
    // A conferência é cruzada só com os registros da janela, então a busca dela
    // também é limitada à janela: sem esse filtro a consulta lia a tabela inteira e
    // parava na linha mil, fazendo o app acusar "sem revisão" dias que foram
    // revistos — só porque a linha não coube na resposta.
    // O saldo de estoque não tem janela (é o histórico todo), então vem paginado.
    try {
      const [regs, cq, cont, fech, entr, said] = await Promise.all([
        supabase.from('registros_producao').select('func_id, data, quantidade, funcionarios(nome)').gte('data', ini),
        supabase.from('controle_qualidade').select('func_id, data').gte('data', ini),
        supabase.from('controle_qualidade').select('func_id, data, contestacao, funcionarios(nome)').eq('contestacao_status', 'aberta'),
        supabase.from('fechamentos').select('data_fim, status').eq('status', 'fechado'),
        buscarPaginado(() => supabase.from('controle_qualidade').select('display').order('id')),
        buscarPaginado(() => supabase.from('expedicoes').select('displays').order('id')),
      ])
      setDados({
        regs: regs.data || [],
        cq: cq.data || [],
        contestacoes: cont.data || [],
        fechamentos: fech.data || [],
        entradaDisplays: entr.reduce((s, r) => s + (r.display || 0), 0),
        saidaDisplays: said.reduce((s, r) => s + (r.displays || 0), 0),
      })
    } catch {
      // Sino do menu: falhar em silêncio é melhor do que um toast a cada 5 minutos.
      // O que não pode é mostrar alerta com base em dado pela metade.
    }
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
    return montarAlertas({
      dados,
      cfg: { diasSemRevisao, estoqueMinimo },
      hoje: getHoje(),
      quinzenaInicio: getQuinzenaAtual(quinzenaD1, quinzenaD2).inicio,
    })
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
