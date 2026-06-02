'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLocation } from '@/hooks/useLocation'
import Link from 'next/link'

const supabase = createClient()

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

export default function Compras() {
  const { locationCode, locationId, loading: locationLoading } = useLocation()

  const now = new Date()
  const [mes, setMes]   = useState(now.getMonth() + 1)
  const [anio, setAnio] = useState(now.getFullYear())

  const [compras, setCompras]     = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading]     = useState(true)
  const [expandido, setExpandido] = useState(null)

  // Edición
  const [editando, setEditando]           = useState(null)
  const [editSupplierId, setEditSupplierId] = useState('')
  const [editDate, setEditDate]           = useState('')
  const [editItems, setEditItems]         = useState([])
  const [savingEdit, setSavingEdit]       = useState(false)

  useEffect(() => {
    if (!locationId) return
    fetchSuppliers()
  }, [locationId])

  useEffect(() => {
    if (!locationId) return
    fetchCompras()
  }, [locationId, mes, anio])

  async function fetchSuppliers() {
    const { data } = await supabase
      .from('supplier_locations')
      .select('supplier_id, suppliers(id, name)')
      .eq('location_id', locationId)
    const list = (data || []).map(row => row.suppliers).filter(Boolean)
    list.sort((a, b) => a.name.localeCompare(b.name))
    setSuppliers(list)
  }

  async function fetchCompras() {
    setLoading(true)
    const desde   = `${anio}-${String(mes).padStart(2, '0')}-01`
    const lastDay = new Date(anio, mes, 0).getDate()
    const hasta   = `${anio}-${String(mes).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    const { data } = await supabase
      .from('purchases')
      .select(`
        id, date, total, supplier_id,
        suppliers(name),
        purchase_items(id, quantity, unit_price, insumo_id, insumos(name, unit))
      `)
      .eq('location_id', locationId)
      .gte('date', desde)
      .lte('date', hasta)
      .order('date', { ascending: false })
    setCompras(data || [])
    setLoading(false)
  }

  function navegarMes(dir) {
    let m = mes + dir, a = anio
    if (m > 12) { m = 1;  a++ }
    if (m < 1)  { m = 12; a-- }
    setMes(m); setAnio(a)
  }

  const totalMes = compras.reduce((s, c) => s + parseFloat(c.total), 0)

  const porProveedor = compras.reduce((acc, c) => {
    const name = c.suppliers?.name || 'Sin proveedor'
    acc[name] = (acc[name] || 0) + parseFloat(c.total)
    return acc
  }, {})

  // ── Edición ───────────────────────────────────────────────────────────────
  function abrirEdicion(compra) {
    setEditando(compra)
    setEditSupplierId(compra.supplier_id)
    setEditDate(compra.date)
    setEditItems(
      compra.purchase_items.map(it => ({
        id:          it.id,
        insumo_id:   it.insumo_id,
        insumo_name: it.insumos?.name,
        unit:        it.insumos?.unit,
        quantity:    it.quantity,
        total_price: (it.quantity * it.unit_price).toFixed(0),
      }))
    )
  }

  function updateEditItem(index, field, value) {
    const updated = [...editItems]
    updated[index][field] = value
    setEditItems(updated)
  }

  function getEditTotal() {
    return editItems.reduce((s, it) => s + (parseFloat(it.total_price) || 0), 0)
  }

  async function handleSaveEdit(e) {
    e.preventDefault()
    setSavingEdit(true)
    const total = getEditTotal()
    await supabase.from('purchases').update({ supplier_id: editSupplierId, date: editDate, total }).eq('id', editando.id)
    for (const item of editItems) {
      const qty        = parseFloat(item.quantity)
      const totalPrice = parseFloat(item.total_price)
      if (!qty || !totalPrice) continue
      await supabase.from('purchase_items').update({ quantity: qty, unit_price: totalPrice / qty }).eq('id', item.id)
    }
    setSavingEdit(false)
    setEditando(null)
    await fetchCompras()
  }

  return (
    <main className="min-h-screen bg-gray-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">🛒 Compras</h1>
            <p className="text-gray-500 text-sm mt-1">Registro de {locationCode}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="bg-orange-500 text-white text-sm font-bold px-3 py-1 rounded-lg">
              {locationCode}
            </span>
            <Link
              href="/compras/nuevo"
              className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
            >
              + Nueva
            </Link>
          </div>
        </div>

        {/* Selector de mes */}
        <div className="flex items-center gap-3">
          <button onClick={() => navegarMes(-1)} className="text-gray-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800 transition">←</button>
          <span className="text-white font-semibold text-lg min-w-[140px] text-center">{MESES[mes - 1]} {anio}</span>
          <button onClick={() => navegarMes(1)} className="text-gray-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800 transition">→</button>
        </div>

        {/* Resumen */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
            <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Total del mes</p>
            <p className="text-3xl font-bold text-white">
              ${totalMes.toLocaleString('es-CL', { maximumFractionDigits: 0 })}
            </p>
            <p className="text-gray-600 text-xs mt-1">{compras.length} factura{compras.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
            <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">Por proveedor</p>
            {Object.keys(porProveedor).length === 0 ? (
              <p className="text-gray-600 text-sm">Sin datos</p>
            ) : (
              <div className="flex flex-col gap-1">
                {Object.entries(porProveedor).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, total]) => (
                  <div key={name} className="flex justify-between items-center">
                    <span className="text-gray-400 text-xs truncate">{name}</span>
                    <span className="text-gray-300 text-xs font-medium ml-2">
                      ${total.toLocaleString('es-CL', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Lista de compras */}
        {loading || locationLoading ? (
          <p className="text-gray-500 text-sm">Cargando...</p>
        ) : compras.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600">No hay compras registradas para este período.</p>
            <Link href="/compras/nuevo" className="text-orange-400 text-sm mt-2 inline-block hover:underline">
              Registrar la primera →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {compras.map(compra => (
              <div key={compra.id} className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
                <button
                  className="w-full p-4 flex items-center justify-between hover:bg-gray-800/50 transition text-left"
                  onClick={() => setExpandido(expandido === compra.id ? null : compra.id)}
                >
                  <div>
                    <p className="text-white font-semibold">{compra.suppliers?.name}</p>
                    <p className="text-gray-500 text-sm">
                      {new Date(compra.date + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })}
                      {' · '}{compra.purchase_items?.length} producto{compra.purchase_items?.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-white font-bold">
                      ${parseFloat(compra.total).toLocaleString('es-CL', { maximumFractionDigits: 0 })}
                    </span>
                    <span className="text-gray-500 text-xs">{expandido === compra.id ? '▲' : '▼'}</span>
                  </div>
                </button>

                {expandido === compra.id && (
                  <div className="border-t border-gray-800">
                    <div className="p-4 flex flex-col gap-2">
                      {compra.purchase_items?.map(item => (
                        <div key={item.id} className="flex justify-between items-center text-sm py-1 border-b border-gray-800/50 last:border-0">
                          <span className="text-gray-300">{item.insumos?.name}</span>
                          <span className="text-gray-500">
                            {item.quantity} {item.insumos?.unit} · ${parseFloat(item.unit_price).toLocaleString('es-CL', { maximumFractionDigits: 0 })}/u
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="px-4 pb-4">
                      <button
                        onClick={() => abrirEdicion(compra)}
                        className="w-full text-center text-sm text-orange-400 border border-orange-500/30 rounded-lg py-2 hover:bg-orange-500/10 transition"
                      >
                        ✏️ Editar compra
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
      {editando && (
        <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col border border-gray-800">
            <div className="p-4 border-b border-gray-800 flex justify-between items-center">
              <h2 className="text-white font-bold">✏️ Editar compra</h2>
              <button onClick={() => setEditando(null)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <form onSubmit={handleSaveEdit} className="overflow-y-auto flex-1 p-4 flex flex-col gap-4">
              <div className="flex flex-col gap-3">
                <select value={editSupplierId} onChange={e => setEditSupplierId(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white">
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white" />
              </div>
              <div className="flex flex-col gap-3">
                <p className="text-gray-400 text-sm font-medium">Productos</p>
                {editItems.map((item, index) => (
                  <div key={item.id} className="flex flex-col gap-1 border-b border-gray-800 pb-3">
                    <p className="text-white text-sm font-medium">{item.insumo_name}</p>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-gray-500 text-xs mb-1 block">Cantidad ({item.unit})</label>
                        <input type="number" value={item.quantity} onChange={e => updateEditItem(index, 'quantity', e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white w-full" />
                      </div>
                      <div className="flex-1">
                        <label className="text-gray-500 text-xs mb-1 block">Total neto ($)</label>
                        <input type="number" value={item.total_price} onChange={e => updateEditItem(index, 'total_price', e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white w-full" />
                      </div>
                    </div>
                    {item.quantity && item.total_price && (
                      <p className="text-gray-600 text-xs">
                        ${(parseFloat(item.total_price) / parseFloat(item.quantity)).toLocaleString('es-CL', { maximumFractionDigits: 0 })}/{item.unit}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">Total</span>
                <span className="text-white font-bold">${getEditTotal().toLocaleString('es-CL')}</span>
              </div>
              <p className="text-gray-600 text-xs">
                * Editar no recalcula el stock ni el costo promedio. Solo corrige el registro histórico.
              </p>
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
