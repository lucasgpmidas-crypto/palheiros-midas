import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from 'chart.js'
import { useRegistros, useFuncionarios, useConfig, useCQ } from '../lib/hooks'
import { getHoje, fmtMoeda, fmtNum, getIniciais, avatarCor, pctMeta, corPct, getSemana, ultimosDias, getMes, isProducao } from '../lib/utils'
import { format, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

export default function Dashboard() {
  const hoje = getHoje()
  const { inicio: semIni, fim: semFim } = getSemana(hoje)
  const mesAtual = hoje.substring(0, 7)
  const mesAnterior = format(subMonths(new Date(), 1), 'yyyy-MM')
  const { inicio: mesAntIni, fim: mesAntFim } = getMes(mesAnterior)

  const { valorMil, uniDisplay, uniMaco, tolerancia } = useConfig()
  const { funcionarios } = useFuncionarios()
  const { registros: regsHoje }   = useRegistros({ data: hoje })
  const { cqRegistros: cqHoje }   = useCQ({ dataInicio: hoje, dataFim: hoje })
  const { registros: regsSemana } = useRegistros({ dataInicio: semIni, dataFim: semFim })
  const { registros: regsMes }    = useRegistros({ dataInicio: mesAtual + '-01', dataFim: hoje })
  const { registros: regsUltMes } = useRegistros({ dataInicio: mesAntIni, dataFim: mesAntFim })

  const mesAtualNome = format(new Date(mesAtual + '-15'), 'MMMM', { locale: ptBR }).toUpperCase()
  const mesAntNome   = format(new Date(mesAnterior + '-15'), 'MMMM', { locale: ptBR }).toUpperCase()

  // Conferência de hoje: produzido × revisado/empacotado pela finalização
  const conf = useMemo(() => {
    const map = new Map()
    regsHoje.forEach(r => {
      map.set(`${r.func_id}`, { nome: r.funcionarios?.nome, produzido: r.quantidade || 0, entregue: 0, perda: 0, display: 0, macos: 0, temCQ: false })
    })
    cqHoje.forEach(c => {
      const k = `${c.func_id}`
      if (!map.has(k)) map.set(k, { nome: c.funcionarios?.nome, produzido: 0, entregue: 0, perda: 0, display: 0, macos: 0, temCQ: false })
      const x = map.get(k)
      x.temCQ = true
      x.entregue += c.entregue || 0
      x.perda += c.perda || 0
      x.display += c.display || 0
      x.macos += c.macos || 0
    })
    const linhas = [...map.values()].map(x => {
      const empacotado = x.display * uniDisplay + x.macos * uniMaco
      const base = x.produzido > 0 ? x.produzido : x.entregue
      const diferenca = base - x.perda - empacotado
      return { ...x, empacotado, base, diferenca }
    })
    const comCQ = linhas.filter(x => x.temCQ)
    const divergentes = comCQ.filter(x => Math.abs(x.diferenca) > Math.round(x.base * tolerancia / 100))
    return {
      ok: comCQ.length - divergentes.length,
      divergentes,
      aguardando: linhas.filter(x => !x.temCQ).length,
    }
  }, [regsHoje, cqHoje, uniDisplay, uniMaco, tolerancia])

  const stats = useMemo(() => {
    const ativos = funcionarios.filter(f => f.situacao === 'ativo' && isProducao(f))
    const valorQty = (r) => (r.aproveitado ?? r.quantidade) || 0
    const totalHoje   = regsHoje.reduce((s, r) => s + (r.quantidade || 0), 0)
    const valorHoje   = regsHoje.reduce((s, r) => s + valorQty(r), 0) / 1000 * valorMil
    const valorSemana = regsSemana.reduce((s, r) => s + valorQty(r), 0) / 1000 * valorMil
    const totalSemana = regsSemana.reduce((s, r) => s + (r.quantidade || 0), 0)
    const valorMesV   = regsMes.reduce((s, r) => s + valorQty(r), 0) / 1000 * valorMil
    const totalMes    = regsMes.reduce((s, r) => s + (r.quantidade || 0), 0)
    const totalUltMes = regsUltMes.reduce((s, r) => s + (r.quantidade || 0), 0)
    const valorUltMes = regsUltMes.reduce((s, r) => s + valorQty(r), 0) / 1000 * valorMil
    // Comparação justa: só os dias do mês anterior até o mesmo dia do mês atual
    // (senão o mês atual, ainda em andamento, sempre perde para o mês anterior completo)
    const diaAtual = hoje.slice(8, 10)
    const regsUltMesAteAgora = regsUltMes.filter(r => r.data.slice(8, 10) <= diaAtual)
    const totalUltMesAteAgora = regsUltMesAteAgora.reduce((s, r) => s + (r.quantidade || 0), 0)
    const valorUltMesAteAgora = regsUltMesAteAgora.reduce((s, r) => s + valorQty(r), 0) / 1000 * valorMil
    const diffPct     = totalUltMesAteAgora > 0 ? Math.round((totalMes - totalUltMesAteAgora) / totalUltMesAteAgora * 100) : null
    const diffUnits   = totalMes - totalUltMesAteAgora
    const diffValor   = valorMesV - valorUltMesAteAgora

    const ranking = [...regsHoje].sort((a, b) => b.quantidade - a.quantidade).map(r => ({ ...r, nome: r.funcionarios?.nome || '?' }))
    const dias7 = ultimosDias(7)
    const chartLabels = dias7.map(d => format(new Date(d + 'T12:00'), 'EEE', { locale: ptBR }))
    const chartData   = dias7.map(d => regsHoje.filter(r => r.data === d).reduce((s, r) => s + (r.quantidade || 0), 0))
    const statusFunc  = ativos.map(f => { const reg = regsHoje.find(r => r.func_id === f.id); const qty = reg?.quantidade || 0; return { ...f, qty, pct: pctMeta(qty, f.meta_diaria) } })
    return { totalHoje, valorHoje, valorSemana, totalSemana, valorMesV, totalMes, totalUltMes, valorUltMes, diffPct, diffUnits, diffValor, ranking, chartLabels, chartData, statusFunc, acima: statusFunc.filter(f => f.pct >= 100).length, abaixo: statusFunc.filter(f => f.pct > 0 && f.pct < 100).length, semReg: statusFunc.filter(f => f.pct === 0).length }
  }, [funcionarios, regsHoje, regsSemana, regsMes, regsUltMes, valorMil])

  const MEDALS = ['🥇', '🥈', '🥉']
  return (
    <div>
      <div className="stat-grid">
        {[
          { cls:'sc-gold',  sv:'sv-gold',  label:'Produção Hoje',   val:fmtNum(stats.totalHoje),      sub:'unidades produzidas', small:false },
          { cls:'sc-green', sv:'sv-green', label:'Valor do Dia',    val:fmtMoeda(stats.valorHoje),    sub:fmtMoeda(valorMil)+' por 1.000 un.', small:true },
          { cls:'sc-blue',  sv:'sv-blue',  label:'Valor Semanal',   val:fmtMoeda(stats.valorSemana),  sub:fmtNum(stats.totalSemana)+' un. semana', small:true },
          { cls:'sc-amber', sv:'sv-amber', label:'Valor Mensal',    val:fmtMoeda(stats.valorMesV),   sub:fmtNum(stats.totalMes)+' un. mês', small:true },
        ].map(x => (
          <div key={x.label} className={`stat-card ${x.cls}`}>
            <div className="stat-label">{x.label}</div>
            <div className={`stat-value ${x.sv}`} style={x.small?{fontSize:22}:{}}>{x.val}</div>
            <div className="stat-sub">{x.sub}</div>
          </div>
        ))}
      </div>

      <div className="g2">
        <div className="card">
          <div className="card-title">🏆 Ranking do Dia</div>
          {stats.ranking.length === 0
            ? <div className="empty-state"><div className="es-icon">📭</div><div className="es-text">Nenhum registro hoje</div></div>
            : stats.ranking.slice(0, 8).map((r, i) => {
                const pct = r.funcionarios?.meta_diaria ? pctMeta(r.quantidade, r.funcionarios.meta_diaria) : 0
                return (
                  <div className="rank-row" key={r.id}>
                    <div className={`rank-num ${i < 3 ? 'rn-' + (i + 1) : ''}`}>{MEDALS[i] || i + 1}</div>
                    <div className="rank-av" style={{ background: avatarCor(r.func_id) }}>{getIniciais(r.nome)}</div>
                    <div className="rank-info">
                      <div className="rank-name">{r.nome}</div>
                      <div className="pbar"><div className="pfill pf-gold" style={{ width: `${Math.min(100, pct)}%` }} /></div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'Barlow Condensed,sans-serif', fontSize: 18, fontWeight: 800, color: 'var(--gold-light)' }}>{fmtNum(r.quantidade)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{fmtMoeda((r.aproveitado ?? r.quantidade) / 1000 * valorMil)}</div>
                    </div>
                  </div>
                )
              })
          }
        </div>
        <div className="card">
          <div className="card-title">📈 Últimos 7 Dias</div>
          <div className="chart-wrap">
            <Bar data={{ labels: stats.chartLabels, datasets: [{ data: stats.chartData, backgroundColor: 'rgba(201,162,39,.2)', borderColor: '#C9A227', borderWidth: 1.5, borderRadius: 4 }] }}
              options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#5E6A8A', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,.04)' } }, y: { ticks: { color: '#5E6A8A', font: { size: 11 }, callback: v => fmtNum(v) }, grid: { color: 'rgba(255,255,255,.04)' } } } }} />
          </div>
        </div>
      </div>

      <div className="g2">
        <div className="card">
          <div className="card-title">👥 Status da Equipe</div>
          {stats.statusFunc.length === 0 ? <div className="empty-state"><div className="es-icon">👥</div><div className="es-text">Cadastre funcionários para ver o status</div></div>
            : stats.statusFunc.map(f => (
            <div key={f.id} style={{ marginBottom: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 13 }}>{f.nome}</span>
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>{f.qty ? fmtNum(f.qty) + ' un.' : 'Sem registro'}</span>
              </div>
              <div className="pbar"><div className={`pfill ${f.pct >= 100 ? 'pf-green' : f.pct >= 70 ? 'pf-gold' : f.pct > 0 ? 'pf-amber' : ''}`} style={{ width: `${Math.min(100, f.pct)}%` }} /></div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{f.pct}% da meta ({fmtNum(f.meta_diaria)} un.)</div>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-title">📊 Desempenho vs Meta</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
            {[['Atingiram', stats.acima, 'var(--green)', 'rgba(40,180,133,.08)', 'rgba(40,180,133,.2)'], ['Abaixo', stats.abaixo, 'var(--amber)', 'rgba(245,158,11,.08)', 'rgba(245,158,11,.2)'], ['Sem Reg.', stats.semReg, 'var(--red)', 'rgba(232,64,64,.08)', 'rgba(232,64,64,.2)']].map(([l, v, cor, bg, border]) => (
              <div key={l} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: '13px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: cor }}>{v}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{l}</div>
              </div>
            ))}
          </div>
          {stats.statusFunc.map(f => (
            <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13 }}>{f.pct >= 100 ? '✅' : f.pct >= 70 ? '📈' : f.pct > 0 ? '⚠️' : '❌'} {f.nome}</span>
              <span style={{ fontSize: 13, color: corPct(f.pct), fontWeight: 700 }}>{f.pct}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Conferência de hoje */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>⚖️ Conferência de Hoje</span>
          <Link to="/conferencia" className="btn btn-secondary btn-sm" style={{ textTransform: 'none', letterSpacing: 0 }}>Ver completa →</Link>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: conf.divergentes.length ? 12 : 0 }}>
          {[['✓ Conferem', conf.ok, 'var(--green)'], ['⚠ Divergências', conf.divergentes.length, conf.divergentes.length ? 'var(--red)' : 'var(--text3)'], ['⏳ Aguardando revisão', conf.aguardando, 'var(--blue)']].map(([l, v, c]) => (
            <div key={l} className="stats-chip"><span style={{ color: 'var(--text3)' }}>{l}: </span><strong style={{ color: c }}>{v}</strong></div>
          ))}
        </div>
        {conf.divergentes.map((d, i) => (
          <div key={i} className={`alert ${d.diferenca > 0 ? 'a-danger' : 'a-warn'}`}>
            <div style={{ fontSize: 17 }}>{d.diferenca > 0 ? '▼' : '▲'}</div>
            <div>
              <strong>{d.nome} — {d.diferenca > 0 ? `faltam ${fmtNum(d.diferenca)} un.` : `sobra de ${fmtNum(Math.abs(d.diferenca))} un.`}</strong>
              <span>Base: {fmtNum(d.base)} un. · Perda: {fmtNum(d.perda)} un. · Empacotado: {fmtNum(d.empacotado)} un.</span>
            </div>
          </div>
        ))}
      </div>

      {/* Comparativo Mensal */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">🗓 Comparativo Mensal</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div style={{ background: 'var(--bg3)', border: '1px solid rgba(201,162,39,.2)', borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ fontSize: 10, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, fontWeight: 700 }}>
              {mesAtualNome} — atual
            </div>
            <div style={{ fontFamily: 'Barlow Condensed,sans-serif', fontSize: 28, fontWeight: 800, color: 'var(--gold-light)' }}>{fmtNum(stats.totalMes)}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>unidades</div>
            <div style={{ fontFamily: 'Barlow Condensed,sans-serif', fontSize: 20, fontWeight: 700, color: 'var(--green)' }}>{fmtMoeda(stats.valorMesV)}</div>
          </div>
          <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, fontWeight: 700 }}>
              {mesAntNome} — anterior
            </div>
            <div style={{ fontFamily: 'Barlow Condensed,sans-serif', fontSize: 28, fontWeight: 800, color: 'var(--text2)' }}>{fmtNum(stats.totalUltMes)}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>unidades</div>
            <div style={{ fontFamily: 'Barlow Condensed,sans-serif', fontSize: 20, fontWeight: 700, color: 'var(--text2)' }}>{fmtMoeda(stats.valorUltMes)}</div>
          </div>
        </div>
        {stats.diffPct !== null && (
          <div style={{ textAlign: 'center', padding: '10px 0', borderTop: '1px solid var(--border)', fontSize: 14 }}>
            <span style={{ fontWeight: 800, color: stats.diffPct >= 0 ? 'var(--green)' : 'var(--red)', fontFamily: 'Barlow Condensed,sans-serif', fontSize: 18 }}>
              {stats.diffPct >= 0 ? '↑' : '↓'} {Math.abs(stats.diffPct)}%
            </span>
            <span style={{ color: 'var(--text3)', marginLeft: 8, fontSize: 12.5 }}>
              {stats.diffPct >= 0 ? 'acima' : 'abaixo'} do mês anterior (mesmo período)
              {' · '}{stats.diffUnits >= 0 ? '+' : ''}{fmtNum(stats.diffUnits)} un.{' · '}{stats.diffUnits >= 0 ? '+' : ''}{fmtMoeda(stats.diffValor)}
            </span>
          </div>
        )}
        {stats.diffPct === null && (
          <div style={{ textAlign: 'center', padding: '10px 0', borderTop: '1px solid var(--border)', fontSize: 12.5, color: 'var(--text3)' }}>
            Sem dados do mês anterior para comparar
          </div>
        )}
      </div>
    </div>
  )
}
