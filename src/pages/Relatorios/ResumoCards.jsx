

export default function ResumoCards({ fields }) {
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
