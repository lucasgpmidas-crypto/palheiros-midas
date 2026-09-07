import { fmtNum, fmtMoeda, fmtData, pctMeta, corPct, avatarCor, getIniciais } from '../../lib/utils'

// O cartao de boas-vindas: quem e, como foi hoje, posicao no ranking e as
// conquistas (recorde pessoal e sequencia batendo a meta).
export default function CabecalhoFuncionario({ f, funcId, meuHoje, minhaPos, posLabel, rankHoje, recorde, recordeHoje, streak, isFinalizacao }) {
  return (
  <div className="card mb16">
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      {f && <div style={{ width: 56, height: 56, borderRadius: '50%', background: avatarCor(funcId), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: '#0D1018', flexShrink: 0 }}>{getIniciais(f.nome)}</div>}
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'Barlow Condensed,sans-serif', fontSize: 22, fontWeight: 700 }}>Olá, {f?.nome?.split(' ')[0] || 'Funcionário'}! 👋</div>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>
          Meta: {fmtNum(f?.meta_diaria || 0)} un./dia · {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
      </div>
      {meuHoje
        ? <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>Produção de hoje</div>
            <div style={{ fontFamily: 'Barlow Condensed,sans-serif', fontSize: 32, fontWeight: 800, color: corPct(f ? pctMeta(meuHoje.quantidade, f.meta_diaria) : 0) }}>{fmtNum(meuHoje.quantidade)}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>
              unidades · {meuHoje.valor == null ? '⏳ a conferir' : fmtMoeda(Number(meuHoje.valor))}
            </div>
            {minhaPos > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                {posLabel} de {rankHoje.length} no ranking de hoje
              </div>
            )}
          </div>
        : <div style={{ fontSize: 13, color: 'var(--amber)' }}>⚠️ Sem registro hoje</div>
      }
    </div>

    {/* Conquistas */}
    {!isFinalizacao && (streak >= 2 || recorde || recordeHoje) && (
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        {recordeHoje && (
          <div className="stats-chip" style={{ borderColor: 'rgba(40,180,133,.45)', background: 'rgba(40,180,133,.08)' }}>
            🎉 <strong style={{ color: 'var(--green)' }}>Novo recorde pessoal hoje!</strong>
          </div>
        )}
        {streak >= 2 && (
          <div className="stats-chip">
            🔥 <strong style={{ color: 'var(--amber)' }}>{streak} registros seguidos</strong>&nbsp;<span style={{ color: 'var(--text3)' }}>batendo a meta</span>
          </div>
        )}
        {recorde && !recordeHoje && (
          <div className="stats-chip">
            🏅 <span style={{ color: 'var(--text3)' }}>Recorde pessoal:</span>&nbsp;<strong style={{ color: 'var(--gold-light)' }}>{fmtNum(recorde.quantidade)} un.</strong>&nbsp;<span style={{ color: 'var(--text3)' }}>({fmtData(recorde.data, 'dd/MM/yy')})</span>
          </div>
        )}
      </div>
    )}
  </div>
  )
}
