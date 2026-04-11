'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function Navbar() {
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <nav className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between">
      <span className="text-white font-bold text-lg">The House</span>
      <button
        onClick={handleLogout}
        className="text-gray-400 hover:text-white text-sm transition"
      >
        Cerrar sesión
      </button>
    </nav>
  )
}