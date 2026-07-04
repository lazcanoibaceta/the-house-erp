'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLocation } from '@/hooks/useLocation'
import Link from 'next/link'

const supabase = createClient()

const LOCATION_NAMES = { SF: 'San Felipe', LA: 'Los Andes' }

export default function NuevaCompra() {
  const { locationCode, loading: locationLoading } = useLocation()

  // Local EXPLÍCITO del formulario: parte con el local activo pero queda
  // fijado acá, visible y editable — evita que un cambio de toggle en otra
  // pestaña guarde la compra en el local equivocado (bug compras SF/LA)
  const [locations, setLocations]   = useState([])
  const [formLoc, setFormLoc]       = useState('')

  const [suppliers, setSuppliers]   = useState([])
  const [insumos, setInsumos]       = useState([])
  const [supplierId, setSupplierId] = useState('')
  const [date, setDate]             = useState(new Date().toISOString().split('T')[0])
  const [items, setItems]           = useState([{ insumo_id: '', quantity: '', total_price: '' }])
  const [loading, setLoading]       = useState(false)
  const [success, setSuccess]       = useState(false)

  const formLocId = locations.find(l => l.short_code === formLoc)?.id || null

  const [showAddSupplier, setShowAddSupplier]   = useState(false)
  const [newSupplierName, setNewSupplierName]   = useState('')
  const [newSupplierPhone, setNewSupplierPhone] = useState('')
  const [savingSupplier, setSavingSupplier]     = useState(false)

  useEffect(() => {
    supabase.from('insumos').select('*').order('name').then(({ data }) => setInsumos(data || []))
    supabase.from('locations').select('id, short_code').then(({ data }) => setLocations(data || []))
  }, [])

  // Inicializa el local del formulario con el local activo (solo una vez)
  useEffect(() => {
    if (!locationLoading && !formLoc && locationCode) setFormLoc(locationCode)
  }, [locationLoading, locationCode, formLoc])

  useEffect(() => {
    if (!formLocId) return
    fetchSuppliers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formLocId])

  async function fetchSuppliers() {
    const { data } = await supabase
      .from('supplier_locations')
      .select('supplier_id, suppliers(id, name)')
      .eq('location_id', formLocId)
    const list = (data || []).map(row => row.suppliers).filter(Boolean)
    list.sort((a, b) => a.name.localeCompare(b.name))
    setSuppliers(list)
    setSupplierId('')
  }

  async function handleAddSupplier(e) {
    e.preventDefault()
    if (!newSupplierName.trim() || !formLocId) return
    setSavingSupplier(true)
    const { data: supplier, error } = await supabase
      .from('suppliers')
      .insert({ name: newSupplierName.trim(), phone: newSupplierPhone.trim() || null })
      .select().single()
    if (error) { console.error(error); setSavingSupplier(false); return }
    await supabase.from('supplier_locations').insert({ supplier_id: supplier.id, location_id: formLocId })
    await fetchSuppliers()
    setSupplierId(supplier.id)
    setShowAddSupplier(false)
    setNewSupplierName('')
    setNewSupplierPhone('')
    setSavingSupplier(false)
  }

  function addItem()              { setItems([...items, { insumo_id: '', quantity: '', total_price: '' }]) }
  function removeItem(i)          { setItems(items.filter((_, idx) => idx !== i)) }
  function updateItem(i, f, v)    { const u = [...items]; u[i][f] = v; setItems(u) }
  function getTotal()             { return items.reduce((s, it) => s + (parseFloat(it.total_price) || 0), 0) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!formLocId) return
    setLoading(true)
    const total = getTotal()
    const { data: purchase, error } = await supabase
      .from('purchases')
      .insert({ supplier_id: supplierId, date, total, location_id: formLocId })
      .select().single()
    if (error) { console.error(error); setLoading(false); return }

    for (const item of items) {
      if (!item.insumo_id || !item.quantity || !item.total_price) continue
      const qty   = parseFloat(item.quantity)
      const total = parseFloat(item.total_price)
      const price = total / qty
      await supabase.from('purchase_items').insert({ purchase_id: purchase.id, insumo_id: item.insumo_id, quantity: qty, unit_price: price })
      const { data: costRow } = await supabase.from('insumo_costs').select('stock, avg_cost').eq('insumo_id', item.insumo_id).eq('location_id', formLocId).single()
      const currentStock = parseFloat(costRow?.stock) || 0
      const currentCost  = parseFloat(costRow?.avg_cost) || 0
      const newStock     = currentStock + qty
      const newAvgCost   = newStock > 0 ? ((currentStock * currentCost) + (qty * price)) / newStock : price
      await supabase.from('insumo_costs').upsert(
        { insumo_id: item.insumo_id, location_id: formLocId, stock: newStock, avg_cost: newAvgCost },
        { onConflict: 'insumo_id,location_id' }
      )
      await supabase.from('stock_movements').insert({ insumo_id: item.insumo_id, type: 'entrada', quantity: qty, reason: 'Compra a proveedor', location_id: formLocId })
    }

    setSuccess(true)
    setItems([{ insumo_id: '', quantity: '', total_price: '' }])
    setSupplierId('')
    setLoading(false)
    setTimeout(() => setSuccess(false), 3000)
  }

  return (
    <main className="min-h-screen bg-gray-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto flex flex-col gap-8">

        <div>
          <Link href="/compras" className="text-gray-500 text-sm hover:text-gray-300 mb-1 inline-block">
            ← Compras
          </Link>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white">🛒 Registrar Compra</h1>
            <div className="flex rounded-lg overflow-hidden border border-gray-700">
              {['SF', 'LA'].map(code => (
                <button
                  key={code}
                  type="button"
                  onClick={() => { setFormLoc(code); setSupplierId('') }}
                  className={`px-3 py-1.5 text-sm font-bold transition ${
                    formLoc === code ? 'bg-orange-500 text-white' : 'bg-gray-900 text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {LOCATION_NAMES[code]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {success && (
          <div className="bg-green-900 text-green-300 rounded-xl p-3 font-semibold">
            ✅ Compra registrada correctamente
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 flex flex-col gap-3">
            <select
              value={supplierId}
              onChange={e => setSupplierId(e.target.value)}
              required
              disabled={!formLocId}
              className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white"
            >
              <option value="">Seleccionar proveedor...</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button type="button" onClick={() => setShowAddSupplier(true)} className="text-orange-400 text-xs hover:text-orange-300 text-left transition">
              + Agregar proveedor nuevo
            </button>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} required className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white" />
          </div>

          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 flex flex-col gap-3">
            <h2 className="font-semibold text-white">Productos comprados</h2>
            {items.map((item, index) => (
              <div key={index} className="flex flex-col gap-2 border-b border-gray-800 pb-3">
                <select
                  value={item.insumo_id}
                  onChange={e => updateItem(index, 'insumo_id', e.target.value)}
                  required
                  className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white"
                >
                  <option value="">Seleccionar insumo...</option>
                  {insumos.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
                <div className="flex gap-2">
                  <input type="number" placeholder="Cantidad (kg, un, lt)" value={item.quantity} onChange={e => updateItem(index, 'quantity', e.target.value)} required className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white w-1/2" />
                  <input type="number" placeholder="Valor neto total ($)" value={item.total_price} onChange={e => updateItem(index, 'total_price', e.target.value)} required className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white w-1/2" />
                </div>
                {item.quantity && item.total_price && (
                  <p className="text-gray-500 text-xs">
                    Precio por unidad: ${(parseFloat(item.total_price) / parseFloat(item.quantity)).toLocaleString('es-CL', { maximumFractionDigits: 0 })}
                  </p>
                )}
                {items.length > 1 && (
                  <button type="button" onClick={() => removeItem(index)} className="text-red-400 text-sm text-right">Eliminar</button>
                )}
              </div>
            ))}
            <button type="button" onClick={addItem} className="text-gray-500 text-sm border border-dashed border-gray-700 rounded-lg p-2 hover:bg-gray-800">
              + Agregar producto
            </button>
          </div>

          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 flex justify-between items-center">
            <span className="font-semibold text-white">Total factura</span>
            <span className="text-xl font-bold text-white">${getTotal().toLocaleString('es-CL')}</span>
          </div>

          <button type="submit" disabled={loading || !formLocId} className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl p-3 font-semibold transition disabled:opacity-50">
            {loading ? 'Guardando...' : `Registrar compra en ${LOCATION_NAMES[formLoc] || '...'}`}
          </button>
        </form>

      </div>

      {/* Modal agregar proveedor */}
      {showAddSupplier && (
        <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl w-full max-w-sm border border-gray-800">
            <div className="p-4 border-b border-gray-800 flex justify-between items-center">
              <h2 className="text-white font-bold">+ Nuevo proveedor</h2>
              <button onClick={() => setShowAddSupplier(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <form onSubmit={handleAddSupplier} className="p-4 flex flex-col gap-3">
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Nombre del proveedor *</label>
                <input type="text" value={newSupplierName} onChange={e => setNewSupplierName(e.target.value)} placeholder="Ej: Distribuidora Sur..." required autoFocus className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm" />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Teléfono (opcional)</label>
                <input type="text" value={newSupplierPhone} onChange={e => setNewSupplierPhone(e.target.value)} placeholder="+56 9 ..." className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm" />
              </div>
              <p className="text-gray-600 text-xs">Se agregará a {LOCATION_NAMES[formLoc] || formLoc} y quedará disponible de inmediato.</p>
              <button type="submit" disabled={savingSupplier || !newSupplierName.trim()} className="bg-orange-500 hover:bg-orange-600 text-white rounded-lg p-2.5 font-semibold text-sm transition disabled:opacity-50">
                {savingSupplier ? 'Guardando...' : 'Agregar proveedor'}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}
