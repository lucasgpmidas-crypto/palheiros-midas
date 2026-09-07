import Campo from '../../components/Campo'
import { fmtNum, fmtData } from '../../lib/utils'
import { taxaCor } from './cq-visual'

// A excecao: corrigir ou lancar a revisao de um dia so.
export default function FormAvulso({ TIPOS, ativos, hoje, form, setF, saving, handleRegistrar,
  prodDeclarada, ent, rev, perda, taxa }) {
  return (
<>
{/* auto-fit em vez de 6 colunas fixas: no celular os campos quebram em linhas
    em vez de sair pela borda — a revisão é lançada no chão de fábrica */}
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 10, alignItems: 'flex-end', marginBottom: 10 }}>
  {[
    { label: 'Parceiro', el: <select value={form.funcId} onChange={e => setF('funcId', e.target.value)}><option value="">Selecionar...</option>{ativos.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</select> },
    { label: 'Dia de produção', el: <input type="date" value={form.data} max={hoje} onChange={e => setF('data', e.target.value)} /> },
    { label: 'Quanto veio (contagem)', el: <input type="number" min="0" value={form.entregue} placeholder="Ex: 10000" onChange={e => setF('entregue', e.target.value)} /> },
    { label: 'Quanto prestou (aprovado)', el: <input type="number" min="0" value={form.revisada} placeholder="Ex: 9500" onChange={e => setF('revisada', e.target.value)} /> },
    { label: 'Tipo', el: <select value={form.tipo} onChange={e => setF('tipo', e.target.value)}>{TIPOS.map(t => <option key={t} value={t}>{t}</option>)}</select> },
  ].map(({ label, el }) => (
    <div className="fg" key={label} style={{ margin: 0 }}><label>{label}</label>{el}</div>
  ))}
</div>
<div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
  <Campo label="Observação" style={{ margin: 0, flex: 1 }}><input type="text" value={form.obs} placeholder="Observações..." onChange={e => setF('obs', e.target.value)} /></Campo>
  <button className="btn btn-primary" onClick={handleRegistrar} disabled={saving} style={{ height: 40 }}>
    {saving ? '...' : '✓ Registrar Revisão'}
  </button>
</div>

{/* Produção declarada pelo funcionário na data */}
{form.funcId && (
  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: prodDeclarada > 0 ? 'rgba(201,162,39,.07)' : 'rgba(245,158,11,.07)', border: `1px solid ${prodDeclarada > 0 ? 'rgba(201,162,39,.25)' : 'rgba(245,158,11,.25)'}`, borderRadius: 'var(--rs)', padding: '8px 14px', fontSize: 12.5, marginTop: 8 }}>
    {prodDeclarada > 0 ? <>
      <span style={{ color: 'var(--text3)' }}>🌾 Produção declarada em {fmtData(form.data)}: <strong style={{ color: 'var(--gold-light)' }}>{fmtNum(prodDeclarada)} un.</strong></span>
      {ent !== prodDeclarada && (
        <button className="btn btn-secondary btn-xs" onClick={() => setF('entregue', String(prodDeclarada))}>Usar como entregue</button>
      )}
      {ent > 0 && ent !== prodDeclarada && (
        <span style={{ color: 'var(--amber)', fontWeight: 700 }}>⚠ Entregue difere do declarado ({ent > prodDeclarada ? '+' : '−'}{fmtNum(Math.abs(ent - prodDeclarada))} un.)</span>
      )}
    </> : (
      <span style={{ color: 'var(--amber)' }}>⚠ Este funcionário não registrou produção em {fmtData(form.data)}</span>
    )}
  </div>
)}

{ent > 0 && (
  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg3)', borderRadius: 'var(--rs)', padding: '8px 14px', fontSize: 12.5, marginTop: 8 }}>
    <span style={{ color: 'var(--text3)' }}>Entregue: <strong style={{ color: 'var(--text)' }}>{fmtNum(ent)} un.</strong></span>
    {rev > 0 && <>
      <span style={{ color: 'var(--text3)' }}>Revisado: <strong style={{ color: 'var(--green)' }}>{fmtNum(rev)} un.</strong></span>
      <span style={{ color: 'var(--text3)' }}>Perda: <strong style={{ color: 'var(--red)' }}>{fmtNum(perda)} un.</strong></span>
      <span style={{ color: 'var(--text3)' }}>Aproveitamento: <strong style={{ color: taxaCor(taxa) }}>{taxa}%</strong></span>
    </>}
  </div>
)}
</>
  )
}
