import { useState } from 'react'
import Campo from '../../components/Campo'
import { useRegistros } from '../../lib/hooks'
import { getHoje, fmtMoeda, fmtNum, fmtData, pctMeta, corPct, exportCSV, exportXLSX, isProducao } from '../../lib/utils'
import { format, subDays } from 'date-fns'

export default function TabIndividual({ funcionarios }) {
  const [funcId, setFuncId] = useState('')
  const [periodo, setPeriodo] = useState('30')
  const ini = format(subDays(new Date(), Number(periodo)), 'yyyy-MM-dd')
  const { registros, loading } = useRegistros({ funcId: funcId || undefined, dataInicio: ini, dataFim: getHoje() })
  const f = funcionarios.find(x => x.id === Number(funcId))
  const total = registros.reduce((s, r) => s + r.quantidade, 0)
  const valor = registros.reduce((s, r) => s + Number(r.valor || 0), 0)
  const media = registros.length ? Math.round(total / registros.length) : 0
  const melhor = registros.reduce((mx, r) => r.quantidade > mx ? r.quantidade : mx, 0)

  const linhas = () => [
    ['Data', 'Produzido', 'Aproveitado', 'Perda', 'Taxa', 'Valor (R$)', '% Meta', 'Obs.'],
    ...registros.map(r => {
      const pct = pctMeta(r.quantidade, f?.meta_diaria || 1)
      return [fmtData(r.data), r.quantidade, r.aproveitado ?? '—', r.perda ?? '—', r.taxa != null ? r.taxa + '%' : '—', Number(r.valor).toFixed(2), pct + '%', r.obs || '']
    })
  ]
  const exportarCSV  = () => { if (!f) return; exportCSV(linhas(), `individual_${f.nome.replace(/\s+/g, '_')}_${periodo}d.csv`) }
  const exportarXLSX = () => { if (!f) return; exportXLSX([{ name: f.nome.split(' ')[0], rows: linhas() }], `individual_${f.nome.replace(/\s+/g, '_')}_${periodo}d.xlsx`) }

  return (
    <div>
      <div className="card mb16">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Campo label="Funcionário" style={{ margin: 0, minWidth: 180 }}><select value={funcId} onChange={e => setFuncId(e.target.value)}>
              <option value="">Selecionar...</option>
              {funcionarios.filter(f => f.situacao === 'ativo' && isProducao(f)).map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select></Campo>
          <Campo label="Período" style={{ margin: 0 }}><select value={periodo} onChange={e => setPeriodo(e.target.value)}>
              {[['7', '7 dias'], ['15', '15 dias'], ['30', '30 dias'], ['60', '60 dias'], ['90', '90 dias']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></Campo>
          <button className="btn btn-secondary" onClick={exportarCSV} disabled={!funcId}>⬇ CSV</button>
          <button className="btn btn-secondary" onClick={exportarXLSX} disabled={!funcId} style={{ color: 'var(--green)', borderColor: 'rgba(40,180,133,.3)' }}>⬇ Excel</button>
        </div>
      </div>
      {!funcId ? <div className="empty-state" style={{ padding: 60 }}><div className="es-icon">👤</div><div className="es-text">Selecione um funcionário</div></div> : (
        <>
          {f && <div className="card mb16">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--bg4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: 'var(--text2)' }}>{f.nome.split(' ').slice(0, 2).map(x => x[0]).join('')}</div>
              <div><div style={{ fontSize: 20, fontWeight: 700 }}>{f.nome}</div><div style={{ fontSize: 12, color: 'var(--text3)' }}>Meta: {fmtNum(f.meta_diaria)} un./dia · {periodo} dias</div></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
              {[['Total', fmtNum(total) + ' un.', 'var(--gold-light)'], ['Valor', fmtMoeda(valor), 'var(--green)'], ['Média/Dia', fmtNum(media) + ' un.', 'var(--blue)'], ['Melhor Dia', fmtNum(melhor) + ' un.', 'var(--amber)']].map(([l, v, c]) => (
                <div key={l} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>{l}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: 'Barlow Condensed,sans-serif' }}>{v}</div>
                </div>
              ))}
            </div>
          </div>}
          <div className="card">
            {loading ? <div className="loading"><div className="spin" /></div> : registros.length === 0 ? <div className="empty-state"><div className="es-icon">📭</div><div className="es-text">Sem registros no período</div></div> :
              <div className="table-wrap"><table>
                <thead><tr><th>Data</th><th>Produzido</th><th>Aproveitado</th><th>Taxa</th><th>Valor</th><th>% Meta</th><th>Obs.</th></tr></thead>
                <tbody>{registros.map(r => { const pct = f ? pctMeta(r.quantidade, f.meta_diaria) : 0; return (<tr key={r.id}><td>{new Date(r.data + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</td><td><strong style={{ color: 'var(--text)' }}>{fmtNum(r.quantidade)} un.</strong></td><td style={{ color: r.aproveitado != null ? 'var(--green)' : 'var(--text3)' }}>{r.aproveitado != null ? fmtNum(r.aproveitado) + ' un.' : '—'}</td><td><span style={{ fontWeight: 700, color: r.taxa != null ? (r.taxa >= 90 ? 'var(--green)' : r.taxa >= 70 ? 'var(--amber)' : 'var(--red)') : 'var(--text3)' }}>{r.taxa != null ? r.taxa + '%' : '—'}</span></td><td style={{ color: 'var(--green)' }}>{fmtMoeda(Number(r.valor))}</td><td><span style={{ color: corPct(pct), fontWeight: 700 }}>{pct}%</span></td><td style={{ color: 'var(--text3)' }}>{r.obs || '—'}</td></tr>) })}</tbody>
              </table></div>}
          </div>
        </>
      )}
    </div>
  )
}
