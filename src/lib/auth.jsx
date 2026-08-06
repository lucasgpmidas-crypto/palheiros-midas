import { createContext, useContext, useState, useEffect } from 'react'
import { supabase, loginAdmin, loginFuncionario, logout, encerrarSessaoFunc, getSession } from '../lib/supabase'

const AuthCtx = createContext(null)

const CHAVE_SESSAO = 'pm_func'
const CHAVE_LEMBRADO = 'pm_func_lembrado'

// A sessão do funcionário guarda um token emitido pelo banco no login. É ele que
// diz quem está escrevendo — as funções de gravação resolvem o funcionário pelo
// token e ignoram qualquer id que venha do navegador. Sem isso, editar este JSON
// no console bastava para escrever no lugar de outra pessoa.
export const lerSessaoFunc = () => {
  try { return JSON.parse(sessionStorage.getItem(CHAVE_SESSAO)) || null } catch { return null }
}

export const getFuncToken = () => lerSessaoFunc()?.token || null

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)       // Supabase session (admin)
  const [funcSession, setFuncSession] = useState(null) // { id, nome, setor, token } funcionário
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
    const saved = lerSessaoFunc()
    if (saved) setFuncSession(saved)

    return () => subscription.unsubscribe()
  }, [])

  const entrarAdmin = async (email, senha) => {
    const result = await loginAdmin(email, senha)
    if (result.ok) {
      setFuncSession(null)
      sessionStorage.removeItem(CHAVE_SESSAO)
    }
    return result
  }

  const entrarFuncionario = async (funcId, pin) => {
    const result = await loginFuncionario(funcId, pin)
    if (result.ok) {
      setFuncSession(result.funcionario)
      sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(result.funcionario))
      // Quem é fica gravado no aparelho (nunca o PIN, nunca o token): como cada um
      // usa o próprio celular, a tela de login abre direto no teclado do PIN em vez
      // da lista de nomes. Trocar de pessoa é o "não sou eu" da tela de login.
      const { token, ...semSegredo } = result.funcionario
      try { localStorage.setItem(CHAVE_LEMBRADO, JSON.stringify(semSegredo)) } catch {}
    }
    return result
  }

  const sair = async () => {
    // Derruba a sessão no banco também: token esquecido em aparelho emprestado
    // continuaria valendo por 30 dias.
    const token = funcSession?.token
    if (token) await encerrarSessaoFunc(token)
    await logout()
    setFuncSession(null)
    setSession(null)
    sessionStorage.removeItem(CHAVE_SESSAO)
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
