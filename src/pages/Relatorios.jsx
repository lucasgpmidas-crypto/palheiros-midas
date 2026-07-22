import { useState, useEffect } from 'react'
import { useRegistros, useFuncionarios, useConfig } from '../lib/hooks'
import { getHoje, getOntem, fmtMoeda, fmtNum, fmtData, pctMeta, corPct, getSemana, getMes, getQuinzena, getQuinzenaAtual, exportCSV, exportXLSX, isProducao } from '../lib/utils'
import { format, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const MEDALS = ['🥇', '🥈', '🥉']

function ResumoCards({ fields }) {
  return (
    <div className="card mb16">
      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
        {fields.map(f => (
          <div key={f.label}>
            <div style={{ fontSize: 10.5, color: 'var(--text3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 1 }}>{f.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: f.cor || 'var(--text)', fontFamily: 'Barlow Condensed,sans-serif' }}>{f.val}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TabDiario({ funcionarios, valorMil }) {
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
          <div className="fg" style={{ margin: 0 }}><label>Data</label><input type="date" value={data} max={getHoje()} onChange={e => setData(e.target.value)} /></div>
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

function TabSemanal({ funcionarios, valorMil }) {
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
          <div className="fg" style={{ margin: 0 }}><label>Semana (qualquer dia)</label><input type="date" value={data} onChange={e => setData(e.target.value)} /></div>
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

function TabMensal({ funcionarios, valorMil }) {
  const [mes, setMes] = useState(getHoje().substring(0, 7))
  const { inicio, fim } = getMes(mes)
  const { registros, loading } = useRegistros({ dataInicio: inicio, dataFim: fim })
  const DIAS_UTEIS = 22
  const porFunc = funcionarios.filter(f => f.situacao === 'ativo' && isProducao(f)).map(f => {
    const fr = registros.filter(r => r.func_id === f.id)
    const tot = fr.reduce((s, r) => s + r.quantidade, 0)
    const val = fr.reduce((s, r) => s + Number(r.valor || 0), 0)
    const dias = new Set(fr.map(r => r.data)).size
    const meta = f.meta_diaria * DIAS_UTEIS
    const pct = meta > 0 ? Math.round(tot / meta * 100) : 0
    return { f, tot, val, dias, media: dias > 0 ? Math.round(tot / dias) : 0, meta, pct }
  }).filter(x => x.tot > 0).sort((a, b) => b.tot - a.tot)
  const total = registros.reduce((s, r) => s + r.quantidade, 0)
  const valor = registros.reduce((s, r) => s + Number(r.valor || 0), 0)

  const linhas = () => [
    ['Funcionário', 'Total Mês', 'Valor (R$)', 'Dias', 'Média/Dia', 'Meta Mês', '% Meta'],
    ...porFunc.map(({ f, tot, val, dias, media, meta, pct }) => [f.nome, tot, val.toFixed(2), dias, media, meta, pct + '%'])
  ]
  const exportarCSV  = () => exportCSV(linhas(), `mensal_${mes}.csv`)
  const exportarXLSX = () => exportXLSX([{ name: 'Mensal', rows: linhas() }], `mensal_${mes}.xlsx`)

  return (
    <div>
      <div className="card mb16">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="fg" style={{ margin: 0 }}><label>Mês</label><input type="month" value={mes} onChange={e => setMes(e.target.value)} /></div>
          <button className="btn btn-secondary" onClick={exportarCSV}>⬇ CSV</button>
          <button className="btn btn-secondary" onClick={exportarXLSX} style={{ color: 'var(--green)', borderColor: 'rgba(40,180,133,.3)' }}>⬇ Excel</button>
        </div>
      </div>
      {registros.length > 0 && <ResumoCards fields={[{ label: 'Mês', val: format(new Date(mes + '-15'), "MMMM 'de' yyyy", { locale: ptBR }), cor: 'var(--text)' }, { label: 'Total', val: fmtNum(total) + ' un.', cor: 'var(--gold-light)' }, { label: 'Valor', val: fmtMoeda(valor), cor: 'var(--green)' }]} />}
      <div className="card">
        {loading ? <div className="loading"><div className="spin" /></div> : porFunc.length === 0 ? <div className="empty-state"><div className="es-icon">📭</div><div className="es-text">Sem registros no mês</div></div> :
          <div className="table-wrap"><table>
            <thead><tr><th>#</th><th>Funcionário</th><th>Total Mês</th><th>Valor</th><th>Dias</th><th>Média/Dia</th><th>Meta Mês</th><th>% Meta</th></tr></thead>
            <tbody>{porFunc.map(({ f, tot, val, dias, media, meta, pct }, i) => (<tr key={f.id}><td style={{ fontFamily: 'Barlow Condensed,sans-serif', fontSize: 18, fontWeight: 800, color: 'var(--text3)' }}>{MEDALS[i] || i + 1}</td><td><strong style={{ color: 'var(--text)' }}>{f.nome}</strong></td><td><strong style={{ color: 'var(--gold-light)' }}>{fmtNum(tot)} un.</strong></td><td style={{ color: 'var(--green)' }}>{fmtMoeda(val)}</td><td>{dias}</td><td>{fmtNum(media)} un.</td><td style={{ color: 'var(--text3)' }}>{fmtNum(meta)} un.</td><td><span style={{ color: corPct(pct), fontWeight: 700 }}>{pct}%</span></td></tr>))}</tbody>
          </table></div>}
      </div>
    </div>
  )
}

function TabIndividual({ funcionarios, valorMil }) {
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
          <div className="fg" style={{ margin: 0, minWidth: 180 }}><label>Funcionário</label>
            <select value={funcId} onChange={e => setFuncId(e.target.value)}>
              <option value="">Selecionar...</option>
              {funcionarios.filter(f => f.situacao === 'ativo' && isProducao(f)).map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <div className="fg" style={{ margin: 0 }}><label>Período</label>
            <select value={periodo} onChange={e => setPeriodo(e.target.value)}>
              {[['7', '7 dias'], ['15', '15 dias'], ['30', '30 dias'], ['60', '60 dias'], ['90', '90 dias']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
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

function TabFolha({ funcionarios, valorMil }) {
  const { quinzenaD1, quinzenaD2 } = useConfig()
  const _q0 = getQuinzenaAtual(quinzenaD1, quinzenaD2)
  const [inicio, setInicio] = useState(_q0.inicio)
  const [fim, setFim] = useState(_q0.fim)
  // Os dias de corte chegam do banco depois do primeiro render — realinha o período padrão
  useEffect(() => {
    const q = getQuinzenaAtual(quinzenaD1, quinzenaD2)
    setInicio(q.inicio)
    setFim(q.fim)
  }, [quinzenaD1, quinzenaD2])
  const { registros, loading } = useRegistros({ dataInicio: inicio, dataFim: fim })

  const diasPeriodo = inicio && fim
    ? Math.round((new Date(fim + 'T12:00') - new Date(inicio + 'T12:00')) / 86400000) + 1
    : 15
  const diasUteisEst = Math.round(diasPeriodo * 5 / 7)

  const porFunc = funcionarios.filter(f => f.situacao === 'ativo' && isProducao(f)).map(f => {
    const fr = registros.filter(r => r.func_id === f.id)
    const totProd  = fr.reduce((s, r) => s + (r.quantidade || 0), 0)
    const totAprov = fr.reduce((s, r) => s + ((r.aproveitado ?? r.quantidade) || 0), 0)
    const valor    = fr.reduce((s, r) => s + Number(r.valor || 0), 0)
    const dias     = new Set(fr.map(r => r.data)).size
    const metaPer  = f.meta_diaria * diasUteisEst
    const pct      = metaPer > 0 ? Math.round(totProd / metaPer * 100) : 0
    return { f, totProd, totAprov, valor, dias, metaPer, pct }
  }).filter(x => x.dias > 0).sort((a, b) => b.valor - a.valor)

  const totalValor   = porFunc.reduce((s, x) => s + x.valor, 0)
  const totalProd    = porFunc.reduce((s, x) => s + x.totProd, 0)
  const labelPeriodo = inicio && fim ? `${fmtData(inicio)} a ${fmtData(fim)}` : '—'

  const aplicarQuinzena = (num) => {
    const q = getQuinzena(num, quinzenaD1, quinzenaD2)
    setInicio(q.inicio)
    setFim(q.fim)
  }

  const linhas = () => [
    ['Funcionário', 'Dias Trabalhados', 'Total Produzido', 'Total Aproveitado', 'Meta Período', '% Meta', 'Valor a Receber (R$)'],
    ...porFunc.map(({ f, totProd, totAprov, valor, dias, metaPer, pct }) => [
      f.nome, dias, totProd, totAprov > 0 ? totAprov : '—', metaPer, pct + '%', valor.toFixed(2)
    ]),
    ['TOTAL', '—', totalProd, '—', '—', '—', totalValor.toFixed(2)],
  ]
  const exportarCSV  = () => exportCSV(linhas(), `folha_${inicio}_${fim}.csv`)
  const exportarXLSX = () => exportXLSX([{ name: 'Folha de Pagamento', rows: linhas() }], `folha_${inicio}_${fim}.xlsx`)

  return (
    <div>
      <div className="card mb16">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="fg" style={{ margin: 0 }}><label>Início</label><input type="date" value={inicio} max={fim} onChange={e => setInicio(e.target.value)} /></div>
          <div className="fg" style={{ margin: 0 }}><label>Fim</label><input type="date" value={fim} min={inicio} onChange={e => setFim(e.target.value)} /></div>
          <button className="btn btn-secondary btn-sm" onClick={() => aplicarQuinzena(1)} title={`Dia ${quinzenaD1} a ${quinzenaD2 - 1} do mês atual`}>1ª Quinzena</button>
          <button className="btn btn-secondary btn-sm" onClick={() => aplicarQuinzena(2)} title={`Dia ${quinzenaD2} ao dia ${quinzenaD1 - 1} do mês seguinte`}>2ª Quinzena</button>
          <button className="btn btn-secondary" onClick={exportarCSV} disabled={porFunc.length === 0}>⬇ CSV</button>
          <button className="btn btn-secondary" onClick={exportarXLSX} disabled={porFunc.length === 0} style={{ color: 'var(--green)', borderColor: 'rgba(40,180,133,.3)' }}>⬇ Excel</button>
        </div>
      </div>

      {porFunc.length > 0 && (
        <div className="card mb16">
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--text3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 1 }}>Período</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', fontFamily: 'Barlow Condensed,sans-serif' }}>{labelPeriodo}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--text3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 1 }}>Total a Pagar</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--green)', fontFamily: 'Barlow Condensed,sans-serif' }}>{fmtMoeda(totalValor)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--text3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 1 }}>Funcionários</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', fontFamily: 'Barlow Condensed,sans-serif' }}>{porFunc.length}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--text3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 1 }}>Produção Total</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--gold-light)', fontFamily: 'Barlow Condensed,sans-serif' }}>{fmtNum(totalProd)} un.</div>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        {loading ? <div className="loading"><div className="spin" /></div>
          : porFunc.length === 0
            ? <div className="empty-state"><div className="es-icon">💰</div><div className="es-text">Sem registros no período selecionado</div></div>
            : (
              <div className="table-wrap"><table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Funcionário</th>
                    <th>Dias</th>
                    <th>Produzido</th>
                    <th>Aproveitado</th>
                    <th>% Meta</th>
                    <th style={{ color: 'var(--green)' }}>Valor a Receber</th>
                  </tr>
                </thead>
                <tbody>
                  {porFunc.map(({ f, totProd, totAprov, valor, dias, pct }, i) => (
                    <tr key={f.id}>
                      <td style={{ fontFamily: 'Barlow Condensed,sans-serif', fontSize: 18, fontWeight: 800, color: 'var(--text3)' }}>{MEDALS[i] || i + 1}</td>
                      <td><strong style={{ color: 'var(--text)' }}>{f.nome}</strong></td>
                      <td>{dias}</td>
                      <td>{fmtNum(totProd)} un.</td>
                      <td style={{ color: totAprov > 0 ? 'var(--green)' : 'var(--text3)' }}>{totAprov > 0 ? fmtNum(totAprov) + ' un.' : '—'}</td>
                      <td><span style={{ color: corPct(pct), fontWeight: 700 }}>{pct}%</span></td>
                      <td>
                        <strong style={{ color: 'var(--green)', fontFamily: 'Barlow Condensed,sans-serif', fontSize: 17 }}>
                          {fmtMoeda(valor)}
                        </strong>
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--bg3)' }}>
                    <td />
                    <td><strong style={{ color: 'var(--text)' }}>TOTAL</strong></td>
                    <td>—</td>
                    <td><strong style={{ color: 'var(--gold-light)' }}>{fmtNum(totalProd)} un.</strong></td>
                    <td>—</td>
                    <td>—</td>
                    <td><strong style={{ color: 'var(--green)', fontFamily: 'Barlow Condensed,sans-serif', fontSize: 17 }}>{fmtMoeda(totalValor)}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )
        }
      </div>
    </div>
  )
}

const TABS = [['diario', 'Diário'], ['semanal', 'Semanal'], ['mensal', 'Mensal'], ['individual', 'Individual'], ['folha', '💰 Folha']]

export default function Relatorios() {
  const [aba, setAba] = useState('diario')
  const { funcionarios } = useFuncionarios()
  const { valorMil } = useConfig()
  return (
    <div>
      <div className="tabs">
        {TABS.map(([id, label]) => (
          <button key={id} className={`tab ${aba === id ? 'active' : ''}`} onClick={() => setAba(id)}>{label}</button>
        ))}
      </div>
      {aba === 'diario'     && <TabDiario     funcionarios={funcionarios} valorMil={valorMil} />}
      {aba === 'semanal'    && <TabSemanal    funcionarios={funcionarios} valorMil={valorMil} />}
      {aba === 'mensal'     && <TabMensal     funcionarios={funcionarios} valorMil={valorMil} />}
      {aba === 'individual' && <TabIndividual funcionarios={funcionarios} valorMil={valorMil} />}
      {aba === 'folha'      && <TabFolha      funcionarios={funcionarios} valorMil={valorMil} />}
    </div>
  )
}
