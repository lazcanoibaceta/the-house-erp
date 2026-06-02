'use client'

import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useRole, clearRoleCache } from '@/hooks/useRole'

const allGroups = [
  {
    label: 'Registrar',
    roles: ['admin_supremo', 'admin', 'cajero'],
    links: [
      { href: '/compras',           label: 'Compras',         roles: ['admin_supremo', 'admin', 'cajero'] },
      { href: '/inventario/conteo', label: 'Conteo',          roles: ['admin_supremo', 'admin', 'cajero'] },
      { href: '/gastos/nuevo',      label: 'Gastos',          roles: ['admin_supremo', 'admin', 'cajero'] },
      { href: '/labor',             label: 'Labor',           roles: ['admin_supremo', 'admin'] },
      { href: '/ventas/importar',   label: 'Importar ventas', roles: ['admin_supremo'] },
      { href: '/repartidores',      label: 'Repartidores',    roles: ['admin_supremo', 'admin', 'cajero'] },
    ],
  },
  {
    label: 'Analizar',
    roles: ['admin_supremo', 'admin'],
    links: [
      { href: '/ventas',            label: 'Ventas' },
      { href: '/inventario/costeo', label: 'Costeo' },
      { href: '/resultados',        label: 'Resultados' },
    ],
  },
  {
    label: 'Config',
    roles: ['admin_supremo'],
    links: [
      { href: '/inventario',            label: 'Insumos' },
      { href: '/inventario/recetas',    label: 'Recetas' },
      { href: '/inventario/subrecetas', label: 'Sub-recetas' },
      { href: '/conversor',             label: 'Conversor' },
    ],
  },
]

// Match exacto — cada sub-página tiene su propio link en el navbar
function isActive(pathname, href) {
  return pathname === href
}

export default function Navbar() {
  const router   = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [location, setLocation] = useState('SF')
  const { role, locationCode: rolLocationCode, loading: roleLoading } = useRole()

  // Mientras carga: mostrar todo para evitar parpadeo
  // Con rol cargado: filtrar según permisos
  // Sin rol (null): mostrar solo Registrar como mínimo seguro
  const groups = allGroups.filter(g => {
    if (roleLoading) return true
    if (!role)       return g.roles.includes('cajero')
    return g.roles.includes(role)
  })

  useEffect(() => {
    const saved = localStorage.getItem('location') || 'SF'
    setLocation(saved)
  }, [])

  // Si el cajero tiene local asignado, forzar su ubicación y no dejar cambiarla
  useEffect(() => {
    if (role === 'cajero' && rolLocationCode) {
      setLocation(rolLocationCode)
      localStorage.setItem('location', rolLocationCode)
    }
  }, [role, rolLocationCode])

  function handleLocationChange(loc) {
    if (role === 'cajero') return   // cajeros no pueden cambiar local
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

  return (
    <nav className="bg-gray-900 border-b border-gray-800 px-4 py-3">
      <div className="flex items-center justify-between gap-4">

        {/* Logo → home */}
        <Link href="/" className="shrink-0">
          <img
            src="/logo.png"
            alt="The House"
            width={110}
            height={44}
            className="object-contain"
            onError={(e) => {
              e.target.style.display = 'none'
              e.target.nextSibling.style.display = 'block'
            }}
          />
          <span className="hidden text-white font-bold text-lg">The House</span>
        </Link>

        {/* Grupos de navegación — desktop */}
        <div className="hidden md:flex items-stretch gap-0 flex-1">
          {groups.map((group, gi) => (
            <div key={group.label} className="flex items-stretch">

              {gi > 0 && (
                <div className="w-px bg-gray-800 mx-3 self-stretch" />
              )}

              <div className="flex flex-col justify-center gap-0.5">
                <span className="text-[10px] uppercase tracking-widest text-gray-600 font-medium px-1">
                  {group.label}
                </span>
                <div className="flex items-center gap-0.5">
                  {group.links.filter(link => !link.roles || roleLoading || !role || link.roles.includes(role)).map(link => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`px-2.5 py-1 rounded-lg text-sm transition ${
                        isActive(pathname, link.href)
                          ? 'bg-orange-500 text-white font-medium'
                          : 'text-gray-400 hover:text-white hover:bg-gray-800'
                      }`}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Derecha: toggle local + logout */}
        <div className="flex items-center gap-3 shrink-0">
          {role === 'cajero' && rolLocationCode ? (
            /* Cajero: badge fijo, sin toggle */
            <span className="bg-orange-500 text-white text-sm font-bold px-3 py-1.5 rounded-lg">
              {rolLocationCode === 'SF' ? 'San Felipe' : 'Los Andes'}
            </span>
          ) : (
            /* Admin / supremo: toggle normal */
            <div className="flex items-center bg-gray-800 rounded-lg p-1 gap-1">
              {['SF', 'LA'].map(loc => (
                <button
                  key={loc}
                  onClick={() => handleLocationChange(loc)}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition ${
                    location === loc
                      ? 'bg-orange-500 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {loc}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-white text-sm transition hidden sm:block"
          >
            Cerrar sesión
          </button>
        </div>
      </div>

      {/* Navegación mobile */}
      <div className="flex md:hidden items-center gap-1 mt-2 overflow-x-auto pb-0.5">
        {groups.map((group, gi) => (
          <div key={group.label} className="flex items-center gap-1 shrink-0">
            {gi > 0 && <span className="text-gray-700 text-xs mx-1">|</span>}
            {group.links.filter(link => !link.roles || roleLoading || !role || link.roles.includes(role)).map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition ${
                  isActive(pathname, link.href)
                    ? 'bg-orange-500 text-white font-medium'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        ))}
        <span className="text-gray-700 text-xs mx-1">|</span>
        <button
          onClick={handleLogout}
          className="text-gray-500 text-sm whitespace-nowrap px-2 py-1.5"
        >
          Salir
        </button>
      </div>
    </nav>
  )
}
