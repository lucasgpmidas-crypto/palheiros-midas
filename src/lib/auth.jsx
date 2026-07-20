import { createContext, useContext, useState, useEffect } from 'react'
import { supabase, loginAdmin, loginFuncionario, logout, getSession } from '../lib/supabase'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)       // Supabase session (admin)
  const [funcSession, setFuncSession] = useState(null) // { id, nome } funcionário
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Verificar sessão Supabase
    getSession().then((s) => {
      setSession(s)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
    })

    // Verificar sessão de funcionário no sessionStorage
    const saved = sessionStorage.getItem('pm_func')
    if (saved) {
      try { setFuncSession(JSON.parse(saved)) } catch {}
    }

    return () => subscription.unsubscribe()
  }, [])

  const entrarAdmin = async (email, senha) => {
    const result = await loginAdmin(email, senha)
    if (result.ok) {
      setFuncSession(null)
      sessionStorage.removeItem('pm_func')
    }
    return result
  }

  const entrarFuncionario = async (funcId, pin) => {
    const result = await loginFuncionario(funcId, pin)
    if (result.ok) {
      setFuncSession(result.funcionario)
      sessionStorage.setItem('pm_func', JSON.stringify(result.funcionario))
    }
    return result
  }

  const sair = async () => {
    await logout()
    setFuncSession(null)
    setSession(null)
    sessionStorage.removeItem('pm_func')
  }

  const isAdmin = !!session
  const isFuncionario = !session && !!funcSession
  const isFunc = isFuncionario
  const isFinalizacao = isFuncionario && funcSession?.setor === 'finalizacao'
  const isLogado = isAdmin || isFuncionario

  return (
    <AuthCtx.Provider value={{
      session, funcSession, loading,
      isAdmin, isFuncionario, isFunc, isFinalizacao, isLogado,
      entrarAdmin, entrarFuncionario, sair,
    }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
