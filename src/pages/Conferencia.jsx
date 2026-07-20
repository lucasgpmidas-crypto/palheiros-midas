import { useState, useMemo } from 'react'
import { subDays, format } from 'date-fns'
import { useRegistros, useCQ, useFuncionarios, useConfig } from '../lib/hooks'
import { getHoje, fmtNum, fmtData, exportCSV, isProducao } from '../lib/utils'

const STATUS = {
  ok:         { badge: 'b-green', label: '✓ Confere' },
  falta:      { badge: 'b-red',   label: '▼ Falta' },
  sobra:      { badge: 'b-amber', label: '▲ Sobra' },
  aguardando: { badge: 'b-blue',  label: '⏳ Aguardando revisão' },
}

export default function Conferencia() {
  const hoje = getHoje()
  const ini7 = format(subDays(new Date(), 7), 'yyyy-MM-dd')
  const [filtros, setFiltros] = useState({ funcId: '', dataInicio: ini7, dataFim: hoje, soDivergentes: false })
  const [aplicados, setAplicados] = useState({ ...filtros })

  const { funcionarios } = useFuncionarios()
  const { uniDisplay, uniMaco, tolerancia } = useConfig()
  const { registros, loading: l1 } = useRegistros({ funcId: aplicados.funcId || undefined, dataInicio: aplicados.dataInicio, dataFim: aplicados.dataFim })
  const { cqRegistros, loading: l2 } = useCQ({ funcId: aplicados.funcId || undefined, dataInicio: aplicados.dataInicio, dataFim: aplicados.dataFim })
  const loading = l1 || l2

  // Cruza produção declarada × revisão da finalização, por funcionário + dia
  const linhas = useMemo(() => {
    const map = new Map()
    const key = (fid, d) => `${fid}|${d}`

    registros.forEach(r => {
      map.set(key(r.func_id, r.data), {
        funcId: r.func_id, nome: r.funcionarios?.nome, data: r.data,
        produzido: r.quantidade || 0, entregue: 0, perda: 0, display: 0, macos: 0, temCQ: false,
      })
    })
    cqRegistros.forEach(c => {
      const k = key(c.func_id, c.data)
      if (!map.has(k)) map.set(k, { funcId: c.func_id, nome: c.funcionarios?.nome, data: c.data, produzido: 0, entregue: 0, perda: 0, display: 0, macos: 0, temCQ: false })
      const x = map.get(k)
      x.temCQ = true
      x.entregue += c.entregue || 0
      x.perda    += c.perda || 0
      x.display  += c.display || 0
      x.macos    += c.macos || 0
    })

    return [...map.values()].map(x => {
      const empacotado = x.display * uniDisplay + x.macos * uniMaco
      // Base do cálculo: produção declarada; se não houver, usa o entregue à revisão
      const base = x.produzido > 0 ? x.produzido : x.entregue
      const diferenca = base - x.perda - empacotado
      const limite = Math.round(base * tolerancia / 100)
      let status
      if (!x.temCQ) status = 'aguardando'
      else if (Math.abs(diferenca) <= limite) status = 'ok'
      else status = diferenca > 0 ? 'falta' : 'sobra'
      return { ...x, base, empacotado, diferenca, status, semProducao: x.temCQ && x.produzido === 0 }
    }).sort((a, b) => b.data.localeCompare(a.data) || (a.nome || '').localeCompare(b.nome || ''))
  }, [registros, cqRegistros, uniDisplay, uniMaco, tolerancia])

  const visiveis = aplicados.soDivergentes ? linhas.filter(l => l.status === 'falta' || l.status === 'sobra') : linhas

  const nOk    = linhas.filter(l => l.status === 'ok').length
  const nDiv   = linhas.filter(l => l.status === 'falta' || l.status === 'sobra').length
  const nAg    = linhas.filter(l => l.status === 'aguardando').length
  const totalFalta = linhas.filter(l => l.status === 'falta').reduce((s, l) => s + l.diferenca, 0)

  const handleExportar = () => exportCSV([
    ['Data', 'Funcionário', 'Produzido', 'Entregue (revisão)', 'Perda', 'Displays', 'Maços', 'Empacotado', 'Diferença', 'Status'],
    ...visiveis.map(l => [fmtData(l.data), l.nome, l.produzido, l.entregue, l.perda, l.display, l.macos, l.empacotado, l.diferenca, STATUS[l.status].label]),
  ], `conferencia_${hoje}.csv`)

  const difCell = (l) => {
    if (!l.temCQ) return <span style={{ color: 'var(--text3)' }}>—</span>
    if (l.diferenca === 0) return <span style={{ color: 'var(--green)', fontWeight: 700 }}>0</span>
    const cor = l.status === 'ok' ? 'var(--green)' : l.diferenca > 0 ? 'var(--red)' : 'var(--amber)'
    return <span style={{ color: cor, fontWeight: 700 }}>{l.diferenca > 0 ? '−' : '+'}{fmtNum(Math.abs(l.diferenca))} un.</span>
  }

  return (
    <div>
      {/* Explicação do cálculo */}
      <div className="card mb16">
        <div className="card-title">⚖️ Como funciona a conferência</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>
          Compara o que o funcionário <strong style={{ color: 'var(--gold-light)' }}>declarou produzir</strong> com o que a finalização
          <strong style={{ color: 'var(--blue)' }}> revisou e empacotou</strong> no mesmo dia:
          <div style={{ background: 'var(--bg3)', borderRadius: 'var(--rs)', padding: '8px 14px', marginTop: 8, fontSize: 12.5 }}>
            <strong>Diferença = Produzido − Perda − Empacotado</strong>
            <span style={{ color: 'var(--text3)' }}> · Empacotado = displays × {fmtNum(uniDisplay)} un. + maços × {fmtNum(uniMaco)} un. · Tolerância: {tolerancia}%</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>
            💡 Se o funcionário não registrou a produção do dia, o cálculo usa a <strong style={{ color: 'var(--text2)' }}>quantidade entregue à revisão</strong> como base.
          </div>
        </div>
      </div>

      {/* Resumo */}
      <div className="stat-grid mb16">
        {[
          ['sc-green', 'sv-green', 'Conferem', nOk, 'dentro da tolerância'],
          ['sc-red',   'sv-red',   'Divergências', nDiv, 'precisam de atenção'],
          ['sc-blue',  'sv-blue',  'Aguardando Revisão', nAg, 'sem registro da finalização'],
          ['sc-amber', 'sv-amber', 'Total em Falta', fmtNum(totalFalta), 'unidades não justificadas'],
        ].map(([cls, sv, label, val, sub]) => (
          <div key={label} className={`stat-card ${cls}`}>
            <div className="stat-label">{label}</div>
            <div className={`stat-value ${sv}`}>{val}</div>
            <div className="stat-sub">{sub}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="card mb16">
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="fg" style={{ margin: 0, minWidth: 160 }}><label>Funcionário</label>
            <select value={filtros.funcId} onChange={e => setFiltros(f => ({ ...f, funcId: e.target.value }))}>
              <option value="">Todos</option>
              {funcionarios.filter(isProducao).map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <div className="fg" style={{ margin: 0 }}><label>De</label><input type="date" value={filtros.dataInicio} onChange={e => setFiltros(f => ({ ...f, dataInicio: e.target.value }))} /></div>
          <div className="fg" style={{ margin: 0 }}><label>Até</label><input type="date" value={filtros.dataFim} max={hoje} onChange={e => setFiltros(f => ({ ...f, dataFim: e.target.value }))} /></div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--text2)', cursor: 'pointer', paddingBottom: 10 }}>
            <input type="checkbox" checked={filtros.soDivergentes} onChange={e => setFiltros(f => ({ ...f, soDivergentes: e.target.checked }))} style={{ width: 15, height: 15 }} />
            Só divergências
          </label>
          <button className="btn btn-primary btn-sm" onClick={() => setAplicados({ ...filtros })}>🔍 Filtrar</button>
          <button className="btn btn-secondary btn-sm" onClick={handleExportar}>⬇ CSV</button>
        </div>
      </div>

      {/* Tabela */}
      <div className="card">
        <div className="card-title">📋 Conferência por Funcionário e Dia</div>
        {loading ? <div className="loading"><div className="spin" /></div>
          : visiveis.length === 0
            ? <div className="empty-state"><div className="es-icon">📭</div><div className="es-text">{aplicados.soDivergentes ? 'Nenhuma divergência no período 🎉' : 'Sem dados no período'}</div></div>
            : <div className="table-wrap"><table>
                <thead><tr><th>Data</th><th>Funcionário</th><th>Produzido</th><th>Entregue (revisão)</th><th>Perda</th><th>Displays</th><th>Maços</th><th>Empacotado</th><th>Diferença</th><th>Status</th></tr></thead>
                <tbody>{visiveis.map(l => (
                  <tr key={`${l.funcId}|${l.data}`}>
                    <td>{fmtData(l.data)}</td>
                    <td><strong style={{ color: 'var(--text)' }}>{l.nome || '—'}</strong></td>
                    <td>{l.produzido > 0
                      ? <strong style={{ color: 'var(--gold-light)' }}>{fmtNum(l.produzido)} un.</strong>
                      : <span style={{ color: 'var(--amber)', fontSize: 11.5 }} title="Funcionário não registrou a produção — cálculo usa o entregue como base">⚠ não declarado</span>}
                    </td>
                    <td>{l.temCQ
                      ? <span style={l.produzido > 0 && l.entregue !== l.produzido ? { color: 'var(--amber)', fontWeight: 700 } : {}} title={l.produzido > 0 && l.entregue !== l.produzido ? 'Entregue difere do produzido declarado' : undefined}>{fmtNum(l.entregue)} un.</span>
                      : '—'}
                    </td>
                    <td style={{ color: 'var(--red)' }}>{l.temCQ ? fmtNum(l.perda) + ' un.' : '—'}</td>
                    <td>{l.temCQ ? l.display : '—'}</td>
                    <td>{l.temCQ ? l.macos : '—'}</td>
                    <td style={{ color: 'var(--blue)' }}>{l.temCQ ? fmtNum(l.empacotado) + ' un.' : '—'}</td>
                    <td>{difCell(l)}</td>
                    <td><span className={`badge ${STATUS[l.status].badge}`}>{STATUS[l.status].label}</span></td>
                  </tr>
                ))}</tbody>
              </table></div>
        }
      </div>
    </div>
  )
}
