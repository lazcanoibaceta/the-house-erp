'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLocation } from '@/hooks/useLocation'

const supabase = createClient()

export default function Compras() {
  const { locationCode, locationId, loading: locationLoading } = useLocation()

  // --- Formulario nueva compra ---
  const [suppliers, setSuppliers] = useState([])
  const [insumos, setInsumos] = useState([])
  const [supplierId, setSupplierId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [items, setItems] = useState([{ insumo_id: '', quantity: '', total_price: '' }])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  // --- Historial ---
  const [historial, setHistorial] = useState([])
  const [expandido, setExpandido] = useState(null)

  // --- Edición ---
  const [editando, setEditando] = useState(null)
  const [editSupplierId, setEditSupplierId] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editItems, setEditItems] = useState([])
  const [savingEdit, setSavingEdit] = useState(false)

  // --- Agregar proveedor ---
  const [showAddSupplier, setShowAddSupplier] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState('')
  const [newSupplierPhone, setNewSupplierPhone] = useState('')
  const [savingSupplier, setSavingSupplier] = useState(false)

  useEffect(() => {
    async function fetchData() {
      const { data: i } = await supabase.from('insumos').select('*').order('name')
      setInsumos(i || [])
    }
    fetchData()
  }, [])

  useEffect(() => {
    if (!locationId) return
    fetchSuppliers()
    fetchHistorial()
  }, [locationId])

  async function fetchSuppliers() {
    const { data } = await supabase
      .from('supplier_locations')
      .select('supplier_id, suppliers(id, name)')
      .eq('location_id', locationId)
    const list = (data || []).map(row => row.suppliers).filter(Boolean)
    list.sort((a, b) => a.name.localeCompare(b.name))
    setSuppliers(list)
    setSupplierId('')
  }

  async function fetchHistorial() {
    const { data } = await supabase
      .from('purchases')
      .select(`
        id, date, total, supplier_id,
        suppliers(name),
        purchase_items(id, quantity, unit_price, insumo_id, insumos(name, unit))
      `)
      .eq('location_id', locationId)
      .order('date', { ascending: false })
      .limit(5)
    setHistorial(data || [])
  }

  // --- Agregar proveedor rápido ---
  async function handleAddSupplier(e) {
    e.preventDefault()
    if (!newSupplierName.trim() || !locationId) return
    setSavingSupplier(true)

    // 1. Insertar en suppliers
    const { data: supplier, error } = await supabase
      .from('suppliers')
      .insert({ name: newSupplierName.trim(), phone: newSupplierPhone.trim() || null })
      .select()
      .single()

    if (error) { console.error(error); setSavingSupplier(false); return }

    // 2. Asociar al local actual en supplier_locations
    await supabase.from('supplier_locations').insert({
      supplier_id: supplier.id,
      location_id: locationId,
    })

    // 3. Refrescar lista y auto-seleccionar el nuevo
    await fetchSuppliers()
    setSupplierId(supplier.id)

    // 4. Cerrar modal
    setShowAddSupplier(false)
    setNewSupplierName('')
    setNewSupplierPhone('')
    setSavingSupplier(false)
  }

  // --- Nueva compra ---
  function addItem() {
    setItems([...items, { insumo_id: '', quantity: '', total_price: '' }])
  }

  function removeItem(index) {
    setItems(items.filter((_, i) => i !== index))
  }

  function updateItem(index, field, value) {
    const updated = [...items]
    updated[index][field] = value
    setItems(updated)
  }

  function getTotal() {
    return items.reduce((sum, item) => sum + (parseFloat(item.total_price) || 0), 0)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)

    const total = getTotal()

    const { data: purchase, error: purchaseError } = await supabase
      .from('purchases')
      .insert({ supplier_id: supplierId, date, total, location_id: locationId })
      .select()
      .single()

    if (purchaseError) {
      console.error(purchaseError)
      setLoading(false)
      return
    }

    for (const item of items) {
      if (!item.insumo_id || !item.quantity || !item.total_price) continue

      const qty = parseFloat(item.quantity)
      const totalPrice = parseFloat(item.total_price)
      const price = totalPrice / qty

      await supabase.from('purchase_items').insert({
        purchase_id: purchase.id,
        insumo_id: item.insumo_id,
        quantity: qty,
        unit_price: price,
      })

      const { data: insumo } = await supabase
        .from('insumos')
        .select('stock, avg_cost')
        .eq('id', item.insumo_id)
        .single()

      const currentStock = parseFloat(insumo.stock) || 0
      const currentCost = parseFloat(insumo.avg_cost) || 0
      const newStock = currentStock + qty
      const newAvgCost = ((currentStock * currentCost) + (qty * price)) / newStock

      await supabase
        .from('insumos')
        .update({ stock: newStock, avg_cost: newAvgCost })
        .eq('id', item.insumo_id)

      await supabase.from('stock_movements').insert({
        insumo_id: item.insumo_id,
        type: 'entrada',
        quantity: qty,
        reason: 'Compra a proveedor',
        location_id: locationId,
      })
    }

    setSuccess(true)
    setItems([{ insumo_id: '', quantity: '', total_price: '' }])
    setSupplierId('')
    setLoading(false)
    await fetchHistorial()
    setTimeout(() => setSuccess(false), 3000)
  }

  // --- Edición ---
  function abrirEdicion(compra) {
    setEditando(compra)
    setEditSupplierId(compra.supplier_id)
    setEditDate(compra.date)
    setEditItems(
      compra.purchase_items.map(it => ({
        id: it.id,
        insumo_id: it.insumo_id,
        insumo_name: it.insumos?.name,
        unit: it.insumos?.unit,
        quantity: it.quantity,
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
    return editItems.reduce((sum, it) => sum + (parseFloat(it.total_price) || 0), 0)
  }

  async function handleSaveEdit(e) {
    e.preventDefault()
    setSavingEdit(true)

    const total = getEditTotal()

    // Actualizar cabecera
    await supabase
      .from('purchases')
      .update({ supplier_id: editSupplierId, date: editDate, total })
      .eq('id', editando.id)

    // Actualizar cada item
    for (const item of editItems) {
      const qty = parseFloat(item.quantity)
      const totalPrice = parseFloat(item.total_price)
      if (!qty || !totalPrice) continue
      const unit_price = totalPrice / qty
      await supabase
        .from('purchase_items')
        .update({ quantity: qty, unit_price })
        .eq('id', item.id)
    }

    setSavingEdit(false)
    setEditando(null)
    await fetchHistorial()
  }

  return (
    <main className="min-h-screen bg-gray-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto flex flex-col gap-8">

        {/* ── Formulario nueva compra ── */}
        <div>
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white">🛒 Registrar Compra</h1>
            <span className="bg-orange-500 text-white text-sm font-bold px-3 py-1 rounded-lg">
              {locationCode}
            </span>
          </div>

          {success && (
            <div className="bg-green-900 text-green-300 rounded-xl p-3 mb-4 font-semibold">
              ✅ Compra registrada correctamente
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 flex flex-col gap-3">
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                required
                disabled={locationLoading}
                className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white"
              >
                <option value="">Seleccionar proveedor...</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setShowAddSupplier(true)}
                className="text-orange-400 text-xs hover:text-orange-300 text-left transition"
              >
                + Agregar proveedor nuevo
              </button>

              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white"
              />
            </div>

            <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 flex flex-col gap-3">
              <h2 className="font-semibold text-white">Productos comprados</h2>

              {items.map((item, index) => (
                <div key={index} className="flex flex-col gap-2 border-b border-gray-800 pb-3">
                  <select
                    value={item.insumo_id}
                    onChange={(e) => updateItem(index, 'insumo_id', e.target.value)}
                    required
                    className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white"
                  >
                    <option value="">Seleccionar insumo...</option>
                    {insumos.map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>

                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Cantidad (kg, un, lt)"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                      required
                      className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white w-1/2"
                    />
                    <input
                      type="number"
                      placeholder="Valor neto total ($)"
                      value={item.total_price}
                      onChange={(e) => updateItem(index, 'total_price', e.target.value)}
                      required
                      className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white w-1/2"
                    />
                  </div>

                  {item.quantity && item.total_price && (
                    <p className="text-gray-500 text-xs">
                      Precio por unidad: ${(parseFloat(item.total_price) / parseFloat(item.quantity)).toLocaleString('es-CL', { maximumFractionDigits: 0 })}
                    </p>
                  )}

                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="text-red-400 text-sm text-right"
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={addItem}
                className="text-gray-500 text-sm border border-dashed border-gray-700 rounded-lg p-2 hover:bg-gray-800"
              >
                + Agregar producto
              </button>
            </div>

            <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 flex justify-between items-center">
              <span className="font-semibold text-white">Total factura</span>
              <span className="text-xl font-bold text-white">
                ${getTotal().toLocaleString('es-CL')}
              </span>
            </div>

            <button
              type="submit"
              disabled={loading || locationLoading}
              className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl p-3 font-semibold transition disabled:opacity-50"
            >
              {loading ? 'Guardando...' : 'Registrar compra'}
            </button>
          </form>
        </div>

        {/* ── Historial últimas 5 compras ── */}
        <div>
          <h2 className="text-lg font-bold text-white mb-3">🕐 Últimas compras</h2>

          {historial.length === 0 ? (
            <p className="text-gray-600 text-sm">No hay compras registradas para {locationCode}.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {historial.map((compra) => (
                <div key={compra.id} className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">

                  {/* Cabecera de la compra */}
                  <button
                    className="w-full p-4 flex items-center justify-between hover:bg-gray-800/50 transition text-left"
                    onClick={() => setExpandido(expandido === compra.id ? null : compra.id)}
                  >
                    <div>
                      <p className="text-white font-semibold">{compra.suppliers?.name}</p>
                      <p className="text-gray-500 text-sm">
                        {new Date(compra.date + 'T12:00:00').toLocaleDateString('es-CL', {
                          weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
                        })}
                        {' · '}
                        {compra.purchase_items?.length} producto{compra.purchase_items?.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-white font-bold">
                        ${parseFloat(compra.total).toLocaleString('es-CL', { maximumFractionDigits: 0 })}
                      </span>
                      <span className="text-gray-500 text-xs">{expandido === compra.id ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {/* Detalle expandible */}
                  {expandido === compra.id && (
                    <div className="border-t border-gray-800">
                      <div className="p-4 flex flex-col gap-2">
                        {compra.purchase_items?.map((item) => (
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

      </div>

      {/* ── Modal agregar proveedor ── */}
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
                <input
                  type="text"
                  value={newSupplierName}
                  onChange={e => setNewSupplierName(e.target.value)}
                  placeholder="Ej: Distribuidora Sur, Loncoleche..."
                  required
                  autoFocus
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm"
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Teléfono (opcional)</label>
                <input
                  type="text"
                  value={newSupplierPhone}
                  onChange={e => setNewSupplierPhone(e.target.value)}
                  placeholder="+56 9 ..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm"
                />
              </div>
              <p className="text-gray-600 text-xs">
                Se agregará a {locationCode} y quedará disponible de inmediato en el selector.
              </p>
              <button
                type="submit"
                disabled={savingSupplier || !newSupplierName.trim()}
                className="bg-orange-500 hover:bg-orange-600 text-white rounded-lg p-2.5 font-semibold text-sm transition disabled:opacity-50"
              >
                {savingSupplier ? 'Guardando...' : 'Agregar proveedor'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal edición ── */}
      {editando && (
        <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col border border-gray-800">

            <div className="p-4 border-b border-gray-800 flex justify-between items-center">
              <h2 className="text-white font-bold">✏️ Editar compra</h2>
              <button onClick={() => setEditando(null)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>

            <form onSubmit={handleSaveEdit} className="overflow-y-auto flex-1 p-4 flex flex-col gap-4">

              {/* Cabecera */}
              <div className="flex flex-col gap-3">
                <select
                  value={editSupplierId}
                  onChange={(e) => setEditSupplierId(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white"
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white"
                />
              </div>

              {/* Items */}
              <div className="flex flex-col gap-3">
                <p className="text-gray-400 text-sm font-medium">Productos</p>
                {editItems.map((item, index) => (
                  <div key={item.id} className="flex flex-col gap-1 border-b border-gray-800 pb-3">
                    <p className="text-white text-sm font-medium">{item.insumo_name}</p>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-gray-500 text-xs mb-1 block">Cantidad ({item.unit})</label>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateEditItem(index, 'quantity', e.target.value)}
                          className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white w-full"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-gray-500 text-xs mb-1 block">Total neto ($)</label>
                        <input
                          type="number"
                          value={item.total_price}
                          onChange={(e) => updateEditItem(index, 'total_price', e.target.value)}
                          className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white w-full"
                        />
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

              {/* Total */}
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">Total</span>
                <span className="text-white font-bold">${getEditTotal().toLocaleString('es-CL')}</span>
              </div>

              <p className="text-gray-600 text-xs">
                * Editar no recalcula el stock ni el costo promedio de los insumos. Solo corrige el registro histórico.
              </p>

              <button
                type="submit"
                disabled={savingEdit}
                className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl p-3 font-semibold transition disabled:opacity-50"
              >
                {savingEdit ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </form>

          </div>
        </div>
      )}
    </main>
  )
}
