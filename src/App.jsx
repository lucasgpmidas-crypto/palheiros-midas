import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'

// Cada tela vira um arquivo separado, baixado só quando é aberta —
// o funcionário no celular não carrega o código das telas de admin.
const Dashboard      = lazy(() => import('./pages/Dashboard'))
const Registro       = lazy(() => import('./pages/Registro'))
const Historico      = lazy(() => import('./pages/Historico'))
const Funcionarios   = lazy(() => import('./pages/Funcionarios'))
const Alertas        = lazy(() => import('./pages/Alertas'))
const Relatorios     = lazy(() => import('./pages/Relatorios'))
const ControleCQ     = lazy(() => import('./pages/ControleCQ'))
const HistIndividual = lazy(() => import('./pages/HistIndividual'))
const HistEquipe     = lazy(() => import('./pages/HistEquipe'))
const MinhaProducao  = lazy(() => import('./pages/MinhaProducao'))
const Configuracoes  = lazy(() => import('./pages/Configuracoes'))
const Conferencia    = lazy(() => import('./pages/Conferencia'))
const Estoque        = lazy(() => import('./pages/Estoque'))
const Fechamento     = lazy(() => import('./pages/Fechamento'))

// Página inicial do funcionário conforme o setor
const funcHome = (funcSession) => funcSession?.setor === 'finalizacao' ? '/cq' : '/minha-producao'

function ProtectedRoute({ children, adminOnly = false }) {
  const { isLogado, isAdmin, funcSession, loading } = useAuth()
  if (loading) return <div className="loading"><div className="spin" /></div>
  if (!isLogado) return <Navigate to="/login" replace />
  if (adminOnly && !isAdmin) return <Navigate to={funcHome(funcSession)} replace />
  return children
}

// Rota da Revisão & Empacotamento: admin ou funcionário do setor finalização
function RevisaoRoute({ children }) {
  const { isAdmin, isFinalizacao } = useAuth()
  if (!isAdmin && !isFinalizacao) return <Navigate to="/minha-producao" replace />
  return children
}

function AppRoutes() {
  const { isLogado, isAdmin, funcSession, loading } = useAuth()
  if (loading) return <div className="loading"><div className="spin" /></div>

  const home = isAdmin ? '/' : funcHome(funcSession)

  return (
    <Suspense fallback={<div className="loading"><div className="spin" /></div>}>
    <Routes>
      <Route path="/login" element={isLogado ? <Navigate to={home} replace /> : <Login />} />

      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        {/* Admin routes */}
        <Route index element={<ProtectedRoute adminOnly><Dashboard /></ProtectedRoute>} />
        <Route path="registro"      element={<ProtectedRoute adminOnly><Registro /></ProtectedRoute>} />
        <Route path="historico"     element={<ProtectedRoute adminOnly><Historico /></ProtectedRoute>} />
        <Route path="funcionarios"  element={<ProtectedRoute adminOnly><Funcionarios /></ProtectedRoute>} />
        <Route path="alertas"       element={<ProtectedRoute adminOnly><Alertas /></ProtectedRoute>} />
        <Route path="conferencia"   element={<ProtectedRoute adminOnly><Conferencia /></ProtectedRoute>} />
        <Route path="estoque"       element={<ProtectedRoute adminOnly><Estoque /></ProtectedRoute>} />
        <Route path="fechamento"    element={<ProtectedRoute adminOnly><Fechamento /></ProtectedRoute>} />
        <Route path="relatorios"    element={<ProtectedRoute adminOnly><Relatorios /></ProtectedRoute>} />
        <Route path="configuracoes" element={<ProtectedRoute adminOnly><Configuracoes /></ProtectedRoute>} />

        {/* Revisão & Empacotamento (admin + setor finalização) */}
        <Route path="cq" element={<ProtectedRoute><RevisaoRoute><ControleCQ /></RevisaoRoute></ProtectedRoute>} />

        {/* Shared routes (admin + funcionario) */}
        <Route path="hist-individual" element={<ProtectedRoute><HistIndividual /></ProtectedRoute>} />
        <Route path="hist-equipe"     element={<ProtectedRoute><HistEquipe /></ProtectedRoute>} />
        <Route path="minha-producao"  element={<ProtectedRoute><MinhaProducao /></ProtectedRoute>} />
      </Route>

      <Route path="*" element={<Navigate to={isLogado ? home : '/login'} replace />} />
    </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: { background:'#1E2538', color:'#E8EAF0', border:'1px solid #3A4466', fontFamily:"'Barlow',sans-serif", fontSize:13 },
            success: { iconTheme: { primary:'#28B485', secondary:'#1E2538' } },
            error:   { iconTheme: { primary:'#E84040', secondary:'#1E2538' } },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  )
}
