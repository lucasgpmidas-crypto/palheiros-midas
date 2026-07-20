import { useMemo } from 'react'
import { subDays, format } from 'date-fns'
import { useRegistros, useFuncionarios, useConfig, useCQ } from '../lib/hooks'
import { getHoje, fmtMoeda, fmtNum, fmtData, pctMeta, ultimosDias, isProducao, statusConferencia } from '../lib/utils'

export default function Alertas() {
  const hoje = getHoje()
  const ini7 = format(subDays(new Date(), 7), 'yyyy-MM-dd')
  const { funcionarios } = useFuncionarios()
  const { valorMil, uniDisplay, uniMaco, tolerancia } = useConfig()
  const { registros: regsHoje } = useRegistros({ data: hoje })
  const { registros: regs7 }   = useRegistros({ dataInicio: ini7, dataFim: hoje })
  const { cqRegistros: cq7 }   = useCQ({ dataInicio: ini7, dataFim: hoje })

  // Divergências da conferência (produzido − perda − empacotado, fora da tolerância)
  const divergencias = useMemo(() => {
    const map = new Map()
    regs7.forEach(r => {
      map.set(`${r.func_id}|${r.data}`, { nome: r.funcionarios?.nome, data: r.data, produzido: r.quantidade || 0, entregue: 0, perda: 0, display: 0, macos: 0, temCQ: false, pendenteEmbalagem: true })
    })
    cq7.forEach(c => {
      const k = `${c.func_id}|${c.data}`
      if (!map.has(k)) map.set(k, { nome: c.funcionarios?.nome, data: c.data, produzido: 0, entregue: 0, perda: 0, display: 0, macos: 0, temCQ: false, pendenteEmbalagem: true })
      const x = map.get(k)
      x.temCQ = true
      x.entregue += c.entregue || 0
      x.perda += c.perda || 0
      x.display += c.display || 0
      x.macos += c.macos || 0
      x.pendenteEmbalagem = x.pendenteEmbalagem && !c.registrado_por_display
    })
    return [...map.values()]
      .filter(x => x.temCQ)
      .map(x => {
        const empacotado = x.display * uniDisplay + x.macos * uniMaco
        // Base: produção declarada; se não houver, o entregue à revisão
        const base = x.produzido > 0 ? x.produzido : x.entregue
        const diferenca = base - x.perda - empacotado
        const status = statusConferencia({ temCQ: x.temCQ, pendenteEmbalagem: x.pendenteEmbalagem, base, perda: x.perda, empacotado, tolerancia })
        return { ...x, base, empacotado, diferenca, status }
      })
      .filter(x => x.status === 'falta' || x.status === 'sobra')
      .sort((a, b) => b.data.localeCompare(a.data))
  }, [regs7, cq7, uniDisplay, uniMaco, tolerancia])

  const analise = useMemo(() => {
    const ativos = funcionarios.filter(f => f.situacao === 'ativo' && isProducao(f))
    const dias7  = ultimosDias(7)

    const statusHoje = ativos.map(f => {
      const reg = regsHoje.find(r => r.func_id === f.id)
      const qty = reg?.quantidade || 0
      const pct = pctMeta(qty, f.meta_diaria)
      return { ...f, qty, pct, reg, valor: Number(reg?.valor || 0) }
    })

    const analise7 = ativos.map(f => {
      const qtds = dias7.map(d => { const r = regs7.find(x => x.func_id === f.id && x.data === d); return r ? r.quantidade : null }).filter(v => v !== null)
      const media7 = qtds.length ? Math.round(qtds.reduce((s, v) => s + v, 0) / qtds.length) : 0
      const pct7   = pctMeta(media7, f.meta_diaria)
      let tend = '➡️'
      if (qtds.length >= 4) {
        const h = Math.floor(qtds.length / 2)
        const rec = qtds.slice(0, h).reduce((s, v) => s + v, 0) / h
        const old = qtds.slice(h).reduce((s, v) => s + v, 0) / h
        if (rec > old * 1.05) tend = '📈'
        else if (rec < old * 0.95) tend = '📉'
      }
      return { ...f, media7, pct7, tend, diasReg: qtds.length }
    })

    const semReg  = statusHoje.filter(f => f.pct === 0)
    const abaixo  = statusHoje.filter(f => f.pct > 0 && f.pct < 100)
    const acima   = statusHoje.filter(f => f.pct >= 100)
    const criticos = analise7.filter(x => x.pct7 < 70 && x.diasReg >= 3)

    return { statusHoje, analise7, semReg, abaixo, acima, criticos, ativos }
  }, [funcionarios, regsHoje, regs7])

  const corPctColor = (p) => p >= 100 ? 'var(--green)' : p >= 70 ? 'var(--gold-light)' : 'var(--red)'

  return (
    <div>
      <div className="stat-grid" style={{ marginBottom: 18 }}>
        {[
          ['sc-green', 'sv-green', 'Atingiram Meta', analise.acima.length, 'hoje'],
          ['sc-amber', 'sv-amber', 'Abaixo da Meta', analise.abaixo.length, 'hoje'],
          ['sc-red',   'sv-red',   'Sem Registro',   analise.semReg.length, 'hoje'],
          ['sc-blue',  'sv-blue',  'Total Ativos',   analise.ativos.length, 'operadores'],
        ].map(([cls, sv, label, val, sub]) => (
          <div key={label} className={`stat-card ${cls}`}>
            <div className="stat-label">{label}</div>
            <div className={`stat-value ${sv}`}>{val}</div>
            <div className="stat-sub">{sub}</div>
          </div>
        ))}
      </div>

      <div className="g2">
        <div className="card">
          <div className="card-title">🔔 Situação de Hoje</div>
          {analise.semReg.map(f => (
            <div key={f.id} className="alert a-danger">
              <div style={{ fontSize: 17 }}>❌</div>
              <div><strong>{f.nome} — sem registro hoje</strong><span>Nenhuma produção registrada para esta data.</span></div>
            </div>
          ))}
          {analise.abaixo.map(f => {
            const faltam = f.meta_diaria - f.qty
            const faltamVal = (faltam / 1000) * valorMil
            return (
              <div key={f.id} className="alert a-warn">
                <div style={{ fontSize: 17 }}>⚠️</div>
                <div>
                  <strong>{f.nome} — abaixo da meta ({f.pct}%)</strong>
                  <span>Produziu {fmtNum(f.qty)} de {fmtNum(f.meta_diaria)} un. — faltam {fmtNum(faltam)} un. ({fmtMoeda(faltamVal)})</span>
                </div>
              </div>
            )
          })}
          {analise.acima.map(f => (
            <div key={f.id} className="alert a-success">
              <div style={{ fontSize: 17 }}>✅</div>
              <div><strong>{f.nome} — meta atingida ({f.pct}%)</strong><span>Produziu {fmtNum(f.qty)} un. · {fmtMoeda(f.valor)}</span></div>
            </div>
          ))}
          {analise.statusHoje.length === 0 && <div className="empty-state"><div className="es-icon">📭</div><div className="es-text">Sem dados hoje</div></div>}
        </div>

        <div className="card">
          <div className="card-title">⚡ Alertas de Produtividade</div>
          {analise.criticos.length === 0
            ? <div className="alert a-success"><div style={{ fontSize: 17 }}>🎉</div><div><strong>Ótima notícia!</strong><span>Nenhum operador com produtividade crítica nos últimos 7 dias.</span></div></div>
            : analise.criticos.map(f => (
              <div key={f.id} className="alert a-danger">
                <div style={{ fontSize: 17 }}>📉</div>
                <div>
                  <strong>{f.nome} — produtividade baixa ({f.pct7}%)</strong>
                  <span>Média 7 dias: {fmtNum(f.media7)} un. · Meta: {fmtNum(f.meta_diaria)} un. · {f.diasReg} dias registrados</span>
                </div>
              </div>
            ))
          }
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-title">⚖️ Conferência Produção × Finalização — Últimos 7 Dias</div>
        {divergencias.length === 0
          ? <div className="alert a-success"><div style={{ fontSize: 17 }}>✅</div><div><strong>Tudo conferido!</strong><span>Nenhuma divergência acima de {tolerancia}% entre produção declarada e revisão da finalização.</span></div></div>
          : divergencias.map((d, i) => (
            <div key={i} className={`alert ${d.diferenca > 0 ? 'a-danger' : 'a-warn'}`}>
              <div style={{ fontSize: 17 }}>{d.diferenca > 0 ? '▼' : '▲'}</div>
              <div>
                <strong>
                  {d.nome} — {fmtData(d.data)}: {d.diferenca > 0
                    ? `faltam ${fmtNum(d.diferenca)} un.`
                    : `sobra de ${fmtNum(Math.abs(d.diferenca))} un.`}
                </strong>
                <span>
                  {d.produzido > 0 ? `Produzido: ${fmtNum(d.produzido)} un.` : `Entregue à revisão: ${fmtNum(d.entregue)} un. (produção não declarada)`}
                  {' · '}Perda: {fmtNum(d.perda)} un. · Empacotado: {fmtNum(d.empacotado)} un. ({d.display} displays + {d.macos} maços)
                </span>
              </div>
            </div>
          ))
        }
      </div>

      <div className="card">
        <div className="card-title">📊 Análise — Últimos 7 Dias</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Funcionário</th><th>Média 7 Dias</th><th>Meta</th><th>Eficiência</th><th>Tendência</th><th>Dias Reg.</th><th>Status</th></tr></thead>
            <tbody>
              {analise.analise7.map(f => (
                <tr key={f.id}>
                  <td><strong style={{ color: 'var(--text)' }}>{f.nome}</strong></td>
                  <td>{fmtNum(f.media7)} un.</td>
                  <td>{fmtNum(f.meta_diaria)} un.</td>
                  <td><span style={{ color: corPctColor(f.pct7), fontWeight: 700 }}>{f.pct7}%</span></td>
                  <td style={{ fontSize: 18 }}>{f.tend}</td>
                  <td><span style={{ color: f.diasReg >= 5 ? 'var(--green)' : f.diasReg >= 3 ? 'var(--amber)' : 'var(--red)' }}>{f.diasReg}/7</span></td>
                  <td><span className={`badge ${f.pct7 >= 100 ? 'b-green' : f.pct7 >= 70 ? 'b-amber' : 'b-red'}`}>{f.pct7 >= 100 ? 'Ótimo' : f.pct7 >= 70 ? 'Regular' : 'Crítico'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
