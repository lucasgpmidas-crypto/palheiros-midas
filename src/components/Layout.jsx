import { useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { getIniciais, avatarCor } from '../lib/utils'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const ADMIN_NAV = [
  { section: 'Principal' },
  { to: '/',              icon: '📊', label: 'Dashboard' },
  { to: '/registro',      icon: '✏️',  label: 'Registrar Produção' },
  { to: '/historico',     icon: '📋', label: 'Histórico' },
  { section: 'Gestão' },
  { to: '/cq',            icon: '📦', label: 'Revisão & Empacote' },
  { to: '/conferencia',   icon: '⚖️', label: 'Conferência' },
  { to: '/estoque',       icon: '🚚', label: 'Estoque & Expedição' },
  { to: '/funcionarios',  icon: '👥', label: 'Funcionários' },
  { to: '/alertas',       icon: '🔔', label: 'Alertas' },
  { section: 'Históricos' },
  { to: '/hist-individual', icon: '👤', label: 'Individual' },
  { to: '/hist-equipe',     icon: '👥', label: 'Equipe' },
  { section: 'Relatórios' },
  { to: '/relatorios',    icon: '📄', label: 'Relatórios' },
]

const FUNC_NAV = [
  { section: 'Minha Área' },
  { to: '/minha-producao', icon: '⭐', label: 'Minha Produção' },
  { to: '/hist-individual', icon: '📈', label: 'Meu Histórico' },
  { section: 'Equipe' },
  { to: '/hist-equipe',    icon: '🏆', label: 'Ranking da Equipe' },
]

const FIN_NAV = [
  { section: 'Finalização' },
  { to: '/cq',             icon: '📦', label: 'Revisão & Empacote' },
  { section: 'Equipe' },
  { to: '/hist-equipe',    icon: '🏆', label: 'Ranking da Equipe' },
]

const PAGE_TITLES = {
  '/':                'Dashboard',
  '/registro':        'Registrar Produção',
  '/historico':       'Histórico',
  '/cq':              'Revisão & Empacotamento',
  '/conferencia':     'Conferência de Produção',
  '/estoque':         'Estoque & Expedição',
  '/funcionarios':    'Funcionários',
  '/alertas':         'Alertas',
  '/hist-individual': 'Histórico Individual',
  '/hist-equipe':     'Histórico da Equipe',
  '/relatorios':      'Relatórios',
  '/minha-producao':  'Minha Produção',
  '/configuracoes':   'Configurações',
}

export default function Layout() {
  const { sair, isAdmin, isFunc, isFinalizacao, funcSession, session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const nav = isAdmin ? ADMIN_NAV : isFinalizacao ? FIN_NAV : FUNC_NAV
  const hoje = format(new Date(), "EEE, dd 'de' MMM", { locale: ptBR })
  const title = PAGE_TITLES[location.pathname] || 'Palheiros Midas'

  const userName = isAdmin
    ? (session?.user?.email?.split('@')[0] || 'Admin')
    : (funcSession?.nome?.split(' ')[0] || 'Funcionário')

  const userRole = isAdmin ? 'Administrador' : isFinalizacao ? 'Finalização' : 'Funcionário'
  const avatarText = isAdmin ? 'AD' : getIniciais(funcSession?.nome || '')
  const avatarBg = isAdmin ? 'linear-gradient(135deg,var(--gold-dark),var(--gold))' : avatarCor(funcSession?.id || 0)

  const handleLogout = async () => {
    await sair()
    navigate('/login')
  }

  return (
    <div className="layout">
      {/* Overlay mobile */}
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:49 }} />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sb-logo">
          <div className="logo-mark">🌾</div>
          <div>
            <div className="brand-name">MIDAS</div>
            <div className="brand-sub">Palheiros</div>
          </div>
        </div>

        <nav className="sb-nav">
          {nav.map((item, i) =>
            item.section ? (
              <div key={i} className="nav-section">{item.section}</div>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/' || item.to === '/minha-producao'}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </NavLink>
            )
          )}

          {/* Config só para admin */}
          {isAdmin && (
            <>
              <div className="nav-section">Sistema</div>
              <NavLink to="/configuracoes" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setSidebarOpen(false)}>
                <span className="nav-icon">⚙️</span> Configurações
              </NavLink>
            </>
          )}
        </nav>

        <div className="sb-footer">
          <div className="sb-user">
            <div className="sb-avatar" style={{ background: avatarBg }}>{avatarText}</div>
            <div>
              <div className="sb-uname">{userName}</div>
              <div className="sb-urole">{userRole}</div>
            </div>
            <button className="sb-logout" onClick={handleLogout} title="Sair">⏏</button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="main">
        <header className="topbar">
          <div style={{ display:'flex', alignItems:'center' }}>
            <button className="hamburger" onClick={() => setSidebarOpen(v => !v)}>☰</button>
            <h1 className="page-title">{title}</h1>
          </div>
          <div className="date-chip">{hoje}</div>
        </header>

        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
