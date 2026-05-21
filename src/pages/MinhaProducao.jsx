import { useMemo } from 'react'
import { subDays, format } from 'date-fns'
import { useRegistros, useFuncionarios, useConfig } from '../lib/hooks'
import { useAuth } from '../lib/auth'
import { getHoje, fmtMoeda, fmtNum, pctMeta, corPct, avatarCor, getIniciais } from '../lib/utils'

export default function MinhaProducao() {
  const { funcSession } = useAuth()
  const funcId = funcSession?.id
  const { funcionarios } = useFuncionarios()
  const { valorMil } = useConfig()
  const hoje = getHoje()
  const ini30 = format(subDays(new Date(), 30), 'yyyy-MM-dd')

  const { registros: regsHoje }  = useRegistros({ data: hoje })
  const { registros: meusRegs }  = useRegistros({ funcId, dataInicio: ini30, dataFim: hoje })

  const f = funcionarios.find(x => x.id === funcId)
  const meuHoje = regsHoje.find(r => r.func_id === funcId)
  const rankHoje = [...regsHoje].sort((a, b) => b.quantidade - a.quantidade)
  const minhaPos = rankHoje.findIndex(r => r.func_id === funcId) + 1

  const total30  = meusRegs.reduce((s, r) => s + r.quantidade, 0)
  const valor30  = meusRegs.reduce((s, r) => s + Number(r.valor || 0), 0)
  const media30  = meusRegs.length ? Math.round(total30 / meusRegs.length) : 0
  const diasMeta = f ? meusRegs.filter(r => r.quantidade >= f.meta_diaria).length : 0

  const MEDALS = ['🥇', '🥈', '🥉']
  const posLabel = minhaPos > 0 ? (MEDALS[minhaPos - 1] || '#' + minhaPos) : '—'

  return (
    <div>
      {/* Boas vindas */}
      <div className="card mb16">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {f && <div style={{ width: 56, height: 56, borderRadius: '50%', background: avatarCor(funcId), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: '#0D1018', flexShrink: 0 }}>{getIniciais(f.nome)}</div>}
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'Barlow Condensed,sans-serif', fontSize: 22, fontWeight: 700 }}>Olá, {f?.nome?.split(' ')[0] || 'Funcionário'}! 👋</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              Meta: {fmtNum(Math.round((f?.meta_diaria || 0) / 20))} maços/dia · {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
          </div>
          {meuHoje
            ? <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>Produção de hoje</div>
                <div style={{ fontFamily: 'Barlow Condensed,sans-serif', fontSize: 32, fontWeight: 800, color: corPct(f ? pctMeta(meuHoje.quantidade, f.meta_diaria) : 0) }}>{fmtNum(Math.round(meuHoje.quantidade / 20))}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>maços · {fmtMoeda(Number(meuHoje.valor))}</div>
              </div>
            : <div style={{ fontSize: 13, color: 'var(--amber)' }}>⚠️ Sem registro hoje</div>
          }
        </div>
      </div>

      {/* Stats */}
      <div className="stat-grid mb16">
        <div className="stat-card sc-gold">
          <div className="stat-label">Posição Hoje</div>
          <div className="stat-value sv-gold" style={{ fontSize: 28 }}>{posLabel}</div>
          <div className="stat-sub">{minhaPos > 0 ? 'de ' + rankHoje.length + ' registros' : 'sem registro hoje'}</div>
        </div>
        <div className="stat-card sc-green">
          <div className="stat-label">Valor 30 Dias</div>
          <div className="stat-value sv-green" style={{ fontSize: 20 }}>{fmtMoeda(valor30)}</div>
          <div className="stat-sub">{fmtNum(Math.round(total30 / 20))} maços produzidos</div>
        </div>
        <div className="stat-card sc-blue">
          <div className="stat-label">Média Diária</div>
          <div className="stat-value sv-blue">{fmtNum(Math.round(media30 / 20))}</div>
          <div className="stat-sub">maços/dia</div>
        </div>
        <div className="stat-card sc-amber">
          <div className="stat-label">Dias na Meta</div>
          <div className="stat-value sv-amber">{diasMeta}/{meusRegs.length}</div>
          <div className="stat-sub">nos últimos 30 dias</div>
        </div>
      </div>

      <div className="g2">
        {/* Ranking do dia */}
        <div className="card">
          <div className="card-title">🏆 Ranking de Hoje</div>
          {rankHoje.length === 0
            ? <div className="empty-state"><div className="es-icon">📭</div><div className="es-text">Nenhum registro hoje</div></div>
            : rankHoje.map((r, i) => {
                const isMe = r.func_id === funcId
                const fData = funcionarios.find(x => x.id === r.func_id)
                const pct = fData ? pctMeta(r.quantidade, fData.meta_diaria) : 0
                return (
                  <div key={r.id} className="rank-row" style={isMe ? { background: 'rgba(201,162,39,.07)', borderRadius: 8, padding: '10px', margin: '-4px -8px' } : {}}>
                    <div className={`rank-num ${i < 3 ? 'rn-' + (i + 1) : ''}`}>{MEDALS[i] || i + 1}</div>
                    <div className="rank-av" style={{ background: avatarCor(r.func_id) }}>{isMe ? '⭐' : getIniciais(r.funcionarios?.nome || '')}</div>
                    <div className="rank-info">
                      <div className="rank-name" style={isMe ? { color: 'var(--gold-light)', fontWeight: 700 } : {}}>{isMe ? '👉 ' : ''}{r.funcionarios?.nome}</div>
                      <div className="pbar"><div className="pfill pf-gold" style={{ width: `${Math.min(100, pct)}%` }} /></div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'Barlow Condensed,sans-serif', fontSize: 18, fontWeight: 800, color: isMe ? 'var(--gold-light)' : 'var(--text2)' }}>{fmtNum(r.quantidade)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{fmtMoeda(Number(r.valor))}</div>
                    </div>
                  </div>
                )
              })
          }
        </div>

        {/* Minha evolução */}
        <div className="card">
          <div className="card-title">📈 Minha Evolução — 30 Dias</div>
          {meusRegs.length === 0
            ? <div className="empty-state"><div className="es-icon">📭</div><div className="es-text">Sem registros no período</div></div>
            : <div className="table-wrap"><table>
                <thead><tr><th>Data</th><th>Dia</th><th>Produção</th><th>Valor</th><th>Meta</th></tr></thead>
                <tbody>{meusRegs.slice(0, 15).map(r => {
                  const pct = f ? pctMeta(r.quantidade, f.meta_diaria) : 0
                  return (
                    <tr key={r.id}>
                      <td>{new Date(r.data + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</td>
                      <td style={{ color: 'var(--text3)' }}>{new Date(r.data + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short' })}</td>
                      <td><strong style={{ color: 'var(--text)' }}>{fmtNum(Math.round(r.quantidade / 20))} maços</strong></td>
                      <td style={{ color: 'var(--green)' }}>{fmtMoeda(Number(r.valor))}</td>
                      <td><span style={{ color: corPct(pct), fontWeight: 700 }}>{pct}%</span></td>
                    </tr>
                  )
                })}</tbody>
              </table></div>
          }
        </div>
      </div>
    </div>
  )
}
