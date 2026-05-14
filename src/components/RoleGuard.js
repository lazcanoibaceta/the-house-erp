'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useRole } from '@/hooks/useRole'

export default function RoleGuard({ children, allowedRoles }) {
  const { role, loading } = useRole()
  const router = useRouter()

  useEffect(() => {
    // Solo redirige si terminó de cargar Y hay un rol definido Y no tiene permiso
    // (si role es null por error de conexión, no redirigir para no bloquear)
    if (!loading && role !== null && !allowedRoles.includes(role)) {
      router.replace('/')
    }
  }, [role, loading])

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-600 text-sm animate-pulse">Verificando acceso...</p>
      </main>
    )
  }

  // Sin permiso (rol conocido pero no autorizado) → nada, el useEffect redirige
  if (role !== null && !allowedRoles.includes(role)) return null

  return children
}
