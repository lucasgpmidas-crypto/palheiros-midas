import { useState } from 'react'
import Campo from '../../components/Campo'
import { useRegistros } from '../../lib/hooks'
import { getHoje, fmtMoeda, fmtNum, fmtData, getSemana, exportCSV, exportXLSX, isProducao } from '../../lib/utils'
import { MEDALS } from './medalhas'
import ResumoCards from './ResumoCards'

export default function TabSemanal({ funcionarios }) {
  const [data, setData] = useState(getHoje())
  const { inicio, fim } = getSemana(data)
  const { registros, loading } = useRegistros({ dataInicio: inicio, dataFim: fim })
  const porFunc = funcionarios.filter(f => f.situacao === 'ativo' && isProducao(f)).map(f => {
    const fr = registros.filter(r => r.func_id === f.id)
    const tot = fr.reduce((s, r) => s + r.quantidade, 0)
    const val = fr.reduce((s, r) => s + Number(r.valor || 0), 0)
    const dias = new Set(fr.map(r => r.data)).size
    return { f, tot, val, dias, media: dias > 0 ? Math.round(tot / dias) : 0 }
  }).filter(x => x.tot > 0).sort((a, b) => b.tot - a.tot)
  const total = registros.reduce((s, r) => s + r.quantidade, 0)
  const valor = registros.reduce((s, r) => s + Number(r.valor || 0), 0)

  const linhas = () => [
    ['Funcionário', 'Total Semana', 'Valor (R$)', 'Dias', 'Média/Dia'],
    ...porFunc.map(({ f, tot, val, dias, media }) => [f.nome, tot, val.toFixed(2), dias, media])
  ]
  const exportarCSV  = () => exportCSV(linhas(), `semanal_${inicio}.csv`)
  const exportarXLSX = () => exportXLSX([{ name: 'Semanal', rows: linhas() }], `semanal_${inicio}.xlsx`)

  return (
    <div>
      <div className="card mb16">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Campo label="Semana (qualquer dia)" style={{ margin: 0 }}><input type="date" value={data} onChange={e => setData(e.target.value)} /></Campo>
          <button className="btn btn-secondary" onClick={exportarCSV}>⬇ CSV</button>
          <button className="btn btn-secondary" onClick={exportarXLSX} style={{ color: 'var(--green)', borderColor: 'rgba(40,180,133,.3)' }}>⬇ Excel</button>
        </div>
      </div>
      {registros.length > 0 && <ResumoCards fields={[{ label: 'Período', val: `${fmtData(inicio)} — ${fmtData(fim)}`, cor: 'var(--text)' }, { label: 'Total', val: fmtNum(total) + ' un.', cor: 'var(--gold-light)' }, { label: 'Valor', val: fmtMoeda(valor), cor: 'var(--green)' }]} />}
      <div className="card">
        {loading ? <div className="loading"><div className="spin" /></div> : porFunc.length === 0 ? <div className="empty-state"><div className="es-icon">📭</div><div className="es-text">Sem registros na semana</div></div> :
          <div className="table-wrap"><table>
            <thead><tr><th>#</th><th>Funcionário</th><th>Total Semana</th><th>Valor</th><th>Dias</th><th>Média/Dia</th></tr></thead>
            <tbody>{porFunc.map(({ f, tot, val, dias, media }, i) => (<tr key={f.id}><td style={{ fontFamily: 'Barlow Condensed,sans-serif', fontSize: 18, fontWeight: 800, color: 'var(--text3)' }}>{MEDALS[i] || i + 1}</td><td><strong style={{ color: 'var(--text)' }}>{f.nome}</strong></td><td><strong style={{ color: 'var(--gold-light)' }}>{fmtNum(tot)} un.</strong></td><td style={{ color: 'var(--green)' }}>{fmtMoeda(val)}</td><td>{dias}</td><td>{fmtNum(media)} un.</td></tr>))}</tbody>
          </table></div>}
      </div>
    </div>
  )
}
