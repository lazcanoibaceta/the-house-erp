'use client'

import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { useState, useEffect } from 'react'

const links = [
  { href: '/', label: 'Inicio' },
  { href: '/inventario', label: 'Inventario' },
  { href: '/compras', label: 'Compras' },
  { href: '/inventario/conteo', label: 'Conteo' },
  { href: '/inventario/costeo', label: 'Costeo' },
  { href: '/inventario/conteos', label: 'Historial' },
  { href: '/conversor', label: '🍔 Conversor' },
]

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/">
            <img
              src="/logo.png"
              alt="The House"
              width={120}
              height={50}
              className="object-contain"
            />
          </Link>
          <div className="hidden sm:flex items-center gap-1">
            {links.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded-lg text-sm transition ${
                  pathname === link.href
                    ? 'bg-orange-500 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Selector de local */}
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
            className="text-gray-400 hover:text-white text-sm transition"
          >
            Cerrar sesión
          </button>
        </div>
      </div>

      {/* Navegación mobile */}
      <div className="flex sm:hidden items-center gap-1 mt-2 overflow-x-auto">
        {links.map(link => (
          <Link
            key={link.href}
            href={link.href}
            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition ${
              pathname === link.href
                ? 'bg-orange-500 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}