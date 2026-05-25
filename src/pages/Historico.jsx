import { useState } from 'react'
import { subDays, format } from 'date-fns'
import { useRegistros, useFuncionarios, useConfig } from '../lib/hooks'
import { getHoje, fmtMoeda, fmtNum, fmtData, pctMeta, corPct, exportCSV } from '../lib/utils'
import ConfirmModal from '../components/ConfirmModal'

export default function Historico() {
  const hoje = getHoje()
  const ini30 = format(subDays(new Date(), 30), 'yyyy-MM-dd')
  const [filtros, setFiltros] = useState({ funcId: '', dataInicio: ini30, dataFim: hoje })
  const [aplicados, setAplicados] = useState({ ...filtros })

  const [confirmDel, setConfirmDel] = useState(null)

  const { funcionarios } = useFuncionarios()
  const { valorMil } = useConfig()
  const { registros, loading, excluir } = useRegistros({ funcId: aplicados.funcId || undefined, dataInicio: aplicados.dataInicio, dataFim: aplicados.dataFim })

  const total = registros.reduce((s, r) => s + r.quantidade, 0)
  const valor = registros.reduce((s, r) => s + Number(r.valor || 0), 0)

  const handleExportar = () => {
    exportCSV(
      [['Data', 'Funcionário', 'Produzido', 'Aproveitado', 'Perda', 'Taxa', 'Valor', '% Meta', 'Obs.'],
       ...registros.map(r => {
         const pct = r.funcionarios?.meta_diaria ? pctMeta(r.quantidade, r.funcionarios.meta_diaria) : 0
         return [fmtData(r.data), r.funcionarios?.nome, r.quantidade, r.aproveitado ?? '—', r.perda ?? '—', r.taxa != null ? r.taxa + '%' : '—', `R$${Number(r.valor).toFixed(2)}`, pct + '%', r.obs || '']
       })],
      `historico_${aplicados.dataInicio}_${aplicados.dataFim}.csv`
    )
  }

  return (
    <div>
      <div className="card mb16">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="fg" style={{ margin: 0, flex: 1, minWidth: 160 }}>
            <label>Funcionário</label>
            <select value={filtros.funcId} onChange={e => setFiltros(f => ({ ...f, funcId: e.target.value }))}>
              <option value="">Todos</option>
              {funcionarios.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <div className="fg" style={{ margin: 0 }}><label>De</label><input type="date" value={filtros.dataInicio} onChange={e => setFiltros(f => ({ ...f, dataInicio: e.target.value }))} /></div>
          <div className="fg" style={{ margin: 0 }}><label>Até</label><input type="date" value={filtros.dataFim} max={hoje} onChange={e => setFiltros(f => ({ ...f, dataFim: e.target.value }))} /></div>
          <button className="btn btn-primary" onClick={() => setAplicados({ ...filtros })}>🔍 Filtrar</button>
          <button className="btn btn-secondary" onClick={handleExportar}>⬇ CSV</button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Histórico de Produção</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          {[['Total', fmtNum(total) + ' un.', 'var(--gold-light)'], ['Valor', fmtMoeda(valor), 'var(--green)'], ['Registros', registros.length, 'var(--text)']].map(([l, v, c]) => (
            <div key={l} className="stats-chip"><span style={{ color: 'var(--text3)' }}>{l}: </span><strong style={{ color: c }}>{v}</strong></div>
          ))}
        </div>
        {loading ? <div className="loading"><div className="spin" /></div>
          : registros.length === 0
            ? <div className="empty-state"><div className="es-icon">🔍</div><div className="es-text">Nenhum registro no período</div></div>
            : <div className="table-wrap">
                <table>
                  <thead><tr><th>Data</th><th>Funcionário</th><th>Produzido</th><th>Aproveitado</th><th>Taxa</th><th>Valor</th><th>% Meta</th><th>Obs.</th><th>Ações</th></tr></thead>
                  <tbody>
                    {registros.map(r => {
                      const pct = r.funcionarios?.meta_diaria ? pctMeta(r.quantidade, r.funcionarios.meta_diaria) : 0
                      return (
                        <tr key={r.id}>
                          <td>{fmtData(r.data)}</td>
                          <td><strong style={{ color: 'var(--text)' }}>{r.funcionarios?.nome}</strong></td>
                          <td>{fmtNum(r.quantidade)} un.</td>
                          <td style={{ color: r.aproveitado != null ? 'var(--green)' : 'var(--text3)' }}>{r.aproveitado != null ? fmtNum(r.aproveitado) + ' un.' : '—'}</td>
                          <td><span style={{ fontWeight: 700, color: r.taxa != null ? (r.taxa >= 90 ? 'var(--green)' : r.taxa >= 70 ? 'var(--amber)' : 'var(--red)') : 'var(--text3)' }}>{r.taxa != null ? r.taxa + '%' : '—'}</span></td>
                          <td style={{ color: 'var(--green)' }}>{fmtMoeda(Number(r.valor))}</td>
                          <td><span style={{ color: corPct(pct), fontWeight: 700 }}>{pct}%</span></td>
                          <td style={{ color: 'var(--text3)' }}>{r.obs || '—'}</td>
                          <td><button className="btn btn-danger btn-xs" onClick={() => setConfirmDel(r)}>🗑</button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
        }
      </div>

      {confirmDel && (
        <ConfirmModal
          title="Excluir registro?"
          onConfirm={async () => { await excluir(confirmDel.id); setConfirmDel(null) }}
          onCancel={() => setConfirmDel(null)}
          details={[
            ['Funcionário', confirmDel.funcionarios?.nome],
            ['Data', fmtData(confirmDel.data)],
            ['Quantidade', fmtNum(confirmDel.quantidade) + ' un.'],
            ['Valor', fmtMoeda(Number(confirmDel.valor))],
          ]}
        />
      )}
    </div>
  )
}
