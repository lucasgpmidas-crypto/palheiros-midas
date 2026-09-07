import Campo from '../../components/Campo'
import { fmtNum, fmtData } from '../../lib/utils'

// Embalar de uma vez tudo o que ja foi revisado do parceiro: ela informa o
// total de displays e macos e o sistema rateia entre os dias.
export default function FormEmbalagem({ ativos, hoje, embLote, setEmbLote, marcadosEmb, setMarcadosEmb,
  salvandoEmbLote, pendentesEmb, temRevisaoEmb, tamanhoLote, embSelecionados, revisadoEmb, sugestaoEmb,
  dispTotal, macTotal, dispRateio, macRateio, embaladoTotal, sobraEmb, handleEmbalarLote }) {
  return (
  <>
    <div style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 12 }}>
      Para quando o monte do parceiro é embalado todo de uma vez. Informe <strong>o total de displays e maços</strong> que saiu;
      o sistema divide entre os dias, proporcional ao aprovado de cada um.
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, alignItems: 'flex-end', marginBottom: 12 }}>
      <Campo label="Parceiro" style={{ margin: 0 }}><select value={embLote.funcId} onChange={e => setEmbLote(l => ({ ...l, funcId: e.target.value }))}>
          <option value="">Selecionar...</option>
          {ativos.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select></Campo>
      <Campo label="Embalado em" style={{ margin: 0 }}><input type="date" value={embLote.embaladoEm} max={hoje} onChange={e => setEmbLote(l => ({ ...l, embaladoEm: e.target.value }))} /></Campo>
      <Campo label="Displays (total)" style={{ margin: 0 }}><input type="number" min="0" value={embLote.displays} placeholder={sugestaoEmb ? String(sugestaoEmb.displays) : '0'}
          onChange={e => setEmbLote(l => ({ ...l, displays: e.target.value }))} /></Campo>
      <Campo label="Maços (total)" style={{ margin: 0 }}><input type="number" min="0" value={embLote.macos} placeholder={sugestaoEmb ? String(sugestaoEmb.macos) : '0'}
          onChange={e => setEmbLote(l => ({ ...l, macos: e.target.value }))} /></Campo>
    </div>

    {!embLote.funcId ? (
      <div style={{ fontSize: 13, color: 'var(--text3)', padding: '14px 0' }}>Escolha o parceiro para ver o que está revisado e ainda não foi embalado.</div>
    ) : pendentesEmb.length === 0 ? (
      temRevisaoEmb ? (
        <div className="alert a-success"><div>✓</div><div><strong>Nada pendente de embalagem</strong><span>Tudo que foi revisado deste parceiro nos últimos 30 dias já tem display lançado.</span></div></div>
      ) : (
        <div className="alert a-warn"><div>⚠</div><div><strong>Nenhuma revisão lançada</strong><span>Este parceiro não tem nenhum dia revisado nos últimos 30 dias. Lance a revisão em “Vários dias” antes de embalar.</span></div></div>
      )
    ) : (
      <>
        {sugestaoEmb && (
          <div style={{ fontSize: 12.5, color: 'var(--gold-light)', background: 'rgba(201,162,39,.07)', border: '1px solid rgba(201,162,39,.25)', borderRadius: 'var(--rs)', padding: '8px 14px', marginBottom: 10 }}>
            🏷 {fmtNum(revisadoEmb)} un. aprovadas dão <strong>{sugestaoEmb.displays} displays + {sugestaoEmb.macos} maços</strong>
            {sugestaoEmb.avulso > 0 && <> e sobram <strong>{sugestaoEmb.avulso} un. avulsas</strong></>} — confira com o que saiu de verdade.
          </div>
        )}
        <div className="table-wrap"><table className="compacta">
          <thead><tr><th style={{ width: 40 }}>✓</th><th>Dia</th><th>Prestou</th><th>Displays</th><th>Maços</th></tr></thead>
          <tbody>
            {pendentesEmb.map(c => {
              const idx = embSelecionados.findIndex(x => x.id === c.id)
              return (
                <tr key={c.id} style={{ opacity: marcadosEmb[c.id] ? 1 : .45 }}>
                  <td><input type="checkbox" checked={!!marcadosEmb[c.id]} onChange={e => setMarcadosEmb(m => ({ ...m, [c.id]: e.target.checked }))} style={{ width: 'auto', margin: 0 }} /></td>
                  {/* De onde veio o dia fica embaixo da data, não numa coluna
                      própria: a informação importa (é o contexto de quem
                      contestar), mas não vale uma coluna num celular. */}
                  <td>
                    <strong style={{ color: 'var(--text)' }}>{fmtData(c.data)}</strong>
                    <div style={{ color: 'var(--text3)', fontSize: 11 }}>
                      {c.lote_id
                        ? <>🧾 lote de {tamanhoLote[c.lote_id]} dias{c.revisado_em ? ` · ${fmtData(c.revisado_em, 'dd/MM')}` : ''}</>
                        : 'avulso'}
                    </div>
                  </td>
                  <td style={{ color: 'var(--green)' }}>{fmtNum(c.revisada)} un.</td>
                  <td style={{ color: 'var(--gold-light)', fontWeight: 700 }}>{idx >= 0 ? dispRateio[idx] : '—'}</td>
                  <td style={{ color: 'var(--text2)' }}>{idx >= 0 ? macRateio[idx] : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table></div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg3)', borderRadius: 'var(--rs)', padding: '10px 14px', fontSize: 13, marginTop: 12 }}>
          <span style={{ color: 'var(--text3)' }}>Dias: <strong style={{ color: 'var(--text)' }}>{embSelecionados.length}</strong></span>
          <span style={{ color: 'var(--text3)' }}>Aprovado: <strong style={{ color: 'var(--green)' }}>{fmtNum(revisadoEmb)} un.</strong></span>
          <span style={{ color: 'var(--text3)' }}>Embalado: <strong style={{ color: 'var(--text)' }}>{dispTotal} disp. + {macTotal} maços = {fmtNum(embaladoTotal)} un.</strong></span>
          <span style={{ color: 'var(--text3)' }}>Sobra avulsa: <strong style={{ color: sobraEmb < 0 ? 'var(--red)' : 'var(--text2)' }}>{fmtNum(sobraEmb)} un.</strong></span>
          <button className="btn btn-primary" onClick={handleEmbalarLote} disabled={salvandoEmbLote || !embSelecionados.length} style={{ marginLeft: 'auto' }}>
            {salvandoEmbLote ? '...' : `🏷 Lançar embalagem de ${embSelecionados.length} ${embSelecionados.length === 1 ? 'dia' : 'dias'}`}
          </button>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 8 }}>
          ℹ️ Display e maço são inteiros: quem tem a maior sobra na conta leva a unidade a mais, e a soma fecha exatamente com o total que você informou.
        </div>
      </>
    )}
  </>
  )
}
