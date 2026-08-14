'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'

// Fecha límite: hasta este día el pop-up aparece cada vez que se abre el Home;
// después deja de mostrarse. Formato 'aaaa-mm-dd'. Cambia solo esta línea para extenderlo.
const CUTOFF_DATE = '2026-08-31'

/**
 * Pop-up de novedad que aparece cada vez que se abre el Home, hasta la fecha
 * de corte. Presenta el nuevo bloque "Estado de pago" (Pagado / Por pagar) de
 * las compras y gastos.
 */
export default function WhatsNewModal() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // Solo en el Home y hasta la fecha límite.
    const today = new Date().toISOString().slice(0, 10)
    setOpen(pathname === '/' && today <= CUTOFF_DATE)
  }, [pathname])

  function close() {
    setOpen(false)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      onClick={close}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Botón cerrar (equis) */}
        <button
          type="button"
          onClick={close}
          aria-label="Cerrar"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-800 hover:text-white"
        >
          ✕
        </button>

        <div className="mb-1 text-xs font-bold uppercase tracking-wide text-orange-400">
          🎉 Novedad
        </div>
        <h2 className="mb-3 text-xl font-bold text-white">
          Ahora marcas si la factura está pagada
        </h2>

        {/* Preview resaltado del bloque Estado de pago */}
        <div className="mb-4 rounded-xl p-1 ring-2 ring-orange-500">
          <div className="flex flex-col gap-3 rounded-lg bg-gray-950 p-4">
            <div>
              <label className="mb-1 block text-xs text-gray-400">Estado de pago</label>
              <div className="flex overflow-hidden rounded-lg border border-gray-700">
                <div className="flex-1 bg-gray-900 px-3 py-2 text-center text-sm font-bold text-gray-500">
                  ✅ Pagado
                </div>
                <div className="flex-1 bg-orange-500 px-3 py-2 text-center text-sm font-bold text-white">
                  ⏳ Por pagar
                </div>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-400">Fecha de vencimiento (opcional)</label>
              <div className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-600">
                dd-mm-aaaa
              </div>
            </div>
          </div>
        </div>

        {/* Instrucciones cortas */}
        <ul className="mb-5 space-y-2 text-sm text-gray-300">
          <li>
            <span className="font-bold text-white">Pagado:</span> ya se pagó la
            factura, no queda nada pendiente.
          </li>
          <li>
            <span className="font-bold text-white">Por pagar:</span> queda a
            crédito. Aparecerá en <span className="text-orange-400">Pendientes de pago</span> hasta que la marques como pagada.
          </li>
        </ul>

        <button
          type="button"
          onClick={close}
          className="w-full rounded-xl bg-orange-500 py-3 font-bold text-white transition hover:bg-orange-600"
        >
          Entendido
        </button>
      </div>
    </div>
  )
}
