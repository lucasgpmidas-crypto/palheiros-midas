import { fmtNum, fmtMoeda, pctMeta, avatarCor, getIniciais } from '../../lib/utils'

export const MEDALS = ['🥇', '🥈', '🥉']

// O ranking de hoje da equipe, com a propria linha destacada.
export default function RankingDoDia({ carregandoHoje, rankHoje, funcId, funcionarios }) {
  return (
  <div className="card">
    <div className="card-title">🏆 Ranking de Hoje</div>
    {carregandoHoje
      ? <div className="loading"><div className="spin" /></div>
      : rankHoje.length === 0
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
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{r.valor == null ? '⏳ a conferir' : fmtMoeda(Number(r.valor))}</div>
              </div>
            </div>
          )
        })
    }
  </div>
  )
}
