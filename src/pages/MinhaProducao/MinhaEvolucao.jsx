import { useMemo } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import Grafico from '../../components/Grafico'
import { fmtNum, fmtMoeda, fmtData, ultimosDias, pctMeta, corPct } from '../../lib/utils'

// O grafico de 14 dias e a tabela dia a dia com o resultado da conferencia.
// O chartData mora aqui porque e dado de apresentacao do grafico, nao da tela.
export default function MinhaEvolucao({ f, carregandoMeus, meusRegs, confLinha, setContestando }) {
  const chartData = useMemo(() => {
    const dias14 = ultimosDias(14)
    const labels = dias14.map(d => format(new Date(d + 'T12:00'), 'dd/MM', { locale: ptBR }))
    const dados  = dias14.map(d => meusRegs.find(r => r.data === d)?.quantidade || 0)
    const meta   = Array(14).fill(f?.meta_diaria || 0)
    return {
      labels,
      datasets: [
        {
          type: 'bar',
          data: dados,
          backgroundColor: dados.map(v => f?.meta_diaria && v >= f.meta_diaria ? 'rgba(40,180,133,.3)' : 'rgba(201,162,39,.2)'),
          borderColor: dados.map(v => f?.meta_diaria && v >= f.meta_diaria ? '#28B485' : '#C9A227'),
          borderWidth: 1.5,
          borderRadius: 4,
        },
        {
          type: 'line',
          data: meta,
          borderColor: 'rgba(201,162,39,.4)',
          borderWidth: 1.5,
          borderDash: [5, 4],
          pointRadius: 0,
          fill: false,
        },
      ],
    }
  }, [meusRegs, f])

  return (
  <div className="card">
    <div className="card-title">
      📈 Minha Evolução — 14 Dias
      {f?.meta_diaria ? <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text3)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>linha = meta {fmtNum(f.meta_diaria)} un.</span> : null}
    </div>
    {carregandoMeus
      ? <div className="loading"><div className="spin" /></div>
      : meusRegs.length === 0
      ? <div className="empty-state"><div className="es-icon">📭</div><div className="es-text">Sem registros no período</div></div>
      : (
        <>
          <div className="chart-wrap" style={{ height: 180, marginBottom: 16 }}>
            <Grafico tipo="bar"
              data={chartData}
              options={{
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  x: { ticks: { color: '#5E6A8A', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,.04)' } },
                  y: { ticks: { color: '#5E6A8A', font: { size: 10 }, callback: v => fmtNum(v) }, grid: { color: 'rgba(255,255,255,.04)' } },
                },
              }}
            />
          </div>
          <div className="table-wrap"><table>
            <thead><tr><th>Data</th><th>Dia</th><th>Produção</th><th>Valor</th><th>Meta</th><th>Perda</th><th>Diferença</th><th>Contestação</th></tr></thead>
            <tbody>{meusRegs.slice(0, 10).map(r => {
              const pct = f ? pctMeta(r.quantidade, f.meta_diaria) : 0
              const c = confLinha(r)
              return (
                <tr key={r.id}>
                  <td>{new Date(r.data + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</td>
                  <td style={{ color: 'var(--text3)' }}>{new Date(r.data + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short' })}</td>
                  <td><strong style={{ color: 'var(--text)' }}>{fmtNum(r.quantidade)} un.</strong></td>
                  <td style={{ color: 'var(--green)' }}>
                    {r.valor == null ? <span style={{ color: 'var(--text3)' }}>⏳ a conferir</span> : fmtMoeda(Number(r.valor))}{' '}
                    {c.temCQ
                      ? <span title="Dia conferido — o valor final segue a faixa da quinzena (veja Minha Parceria)" style={{ fontSize: 11 }}>✔</span>
                      : <span title="Estimativa — o valor final depende da conferência e da faixa da quinzena" style={{ fontSize: 11, color: 'var(--text3)' }}>⏳</span>}
                  </td>
                  <td><span style={{ color: corPct(pct), fontWeight: 700 }}>{pct}%</span></td>
                  <td style={{ color: c.temCQ ? 'var(--red)' : 'var(--text3)' }}>
                    {c.temCQ ? fmtNum(c.perda) + ' un.' : '—'}
                    {/* Quando o dia foi contado dentro de um monte, o descarte dele é a
                        parte proporcional — dizer isso evita discussão sobre o número */}
                    {c.loteId && (
                      <div style={{ fontSize: 10, color: 'var(--text3)' }} title="Seus lotes foram revisados juntos e o descarte foi dividido entre os dias">
                        revisado em lote{c.revisadoEm ? ` em ${fmtData(c.revisadoEm, 'dd/MM')}` : ''}
                      </div>
                    )}
                  </td>
                  <td>{c.status === 'aguardando' ? <span style={{ color: 'var(--text3)' }}>⏳ aguardando conferência</span>
                    : c.status === 'aguardando_embalagem' ? <span style={{ color: 'var(--text3)' }}>📦 aguardando embalagem</span>
                    : <span style={{ color: c.status === 'ok' ? 'var(--green)' : c.diferenca > 0 ? 'var(--red)' : 'var(--amber)', fontWeight: 700 }}>{c.diferenca === 0 ? '0' : (c.diferenca > 0 ? '−' : '+') + fmtNum(Math.abs(c.diferenca)) + ' un.'}</span>}
                  </td>
                  <td>{!c.temCQ ? <span style={{ color: 'var(--text3)' }}>—</span>
                    : c.contestacao
                      ? <span style={{ color: c.contestacaoStatus === 'resolvida' ? 'var(--green)' : 'var(--amber)', fontSize: 12, fontWeight: 600 }} title={c.contestacao}>{c.contestacaoStatus === 'resolvida' ? '✓ resolvida' : '⚑ contestada'}</span>
                      : <button className="btn btn-secondary btn-xs" title="Discorda da contagem ou da perda? Envie uma contestação ao administrador" onClick={() => setContestando({ data: r.data, perda: c.perda, diferenca: c.diferenca })}>⚑ Contestar</button>}
                  </td>
                </tr>
              )
            })}</tbody>
          </table></div>
        </>
      )
    }
  </div>
  )
}
