'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLocation } from '@/hooks/useLocation'
import DateInput from '@/components/DateInput'
import Link from 'next/link'

const supabase = createClient()

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

export default function Gastos() {
  const { locationCode, locationId, loading: locationLoading } = useLocation()

  const now = new Date()
  const [mes, setMes] = useState(now.getMonth() + 1)
  const [anio, setAnio] = useState(now.getFullYear())
  const [categoriaFiltro, setCategoriaFiltro] = useState('')

  const [gastos, setGastos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandido, setExpandido] = useState(null)

  // Edición
  const [editando, setEditando] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)

  // Eliminación
  const [eliminando, setEliminando] = useState(null)

  useEffect(() => {
    supabase.from('expense_categories').select('*').order('name').then(({ data }) => {
      setCategorias(data || [])
    })
  }, [])

  useEffect(() => {
    if (locationLoading) return
    if (!locationId) {
      setLoading(false)
      return
    }
    fetchGastos()
  }, [locationId, locationLoading, mes, anio, categoriaFiltro])

  async function fetchGastos() {
    setLoading(true)

    const desde = `${anio}-${String(mes).padStart(2, '0')}-01`
    const lastDay = new Date(anio, mes, 0).getDate()
    const hasta = `${anio}-${String(mes).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    let query = supabase
      .from('operating_expenses')
      .select('*, expense_categories(name)')
      .eq('location_id', locationId)
      .gte('expense_date', desde)
      .lte('expense_date', hasta)
      .order('expense_date', { ascending: false })

    if (categoriaFiltro) {
      query = query.eq('category_id', categoriaFiltro)
    }

    const { data } = await query
    setGastos(data || [])
    setLoading(false)
  }

  function navegarMes(dir) {
    let m = mes + dir
    let a = anio
    if (m > 12) { m = 1; a++ }
    if (m < 1) { m = 12; a-- }
    setMes(m)
    setAnio(a)
  }

  // ── Edición ─────────────────────────────────────────────────────────────────
  // amount_net siempre guarda el valor que tecleó el usuario (para factura es el
  // neto; para boleta/otro es el total). Por eso el campo editable parte de ahí.
  function abrirEdicion(g) {
    setEditando(g)
    setEditForm({
      category_id:     g.category_id || '',
      supplier:        g.supplier || '',
      description:     g.description || '',
      document_type:   g.document_type || 'factura',
      document_number: g.document_number || '',
      amount:          String(g.amount_net ?? ''),
      payment_method:  g.payment_method || 'transferencia',
      expense_date:    g.expense_date,
      notes:           g.notes || '',
    })
  }

  function updateEditForm(field, value) {
    setEditForm(prev => ({ ...prev, [field]: value }))
  }

  // Misma lógica IVA que el formulario de nuevo gasto
  function calcularMontosEdit() {
    const val = parseFloat(editForm?.amount) || 0
    if (editForm?.document_type === 'factura') {
      return { amount_net: val, amount_total: Math.round(val * 1.19), has_iva: true }
    }
    return { amount_net: val, amount_total: val, has_iva: false }
  }

  async function handleSaveEdit(e) {
    e.preventDefault()
    setSavingEdit(true)
    const montos = calcularMontosEdit()
    await supabase.from('operating_expenses').update({
      category_id:     editForm.category_id || null,
      supplier:        editForm.supplier || null,
      description:     editForm.description || null,
      amount_net:      montos.amount_net,
      amount_total:    montos.amount_total,
      has_iva:         montos.has_iva,
      document_type:   editForm.document_type,
      document_number: editForm.document_number || null,
      expense_date:    editForm.expense_date,
      payment_method:  editForm.payment_method,
      notes:           editForm.notes || null,
    }).eq('id', editando.id)
    setSavingEdit(false)
    setEditando(null)
    setEditForm(null)
    await fetchGastos()
  }

  // ── Eliminación ─────────────────────────────────────────────────────────────
  async function handleEliminar(g) {
    const fecha = new Date(g.expense_date + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
    const nombre = g.expense_categories?.name || g.supplier || 'gasto'
    const ok = window.confirm(
      `¿Eliminar este gasto?\n\n${nombre} · ${fecha}\n$${parseFloat(g.amount_net).toLocaleString('es-CL')}\n\nEsta acción no se puede deshacer.`
    )
    if (!ok) return
    setEliminando(g.id)
    await supabase.from('operating_expenses').delete().eq('id', g.id)
    setEliminando(null)
    setExpandido(null)
    await fetchGastos()
  }

  const totalMes = gastos.reduce((sum, g) => sum + parseFloat(g.amount_net), 0)

  // Agrupar por categoría para el resumen
  const porCategoria = gastos.reduce((acc, g) => {
    const cat = g.expense_categories?.name || 'Sin categoría'
    acc[cat] = (acc[cat] || 0) + parseFloat(g.amount_net)
    return acc
  }, {})

  return (
    <main className="min-h-screen bg-gray-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">📊 Gastos Operativos</h1>
            <p className="text-gray-500 text-sm mt-1">Gastos de {locationCode}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="bg-orange-500 text-white text-sm font-bold px-3 py-1 rounded-lg">
              {locationCode}
            </span>
            <Link
              href="/gastos/nuevo"
              className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
            >
              + Nuevo
            </Link>
          </div>
        </div>

        {/* Selector de mes */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navegarMes(-1)}
            className="text-gray-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800 transition"
          >
            ←
          </button>
          <span className="text-white font-semibold text-lg min-w-[140px] text-center">
            {MESES[mes - 1]} {anio}
          </span>
          <button
            onClick={() => navegarMes(1)}
            className="text-gray-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800 transition"
          >
            →
          </button>
        </div>

        {/* Resumen del mes */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
            <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Total neto del mes</p>
            <p className="text-3xl font-bold text-white">
              ${totalMes.toLocaleString('es-CL', { maximumFractionDigits: 0 })}
            </p>
            <p className="text-gray-600 text-xs mt-1">{gastos.length} registro{gastos.length !== 1 ? 's' : ''}</p>
          </div>

          {/* Breakdown por categoría */}
          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
            <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">Por categoría</p>
            {Object.keys(porCategoria).length === 0 ? (
              <p className="text-gray-600 text-sm">Sin datos</p>
            ) : (
              <div className="flex flex-col gap-1">
                {Object.entries(porCategoria)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 4)
                  .map(([cat, total]) => (
                    <div key={cat} className="flex justify-between items-center">
                      <span className="text-gray-400 text-xs truncate">{cat}</span>
                      <span className="text-gray-300 text-xs font-medium ml-2">
                        ${total.toLocaleString('es-CL', { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Filtro categoría */}
        <select
          value={categoriaFiltro}
          onChange={(e) => setCategoriaFiltro(e.target.value)}
          className="bg-gray-900 border border-gray-800 rounded-xl p-2.5 text-gray-300 text-sm"
        >
          <option value="">Todas las categorías</option>
          {categorias.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {/* Lista de gastos */}
        {loading || locationLoading ? (
          <p className="text-gray-500">Cargando...</p>
        ) : !locationId ? (
          <div className="bg-yellow-950 border border-yellow-800 rounded-2xl p-4 text-center">
            <p className="text-yellow-400 font-semibold">⚠️ Selecciona un local específico</p>
            <p className="text-yellow-600 text-sm mt-1">Los gastos se registran por local. Elige SF o LA en el menú de arriba.</p>
          </div>
        ) : gastos.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600">No hay gastos registrados para este período.</p>
            <Link href="/gastos/nuevo" className="text-orange-400 text-sm mt-2 inline-block hover:underline">
              Registrar el primero →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {gastos.map(g => (
              <div key={g.id} className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
                <button
                  className="w-full p-4 text-left hover:bg-gray-800/50 transition"
                  onClick={() => setExpandido(expandido === g.id ? null : g.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-medium text-sm">
                          {g.expense_categories?.name || 'Sin categoría'}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          g.document_type === 'factura'
                            ? 'bg-blue-900/50 text-blue-400'
                            : g.document_type === 'boleta'
                            ? 'bg-gray-800 text-gray-400'
                            : 'bg-gray-800 text-gray-500'
                        }`}>
                          {g.document_type || 'sin doc'}
                        </span>
                      </div>
                      {g.supplier && (
                        <p className="text-gray-500 text-xs mt-0.5">{g.supplier}</p>
                      )}
                      {g.description && (
                        <p className="text-gray-600 text-xs mt-0.5 truncate">{g.description}</p>
                      )}
                    </div>
                    <div className="text-right ml-3 shrink-0 flex items-start gap-2">
                      <div>
                        <p className="text-white font-bold">
                          ${parseFloat(g.amount_net).toLocaleString('es-CL', { maximumFractionDigits: 0 })}
                        </p>
                        <p className="text-gray-600 text-xs">
                          {new Date(g.expense_date + 'T12:00:00').toLocaleDateString('es-CL', {
                            day: 'numeric', month: 'short'
                          })}
                        </p>
                      </div>
                      <span className="text-gray-500 text-xs mt-1">{expandido === g.id ? '▲' : '▼'}</span>
                    </div>
                  </div>
                </button>

                {expandido === g.id && (
                  <div className="border-t border-gray-800 p-4 flex flex-col gap-3">
                    {(g.document_number || g.payment_method || g.notes) && (
                      <div className="flex flex-col gap-1 text-xs text-gray-500">
                        {g.document_number && <p>N° documento: <span className="text-gray-400">{g.document_number}</span></p>}
                        {g.payment_method && <p>Forma de pago: <span className="text-gray-400">{g.payment_method}</span></p>}
                        {g.notes && <p>Notas: <span className="text-gray-400">{g.notes}</span></p>}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => abrirEdicion(g)}
                        className="flex-1 text-center text-sm text-orange-400 border border-orange-500/30 rounded-lg py-2 hover:bg-orange-500/10 transition"
                      >
                        ✏️ Editar
                      </button>
                      <button
                        onClick={() => handleEliminar(g)}
                        disabled={eliminando === g.id}
                        className="flex-1 text-center text-sm text-red-400 border border-red-500/30 rounded-lg py-2 hover:bg-red-500/10 transition disabled:opacity-50"
                      >
                        {eliminando === g.id ? 'Eliminando...' : '🗑️ Eliminar'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Modal edición */}
      {editando && editForm && (
        <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col border border-gray-800">
            <div className="p-4 border-b border-gray-800 flex justify-between items-center">
              <h2 className="text-white font-bold">✏️ Editar gasto</h2>
              <button onClick={() => { setEditando(null); setEditForm(null) }} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <form onSubmit={handleSaveEdit} className="overflow-y-auto flex-1 p-4 flex flex-col gap-4">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-gray-400 text-xs mb-1 block">Fecha</label>
                  <DateInput value={editForm.expense_date} onChange={v => updateEditForm('expense_date', v)} required />
                </div>
                <div className="flex-1">
                  <label className="text-gray-400 text-xs mb-1 block">Tipo documento</label>
                  <select value={editForm.document_type} onChange={e => updateEditForm('document_type', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm">
                    <option value="factura">Factura</option>
                    <option value="boleta">Boleta</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-gray-400 text-xs mb-1 block">N° documento</label>
                  <input type="text" value={editForm.document_number} onChange={e => updateEditForm('document_number', e.target.value)} placeholder="Opcional" className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm" />
                </div>
                <div className="flex-1">
                  <label className="text-gray-400 text-xs mb-1 block">Forma de pago</label>
                  <select value={editForm.payment_method} onChange={e => updateEditForm('payment_method', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm">
                    <option value="transferencia">Transferencia</option>
                    <option value="efectivo">Efectivo</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-gray-400 text-xs mb-1 block">Categoría</label>
                <select value={editForm.category_id} onChange={e => updateEditForm('category_id', e.target.value)} required className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm">
                  <option value="">Seleccionar categoría...</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-gray-400 text-xs mb-1 block">Proveedor / Empresa</label>
                <input type="text" value={editForm.supplier} onChange={e => updateEditForm('supplier', e.target.value)} placeholder="Ej: Aguas del Valle, CGE..." className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm" />
              </div>

              <div>
                <label className="text-gray-400 text-xs mb-1 block">Descripción</label>
                <input type="text" value={editForm.description} onChange={e => updateEditForm('description', e.target.value)} placeholder="Ej: Cuenta de agua abril..." className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm" />
              </div>

              <div>
                <label className="text-gray-400 text-xs mb-1 block">
                  {editForm.document_type === 'factura' ? 'Monto neto (sin IVA)' : editForm.document_type === 'boleta' ? 'Monto total (según boleta)' : 'Monto'}
                </label>
                <input type="number" value={editForm.amount} onChange={e => updateEditForm('amount', e.target.value)} placeholder="$" required className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm" />
                {editForm.amount && parseFloat(editForm.amount) > 0 && editForm.document_type === 'factura' && (
                  <div className="bg-gray-800/50 rounded-lg p-3 mt-2 flex justify-between text-xs text-gray-400">
                    <span>Neto: <span className="text-white font-medium">${calcularMontosEdit().amount_net.toLocaleString('es-CL')}</span></span>
                    <span>IVA (19%): <span className="text-white font-medium">${(calcularMontosEdit().amount_total - calcularMontosEdit().amount_net).toLocaleString('es-CL')}</span></span>
                    <span>Total: <span className="text-white font-medium">${calcularMontosEdit().amount_total.toLocaleString('es-CL')}</span></span>
                  </div>
                )}
                {editForm.amount && parseFloat(editForm.amount) > 0 && editForm.document_type === 'boleta' && (
                  <div className="bg-gray-800/50 rounded-lg p-3 mt-2 text-xs text-gray-400">
                    Boleta: sin crédito fiscal → se registra el total <span className="text-white font-medium">${calcularMontosEdit().amount_total.toLocaleString('es-CL')}</span> como costo (no se extrae IVA).
                  </div>
                )}
              </div>

              <div>
                <label className="text-gray-400 text-xs mb-1 block">Notas internas (opcional)</label>
                <textarea value={editForm.notes} onChange={e => updateEditForm('notes', e.target.value)} rows={2} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm resize-none" />
              </div>

              <button type="submit" disabled={savingEdit} className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl p-3 font-semibold transition disabled:opacity-50">
                {savingEdit ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}
