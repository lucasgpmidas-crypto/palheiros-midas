import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

export default function Login() {
  const { entrarAdmin, entrarFuncionario } = useAuth()
  const [modo, setModo] = useState('admin')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [funcId, setFuncId] = useState('')
  const [pinDigits, setPinDigits] = useState(['', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [funcionarios, setFuncionarios] = useState([])
  const [erro, setErro] = useState('')

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
    supabase.from('funcionarios').select('id,nome,situacao').eq('situacao','ativo').order('nome')
      .then(({ data }) => setFuncionarios(data || []))
  }, [])

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
      if (!r.ok) setErro(r.msg)
    }
    setLoading(false)
  }

  const trocarModo = (m) => {
    setModo(m)
    setErro('')
    setPinDigits(['', '', '', ''])
  }

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'var(--bg)', backgroundImage:'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(201,162,39,.12) 0%, transparent 60%)' }}>
      <div style={{ width:380, background:'var(--bg2)', border:'1px solid var(--border2)', borderRadius:20, padding:'48px 40px', textAlign:'center', position:'relative', overflow:'hidden' }}>
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
              <div className="fg" style={{ textAlign:'left' }}>
                <label>Email</label>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="seu@email.com" autoFocus />
              </div>
              <div className="fg" style={{ textAlign:'left' }}>
                <label>Senha</label>
                <input type="password" value={senha} onChange={e=>setSenha(e.target.value)} placeholder="••••••" onKeyDown={e=>e.key==='Enter'&&handleSubmit(e)} />
              </div>
            </>
          ) : (
            <>
              <div className="fg" style={{ textAlign:'left' }}>
                <label>Selecione seu nome</label>
                <select value={funcId} onChange={e=>setFuncId(e.target.value)}>
                  <option value="">Selecionar...</option>
                  {funcionarios.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </div>
              <div className="fg">
                <label style={{ display:'block', textAlign:'center', marginBottom:10 }}>PIN (4 dígitos)</label>
                <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
                  {pinDigits.map((d, i) => (
                    <input
                      key={i}
                      ref={pinRefs[i]}
                      type="password"
                      inputMode="numeric"
                      maxLength={1}
                      value={d}
                      onChange={e => handlePinChange(i, e.target.value)}
                      onKeyDown={e => handlePinKeyDown(i, e)}
                      onPaste={handlePinPaste}
                      autoFocus={i === 0}
                      style={{
                        width:58, height:58, textAlign:'center', fontSize:28, padding:0,
                        borderRadius:12, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800,
                        background: d ? 'rgba(201,162,39,.12)' : 'var(--bg3)',
                        border: d ? '2px solid var(--gold)' : '2px solid var(--border)',
                        color:'var(--text)', outline:'none', transition:'all .15s',
                        boxShadow: d ? '0 0 0 3px rgba(201,162,39,.15)' : 'none',
                      }}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {erro && <div style={{ background:'rgba(232,64,64,.1)', border:'1px solid rgba(232,64,64,.3)', borderRadius:'var(--rs)', padding:'10px 14px', fontSize:12.5, color:'var(--red)', marginBottom:12 }}>{erro}</div>}

          <button type="submit" disabled={loading} style={{ width:'100%', marginTop:4, background:'linear-gradient(135deg,var(--gold-dark),var(--gold))', border:'none', borderRadius:'var(--rs)', padding:13, color:'#0D1018', fontSize:15, fontWeight:800, fontFamily:'Barlow Condensed,sans-serif', letterSpacing:1.5, cursor:loading?'not-allowed':'pointer', opacity:loading?.7:1 }}>
            {loading ? 'ENTRANDO...' : 'ENTRAR →'}
          </button>
        </form>

        <div style={{ fontSize:11, color:'var(--text3)', marginTop:16 }}>
          {modo === 'admin' ? 'Email e senha configurados no Supabase' : 'PIN configurado pelo administrador'}
        </div>
      </div>
    </div>
  )
}
