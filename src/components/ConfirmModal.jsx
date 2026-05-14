export default function ConfirmModal({ title, message = 'Esta ação não pode ser desfeita.', details = [], onConfirm, onCancel, confirmLabel = 'Sim, excluir' }) {
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="modal" style={{ width: 360, maxWidth: '92vw' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,transparent,var(--red),transparent)', borderRadius: '16px 16px 0 0' }} />
        <div style={{ textAlign: 'center', padding: '8px 0 0' }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(232,64,64,.1)', border: '1px solid rgba(232,64,64,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, margin: '0 auto 14px' }}>🗑️</div>
          <div style={{ fontFamily: 'Barlow Condensed,sans-serif', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{title}</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16 }}>{message}</div>
        </div>

        {details.length > 0 && (
          <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--rs)', padding: '12px 14px', marginBottom: 18 }}>
            {details.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                <span style={{ color: 'var(--text3)', fontSize: 12 }}>{k}</span>
                <span style={{ fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-danger" style={{ flex: 1, justifyContent: 'center' }} onClick={onConfirm}>{confirmLabel}</button>
          <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={onCancel}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}
