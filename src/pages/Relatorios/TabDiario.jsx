import { useState } from 'react'
import Campo from '../../components/Campo'
import { useRegistros } from '../../lib/hooks'
import { getHoje, getOntem, fmtMoeda, fmtNum, pctMeta, corPct, exportCSV, exportXLSX } from '../../lib/utils'
import { MEDALS } from './medalhas'
import ResumoCards from './ResumoCards'

export default function TabDiario({ funcionarios, valorMil }) {
  const [data, setData] = useState(getHoje())
  const { registros, loading } = useRegistros({ data })
  const total = registros.reduce((s, r) => s + r.quantidade, 0)
  const valor = registros.reduce((s, r) => s + Number(r.valor || 0), 0)

  const linhas = () => [
    ['Funcionário', 'Produzido', 'Valor', '% Meta', 'Obs.'],
    ...registros.map(r => {
      const pct = r.funcionarios?.meta_diaria ? pctMeta(r.quantidade, r.funcionarios.meta_diaria) : 0
      return [r.funcionarios?.nome, r.quantidade, Number(r.valor).toFixed(2), pct + '%', r.obs || '']
    })
  ]

  const exportarCSV  = () => exportCSV(linhas(), `diario_${data}.csv`)
  const exportarXLSX = () => exportXLSX([{ name: 'Diário', rows: linhas() }], `diario_${data}.xlsx`)

  return (
    <div>
      <div className="card mb16">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Campo label="Data" style={{ margin: 0 }}><input type="date" value={data} max={getHoje()} onChange={e => setData(e.target.value)} /></Campo>
          <button className="btn btn-secondary btn-sm" onClick={() => setData(getHoje())}>Hoje</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setData(getOntem())}>Ontem</button>
          <button className="btn btn-secondary" onClick={exportarCSV}>⬇ CSV</button>
          <button className="btn btn-secondary" onClick={exportarXLSX} style={{ color: 'var(--green)', borderColor: 'rgba(40,180,133,.3)' }}>⬇ Excel</button>
        </div>
      </div>
      {registros.length > 0 && <ResumoCards fields={[{ label: 'Data', val: new Date(data + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }), cor: 'var(--text)' }, { label: 'Total', val: fmtNum(total) + ' un.', cor: 'var(--gold-light)' }, { label: 'Valor', val: fmtMoeda(valor), cor: 'var(--green)' }, { label: 'Operadores', val: registros.length }]} />}
      <div className="card">
        {loading ? <div className="loading"><div className="spin" /></div> : registros.length === 0 ? <div className="empty-state"><div className="es-icon">📭</div><div className="es-text">Sem registros nesta data</div></div> :
          <div className="table-wrap"><table>
            <thead><tr><th>#</th><th>Funcionário</th><th>Produção</th><th>Aproveitado</th><th>Taxa</th><th>Valor</th><th>% Meta</th><th>Obs.</th></tr></thead>
            <tbody>{[...registros].sort((a, b) => b.quantidade - a.quantidade).map((r, i) => { const pct = r.funcionarios?.meta_diaria ? pctMeta(r.quantidade, r.funcionarios.meta_diaria) : 0; return (<tr key={r.id}><td style={{ fontFamily: 'Barlow Condensed,sans-serif', fontSize: 18, fontWeight: 800, color: 'var(--text3)' }}>{MEDALS[i] || i + 1}</td><td><strong style={{ color: 'var(--text)' }}>{r.funcionarios?.nome}</strong></td><td>{fmtNum(r.quantidade)} un.</td><td style={{ color: r.aproveitado != null ? 'var(--green)' : 'var(--text3)' }}>{r.aproveitado != null ? fmtNum(r.aproveitado) + ' un.' : '—'}</td><td><span style={{ fontWeight: 700, color: r.taxa != null ? (r.taxa >= 90 ? 'var(--green)' : r.taxa >= 70 ? 'var(--amber)' : 'var(--red)') : 'var(--text3)' }}>{r.taxa != null ? r.taxa + '%' : '—'}</span></td><td style={{ color: 'var(--green)' }}>{fmtMoeda(Number(r.valor))}</td><td><span style={{ color: corPct(pct), fontWeight: 700 }}>{pct}%</span></td><td style={{ color: 'var(--text3)' }}>{r.obs || '—'}</td></tr>) })}</tbody>
          </table></div>}
      </div>
    </div>
  )
}
