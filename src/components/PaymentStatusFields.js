'use client'

import DateInput from '@/components/DateInput'

/**
 * Bloque de "estado de pago" para los formularios de compras y gastos.
 *
 * Toggle Pagado / Por pagar + fecha de vencimiento opcional (solo aparece
 * cuando el estado es 'por_pagar'). Las facturas a crédito quedan como
 * 'por_pagar' y alimentan la página de Pendientes de pago.
 *
 * Props:
 *   status         'pagado' | 'por_pagar'
 *   onStatusChange (nuevoEstado) => void
 *   dueDate        ISO 'aaaa-mm-dd' | ''
 *   onDueDateChange (iso) => void
 */
export default function PaymentStatusFields({ status, onStatusChange, dueDate, onDueDateChange }) {
  const opciones = [
    { val: 'pagado',    label: '✅ Pagado' },
    { val: 'por_pagar', label: '⏳ Por pagar' },
  ]

  return (
    <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 flex flex-col gap-3">
      <div>
        <label className="text-gray-400 text-xs mb-1 block">Estado de pago</label>
        <div className="flex rounded-lg overflow-hidden border border-gray-700">
          {opciones.map(opt => (
            <button
              key={opt.val}
              type="button"
              onClick={() => onStatusChange(opt.val)}
              className={`flex-1 px-3 py-2 text-sm font-bold transition ${
                status === opt.val ? 'bg-orange-500 text-white' : 'bg-gray-900 text-gray-500 hover:text-gray-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {status === 'por_pagar' && (
        <div>
          <label className="text-gray-400 text-xs mb-1 block">Fecha de vencimiento (opcional)</label>
          <DateInput value={dueDate} onChange={onDueDateChange} />
          <p className="text-gray-600 text-xs mt-1">Aparecerá en Pendientes de pago hasta que la marques como pagada.</p>
        </div>
      )}
    </div>
  )
}
