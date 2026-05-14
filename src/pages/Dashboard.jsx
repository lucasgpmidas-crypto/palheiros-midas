import { useMemo } from 'react'
import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from 'chart.js'
import { useRegistros, useFuncionarios, useConfig } from '../lib/hooks'
import { getHoje, fmtMoeda, fmtNum, getIniciais, avatarCor, pctMeta, corPct, getSemana, ultimosDias } from '../lib/utils'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

export default function Dashboard() {
  const hoje = getHoje()
  const { inicio: semIni, fim: semFim } = getSemana(hoje)
  const mesAtual = hoje.substring(0, 7)
  const { valorMil } = useConfig()
  const { funcionarios } = useFuncionarios()
  const { registros: regsHoje }   = useRegistros({ data: hoje })
  const { registros: regsSemana } = useRegistros({ dataInicio: semIni, dataFim: semFim })
  const { registros: regsMes }    = useRegistros({ dataInicio: mesAtual + '-01', dataFim: hoje })

  const stats = useMemo(() => {
    const ativos = funcionarios.filter(f => f.situacao === 'ativo')
    const valorQty = (r) => (r.aproveitado ?? r.quantidade) || 0
    const totalHoje   = regsHoje.reduce((s, r) => s + (r.quantidade || 0), 0)
    const valorHoje   = regsHoje.reduce((s, r) => s + valorQty(r), 0) / 1000 * valorMil
    const valorSemana = regsSemana.reduce((s, r) => s + valorQty(r), 0) / 1000 * valorMil
    const totalSemana = regsSemana.reduce((s, r) => s + (r.quantidade || 0), 0)
    const valorMesV   = regsMes.reduce((s, r) => s + valorQty(r), 0) / 1000 * valorMil
    const totalMes    = regsMes.reduce((s, r) => s + (r.quantidade || 0), 0)
    const ranking = [...regsHoje].sort((a, b) => b.quantidade - a.quantidade).map(r => ({ ...r, nome: r.funcionarios?.nome || '?' }))
    const dias7 = ultimosDias(7)
    const chartLabels = dias7.map(d => format(new Date(d + 'T12:00'), 'EEE', { locale: ptBR }))
    const chartData   = dias7.map(d => regsHoje.filter(r => r.data === d).reduce((s, r) => s + (r.quantidade || 0), 0))
    const statusFunc  = ativos.map(f => { const reg = regsHoje.find(r => r.func_id === f.id); const qty = reg?.quantidade || 0; return { ...f, qty, pct: pctMeta(qty, f.meta_diaria) } })
    return { totalHoje, valorHoje, valorSemana, totalSemana, valorMesV, totalMes, ranking, chartLabels, chartData, statusFunc, acima: statusFunc.filter(f => f.pct >= 100).length, abaixo: statusFunc.filter(f => f.pct > 0 && f.pct < 100).length, semReg: statusFunc.filter(f => f.pct === 0).length }
  }, [funcionarios, regsHoje, regsSemana, regsMes, valorMil])

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
    </div>
  )
}
