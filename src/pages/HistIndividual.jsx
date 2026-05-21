import { useState } from 'react'
import { Line } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from 'chart.js'
import { subDays, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useRegistros, useFuncionarios, useConfig } from '../lib/hooks'
import { useAuth } from '../lib/auth'
import { getHoje, fmtMoeda, fmtNum, fmtData, pctMeta, corPct, avatarCor, getIniciais, exportCSV } from '../lib/utils'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

export default function HistIndividual() {
  const { isAdmin, funcSession } = useAuth()
  const { funcionarios } = useFuncionarios()
  const { valorMil } = useConfig()

  // Pré-selecionar funcionário logado
  const [funcId, setFuncId] = useState(funcSession?.id ? String(funcSession.id) : '')
  const [periodo, setPeriodo] = useState('30')

  const ini = format(subDays(new Date(), Number(periodo)), 'yyyy-MM-dd')
  const { registros, loading } = useRegistros({ funcId: funcId || undefined, dataInicio: ini, dataFim: getHoje() })

  const f = funcionarios.find(x => x.id === Number(funcId))
  const ativos = funcionarios.filter(x => x.situacao === 'ativo')

  const total     = registros.reduce((s, r) => s + r.quantidade, 0)
  const valor     = registros.reduce((s, r) => s + Number(r.valor || 0), 0)
  const media     = registros.length ? Math.round(total / registros.length) : 0
  const melhor    = registros.reduce((mx, r) => r.quantidade > mx ? r.quantidade : mx, 0)
  const diasMeta  = f ? registros.filter(r => r.quantidade >= f.meta_diaria).length : 0
  const totalPerd = registros.reduce((s, r) => s + (r.perda || 0), 0)
  const regsComTaxa = registros.filter(r => r.taxa != null)
  const taxaMedia = regsComTaxa.length ? Math.round(regsComTaxa.reduce((s, r) => s + Number(r.taxa), 0) / regsComTaxa.length) : null

  // Gráfico
  const allDays = Array.from({ length: Number(periodo) }, (_, i) =>
    format(subDays(new Date(), Number(periodo) - 1 - i), 'yyyy-MM-dd')
  )
  const chartLabels = allDays.map(d => format(new Date(d + 'T12:00'), 'dd/MM', { locale: ptBR }))
  const chartData   = allDays.map(d => { const r = registros.find(x => x.data === d); return r ? r.quantidade : null })
  const metaLine    = allDays.map(() => f?.meta_diaria || null)

  const exportar = () => {
    if (!f) return
    exportCSV([['Data', 'Dia', 'Produzido', 'Aproveitado', 'Perda', 'Taxa', 'Valor', '% Meta', 'Obs.'],
      ...registros.map(r => {
        const pct = pctMeta(r.quantidade, f.meta_diaria)
        return [fmtData(r.data), new Date(r.data + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long' }), r.quantidade, r.aproveitado ?? '—', r.perda ?? '—', r.taxa != null ? r.taxa + '%' : '—', `R$${Number(r.valor).toFixed(2)}`, pct + '%', r.obs || '']
      })], `individual_${f.nome.replace(/\s+/g, '_')}_${periodo}d.csv`)
  }

  return (
    <div>
      <div className="card mb16">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="fg" style={{ margin: 0, minWidth: 200 }}>
            <label>Funcionário</label>
            <select value={funcId} onChange={e => setFuncId(e.target.value)} disabled={!isAdmin}>
              <option value="">Selecionar...</option>
              {ativos.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <div className="fg" style={{ margin: 0 }}>
            <label>Período</label>
            <select value={periodo} onChange={e => setPeriodo(e.target.value)}>
              {[['7','7 dias'],['15','15 dias'],['30','30 dias'],['60','60 dias'],['90','90 dias']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <button className="btn btn-secondary" onClick={exportar} disabled={!funcId}>⬇ CSV</button>
        </div>
      </div>

      {!funcId ? (
        <div className="empty-state" style={{ padding: 60 }}>
          <div className="es-icon">👤</div>
          <div className="es-text">Selecione um funcionário para ver o histórico</div>
        </div>
      ) : (
        <>
          {f && (
            <div className="stat-grid mb16" style={{ gridTemplateColumns: 'repeat(6,1fr)' }}>
              {[
                { cls: 'sc-gold',   sv: 'sv-gold',   label: 'Total', val: fmtNum(Math.round(total / 20)) + ' maços' },
                { cls: 'sc-green',  sv: 'sv-green',  label: 'Valor',  val: fmtMoeda(valor), small: true },
                { cls: 'sc-blue',   sv: 'sv-blue',   label: 'Média/Dia', val: fmtNum(Math.round(media / 20)) + ' maços' },
                { cls: 'sc-amber',  sv: 'sv-amber',  label: 'Melhor Dia', val: fmtNum(Math.round(melhor / 20)) + ' maços' },
                { cls: 'sc-red',    sv: 'sv-red',    label: 'Perda Total', val: fmtNum(Math.round(totalPerd / 20)) + ' maços' },
                { cls: 'sc-purple', sv: '',           label: 'Taxa Média', val: taxaMedia != null ? taxaMedia + '%' : '—', cor: 'var(--purple)' },
              ].map(x => (
                <div key={x.label} className={`stat-card ${x.cls}`}>
                  <div className="stat-label">{x.label}</div>
                  <div className={`stat-value ${x.sv}`} style={{ fontSize: x.small ? 18 : undefined, color: x.cor }}>{x.val}</div>
                </div>
              ))}
            </div>
          )}

          <div className="g2">
            {f && (
              <div className="card">
                <div className="card-title" style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: avatarCor(f.id), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#0D1018' }}>{getIniciais(f.nome)}</div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', textTransform: 'none', letterSpacing: 0 }}>{f.nome}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'none', letterSpacing: 0 }}>Meta: {fmtNum(Math.round(f.meta_diaria / 20))} maços/dia · Entrada: {fmtData(f.entrada)}</div>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[['Melhor dia', fmtNum(Math.round(melhor / 20)) + ' maços', 'var(--green)'], ['Dias na meta', diasMeta + '/' + registros.length, 'var(--amber)'], ['Meta diária', fmtNum(Math.round(f.meta_diaria / 20)) + ' maços', 'var(--gold-light)'], ['Eficiência', f.meta_diaria > 0 ? Math.round(media / f.meta_diaria * 100) + '%' : '—', 'var(--blue)']].map(([l, v, c]) => (
                    <div key={l} style={{ background: 'var(--bg3)', borderRadius: 6, padding: '10px 12px' }}>
                      <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>{l}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: c, fontFamily: 'Barlow Condensed,sans-serif' }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="card">
              <div className="card-title">📈 Evolução da Produção</div>
              <div className="chart-wrap">
                <Line
                  data={{ labels: chartLabels, datasets: [
                    { label: 'Produção', data: chartData, borderColor: '#C9A227', backgroundColor: 'rgba(201,162,39,.1)', borderWidth: 2, pointRadius: 2, tension: .3, spanGaps: true },
                    { label: 'Meta', data: metaLine, borderColor: 'rgba(40,180,133,.5)', borderWidth: 1.5, borderDash: [5, 4], pointRadius: 0, tension: 0, spanGaps: true },
                  ]}}
                  options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#9CA5C2', font: { size: 11 }, boxWidth: 12 } }, tooltip: { callbacks: { label: c => c.dataset.label + ': ' + fmtNum(Math.round(c.raw / 20)) + ' maços' } } }, scales: { x: { ticks: { color: '#5E6A8A', font: { size: 10 }, maxTicksLimit: 10 }, grid: { color: 'rgba(255,255,255,.04)' } }, y: { ticks: { color: '#5E6A8A', font: { size: 11 }, callback: v => fmtNum(Math.round(v / 20)) }, grid: { color: 'rgba(255,255,255,.04)' } } } }}
                />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">📋 Registros do Período</div>
            {loading ? <div className="loading"><div className="spin" /></div>
              : registros.length === 0
                ? <div className="empty-state"><div className="es-icon">📭</div><div className="es-text">Sem registros no período</div></div>
                : <div className="table-wrap"><table>
                    <thead><tr><th>Data</th><th>Dia</th><th>Produzido</th><th>Aproveitado</th><th>Perda</th><th>Taxa</th><th>Valor</th><th>% Meta</th><th>vs Média</th><th>Obs.</th></tr></thead>
                    <tbody>{registros.map(r => {
                      const pct = f ? pctMeta(r.quantidade, f.meta_diaria) : 0
                      const diff = r.quantidade - media
                      return (
                        <tr key={r.id}>
                          <td>{fmtData(r.data)}</td>
                          <td style={{ color: 'var(--text3)' }}>{new Date(r.data + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short' })}</td>
                          <td><strong style={{ color: 'var(--text)' }}>{fmtNum(Math.round(r.quantidade / 20))} maços</strong></td>
                          <td style={{ color: r.aproveitado != null ? 'var(--green)' : 'var(--text3)' }}>{r.aproveitado != null ? fmtNum(Math.round(r.aproveitado / 20)) + ' maços' : '—'}</td>
                          <td style={{ color: r.perda > 0 ? 'var(--red)' : 'var(--text3)' }}>{r.perda != null ? fmtNum(Math.round(r.perda / 20)) + ' maços' : '—'}</td>
                          <td><span style={{ fontWeight: 700, color: r.taxa != null ? (r.taxa >= 90 ? 'var(--green)' : r.taxa >= 70 ? 'var(--amber)' : 'var(--red)') : 'var(--text3)' }}>{r.taxa != null ? r.taxa + '%' : '—'}</span></td>
                          <td style={{ color: 'var(--green)' }}>{fmtMoeda(Number(r.valor))}</td>
                          <td><span style={{ color: corPct(pct), fontWeight: 700 }}>{pct}%</span></td>
                          <td style={{ color: diff >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{(diff >= 0 ? '+' : '') + fmtNum(diff)}</td>
                          <td style={{ color: 'var(--text3)' }}>{r.obs || '—'}</td>
                        </tr>
                      )
                    })}</tbody>
                  </table></div>
            }
          </div>
        </>
      )}
    </div>
  )
}
