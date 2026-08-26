import { useState, useEffect, useRef, useMemo } from 'react'
import Campo from '../components/Campo'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { getIniciais, avatarCor } from '../lib/utils'

// Quem entrou por último neste aparelho (só id/nome/setor — PIN nunca é salvo)
const lerLembrado = () => {
  try { return JSON.parse(localStorage.getItem('pm_func_lembrado')) || null } catch { return null }
}

// A seta do topo alterna entre as duas áreas — quem faz as duas coisas escolhe por onde entra
const SETORES = [
  ['producao', '🌾 Produção'],
  ['finalizacao', '📦 Revisão & Empacote'],
]

export default function Login() {
  const { entrarAdmin, entrarFuncionario } = useAuth()
  const lembrado = useMemo(lerLembrado, [])
  // Aparelho que já tem dono abre no modo funcionário, direto no PIN
  const [modo, setModo] = useState(lembrado ? 'func' : 'admin')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [funcId, setFuncId] = useState(lembrado ? String(lembrado.id) : '')
  // Área aberta na lista: quem já usou o aparelho cai na própria área
  const [idxSetor, setIdxSetor] = useState(
    lembrado?.setor === 'finalizacao' ? 1 : 0
  )
  // Com alguém escolhido, a lista recolhe e fica só o nome dele; tocar nele reabre
  const [listaAberta, setListaAberta] = useState(!lembrado)
  const [pinDigits, setPinDigits] = useState(['', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [funcionarios, setFuncionarios] = useState([])
  const [erro, setErro] = useState('')
  // Funcionário travado pelo banco após erros seguidos: some o teclado do PIN
  const [bloqueado, setBloqueado] = useState(false)

  const pinR0 = useRef(null)
  const pinR1 = useRef(null)
  const pinR2 = useRef(null)
  const pinR3 = useRef(null)
  const pinRefs = [pinR0, pinR1, pinR2, pinR3]
  const pin = pinDigits.join('')

  const handlePinChange = (i, val) => {
    const d = val.replace(/\D/g, '').slice(-1)
    const next = [...pinDigits]
    next[i] = d
    setPinDigits(next)
    if (d && i < 3) pinRefs[i + 1].current?.focus()
  }

  const handlePinKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !pinDigits[i] && i > 0) pinRefs[i - 1].current?.focus()
    if (e.key === 'Enter') handleSubmit(e)
  }

  const handlePinPaste = (e) => {
    e.preventDefault()
    const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4)
    const next = ['', '', '', '']
    paste.split('').forEach((c, idx) => { next[idx] = c })
    setPinDigits(next)
    pinRefs[Math.min(paste.length, 3)].current?.focus()
  }

  useEffect(() => {
    supabase.from('funcionarios').select('id,nome,situacao,setor').eq('situacao','ativo').order('nome')
      .then(({ data }) => setFuncionarios(data || []))
  }, [])

  // Tocar no nome só marca quem é e joga o cursor no PIN — o nome nunca é escrito
  // em outro lugar da tela, o destaque na própria lista é a única indicação.
  const selecionar = (f) => {
    // Tocar em quem já está escolhido reabre a lista para trocar de pessoa
    if (String(f.id) === String(funcId) && !listaAberta) { setListaAberta(true); return }
    setBloqueado(false)
    setFuncId(String(f.id))
    setListaAberta(false)
    setErro('')
    setPinDigits(['', '', '', ''])
    setTimeout(() => pinR0.current?.focus(), 50)
  }

  // A seta alterna a área; trocar de área desmarca quem estava escolhido
  const trocarSetor = (dir) => {
    setIdxSetor(i => (i + dir + SETORES.length) % SETORES.length)
    setBloqueado(false)
    setFuncId('')
    setListaAberta(true)
    setPinDigits(['', '', '', ''])
    setErro('')
  }

  const daArea = funcionarios.filter(f => (f.setor || 'producao') === SETORES[idxSetor][0])
  // Recolher a lista só faz sentido se o escolhido estiver mesmo nela: se ele saiu da
  // empresa, mudou de área ou o aparelho guardou alguém que não existe mais, a lista
  // volta inteira — senão a tela ficaria sem nenhum nome para tocar.
  const escolhidoNaArea = daArea.some(f => String(f.id) === String(funcId))
  const visiveis = listaAberta || !escolhidoNaArea ? daArea : daArea.filter(f => String(f.id) === String(funcId))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErro('')
    setLoading(true)
    if (modo === 'admin') {
      if (!email || !senha) { setErro('Preencha email e senha'); setLoading(false); return }
      const r = await entrarAdmin(email, senha)
      if (!r.ok) setErro(r.msg)
    } else {
      if (!funcId) { setErro('Selecione seu nome'); setLoading(false); return }
      if (pin.length < 4) { setErro('Digite os 4 dígitos do PIN'); setLoading(false); return }
      const r = await entrarFuncionario(Number(funcId), pin)
      if (!r.ok) {
        setErro(r.msg)
        setBloqueado(!!r.bloqueado)
        setPinDigits(['', '', '', ''])          // limpa para a próxima tentativa
        if (!r.bloqueado) setTimeout(() => pinR0.current?.focus(), 60)
      }
    }
    setLoading(false)
  }

  const trocarModo = (m) => {
    setModo(m)
    setErro('')
    setPinDigits(['', '', '', ''])
  }

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', padding:16, background:'var(--bg)', backgroundImage:'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(201,162,39,.12) 0%, transparent 60%)' }}>
      <div style={{ width:'100%', maxWidth:380, background:'var(--bg2)', border:'1px solid var(--border2)', borderRadius:20, padding:'40px 26px', textAlign:'center', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:'linear-gradient(90deg,transparent,var(--gold-dark),var(--gold-light),var(--gold-dark),transparent)', borderRadius:'20px 20px 0 0' }} />

        <img src="/logo-grupo-midas.png" alt="Grupo Midas"
          style={{ width:120, height:120, margin:'0 auto 16px', display:'block', objectFit:'contain', filter:'drop-shadow(0 8px 24px rgba(201,162,39,.35))' }} />
        <div style={{ fontFamily:'Barlow Condensed,sans-serif', fontSize:28, fontWeight:800, color:'var(--gold-light)', letterSpacing:2 }}>PALHEIROS MIDAS</div>
        <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:2.5, marginTop:4, marginBottom:28 }}>Sistema de Gestão de Produção</div>

        {/* Seletor modo */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:20 }}>
          {[['admin','👤 ADMINISTRADOR'],['func','👥 FUNCIONÁRIO']].map(([m, label]) => (
            <button key={m} onClick={() => trocarModo(m)} style={{
              padding:10, borderRadius:8, cursor:'pointer', transition:'all .2s',
              fontFamily:'Barlow Condensed,sans-serif', fontSize:13, fontWeight:700, letterSpacing:.5,
              border: modo===m ? (m==='admin'?'2px solid var(--gold)':'2px solid var(--blue)') : '2px solid var(--border2)',
              background: modo===m ? (m==='admin'?'rgba(201,162,39,.15)':'rgba(59,130,246,.12)') : 'transparent',
              color: modo===m ? (m==='admin'?'var(--gold-light)':'var(--blue)') : 'var(--text2)',
            }}>{label}</button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          {modo === 'admin' ? (
            <>
              <Campo label="Email" style={{ textAlign:'left' }}><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="seu@email.com" autoFocus /></Campo>
              <Campo label="Senha" style={{ textAlign:'left' }}><input type="password" value={senha} onChange={e=>setSenha(e.target.value)} placeholder="••••••" onKeyDown={e=>e.key==='Enter'&&handleSubmit(e)} /></Campo>
            </>
          ) : (
            <>
              {/* Área: a seta troca entre Produção e Revisão & Empacote */}
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10 }}>
                {[-1, 1].map(dir => (
                  <button key={dir} type="button" onClick={() => trocarSetor(dir)} aria-label={dir < 0 ? 'Área anterior' : 'Próxima área'}
                    style={{ order: dir < 0 ? 0 : 2, width:38, height:38, flexShrink:0, borderRadius:10, background:'var(--bg3)', border:'1px solid var(--border)', color:'var(--gold-light)', fontSize:20, lineHeight:1, cursor:'pointer' }}>
                    {dir < 0 ? '‹' : '›'}
                  </button>
                ))}
                <div style={{ order:1, flex:1, fontFamily:'Barlow Condensed,sans-serif', fontSize:16, fontWeight:800, letterSpacing:1.5, color:'var(--gold-light)', textTransform:'uppercase' }}>
                  {SETORES[idxSetor][1]}
                </div>
              </div>

              {/* Nomes da área. Com alguém escolhido a lista recolhe e sobra só ele —
                  o nome nunca é repetido em outro canto da tela. */}
              <div style={{ maxHeight:236, overflowY:'auto', display:'grid', gap:6, marginBottom:14, textAlign:'left' }}>
                {visiveis.map(f => {
                  const sel = String(f.id) === String(funcId)
                  return (
                    <button key={f.id} type="button" onClick={() => selecionar(f)}
                      style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'10px 12px', borderRadius:10,
                        background: sel ? 'rgba(201,162,39,.14)' : 'var(--bg3)',
                        border: sel ? '2px solid var(--gold)' : '1px solid var(--border)',
                        color:'var(--text)', fontSize:14.5, fontWeight:600, cursor:'pointer', textAlign:'left', transition:'all .15s' }}>
                      <span style={{ width:32, height:32, borderRadius:'50%', background:avatarCor(f.id), display:'flex', alignItems:'center', justifyContent:'center', fontSize:11.5, fontWeight:800, color:'#0F1420', flexShrink:0 }}>
                        {getIniciais(f.nome)}
                      </span>
                      <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.nome}</span>
                      {sel && (
                        <span style={{ color:'var(--gold-light)', fontSize:15, display:'flex', alignItems:'center', gap:6 }}>
                          ✓ {!listaAberta && escolhidoNaArea && <span style={{ fontSize:12, color:'var(--text3)' }}>trocar ▾</span>}
                        </span>
                      )}
                    </button>
                  )
                })}
                {daArea.length === 0 && (
                  <div style={{ fontSize:13, color:'var(--text3)', textAlign:'center', padding:'14px 0' }}>
                    {funcionarios.length ? 'Ninguém cadastrado nesta área' : 'Carregando...'}
                  </div>
                )}
              </div>

              {/* Travado: não adianta continuar digitando, então o teclado do PIN sai da tela */}
              {bloqueado ? (
                <div style={{ background:'rgba(232,64,64,.08)', border:'1px solid rgba(232,64,64,.35)', borderRadius:12, padding:'18px 16px', marginBottom:8 }}>
                  <div style={{ fontSize:34, marginBottom:6 }}>🔒</div>
                  <div style={{ fontSize:15, fontWeight:700, color:'var(--red)', marginBottom:6 }}>Acesso bloqueado por segurança</div>
                  <div style={{ fontSize:13, color:'var(--text2)', lineHeight:1.5 }}>
                    {erro} Se você esqueceu o PIN, fale com o administrador — ele libera na hora.
                  </div>
                </div>
              ) : (
              <div className="fg">
                <label style={{ display:'block', textAlign:'center', marginBottom:10, color: funcId ? 'var(--gold-light)' : 'var(--text3)' }}>
                  {funcId ? 'Digite seu PIN' : 'Toque no seu nome acima'}
                </label>
                <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
                  {pinDigits.map((d, i) => (
                    <input
                      key={i}
                      ref={pinRefs[i]}
                      type="password"
                      inputMode="numeric"
                      maxLength={1}
                      value={d}
                      disabled={!funcId}
                      onChange={e => handlePinChange(i, e.target.value)}
                      onKeyDown={e => handlePinKeyDown(i, e)}
                      onPaste={handlePinPaste}
                      autoFocus={i === 0 && !!funcId}
                      style={{
                        width:58, height:58, textAlign:'center', fontSize:28, padding:0,
                        borderRadius:12, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800,
                        background: d ? 'rgba(201,162,39,.12)' : 'var(--bg3)',
                        border: d ? '2px solid var(--gold)' : '2px solid var(--border)',
                        color:'var(--text)', outline:'none', transition:'all .15s',
                        opacity: funcId ? 1 : .45,
                        boxShadow: d ? '0 0 0 3px rgba(201,162,39,.15)' : 'none',
                      }}
                    />
                  ))}
                </div>
              </div>
              )}
            </>
          )}

          {erro && !bloqueado && <div style={{ background:'rgba(232,64,64,.1)', border:'1px solid rgba(232,64,64,.3)', borderRadius:'var(--rs)', padding:'10px 14px', fontSize:12.5, color:'var(--red)', marginBottom:12 }}>{erro}</div>}

          <button type="submit" disabled={loading || (modo === 'func' && (!funcId || bloqueado))}
            style={{ width:'100%', marginTop:4, background:'linear-gradient(135deg,var(--gold-dark),var(--gold))', border:'none', borderRadius:'var(--rs)', padding:13, color:'#0D1018', fontSize:15, fontWeight:800, fontFamily:'Barlow Condensed,sans-serif', letterSpacing:1.5, cursor:(loading || (modo === 'func' && !funcId))?'not-allowed':'pointer', opacity:(loading || (modo === 'func' && !funcId))?.5:1 }}>
            {loading ? 'ENTRANDO...' : 'ENTRAR →'}
          </button>
        </form>

        <div style={{ fontSize:11, color:'var(--text3)', marginTop:16 }}>
          {modo === 'admin'
            ? 'Email e senha configurados no Supabase'
            : 'O aparelho lembra quem entrou por último — o PIN, nunca'}
        </div>
      </div>
    </div>
  )
}
