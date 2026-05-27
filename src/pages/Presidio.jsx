import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { getHoje, fmtData, exportCSV } from '../lib/utils'
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  format, addWeeks, subWeeks, addMonths, subMonths,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import Modal from '../components/Modal'
import ConfirmModal from '../components/ConfirmModal'
import toast from 'react-hot-toast'

const CHAVE = 'presidio_data'
const BONUS_SEMANAL = [
  { min: 9, pts: 10 },
  { min: 7, pts: 5 },
  { min: 5, pts: 2 },
]
const BONUS_RANKING = [14, 10, 7, 5, 3]
const MEDALHAS = ['🥇', '🥈', '🥉', '4º', '5º']

const dadosVazios = () => ({ enroladores: [], registros: [] })

function gerarId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function parseDate(str) {
  return new Date(str + 'T12:00:00')
}

async function loadData() {
  const { data } = await supabase
    .from('configuracoes')
    .select('valor')
    .eq('chave', CHAVE)
    .single()
  if (!data?.valor) return dadosVazios()
  try { return JSON.parse(data.valor) } catch { return dadosVazios() }
}

async function saveData(dados) {
  const { error } = await supabase
    .from('configuracoes')
    .upsert({ chave: CHAVE, valor: JSON.stringify(dados) }, { onConflict: 'chave' })
  if (error) throw error
}

function calcBonusSemanal(totalMil) {
  const tier = BONUS_SEMANAL.find(b => totalMil >= b.min)
  return tier ? tier.pts : 0
}

// Filtra registros por mês (yyyy-MM) ou retorna todos
function filtrarPorMes(registros, mesKey) {
  if (!mesKey) return registros
  const d = parseDate(mesKey + '-15')
  const ms = format(startOfMonth(d), 'yyyy-MM-dd')
  const me = format(endOfMonth(d), 'yyyy-MM-dd')
  return registros.filter(r => r.data >= ms && r.data <= me)
}

function computeCredits(registros, enroladores) {
  const ids = enroladores.map(e => e.id)
  const baseMap = Object.fromEntries(ids.map(id => [id, 0]))
  const semanalMap = Object.fromEntries(ids.map(id => [id, 0]))
  const rankingMap = Object.fromEntries(ids.map(id => [id, 0]))
  const weekMap = {}
  const monthMilMap = {}

  registros.forEach(r => {
    if (r.aproveitamento < 96) return
    const eid = r.enroladorId
    const d = parseDate(r.data)
    const weekStart = format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd')
    const monthKey = format(d, 'yyyy-MM')

    if (eid in baseMap) baseMap[eid] += r.milheiros
    else baseMap[eid] = r.milheiros

    const wkey = `${eid}__${weekStart}`
    if (!weekMap[wkey]) weekMap[wkey] = { eid, totalMil: 0, monthKey }
    weekMap[wkey].totalMil += r.milheiros

    const mkey = `${eid}__${monthKey}`
    monthMilMap[mkey] = (monthMilMap[mkey] || 0) + r.milheiros
  })

  Object.values(weekMap).forEach(({ eid, totalMil }) => {
    const b = calcBonusSemanal(totalMil)
    semanalMap[eid] = (semanalMap[eid] || 0) + b
  })

  const allMonths = [...new Set(Object.values(weekMap).map(v => v.monthKey))]
  allMonths.forEach(monthKey => {
    const scores = ids
      .map(eid => ({ eid, mil: monthMilMap[`${eid}__${monthKey}`] || 0 }))
      .filter(x => x.mil > 0)
      .sort((a, b) => b.mil - a.mil)
    scores.forEach(({ eid }, idx) => {
      if (idx < BONUS_RANKING.length)
        rankingMap[eid] = (rankingMap[eid] || 0) + BONUS_RANKING[idx]
    })
  })

  const result = {}
  ids.forEach(eid => {
    const base = baseMap[eid] || 0
    const semanal = semanalMap[eid] || 0
    const ranking = rankingMap[eid] || 0
    result[eid] = { base, semanal, ranking, total: base + semanal + ranking }
  })
  return result
}

// ─── Tab Registrar ──────────────────────────────────────────────────────────────

function TabRegistrar({ dados, setDados }) {
  const [form, setForm] = useState({ enroladorId: '', data: getHoje(), milheiros: '', aproveitamento: '' })
  const [saving, setSaving] = useState(false)
  const [confirmId, setConfirmId] = useState(null) // id do registro a excluir

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const enroladoresAtivos = dados.enroladores.filter(e => e.ativo)

  // Resumo da semana atual
  const weekStats = useMemo(() => {
    const d = parseDate(getHoje())
    const ws = format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd')
    const we = format(endOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd')
    const wLabel = `${format(parseDate(ws), 'dd/MM', { locale: ptBR })} – ${format(parseDate(we), 'dd/MM', { locale: ptBR })}`

    const milPorEnrolador = {}
    dados.registros.forEach(r => {
      if (r.aproveitamento < 96 || r.data < ws || r.data > we) return
      milPorEnrolador[r.enroladorId] = (milPorEnrolador[r.enroladorId] || 0) + r.milheiros
    })

    const totalMil = Object.values(milPorEnrolador).reduce((s, v) => s + v, 0)
    const totalPts = totalMil
    let totalBonus = 0
    Object.values(milPorEnrolador).forEach(mil => { totalBonus += calcBonusSemanal(mil) })

    return { wLabel, totalMil, totalPts, totalBonus, milPorEnrolador }
  }, [dados.registros])

  const handleSalvar = async () => {
    if (!form.enroladorId) { toast.error('Selecione o enrolador'); return }
    const mil = Math.round(Number(form.milheiros) * 10) / 10
    const apr = Number(form.aproveitamento)
    if (!form.milheiros || mil < 0.5) { toast.error('Mínimo de 0,5 milheiros'); return }
    if (form.aproveitamento === '' || apr < 0 || apr > 100) { toast.error('Aproveitamento inválido (0–100)'); return }

    setSaving(true)
    const novo = {
      id: gerarId(),
      enroladorId: form.enroladorId,
      data: form.data,
      milheiros: mil,
      aproveitamento: apr,
      criadoEm: new Date().toISOString(),
    }
    const atualizado = { ...dados, registros: [...dados.registros, novo] }
    try {
      await saveData(atualizado)
      setDados(atualizado)
      setForm(f => ({ ...f, milheiros: '', aproveitamento: '' }))
      toast.success('Produção registrada!')
    } catch { toast.error('Erro ao salvar') }
    setSaving(false)
  }

  const handleExcluir = async () => {
    const atualizado = { ...dados, registros: dados.registros.filter(r => r.id !== confirmId) }
    try {
      await saveData(atualizado)
      setDados(atualizado)
      setConfirmId(null)
      toast.success('Registro removido')
    } catch { toast.error('Erro ao remover') }
  }

  const nomeEnrolador = (eid) => dados.enroladores.find(e => e.id === eid)?.nome || '—'
  const recentes = [...dados.registros]
    .sort((a, b) => b.data.localeCompare(a.data) || (b.criadoEm || '').localeCompare(a.criadoEm || ''))
    .slice(0, 60)

  const aprPrev = Number(form.aproveitamento)
  const milPrev = Math.round(Number(form.milheiros) * 10) / 10

  const registroConfirm = dados.registros.find(r => r.id === confirmId)

  return (
    <div>
      {/* Resumo semana atual */}
      <div className="card mb16" style={{ background: 'rgba(201,162,39,.06)', border: '1px solid rgba(201,162,39,.18)' }}>
        <div style={{ fontSize: 11, color: 'var(--gold-light)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
          Semana Atual — {weekStats.wLabel}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--gold-light)' }}>{weekStats.totalMil}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>mil aprovados</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>{weekStats.totalPts}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>pontos base</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: weekStats.totalBonus > 0 ? 'var(--green)' : 'var(--text3)' }}>
              {weekStats.totalBonus > 0 ? `+${weekStats.totalBonus}` : '—'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>bônus semanal</div>
          </div>
          {Object.keys(weekStats.milPorEnrolador).length > 0 && (
            <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              {Object.entries(weekStats.milPorEnrolador).map(([eid, mil]) => {
                const bonus = calcBonusSemanal(mil)
                const nome = nomeEnrolador(eid)
                return (
                  <div key={eid} style={{ fontSize: 12 }}>
                    <span style={{ color: 'var(--text2)' }}>{nome.split(' ')[0]}: </span>
                    <span style={{ color: 'var(--gold-light)', fontWeight: 700 }}>{mil} mil</span>
                    {bonus > 0 && <span style={{ color: 'var(--green)' }}> +{bonus}pts</span>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="card mb16">
        <div className="card-title">✏️ Registrar Produção</div>
        <div className="fgrid">
          <div className="fg">
            <label>Enrolador *</label>
            <select value={form.enroladorId} onChange={e => setF('enroladorId', e.target.value)}>
              <option value="">Selecione...</option>
              {enroladoresAtivos.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </div>
          <div className="fg">
            <label>Data *</label>
            <input type="date" value={form.data} onChange={e => setF('data', e.target.value)} />
          </div>
          <div className="fg">
            <label>Milheiros Produzidos * <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(mín. 0,5)</span></label>
            <input type="number" min="0.5" step="0.5" value={form.milheiros}
              onChange={e => setF('milheiros', e.target.value)} placeholder="Ex: 5" />
          </div>
          <div className="fg">
            <label>Aproveitamento (%) *</label>
            <input type="number" min="0" max="100" step="0.1" value={form.aproveitamento}
              onChange={e => setF('aproveitamento', e.target.value)} placeholder="Ex: 97.5" />
          </div>
        </div>

        {form.milheiros && form.aproveitamento !== '' && (
          <div style={{ margin: '4px 0 12px', background: 'var(--bg3)', borderRadius: 'var(--rs)', padding: '10px 14px', fontSize: 13, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <span>
              <span style={{ color: 'var(--text3)' }}>Pontos base: </span>
              <strong style={{ color: aprPrev >= 96 ? 'var(--green)' : 'var(--red)' }}>
                {aprPrev >= 96 ? `+${milPrev} pts` : '0 pts (aproveitamento < 96%)'}
              </strong>
            </span>
            {aprPrev >= 96 && milPrev >= 5 && (
              <span>
                <span style={{ color: 'var(--text3)' }}>Bônus semanal se atingir: </span>
                <strong style={{ color: 'var(--gold-light)' }}>
                  {milPrev >= 9 ? '+10 pts (≥9mil)' : milPrev >= 7 ? '+5 pts (≥7mil)' : '+2 pts (≥5mil)'}
                </strong>
              </span>
            )}
          </div>
        )}

        <button className="btn btn-primary" onClick={handleSalvar} disabled={saving}>
          {saving ? 'Salvando...' : 'Registrar Produção'}
        </button>
      </div>

      <div className="card">
        <div className="card-title">📋 Registros Recentes</div>
        {recentes.length === 0
          ? <div className="empty-state"><div className="es-icon">📋</div><div className="es-text">Nenhum registro ainda</div></div>
          : <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Enrolador</th><th>Data</th><th>Milheiros</th><th>Aproveit.</th><th>Pontos</th><th></th></tr>
                </thead>
                <tbody>
                  {recentes.map(r => {
                    const ok = r.aproveitamento >= 96
                    return (
                      <tr key={r.id}>
                        <td><strong>{nomeEnrolador(r.enroladorId)}</strong></td>
                        <td>{fmtData(r.data)}</td>
                        <td style={{ color: 'var(--gold-light)', fontWeight: 700 }}>{r.milheiros} mil</td>
                        <td><span className={`badge ${ok ? 'b-green' : 'b-red'}`}>{r.aproveitamento}%</span></td>
                        <td><strong style={{ color: ok ? 'var(--green)' : 'var(--text3)' }}>{ok ? `+${r.milheiros}` : '0'}</strong></td>
                        <td>
                          <button className="btn btn-secondary btn-sm" onClick={() => setConfirmId(r.id)}
                            style={{ color: 'var(--red)' }} title="Excluir">🗑</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
        }
      </div>

      {confirmId && registroConfirm && (
        <ConfirmModal
          title="Excluir Registro?"
          message="Este registro será removido permanentemente."
          details={[
            ['Enrolador', nomeEnrolador(registroConfirm.enroladorId)],
            ['Data', fmtData(registroConfirm.data)],
            ['Milheiros', `${registroConfirm.milheiros} mil`],
            ['Aproveitamento', `${registroConfirm.aproveitamento}%`],
          ]}
          confirmLabel="Sim, excluir"
          onConfirm={handleExcluir}
          onCancel={() => setConfirmId(null)}
        />
      )}
    </div>
  )
}

// ─── Tab Enroladores ────────────────────────────────────────────────────────────

function TabEnroladores({ dados, setDados }) {
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ nome: '', ativo: true, obs: '' })
  const [saving, setSaving] = useState(false)
  const [confirmExcluirId, setConfirmExcluirId] = useState(null)

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const abrirNovo = () => { setEditId(null); setForm({ nome: '', ativo: true, obs: '' }); setModal(true) }
  const abrirEditar = (e) => { setEditId(e.id); setForm({ nome: e.nome, ativo: e.ativo, obs: e.obs || '' }); setModal(true) }

  const registrosPorEnrolador = useMemo(() => {
    const map = {}
    dados.registros.forEach(r => { map[r.enroladorId] = (map[r.enroladorId] || 0) + 1 })
    return map
  }, [dados.registros])

  const handleSalvar = async () => {
    if (!form.nome.trim()) { toast.error('Informe o nome'); return }
    setSaving(true)
    let enroladores
    if (editId) {
      enroladores = dados.enroladores.map(e =>
        e.id === editId ? { ...e, nome: form.nome.trim(), ativo: form.ativo, obs: form.obs } : e
      )
    } else {
      enroladores = [...dados.enroladores, {
        id: gerarId(), nome: form.nome.trim(), ativo: form.ativo, obs: form.obs, criadoEm: new Date().toISOString(),
      }]
    }
    const atualizado = { ...dados, enroladores }
    try {
      await saveData(atualizado)
      setDados(atualizado)
      setModal(false)
      toast.success(editId ? 'Enrolador atualizado!' : 'Enrolador adicionado!')
    } catch { toast.error('Erro ao salvar') }
    setSaving(false)
  }

  const handleExcluir = async () => {
    const enroladores = dados.enroladores.filter(e => e.id !== confirmExcluirId)
    const registros = dados.registros.filter(r => r.enroladorId !== confirmExcluirId)
    const atualizado = { ...dados, enroladores, registros }
    try {
      await saveData(atualizado)
      setDados(atualizado)
      setConfirmExcluirId(null)
      toast.success('Enrolador excluído')
    } catch { toast.error('Erro ao excluir') }
  }

  const ativos = dados.enroladores.filter(e => e.ativo).length
  const enroladorConfirm = dados.enroladores.find(e => e.id === confirmExcluirId)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="stats-chip"><span style={{ color: 'var(--text3)' }}>Ativos: </span><strong style={{ color: 'var(--green)' }}>{ativos}</strong></div>
          <div className="stats-chip"><span style={{ color: 'var(--text3)' }}>Total: </span><strong>{dados.enroladores.length}</strong></div>
        </div>
        <button className="btn btn-primary" onClick={abrirNovo}>+ Novo Enrolador</button>
      </div>

      <div className="card">
        <div className="card-title">⛓ Enroladores do Presídio</div>
        {dados.enroladores.length === 0
          ? <div className="empty-state"><div className="es-icon">⛓</div><div className="es-text">Nenhum enrolador cadastrado</div></div>
          : <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>#</th><th>Nome</th><th>Situação</th><th>Registros</th><th>Observações</th><th>Ações</th></tr>
                </thead>
                <tbody>
                  {dados.enroladores.map((e, i) => (
                    <tr key={e.id}>
                      <td style={{ color: 'var(--text3)', width: 36 }}>{i + 1}</td>
                      <td><strong>{e.nome}</strong></td>
                      <td><span className={`badge ${e.ativo ? 'b-green' : 'b-red'}`}>{e.ativo ? 'Ativo' : 'Inativo'}</span></td>
                      <td style={{ color: 'var(--text3)' }}>{registrosPorEnrolador[e.id] || 0} reg.</td>
                      <td style={{ color: 'var(--text3)' }}>{e.obs || '—'}</td>
                      <td style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => abrirEditar(e)}>✏️ Editar</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setConfirmExcluirId(e.id)}
                          style={{ color: 'var(--red)' }} title="Excluir">🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        }
      </div>

      {modal && (
        <Modal title={editId ? 'Editar Enrolador' : 'Novo Enrolador'} onClose={() => setModal(false)}>
          <div className="fg">
            <label>Nome *</label>
            <input value={form.nome} onChange={e => setF('nome', e.target.value)} placeholder="Nome completo" autoFocus />
          </div>
          <div className="fg">
            <label>Situação</label>
            <select value={form.ativo ? 'ativo' : 'inativo'} onChange={e => setF('ativo', e.target.value === 'ativo')}>
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </div>
          <div className="fg">
            <label>Observações</label>
            <textarea value={form.obs} onChange={e => setF('obs', e.target.value)} placeholder="Observações opcionais..." />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={handleSalvar} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
            <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
          </div>
        </Modal>
      )}

      {confirmExcluirId && enroladorConfirm && (
        <ConfirmModal
          title="Excluir Enrolador?"
          message="O enrolador e todos os seus registros serão removidos permanentemente."
          details={[
            ['Nome', enroladorConfirm.nome],
            ['Registros', `${registrosPorEnrolador[confirmExcluirId] || 0} registros`],
          ]}
          confirmLabel="Sim, excluir tudo"
          onConfirm={handleExcluir}
          onCancel={() => setConfirmExcluirId(null)}
        />
      )}
    </div>
  )
}

// ─── Tab Ranking ────────────────────────────────────────────────────────────────

function TabRanking({ dados }) {
  const [modo, setModo] = useState('semana')
  const [refDate, setRefDate] = useState(getHoje())

  const navPrev = () => {
    const d = parseDate(refDate)
    setRefDate(format(modo === 'semana' ? subWeeks(d, 1) : subMonths(d, 1), 'yyyy-MM-dd'))
  }
  const navNext = () => {
    const d = parseDate(refDate)
    setRefDate(format(modo === 'semana' ? addWeeks(d, 1) : addMonths(d, 1), 'yyyy-MM-dd'))
  }

  const weekLabel = useMemo(() => {
    const d = parseDate(refDate)
    const ws = format(startOfWeek(d, { weekStartsOn: 1 }), 'dd/MM', { locale: ptBR })
    const we = format(endOfWeek(d, { weekStartsOn: 1 }), 'dd/MM/yyyy', { locale: ptBR })
    return `${ws} – ${we}`
  }, [refDate])

  const monthLabel = useMemo(() => format(parseDate(refDate), 'MMMM yyyy', { locale: ptBR }), [refDate])

  const weekRanking = useMemo(() => {
    const d = parseDate(refDate)
    const ws = format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd')
    const we = format(endOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd')
    const milMap = {}
    dados.registros.forEach(r => {
      if (r.aproveitamento < 96 || r.data < ws || r.data > we) return
      milMap[r.enroladorId] = (milMap[r.enroladorId] || 0) + r.milheiros
    })
    return dados.enroladores
      .map(e => {
        const mil = milMap[e.id] || 0
        const bonus = calcBonusSemanal(mil)
        return { ...e, mil, bonus, total: mil + bonus }
      })
      .filter(e => e.mil > 0)
      .sort((a, b) => b.mil - a.mil)
  }, [dados, refDate])

  const monthRanking = useMemo(() => {
    const d = parseDate(refDate)
    const ms = format(startOfMonth(d), 'yyyy-MM-dd')
    const me = format(endOfMonth(d), 'yyyy-MM-dd')
    const milMap = {}
    dados.registros.forEach(r => {
      if (r.aproveitamento < 96 || r.data < ms || r.data > me) return
      milMap[r.enroladorId] = (milMap[r.enroladorId] || 0) + r.milheiros
    })
    return dados.enroladores
      .map(e => ({ ...e, mil: milMap[e.id] || 0 }))
      .filter(e => e.mil > 0)
      .sort((a, b) => b.mil - a.mil)
      .map((e, idx) => ({ ...e, bonusRanking: idx < BONUS_RANKING.length ? BONUS_RANKING[idx] : 0 }))
  }, [dados, refDate])

  // Períodos com dados (para dica visual)
  const mesesComDados = useMemo(() => new Set(dados.registros.map(r => r.data.slice(0, 7))), [dados.registros])
  const semanasComDados = useMemo(() => {
    const s = new Set()
    dados.registros.forEach(r => {
      const ws = format(startOfWeek(parseDate(r.data), { weekStartsOn: 1 }), 'yyyy-MM-dd')
      s.add(ws)
    })
    return s
  }, [dados.registros])

  const semanaAtualKey = format(startOfWeek(parseDate(refDate), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const mesAtualKey = refDate.slice(0, 7)
  const periodoTemDados = modo === 'semana' ? semanasComDados.has(semanaAtualKey) : mesesComDados.has(mesAtualKey)

  return (
    <div>
      <div className="card mb16" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', borderRadius: 'var(--rs)', overflow: 'hidden', border: '1px solid var(--border)' }}>
            {[['semana', 'Semana'], ['mes', 'Mês']].map(([v, l]) => (
              <button key={v} onClick={() => setModo(v)} style={{
                padding: '6px 18px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: modo === v ? 700 : 400,
                background: modo === v ? 'var(--gold-dark)' : 'var(--bg3)',
                color: modo === v ? '#fff' : 'var(--text2)',
              }}>{l}</button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={navPrev}>‹</button>
            <span style={{ fontWeight: 600, minWidth: 160, textAlign: 'center', fontSize: 13 }}>
              {modo === 'semana' ? weekLabel : monthLabel}
            </span>
            <button className="btn btn-secondary btn-sm" onClick={navNext}>›</button>
          </div>
          {!periodoTemDados && (
            <span style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>Sem registros neste período</span>
          )}
        </div>
      </div>

      {modo === 'semana' ? (
        <div className="card">
          <div className="card-title">📅 Ranking Semanal — {weekLabel}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
            Bônus automático: ≥5mil +2pts · ≥7mil +5pts · ≥9mil +10pts
          </div>
          {weekRanking.length === 0
            ? <div className="empty-state"><div className="es-icon">🏆</div><div className="es-text">Sem registros nesta semana</div></div>
            : <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Pos</th><th>Enrolador</th><th>Milheiros Aprov.</th><th>Pontos Base</th><th>Bônus Semanal</th><th>Total Semana</th></tr>
                  </thead>
                  <tbody>
                    {weekRanking.map((e, idx) => (
                      <tr key={e.id}>
                        <td style={{ fontWeight: 800, fontSize: 16, width: 48 }}>{MEDALHAS[idx] ?? `${idx + 1}º`}</td>
                        <td><strong>{e.nome}</strong></td>
                        <td><span style={{ color: 'var(--gold-light)', fontWeight: 700 }}>{e.mil} mil</span></td>
                        <td style={{ color: 'var(--text2)' }}>{e.mil} pts</td>
                        <td>
                          {e.bonus > 0
                            ? <span className="badge b-green">+{e.bonus} pts</span>
                            : <span style={{ color: 'var(--text3)' }}>—</span>}
                        </td>
                        <td>
                          <strong style={{ color: 'var(--gold-light)' }}>{e.total} pts</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
        </div>
      ) : (
        <div className="card">
          <div className="card-title">🏆 Ranking Mensal — {monthLabel}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
            Bônus ranking: Top1 +14 · Top2 +10 · Top3 +7 · Top4 +5 · Top5 +3
          </div>
          {monthRanking.length === 0
            ? <div className="empty-state"><div className="es-icon">🏆</div><div className="es-text">Sem registros neste mês</div></div>
            : <div className="table-wrap">
                <table>
                  <thead><tr><th>Pos</th><th>Enrolador</th><th>Milheiros Aprov.</th><th>Bônus Ranking</th></tr></thead>
                  <tbody>
                    {monthRanking.map((e, idx) => (
                      <tr key={e.id}>
                        <td style={{ fontWeight: 800, fontSize: 16, width: 48 }}>{MEDALHAS[idx] ?? `${idx + 1}º`}</td>
                        <td><strong>{e.nome}</strong></td>
                        <td><span style={{ color: 'var(--gold-light)', fontWeight: 700 }}>{e.mil} mil</span></td>
                        <td>
                          {e.bonusRanking > 0
                            ? <span className="badge b-green">+{e.bonusRanking} pts</span>
                            : <span style={{ color: 'var(--text3)' }}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
        </div>
      )}
    </div>
  )
}

// ─── Tab Créditos ───────────────────────────────────────────────────────────────

function TabCreditos({ dados }) {
  const [mesFiltro, setMesFiltro] = useState('')

  const mesesDisponiveis = useMemo(() => {
    const s = new Set(dados.registros.map(r => r.data.slice(0, 7)))
    return [...s].sort().reverse()
  }, [dados.registros])

  const registrosFiltrados = useMemo(() => filtrarPorMes(dados.registros, mesFiltro), [dados.registros, mesFiltro])
  const credits = useMemo(() => computeCredits(registrosFiltrados, dados.enroladores), [registrosFiltrados, dados.enroladores])

  const lista = dados.enroladores
    .map(e => ({ ...e, ...(credits[e.id] || { base: 0, semanal: 0, ranking: 0, total: 0 }) }))
    .sort((a, b) => b.total - a.total)

  const totalGeral = lista.reduce((s, e) => s + e.total, 0)

  const handleExportCSV = () => {
    const periodo = mesFiltro
      ? format(parseDate(mesFiltro + '-15'), 'MMMM-yyyy', { locale: ptBR })
      : 'total'
    const rows = [
      ['Pos', 'Enrolador', 'Situação', 'Base (pts)', 'Bônus Semanal (pts)', 'Bônus Ranking (pts)', 'Total (pts)'],
      ...lista.map((e, idx) => [
        `${idx + 1}º`, e.nome, e.ativo ? 'Ativo' : 'Inativo',
        e.base, e.semanal, e.ranking, e.total,
      ]),
    ]
    exportCSV(rows, `creditos-midas-${periodo}.csv`)
    toast.success('CSV exportado!')
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="stats-chip">
            <span style={{ color: 'var(--text3)' }}>Total pontos: </span>
            <strong style={{ color: 'var(--gold-light)' }}>{totalGeral} pts</strong>
          </div>
          <div className="stats-chip">
            <span style={{ color: 'var(--text3)' }}>Enroladores: </span>
            <strong>{lista.filter(e => e.ativo).length} ativos</strong>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="fg" style={{ margin: 0 }}>
            <select value={mesFiltro} onChange={e => setMesFiltro(e.target.value)}
              style={{ fontSize: 13, padding: '6px 10px' }}>
              <option value="">Todos os tempos</option>
              {mesesDisponiveis.map(m => (
                <option key={m} value={m}>
                  {format(parseDate(m + '-15'), 'MMMM yyyy', { locale: ptBR })}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-secondary" onClick={handleExportCSV} title="Exportar CSV">
            📥 Exportar CSV
          </button>
        </div>
      </div>

      <div className="card mb16">
        <div className="card-title">
          💎 Saldo de Créditos MIDAS
          {mesFiltro && (
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--gold-light)', marginLeft: 8 }}>
              — {format(parseDate(mesFiltro + '-15'), 'MMMM yyyy', { locale: ptBR })}
            </span>
          )}
        </div>
        {lista.length === 0
          ? <div className="empty-state"><div className="es-icon">💎</div><div className="es-text">Nenhum enrolador cadastrado</div></div>
          : <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Pos</th>
                    <th>Enrolador</th>
                    <th>Base</th>
                    <th>Bônus Semanal</th>
                    <th>Bônus Ranking</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((e, idx) => (
                    <tr key={e.id}>
                      <td style={{ fontWeight: 800, fontSize: 15, width: 48 }}>{idx < 3 ? MEDALHAS[idx] : `${idx + 1}º`}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <strong>{e.nome}</strong>
                          {!e.ativo && <span className="badge b-red" style={{ fontSize: 10 }}>Inativo</span>}
                        </div>
                      </td>
                      <td style={{ color: 'var(--text2)' }}>{e.base} pts</td>
                      <td style={{ color: 'var(--green)' }}>{e.semanal > 0 ? `+${e.semanal}` : '—'}</td>
                      <td style={{ color: 'var(--gold-light)' }}>{e.ranking > 0 ? `+${e.ranking}` : '—'}</td>
                      <td>
                        <strong style={{ fontSize: 15, color: e.total > 0 ? 'var(--gold-light)' : 'var(--text3)' }}>
                          {e.total} pts
                        </strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        }
      </div>

      <div className="card">
        <div className="card-title" style={{ fontSize: 12 }}>📖 Regras de Pontuação</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, fontSize: 12 }}>
          {[
            ['1 ponto', '1 milheiro aprovado com ≥96% aproveitamento'],
            ['Bônus Semanal ≥5mil', '+2 pontos'],
            ['Bônus Semanal ≥7mil', '+5 pontos'],
            ['Bônus Semanal ≥9mil', '+10 pontos'],
            ['Ranking Top 1 mensal', '+14 pontos'],
            ['Ranking Top 2 mensal', '+10 pontos'],
            ['Ranking Top 3 mensal', '+7 pontos'],
            ['Ranking Top 4 mensal', '+5 pontos'],
            ['Ranking Top 5 mensal', '+3 pontos'],
          ].map(([k, v]) => (
            <div key={k} style={{ background: 'var(--bg3)', borderRadius: 'var(--rs)', padding: '8px 12px' }}>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>{k}</div>
              <div style={{ fontWeight: 600, fontSize: 11 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'registrar',   label: '✏️ Registrar' },
  { id: 'enroladores', label: '⛓ Enroladores' },
  { id: 'ranking',     label: '🏆 Ranking' },
  { id: 'creditos',    label: '💎 Créditos' },
]

export default function Presidio() {
  const [aba, setAba] = useState('registrar')
  const [dados, setDados] = useState(dadosVazios())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData().then(d => { setDados(d); setLoading(false) })
  }, [])

  if (loading) return <div className="loading"><div className="spin" /></div>

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setAba(t.id)}
            className={`btn ${aba === t.id ? 'btn-primary' : 'btn-secondary'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {aba === 'registrar'   && <TabRegistrar   dados={dados} setDados={setDados} />}
      {aba === 'enroladores' && <TabEnroladores dados={dados} setDados={setDados} />}
      {aba === 'ranking'     && <TabRanking     dados={dados} />}
      {aba === 'creditos'    && <TabCreditos    dados={dados} />}
    </div>
  )
}
