'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { useRole, clearRoleCache } from '@/hooks/useRole'

// ── Estructura de navegación ────────────────────────────────────────────────
const SECTIONS = [
  {
    id:    'home',
    label: 'Home',
    emoji: '🏠',
    roles: ['admin_supremo', 'admin', 'cajero'],
    links: [
      { href: '/', label: 'Home', roles: ['admin_supremo', 'admin', 'cajero'] },
    ],
  },
  {
    id:    'registrar',
    label: 'Registrar',
    emoji: '📥',
    roles: ['admin_supremo', 'admin', 'cajero'],
    links: [
      { href: '/compras/nuevo',     label: 'Nueva compra',              roles: ['admin_supremo', 'admin', 'cajero'] },
      { href: '/inventario/conteo', label: 'Nuevo conteo',              roles: ['admin_supremo', 'admin', 'cajero'] },
      { href: '/gastos/nuevo',      label: 'Nuevo gasto',               roles: ['admin_supremo', 'admin', 'cajero'] },
      { href: '/labor',             label: 'Costo laboral',             roles: ['admin_supremo', 'admin'] },
      { href: '/ventas/importar',   label: 'Importar ventas',           roles: ['admin_supremo'] },
      { href: '/repartidores',      label: 'Liquidación repartidores',  roles: ['admin_supremo', 'admin', 'cajero'] },
    ],
  },
  {
    id:    'analizar',
    label: 'Analizar',
    emoji: '📊',
    roles: ['admin_supremo', 'admin'],
    links: [
      { href: '/resultados',          label: 'Resultados' },
      { href: '/ventas',              label: 'Ventas' },
      { href: '/inventario/costeo',   label: 'Costeo' },
      { href: '/inventario/merma',    label: 'Merma' },
      { href: '/compras',             label: 'Compras' },
      { href: '/gastos',              label: 'Gastos' },
      { href: '/inventario/conteos',  label: 'Conteos' },
    ],
  },
  {
    id:    'config',
    label: 'Config',
    emoji: '⚙️',
    roles: ['admin_supremo'],
    links: [
      { href: '/inventario',            label: 'Insumos' },
      { href: '/inventario/recetas',    label: 'Recetas' },
      { href: '/inventario/subrecetas', label: 'Sub-recetas' },
      { href: '/conversor',             label: 'Conversor' },
    ],
  },
]

function getActiveSectionId(pathname) {
  for (const section of SECTIONS) {
    if (section.links.some(link => link.href === pathname)) return section.id
  }
  return null
}

// ── Ícono chevron ───────────────────────────────────────────────────────────
function Chevron({ open }) {
  return (
    <svg
      width="14" height="14"
      fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
      className={`transition-transform duration-200 shrink-0 ${open ? 'rotate-180' : ''}`}
    >
      <path d="M6 9l6 6 6-6"/>
    </svg>
  )
}

// ── Contenido del sidebar (reutilizable en desktop y mobile) ────────────────
function SidebarContent({ role, roleLoading, pathname, onNavigate }) {
  const activeSectionId = getActiveSectionId(pathname)

  // Sección activa abierta por defecto; demás cerradas
  const [open, setOpen] = useState(() => {
    const state = {}
    SECTIONS.forEach(s => { state[s.id] = s.id === activeSectionId })
    return state
  })

  // Auto-abrir sección cuando cambia la ruta
  useEffect(() => {
    const id = getActiveSectionId(pathname)
    if (id) setOpen(prev => ({ ...prev, [id]: true }))
  }, [pathname])

  function toggle(id) {
    setOpen(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const visibleSections = SECTIONS.filter(s => {
    if (roleLoading) return true
    if (!role)       return s.roles.includes('cajero')
    return s.roles.includes(role)
  })

  return (
    <nav className="flex-1 overflow-y-auto px-2 py-3 flex flex-col gap-0.5">
      {visibleSections.map(section => {
        const visibleLinks = section.links.filter(
          link => !link.roles || roleLoading || !role || link.roles.includes(role)
        )
        if (visibleLinks.length === 0) return null

        const isOpen      = open[section.id]
        const hasActive   = visibleLinks.some(l => l.href === pathname)

        return (
          <div key={section.id}>
            {/* Cabecera de sección */}
            <button
              onClick={() => toggle(section.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                hasActive
                  ? 'text-white'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/60'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <span className="text-base leading-none">{section.emoji}</span>
                <span>{section.label}</span>
              </span>
              <Chevron open={isOpen} />
            </button>

            {/* Links colapsables */}
            {isOpen && (
              <div className="mt-0.5 mb-1 ml-3 flex flex-col gap-0.5 border-l border-gray-800 pl-3">
                {visibleLinks.map(link => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={onNavigate}
                    className={`flex items-center px-2 py-1.5 rounded-lg text-sm transition-colors ${
                      pathname === link.href
                        ? 'bg-orange-500/15 text-orange-400 font-medium'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800'
                    }`}
                  >
                    {pathname === link.href && (
                      <span className="w-1 h-1 rounded-full bg-orange-400 mr-2 shrink-0" />
                    )}
                    {link.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )
}

// ── Sidebar principal ───────────────────────────────────────────────────────
export default function Sidebar() {
  const router   = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  const [location, setLocation]     = useState('SF')
  const [mobileOpen, setMobileOpen] = useState(false)
  const { role, locationCode: rolLocationCode, loading: roleLoading } = useRole()

  // Leer local + escuchar cambios
  useEffect(() => {
    function readLocation() { setLocation(localStorage.getItem('location') || 'SF') }
    readLocation()
    window.addEventListener('locationChanged', readLocation)
    return () => window.removeEventListener('locationChanged', readLocation)
  }, [])

  // Forzar local para cajeros
  useEffect(() => {
    if (role === 'cajero' && rolLocationCode) {
      setLocation(rolLocationCode)
      localStorage.setItem('location', rolLocationCode)
    }
  }, [role, rolLocationCode])

  // Cerrar drawer móvil al navegar
  useEffect(() => { setMobileOpen(false) }, [pathname])

  function handleLocationChange(loc) {
    if (role === 'cajero') return
    setLocation(loc)
    localStorage.setItem('location', loc)
    window.dispatchEvent(new Event('locationChanged'))
  }

  async function handleLogout() {
    clearRoleCache()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const LocationToggle = ({ compact = false }) =>
    role === 'cajero' && rolLocationCode ? (
      <span className={`bg-orange-500 text-white font-bold rounded-lg text-center ${compact ? 'text-xs px-2 py-1' : 'text-sm px-3 py-1.5 block'}`}>
        {rolLocationCode === 'SF' ? (compact ? 'SF' : 'San Felipe') : (compact ? 'LA' : 'Los Andes')}
      </span>
    ) : (
      <div className={`flex items-center bg-gray-800 rounded-lg gap-0.5 ${compact ? 'p-0.5' : 'p-1'}`}>
        {['SF', 'LA'].map(loc => (
          <button
            key={loc}
            onClick={() => handleLocationChange(loc)}
            className={`flex-1 rounded-md font-medium transition-colors ${
              compact ? 'px-2.5 py-1 text-xs' : 'py-1.5 text-sm'
            } ${location === loc ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            {loc}
          </button>
        ))}
      </div>
    )

  const Logo = ({ width = 100 }) => (
    <>
      <img
        src="/logo.png"
        alt="The House"
        width={width}
        height={Math.round(width * 0.4)}
        className="object-contain"
        onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block' }}
      />
      <span className="hidden text-white font-bold text-lg">The House</span>
    </>
  )

  return (
    <>
      {/* ── Desktop sidebar ──────────────────────────────────── */}
      <aside className="hidden md:flex fixed left-0 top-0 h-screen w-52 bg-gray-900 border-r border-gray-800 flex-col z-30">

        <div className="px-4 pt-5 pb-3 shrink-0">
          <Link href="/"><Logo width={90} /></Link>
        </div>

        <SidebarContent
          role={role}
          roleLoading={roleLoading}
          pathname={pathname}
          onNavigate={undefined}
        />

        <div className="shrink-0 p-3 border-t border-gray-800 flex flex-col gap-2.5">
          <LocationToggle />
          <button onClick={handleLogout} className="text-gray-500 hover:text-white text-sm transition-colors text-left px-1">
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ── Mobile top bar ───────────────────────────────────── */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 z-30">
        <button
          onClick={() => setMobileOpen(o => !o)}
          className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800 transition-colors"
          aria-label="Menú"
        >
          {mobileOpen ? (
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg>
          ) : (
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
          )}
        </button>

        <Link href="/" className="absolute left-1/2 -translate-x-1/2">
          <Logo width={80} />
        </Link>

        <LocationToggle compact />
      </div>

      {/* ── Mobile drawer ────────────────────────────────────── */}
      {mobileOpen && (
        <>
          <div className="md:hidden fixed inset-0 bg-black/60 z-40" onClick={() => setMobileOpen(false)} />
          <aside className="md:hidden fixed left-0 top-0 h-screen w-64 bg-gray-900 border-r border-gray-800 z-50 flex flex-col">
            <div className="px-4 pt-5 pb-3 shrink-0 flex items-center justify-between">
              <Link href="/" onClick={() => setMobileOpen(false)}><Logo width={90} /></Link>
              <button onClick={() => setMobileOpen(false)} className="text-gray-500 hover:text-white p-1">
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            <SidebarContent
              role={role}
              roleLoading={roleLoading}
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
            />

            <div className="shrink-0 p-3 border-t border-gray-800 flex flex-col gap-2.5">
              <LocationToggle />
              <button onClick={handleLogout} className="text-gray-500 hover:text-white text-sm transition-colors text-left px-1">
                Cerrar sesión
              </button>
            </div>
          </aside>
        </>
      )}
    </>
  )
}
