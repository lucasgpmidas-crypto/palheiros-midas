import Campo from '../../components/Campo'
import { fmtNum, fmtData } from '../../lib/utils'

// Revisar varios dias do mesmo parceiro de uma vez.
export default function FormLote({ TIPOS, ativos, hoje, lote, setLote, itens, setItem, salvandoLote,
  diasPendentes, selecionados, totalEntregueLote, revisadoLote, previa, descarteLote, handleRegistrarLote }) {
  return (
  <>
    <div style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 12 }}>
      Para quando chegam vários dias do mesmo parceiro de uma vez. Confira o entregue de cada dia pela etiqueta,
      informe <strong>quanto foi aprovado no total</strong> e o sistema divide o descarte entre os dias, proporcional ao tamanho de cada lote.
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, alignItems: 'flex-end', marginBottom: 12 }}>
      <Campo label="Parceiro" style={{ margin: 0 }}><select value={lote.funcId} onChange={e => setLote(l => ({ ...l, funcId: e.target.value }))}>
          <option value="">Selecionar...</option>
          {ativos.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select></Campo>
      <Campo label="Tipo" style={{ margin: 0 }}><select value={lote.tipo} onChange={e => setLote(l => ({ ...l, tipo: e.target.value }))}>{TIPOS.map(t => <option key={t} value={t}>{t}</option>)}</select></Campo>
      <Campo label="Revisão fechada em" style={{ margin: 0 }}><input type="date" value={lote.revisadoEm} max={hoje} onChange={e => setLote(l => ({ ...l, revisadoEm: e.target.value }))} /></Campo>
      <Campo label="Total aprovado na revisão" style={{ margin: 0 }}><input type="number" min="0" value={lote.revisado} placeholder={totalEntregueLote ? String(totalEntregueLote) : 'Ex: 2900'}
          onChange={e => setLote(l => ({ ...l, revisado: e.target.value }))} /></Campo>
      <Campo label="Observação" style={{ margin: 0 }}><input type="text" value={lote.obs} placeholder="Opcional..." onChange={e => setLote(l => ({ ...l, obs: e.target.value }))} /></Campo>
    </div>

    {!lote.funcId ? (
      <div style={{ fontSize: 13, color: 'var(--text3)', padding: '14px 0' }}>Escolha o parceiro para ver os dias que faltam revisar.</div>
    ) : diasPendentes.length === 0 ? (
      <div className="alert a-success"><div>✓</div><div><strong>Nenhum dia pendente</strong><span>Toda a produção declarada deste parceiro nos últimos 30 dias já passou pela revisão.</span></div></div>
    ) : (
      <>
        <div className="table-wrap"><table className="compacta">
          {/* Quatro colunas, não seis: com o rateado e o descarte em colunas
              próprias a tabela não cabia num celular, e o que ficava fora da
              borda dependia de uma rolagem lateral que ninguém descobre. Os
              dois viraram uma linha embaixo do campo, onde ela já olha. */}
          <thead><tr><th style={{ width: 40 }}>✓</th><th>Dia</th><th>Declarado</th><th>Quanto veio</th></tr></thead>
          <tbody>
            {diasPendentes.map(r => {
              const it = itens[r.data] || {}
              const calc = previa.find(p => p.data === r.data)
              const ent = parseInt(it.entregue) || 0
              return (
                <tr key={r.data} style={{ opacity: it.incluir ? 1 : .45 }}>
                  <td><input type="checkbox" checked={!!it.incluir} onChange={e => setItem(r.data, 'incluir', e.target.checked)} style={{ width: 'auto', margin: 0 }} /></td>
                  <td><strong style={{ color: 'var(--text)' }}>{fmtData(r.data)}</strong></td>
                  <td style={{ color: 'var(--gold-light)' }}>{fmtNum(r.quantidade)} un.</td>
                  <td>
                    <input type="number" min="0" value={it.entregue ?? ''} disabled={!it.incluir}
                      onChange={e => setItem(r.data, 'entregue', e.target.value)} style={{ width: 110 }} />
                    {it.incluir && ent > 0 && ent !== r.quantidade && (
                      <div style={{ fontSize: 10.5, color: 'var(--amber)' }}>
                        {ent > r.quantidade ? '+' : '−'}{fmtNum(Math.abs(ent - r.quantidade))} vs declarado
                      </div>
                    )}
                    {/* Só depois que ela informa o total aprovado: antes disso
                        o rateio assume tudo aprovado e mostraria "descarte 0"
                        em todos os dias, que não é resultado, é ruído. */}
                    {it.incluir && calc && lote.revisado !== '' && (
                      <div style={{ fontSize: 11, marginTop: 3 }}>
                        <span style={{ color: 'var(--green)' }}>prestou {fmtNum(calc.revisada)}</span>
                        {calc.entregue - calc.revisada > 0 && (
                          <span style={{ color: 'var(--red)' }}> · −{fmtNum(calc.entregue - calc.revisada)}</span>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table></div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg3)', borderRadius: 'var(--rs)', padding: '10px 14px', fontSize: 13, marginTop: 12 }}>
          <span style={{ color: 'var(--text3)' }}>Dias: <strong style={{ color: 'var(--text)' }}>{selecionados.length}</strong></span>
          <span style={{ color: 'var(--text3)' }}>Entregue: <strong style={{ color: 'var(--text)' }}>{fmtNum(totalEntregueLote)} un.</strong></span>
          <span style={{ color: 'var(--text3)' }}>Aprovado: <strong style={{ color: 'var(--green)' }}>{fmtNum(revisadoLote)} un.</strong></span>
          <span style={{ color: 'var(--text3)' }}>Descarte: <strong style={{ color: 'var(--red)' }}>{fmtNum(descarteLote)} un.</strong></span>
          {totalEntregueLote > 0 && <span style={{ color: 'var(--text3)' }}>Qualidade: <strong style={{ color: 'var(--gold-light)' }}>{(revisadoLote / totalEntregueLote * 100).toFixed(1)}%</strong></span>}
          <button className="btn btn-primary" onClick={handleRegistrarLote} disabled={salvandoLote || !selecionados.length} style={{ marginLeft: 'auto' }}>
            {salvandoLote ? '...' : `✓ Registrar ${selecionados.length} ${selecionados.length === 1 ? 'dia' : 'dias'}`}
          </button>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 8 }}>
          ℹ️ Cada dia vira um registro separado, para a conferência diária continuar batendo.
          A divisão do descarte não muda o pagamento nem a qualidade da quinzena — só distribui o que foi reprovado entre os lotes.
        </div>
      </>
    )}
  </>
  )
}
