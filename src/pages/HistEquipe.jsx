import { useState, useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from 'chart.js'
import { subDays, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useRegistros, useFuncionarios, useConfig, useCQ } from '../lib/hooks'
import { getHoje, fmtMoeda, fmtNum, pctMeta, avatarCor, getIniciais, exportCSV, isProducao } from '../lib/utils'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

const COLORS = ['#C9A227', '#3B82F6', '#28B485', '#8B5CF6', '#F59E0B', '#06B6D4', '#EC4899', '#EF4444']

export default function HistEquipe() {
  const [periodo, setPeriodo] = useState('30')
  const { funcionarios } = useFuncionarios()
  const { valorMil } = useConfig()
  const hoje = getHoje()
  const ini  = format(subDays(new Date(), Number(periodo)), 'yyyy-MM-dd')
  const { registros, loading } = useRegistros({ dataInicio: ini, dataFim: hoje })
  const { cqRegistros } = useCQ({ dataInicio: ini, dataFim: hoje })

  const ativos = funcionarios.filter(f => f.situacao === 'ativo' && isProducao(f))

  const stats = useMemo(() => {
    const totalQty = registros.reduce((s, r) => s + r.quantidade, 0)
    const totalVal = registros.reduce((s, r) => s + Number(r.valor || 0), 0)
    const diasUnicos = [...new Set(registros.map(r => r.data))].length
    const mediaEquipe = diasUnicos > 0 && ativos.length > 0 ? Math.round(totalQty / (diasUnicos * ativos.length)) : 0

    // Perda real vem da revisão da finalização (controle_qualidade), não do
    // campo "aproveitado" de registros_producao — que ninguém preenche nesse fluxo.
    const perdaPorFunc = new Map()
    cqRegistros.forEach(c => perdaPorFunc.set(c.func_id, (perdaPorFunc.get(c.func_id) || 0) + (c.perda || 0)))
    const totalPerd = [...perdaPorFunc.values()].reduce((s, p) => s + p, 0)

    const allDays = Array.from({ length: Number(periodo) }, (_, i) =>
      format(subDays(new Date(), Number(periodo) - 1 - i), 'yyyy-MM-dd')
    )
    const chartLabels = allDays.map(d => format(new Date(d + 'T12:00'), 'dd/MM', { locale: ptBR }))
    const datasets = ativos.map((f, i) => ({
      label: f.nome.split(' ')[0],
      data: allDays.map(d => { const r = registros.find(x => x.func_id === f.id && x.data === d); return r ? r.quantidade : null }),
      borderColor: COLORS[i % COLORS.length],
      backgroundColor: COLORS[i % COLORS.length] + '20',
      borderWidth: 2, pointRadius: 2, tension: .3, spanGaps: true,
    }))

    const porFunc = ativos.map(f => {
      const fr = registros.filter(r => r.func_id === f.id)
      const tot  = fr.reduce((s, r) => s + r.quantidade, 0)
      const val  = fr.reduce((s, r) => s + Number(r.valor || 0), 0)
      const dias = new Set(fr.map(r => r.data)).size
      const media = dias > 0 ? Math.round(tot / dias) : 0
      const pct   = pctMeta(media, f.meta_diaria)
      const diasMeta = fr.filter(r => r.quantidade >= f.meta_diaria).length
      const perda = perdaPorFunc.get(f.id) || 0
      return { f, tot, val, dias, media, pct, diasMeta, perda }
    }).sort((a, b) => b.tot - a.tot)

    return { totalQty, totalVal, totalPerd, diasUnicos, mediaEquipe, chartLabels, datasets, porFunc }
  }, [registros, cqRegistros, ativos, periodo, valorMil])

  const exportar = () => exportCSV(
    [['Funcionário', 'Total', 'Valor', 'Dias', 'Média/Dia', 'Eficiência', 'Dias na Meta', 'Perda (revisão)'],
     ...stats.porFunc.map(({ f, tot, val, dias, media, pct, diasMeta, perda }) => [f.nome, tot, `R$${val.toFixed(2)}`, dias, media, pct + '%', diasMeta + '/' + dias, perda])],
    `equipe_${periodo}d.csv`
  )

  const MEDALS = ['🥇', '🥈', '🥉']
  const taxaCor = (p) => p >= 100 ? 'var(--green)' : p >= 70 ? 'var(--gold-light)' : 'var(--red)'

  return (
    <div>
      <div className="card mb16">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="fg" style={{ margin: 0 }}>
            <label>Período</label>
            <select value={periodo} onChange={e => setPeriodo(e.target.value)}>
              {[['7','7 dias'],['15','15 dias'],['30','30 dias'],['60','60 dias']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <button className="btn btn-secondary" onClick={exportar}>⬇ CSV</button>
        </div>
      </div>

      <div className="stat-grid mb16">
        {[
          { cls:'sc-gold',  sv:'sv-gold',  label:'Total Equipe',       val:fmtNum(stats.totalQty)+' un.' },
          { cls:'sc-green', sv:'sv-green', label:'Valor Total',         val:fmtMoeda(stats.totalVal), small:true },
          { cls:'sc-blue',  sv:'sv-blue',  label:'Média/Dia/Operador',  val:fmtNum(stats.mediaEquipe)+' un.' },
          { cls:'sc-amber', sv:'sv-amber', label:'Dias Registrados',    val:stats.diasUnicos+' de '+periodo },
          { cls:'sc-red',   sv:'sv-red',   label:'Perda Equipe (revisão)', val:fmtNum(stats.totalPerd)+' un.' },
        ].map(x => (
          <div key={x.label} className={`stat-card ${x.cls}`}>
            <div className="stat-label">{x.label}</div>
            <div className={`stat-value ${x.sv}`} style={x.small ? { fontSize: 20 } : {}}>{x.val}</div>
          </div>
        ))}
      </div>

      <div className="g2">
        <div className="card">
          <div className="card-title">📈 Evolução por Funcionário</div>
          <div className="chart-wrap">
            {loading ? <div className="loading"><div className="spin" /></div>
              : <Line
                  data={{ labels: stats.chartLabels, datasets: stats.datasets }}
                  options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#9CA5C2', font: { size: 11 }, boxWidth: 12 } }, tooltip: { callbacks: { label: c => c.dataset.label + ': ' + fmtNum(c.raw) + ' un.' } } }, scales: { x: { ticks: { color: '#5E6A8A', font: { size: 10 }, maxTicksLimit: 10 }, grid: { color: 'rgba(255,255,255,.04)' } }, y: { ticks: { color: '#5E6A8A', font: { size: 11 }, callback: v => fmtNum(v) }, grid: { color: 'rgba(255,255,255,.04)' } } } }}
                />
            }
          </div>
        </div>

        <div className="card">
          <div className="card-title">🏆 Ranking do Período</div>
          {stats.porFunc.length === 0
            ? <div className="empty-state"><div className="es-icon">📭</div><div className="es-text">Sem registros no período</div></div>
            : stats.porFunc.map((x, i) => (
              <div className="rank-row" key={x.f.id}>
                <div className={`rank-num ${i < 3 ? 'rn-' + (i + 1) : ''}`}>{MEDALS[i] || i + 1}</div>
                <div className="rank-av" style={{ background: avatarCor(x.f.id) }}>{getIniciais(x.f.nome)}</div>
                <div className="rank-info">
                  <div className="rank-name">{x.f.nome}</div>
                  <div className="pbar"><div className={`pfill ${x.pct >= 100 ? 'pf-green' : x.pct >= 70 ? 'pf-gold' : 'pf-amber'}`} style={{ width: `${Math.min(100, x.pct)}%` }} /></div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{x.dias} dias · Média {fmtNum(x.media)} un./dia</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'Barlow Condensed,sans-serif', fontSize: 18, fontWeight: 800, color: 'var(--gold-light)' }}>{fmtNum(x.tot)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>un.</div>
                </div>
              </div>
            ))
          }
        </div>
      </div>

      <div className="card">
        <div className="card-title">📋 Produção Detalhada por Funcionário</div>
        {loading ? <div className="loading"><div className="spin" /></div>
          : stats.porFunc.length === 0
            ? <div className="empty-state"><div className="es-icon">📭</div><div className="es-text">Sem dados no período</div></div>
            : <div className="table-wrap"><table>
                <thead><tr><th>#</th><th>Funcionário</th><th>Total</th><th>Valor</th><th>Dias</th><th>Média/Dia</th><th>Dias na Meta</th><th>Eficiência</th><th>Perda (revisão)</th></tr></thead>
                <tbody>{stats.porFunc.map((x, i) => (
                  <tr key={x.f.id}>
                    <td style={{ fontFamily: 'Barlow Condensed,sans-serif', fontSize: 16, fontWeight: 800, color: 'var(--text3)' }}>{MEDALS[i] || i + 1}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: avatarCor(x.f.id), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#0D1018', flexShrink: 0 }}>{getIniciais(x.f.nome)}</div>
                        <strong style={{ color: 'var(--text)' }}>{x.f.nome}</strong>
                      </div>
                    </td>
                    <td><strong style={{ color: 'var(--gold-light)' }}>{fmtNum(x.tot)} un.</strong></td>
                    <td style={{ color: 'var(--green)' }}>{fmtMoeda(x.val)}</td>
                    <td>{x.dias}</td>
                    <td>{fmtNum(x.media)} un.</td>
                    <td>{x.diasMeta}/{x.dias}</td>
                    <td><span style={{ color: taxaCor(x.pct), fontWeight: 700 }}>{x.pct}%</span></td>
                    <td style={{ color: x.perda > 0 ? 'var(--red)' : 'var(--text3)' }}>{fmtNum(x.perda)} un.</td>
                  </tr>
                ))}</tbody>
              </table></div>
        }
      </div>
    </div>
  )
}
