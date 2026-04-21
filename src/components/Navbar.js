'use client'

import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { useState, useEffect } from 'react'

const groups = [
  {
    label: 'Operación',
    links: [
      { href: '/compras', label: 'Compras' },
      { href: '/inventario', label: 'Inventario' },
      { href: '/inventario/conteo', label: 'Conteo' },
      { href: '/inventario/subrecetas', label: 'Sub-recetas' },
      { href: '/labor', label: 'Labor' },
    ],
  },
  {
    label: 'Análisis',
    links: [
      { href: '/inventario/costeo', label: 'Costeo' },
      { href: '/ventas', label: 'Ventas' },
      { href: '/gastos', label: 'Gastos' },
    ],
  },
  {
    label: 'Herramientas',
    links: [
      { href: '/conversor', label: 'Conversor' },
    ],
  },
]

// Match exacto — cada sub-página tiene su propio link en el navbar
function isActive(pathname, href) {
  return pathname === href
}

export default function Navbar() {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [location, setLocation] = useState('SF')

  useEffect(() => {
    const saved = localStorage.getItem('location') || 'SF'
    setLocation(saved)
  }, [])

  function handleLocationChange(loc) {
    setLocation(loc)
    localStorage.setItem('location', loc)
    router.refresh()
  }

  async function handleLogout() {
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

              {/* Divisor entre grupos */}
              {gi > 0 && (
                <div className="w-px bg-gray-800 mx-3 self-stretch" />
              )}

              <div className="flex flex-col justify-center gap-0.5">
                {/* Etiqueta del grupo */}
                <span className="text-[10px] uppercase tracking-widest text-gray-600 font-medium px-1">
                  {group.label}
                </span>

                {/* Links del grupo */}
                <div className="flex items-center gap-0.5">
                  {group.links.map(link => (
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

          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-white text-sm transition hidden sm:block"
          >
            Cerrar sesión
          </button>
        </div>
      </div>

      {/* Navegación mobile — scroll horizontal con separadores */}
      <div className="flex md:hidden items-center gap-1 mt-2 overflow-x-auto pb-0.5">
        {groups.map((group, gi) => (
          <div key={group.label} className="flex items-center gap-1 shrink-0">

            {gi > 0 && (
              <span className="text-gray-700 text-xs mx-1">|</span>
            )}

            {group.links.map(link => (
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

        {/* Logout mobile */}
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
