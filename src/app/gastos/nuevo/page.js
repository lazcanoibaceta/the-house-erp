'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLocation } from '@/hooks/useLocation'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const supabase = createClient()

export default function NuevoGasto() {
  const { locationCode, locationId, loading: locationLoading } = useLocation()
  const router = useRouter()

  const [categorias, setCategorias] = useState([])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Campos del formulario
  const [categoryId, setCategoryId] = useState('')
  const [supplier, setSupplier] = useState('')
  const [description, setDescription] = useState('')
  const [documentType, setDocumentType] = useState('factura')
  const [documentNumber, setDocumentNumber] = useState('')
  const [amount, setAmount] = useState('')         // lo que escribe el usuario
  const [paymentMethod, setPaymentMethod] = useState('transferencia')
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')

  useEffect(() => {
    supabase.from('expense_categories').select('*').order('name').then(({ data }) => {
      setCategorias(data || [])
    })
  }, [])

  // Lógica IVA según tipo de documento
  // - factura: usuario ingresa monto NETO → amount_net = amount, amount_total = amount * 1.19
  // - boleta:  usuario ingresa monto TOTAL (lo que dice la boleta) → amount_total = amount, amount_net = amount / 1.19
  // - otro:    sin IVA → amount_net = amount_total = amount
  function calcularMontos() {
    const val = parseFloat(amount) || 0
    if (documentType === 'factura') {
      return { amount_net: val, amount_total: Math.round(val * 1.19), has_iva: true }
    } else if (documentType === 'boleta') {
      return { amount_net: Math.round(val / 1.19), amount_total: val, has_iva: true }
    } else {
      return { amount_net: val, amount_total: val, has_iva: false }
    }
  }

  const montos = calcularMontos()

  function labelMonto() {
    if (documentType === 'factura') return 'Monto neto (sin IVA)'
    if (documentType === 'boleta') return 'Monto total (según boleta)'
    return 'Monto'
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setErrorMsg('')

    if (!locationId) {
      setErrorMsg('Debes seleccionar un local específico (SF o LA) para registrar gastos.')
      return
    }

    setLoading(true)

    const { error } = await supabase.from('operating_expenses').insert({
      location_id: locationId,
      category_id: categoryId || null,
      supplier: supplier || null,
      description: description || null,
      amount_net: montos.amount_net,
      amount_total: montos.amount_total,
      has_iva: montos.has_iva,
      document_type: documentType,
      document_number: documentNumber || null,
      expense_date: expenseDate,
      payment_method: paymentMethod,
      notes: notes || null,
    })

    if (error) {
      console.error(error)
      setErrorMsg('Error al guardar: ' + error.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setTimeout(() => router.push('/gastos'), 1200)
  }

  return (
    <main className="min-h-screen bg-gray-950 p-4 md:p-8">
      <div className="max-w-lg mx-auto">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Link href="/gastos" className="text-gray-500 text-sm hover:text-gray-300 mb-1 inline-block">
              ← Volver
            </Link>
            <h1 className="text-2xl font-bold text-white">📝 Nuevo Gasto</h1>
          </div>
          <span className="bg-orange-500 text-white text-sm font-bold px-3 py-1 rounded-lg">
            {locationCode}
          </span>
        </div>

        {success && (
          <div className="bg-green-900 text-green-300 rounded-xl p-3 mb-4 font-semibold">
            ✅ Gasto registrado — redirigiendo...
          </div>
        )}

        {errorMsg && (
          <div className="bg-red-950 border border-red-800 text-red-400 rounded-xl p-3 mb-4 text-sm">
            ⚠️ {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">

          {/* Fecha + Tipo documento */}
          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 flex flex-col gap-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-gray-400 text-xs mb-1 block">Fecha</label>
                <input
                  type="date"
                  value={expenseDate}
                  onChange={e => setExpenseDate(e.target.value)}
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="text-gray-400 text-xs mb-1 block">Tipo documento</label>
                <select
                  value={documentType}
                  onChange={e => setDocumentType(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm"
                >
                  <option value="factura">Factura</option>
                  <option value="boleta">Boleta</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-gray-400 text-xs mb-1 block">N° documento</label>
                <input
                  type="text"
                  value={documentNumber}
                  onChange={e => setDocumentNumber(e.target.value)}
                  placeholder="Opcional"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="text-gray-400 text-xs mb-1 block">Forma de pago</label>
                <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm"
                >
                  <option value="transferencia">Transferencia</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>
            </div>
          </div>

          {/* Categoría + Proveedor */}
          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 flex flex-col gap-3">
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Categoría</label>
              <select
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                required
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm"
              >
                <option value="">Seleccionar categoría...</option>
                {categorias.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-gray-400 text-xs mb-1 block">Proveedor / Empresa</label>
              <input
                type="text"
                value={supplier}
                onChange={e => setSupplier(e.target.value)}
                placeholder="Ej: Aguas del Valle, CGE..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm"
              />
            </div>

            <div>
              <label className="text-gray-400 text-xs mb-1 block">Descripción</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Ej: Cuenta de agua abril, mantención freidora..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm"
              />
            </div>
          </div>

          {/* Monto */}
          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 flex flex-col gap-2">
            <div>
              <label className="text-gray-400 text-xs mb-1 block">{labelMonto()}</label>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="$"
                required
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm"
              />
            </div>

            {/* Preview del cálculo IVA */}
            {amount && parseFloat(amount) > 0 && documentType !== 'otro' && (
              <div className="bg-gray-800/50 rounded-lg p-3 flex justify-between text-xs text-gray-400">
                <span>Neto: <span className="text-white font-medium">${montos.amount_net.toLocaleString('es-CL')}</span></span>
                <span>IVA (19%): <span className="text-white font-medium">${(montos.amount_total - montos.amount_net).toLocaleString('es-CL')}</span></span>
                <span>Total: <span className="text-white font-medium">${montos.amount_total.toLocaleString('es-CL')}</span></span>
              </div>
            )}
          </div>

          {/* Notas */}
          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
            <label className="text-gray-400 text-xs mb-1 block">Notas internas (opcional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Cualquier detalle adicional..."
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading || locationLoading}
            className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl p-3 font-semibold transition disabled:opacity-50"
          >
            {loading ? 'Guardando...' : 'Registrar gasto'}
          </button>
        </form>

      </div>
    </main>
  )
}
