import { useState, useEffect } from 'react'
import Campo from '../../components/Campo'
import { useRegistros, useConfig, useCQ } from '../../lib/hooks'
import { fmtMoeda, fmtNum, fmtData, getQuinzena, getQuinzenaAtual, exportCSV, exportXLSX, isProducao, calcParceria, fmtMilheiros, corQualidade } from '../../lib/utils'
import { MEDALS } from './medalhas'

export default function TabFolha({ funcionarios }) {
  const cfg = useConfig()
  const { quinzenaD1, quinzenaD2 } = cfg
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
  const { cqRegistros } = useCQ({ dataInicio: inicio, dataFim: fim })

  const diasPeriodo = inicio && fim
    ? Math.round((new Date(fim + 'T12:00') - new Date(inicio + 'T12:00')) / 86400000) + 1
    : 15
  const diasUteisEst = Math.round(diasPeriodo * 5 / 7)

  // Programa de Parceria: paga-se APENAS o APROVADO na conferência (revisada) pelo
  // preço da faixa da quinzena, com trava de qualidade — mesma conta da MinhaProducao.
  // O declarado sem conferência fica de fora ("aguardando"); a diferença
  // declarado × entregue (o que nunca chegou na conferência) é rastreada por parceiro.
  const porFunc = funcionarios.filter(f => f.situacao === 'ativo' && isProducao(f)).map(f => {
    const fr = registros.filter(r => r.func_id === f.id)
    const cq = cqRegistros.filter(c => c.func_id === f.id)
    const totProd  = fr.reduce((s, r) => s + (r.quantidade || 0), 0)
    const entregue = cq.reduce((s, c) => s + (c.entregue || 0), 0)
    const revisada = cq.reduce((s, c) => s + (c.revisada || 0), 0)
    const modalidade = f.modalidade || 'cp'
    const p = calcParceria({ entregue, revisada, modalidade, cfg })
    const dias = new Set(fr.map(r => r.data)).size
    const diasCq = new Set(cq.map(c => c.data))
    const aguardando = fr.filter(r => !diasCq.has(r.data)).reduce((s, r) => s + (r.quantidade || 0), 0)
    const declConf = fr.filter(r => diasCq.has(r.data)).reduce((s, r) => s + (r.quantidade || 0), 0)
    const dif = declConf - entregue
    const ajuda = modalidade === 'cp' ? dias * cfg.ajudaCustoDia : 0
    const metaPer = f.meta_diaria * diasUteisEst
    const pct = metaPer > 0 ? Math.round(totProd / metaPer * 100) : 0
    return { f, modalidade, totProd, entregue, revisada, declConf, dif, aguardando, dias, metaPer, pct, p, ajuda, total: p.valor + ajuda }
  }).filter(x => x.dias > 0 || x.entregue > 0).sort((a, b) => b.total - a.total)

  const totalValor      = porFunc.reduce((s, x) => s + x.total, 0)
  const totalProd       = porFunc.reduce((s, x) => s + x.totProd, 0)
  const totalEntregue   = porFunc.reduce((s, x) => s + x.entregue, 0)
  const totalDif        = porFunc.reduce((s, x) => s + x.dif, 0)
  const totalAguardando = porFunc.reduce((s, x) => s + x.aguardando, 0)
  const labelPeriodo = inicio && fim ? `${fmtData(inicio)} a ${fmtData(fim)}` : '—'

  const aplicarQuinzena = (num) => {
    const q = getQuinzena(num, quinzenaD1, quinzenaD2)
    setInicio(q.inicio)
    setFim(q.fim)
  }

  const linhas = () => [
    ['Funcionário', 'Modalidade', 'Dias c/ Entrega', 'Declarado (un.)', 'Entregue na Conferência (un.)', 'Aprovado na Revisão (un.)', 'Dif. Declarado × Entregue (un.)', 'Qualidade %', 'Faixa', 'Preço/Milheiro (R$)', 'Produção (R$)', 'Ajuda de Custo (R$)', 'Total a Receber (R$)'],
    ...porFunc.map(({ f, modalidade, dias, totProd, entregue, revisada, dif, p, ajuda, total }) => [
      f.nome, modalidade === 'externo' ? 'Externo' : 'CP Barretos', dias, totProd, entregue, revisada, dif,
      p.qualidade == null ? '—' : p.qualidade.toFixed(1), p.faixaEfetiva.nome, p.preco,
      p.valor.toFixed(2), ajuda.toFixed(2), total.toFixed(2),
    ]),
    ['TOTAL', '—', '—', totalProd, totalEntregue, '—', totalDif, '—', '—', '—', '—', '—', totalValor.toFixed(2)],
  ]
  const exportarCSV  = () => exportCSV(linhas(), `folha_${inicio}_${fim}.csv`)
  const exportarXLSX = () => exportXLSX([{ name: 'Folha de Pagamento', rows: linhas() }], `folha_${inicio}_${fim}.xlsx`)

  return (
    <div>
      <div className="card mb16">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Campo label="Início" style={{ margin: 0 }}><input type="date" value={inicio} max={fim} onChange={e => setInicio(e.target.value)} /></Campo>
          <Campo label="Fim" style={{ margin: 0 }}><input type="date" value={fim} min={inicio} onChange={e => setFim(e.target.value)} /></Campo>
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
              <div style={{ fontSize: 10.5, color: 'var(--text3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 1 }}>Entregue (pago)</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--gold-light)', fontFamily: 'Barlow Condensed,sans-serif' }}>{fmtNum(totalEntregue)} un.</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--text3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 1 }}>Declarado</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', fontFamily: 'Barlow Condensed,sans-serif' }}>{fmtNum(totalProd)} un.</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--text3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 1 }}>Dif. Declarado × Entregue</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: totalDif > 0 ? 'var(--red)' : 'var(--text)', fontFamily: 'Barlow Condensed,sans-serif' }}>{fmtNum(totalDif)} un.</div>
            </div>
          </div>
          {totalAguardando > 0 && (
            <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--amber)' }}>
              ⏳ {fmtNum(totalAguardando)} un. declaradas ainda sem conferência — não entram no pagamento até serem conferidas. Confira antes de fechar a quinzena.
            </div>
          )}
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
                    <th>Declarado</th>
                    <th>Entregue (pago)</th>
                    <th>Diferença</th>
                    <th>Qualidade</th>
                    <th>Faixa · Preço/mil</th>
                    <th>Produção</th>
                    <th>Ajuda de Custo</th>
                    <th style={{ color: 'var(--green)' }}>Total a Receber</th>
                  </tr>
                </thead>
                <tbody>
                  {porFunc.map(({ f, modalidade, totProd, entregue, revisada, dif, aguardando, dias, p, ajuda, total }, i) => (
                    <tr key={f.id}>
                      <td style={{ fontFamily: 'Barlow Condensed,sans-serif', fontSize: 18, fontWeight: 800, color: 'var(--text3)' }}>{MEDALS[i] || i + 1}</td>
                      <td>
                        <strong style={{ color: 'var(--text)' }}>{f.nome}</strong>
                        <div style={{ fontSize: 10.5, color: 'var(--text3)' }}>{modalidade === 'externo' ? '🏠 Externo' : '🏭 CP Barretos'}</div>
                      </td>
                      <td>{dias}</td>
                      <td>
                        {fmtNum(totProd)} un.
                        {aguardando > 0 && <div style={{ fontSize: 10.5, color: 'var(--amber)' }}>⏳ {fmtNum(aguardando)} aguardam conferência</div>}
                      </td>
                      <td style={{ color: entregue > 0 ? 'var(--text)' : 'var(--text3)' }}>
                        {entregue > 0 ? <strong>{fmtNum(entregue)} un.</strong> : '—'}
                        {entregue > 0 && <div style={{ fontSize: 10.5, color: 'var(--text3)' }}>{fmtNum(revisada)} aprovados na revisão</div>}
                      </td>
                      <td title="Declarado (dias já conferidos) − entregue: o que o parceiro anotou e nunca chegou na conferência. O descarte da revisão continua sendo pago.">
                        {dif > 0 ? <strong style={{ color: 'var(--red)' }}>−{fmtNum(dif)} un.</strong>
                          : dif < 0 ? <strong style={{ color: 'var(--amber)' }}>+{fmtNum(-dif)} un.</strong>
                          : <span style={{ color: 'var(--text3)' }}>—</span>}
                      </td>
                      <td>
                        {p.qualidade == null ? <span style={{ color: 'var(--text3)' }}>—</span>
                          : <span style={{ color: corQualidade(p.qualidade, cfg), fontWeight: 700 }}>{p.qualidade.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>}
                      </td>
                      <td>
                        <span style={{ color: 'var(--gold-light)', fontWeight: 700 }}>{p.faixaEfetiva.nome}</span>
                        <span style={{ color: 'var(--text3)' }}> · {fmtMoeda(p.preco)}</span>
                        {p.travada && <span title={`Pelo volume seria ${p.faixaVolume.nome} — qualidade abaixo do padrão travou o preço`} style={{ color: 'var(--amber)' }}> ⚠</span>}
                      </td>
                      <td style={{ color: 'var(--text2)' }} title={`${fmtMilheiros(p.milheiros)} milheiros × ${fmtMoeda(p.preco)}`}>{fmtMoeda(p.valor)}</td>
                      <td style={{ color: ajuda > 0 ? 'var(--text2)' : 'var(--text3)' }} title={modalidade === 'cp' ? `${dias} dias × ${fmtMoeda(cfg.ajudaCustoDia)}` : 'Só parceiro CP recebe ajuda de custo'}>{ajuda > 0 ? fmtMoeda(ajuda) : '—'}</td>
                      <td>
                        <strong style={{ color: 'var(--green)', fontFamily: 'Barlow Condensed,sans-serif', fontSize: 17 }}>
                          {fmtMoeda(total)}
                        </strong>
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--bg3)' }}>
                    <td />
                    <td><strong style={{ color: 'var(--text)' }}>TOTAL</strong></td>
                    <td>—</td>
                    <td><strong style={{ color: 'var(--text)' }}>{fmtNum(totalProd)} un.</strong></td>
                    <td><strong style={{ color: 'var(--gold-light)' }}>{fmtNum(totalEntregue)} un.</strong></td>
                    <td>{totalDif > 0 ? <strong style={{ color: 'var(--red)' }}>−{fmtNum(totalDif)} un.</strong> : '—'}</td>
                    <td>—</td>
                    <td>—</td>
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
