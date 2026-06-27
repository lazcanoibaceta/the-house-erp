'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLocation } from '@/hooks/useLocation'
import RoleGuard from '@/components/RoleGuard'
import Link from 'next/link'

const supabase = createClient()

function locName(code) {
  return code === 'SF' ? 'San Felipe' : code === 'LA' ? 'Los Andes' : code
}

export default function Traspasos() {
  return (
    <RoleGuard allowedRoles={['admin_supremo', 'admin']}>
      <TraspasosContent />
    </RoleGuard>
  )
}

function TraspasosContent() {
  const { locationCode } = useLocation()

  const [locations, setLocations] = useState([])   // [{ id, short_code }]
  const [insumos, setInsumos]     = useState([])   // [{ id, name, unit }]
  const [originCosts, setOriginCosts] = useState({}) // insumo_id -> { stock, avg_cost } del origen

  const [fromId, setFromId] = useState('')
  const [toId, setToId]     = useState('')
  const [date, setDate]     = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes]   = useState('')
  const [items, setItems]   = useState([{ insumo_id: '', quantity: '' }])

  const [saving, setSaving]   = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError]     = useState(null)

  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  // Cargar locales e insumos al montar
  useEffect(() => {
    supabase.from('locations').select('id, short_code').then(({ data }) => {
      const locs = data || []
      setLocations(locs)
      // Por defecto: origen = local activo (o SF), destino = el otro
      const activeCode = (typeof window !== 'undefined' && localStorage.getItem('location')) || 'SF'
      const origin = locs.find(l => l.short_code === activeCode) || locs[0]
      const dest   = locs.find(l => l.id !== origin?.id)
      if (origin) setFromId(origin.id)
      if (dest)   setToId(dest.id)
    })
    supabase.from('insumos').select('id, name, unit').order('name').then(({ data }) => setInsumos(data || []))
  }, [])

  // Cargar stock disponible del origen cuando cambia el local origen
  useEffect(() => {
    if (!fromId) return
    supabase.from('insumo_costs').select('insumo_id, stock, avg_cost').eq('location_id', fromId).then(({ data }) => {
      const map = {}
      for (const row of data || []) map[row.insumo_id] = { stock: Number(row.stock) || 0, avg_cost: Number(row.avg_cost) || 0 }
      setOriginCosts(map)
    })
  }, [fromId])

  async function fetchHistory() {
    setLoadingHistory(true)
    const { data } = await supabase
      .from('transfers')
      .select('id, date, notes, from_location_id, to_location_id, transfer_items(quantity, insumos(name, unit))')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(15)
    setHistory(data || [])
    setLoadingHistory(false)
  }

  useEffect(() => { fetchHistory() }, [])

  function codeOf(locId) {
    return locations.find(l => l.id === locId)?.short_code || '?'
  }

  // Al elegir origen, si coincide con el destino, intercambia para que nunca sean iguales
  function handleFromChange(id) {
    if (id === toId) setToId(fromId)
    setFromId(id)
  }
  function handleToChange(id) {
    if (id === fromId) setFromId(toId)
    setToId(id)
  }

  function addItem()           { setItems([...items, { insumo_id: '', quantity: '' }]) }
  function removeItem(i)        { setItems(items.filter((_, idx) => idx !== i)) }
  function updateItem(i, f, v)  { const u = [...items]; u[i][f] = v; setItems(u) }

  function availableFor(insumoId) {
    return originCosts[insumoId]?.stock ?? null
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    const validItems = items.filter(it => it.insumo_id && parseFloat(it.quantity) > 0)
    if (!fromId || !toId) { setError('Selecciona el local de origen y el de destino.'); return }
    if (fromId === toId)  { setError('El origen y el destino deben ser distintos.'); return }
    if (validItems.length === 0) { setError('Agrega al menos un insumo con cantidad.'); return }

    setSaving(true)

    // 1. Cabecera del traspaso
    const { data: transfer, error: errT } = await supabase
      .from('transfers')
      .insert({ date, from_location_id: fromId, to_location_id: toId, notes: notes.trim() || null })
      .select().single()
    if (errT) { console.error(errT); setError('No se pudo crear el traspaso: ' + errT.message); setSaving(false); return }

    const fromCode = codeOf(fromId)
    const toCode   = codeOf(toId)

    // 2. Por cada insumo: mover stock y dejar bitácora
    for (const it of validItems) {
      const qty = parseFloat(it.quantity)

      // Costo del origen (para valorizar el traspaso y recalcular el costo del destino)
      const originRow  = originCosts[it.insumo_id] || { stock: 0, avg_cost: 0 }
      const originCost = originRow.avg_cost

      // Ítem del traspaso
      await supabase.from('transfer_items').insert({
        transfer_id: transfer.id, insumo_id: it.insumo_id, quantity: qty, unit_cost: originCost,
      })

      // ORIGEN: baja el stock (el costo promedio del origen no cambia)
      const originNewStock = (originRow.stock || 0) - qty
      await supabase.from('insumo_costs').upsert(
        { insumo_id: it.insumo_id, location_id: fromId, stock: originNewStock, avg_cost: originCost },
        { onConflict: 'insumo_id,location_id' }
      )

      // DESTINO: sube el stock y recalcula su costo promedio ponderado con el costo del origen
      const { data: destRow } = await supabase
        .from('insumo_costs').select('stock, avg_cost')
        .eq('insumo_id', it.insumo_id).eq('location_id', toId).single()
      const destStock = Number(destRow?.stock) || 0
      const destCost  = Number(destRow?.avg_cost) || 0
      const destNewStock = destStock + qty
      const destNewCost  = destNewStock > 0
        ? ((destStock * destCost) + (qty * originCost)) / destNewStock
        : originCost
      await supabase.from('insumo_costs').upsert(
        { insumo_id: it.insumo_id, location_id: toId, stock: destNewStock, avg_cost: destNewCost },
        { onConflict: 'insumo_id,location_id' }
      )

      // Bitácora en stock_movements (salida en origen, entrada en destino)
      await supabase.from('stock_movements').insert([
        { insumo_id: it.insumo_id, type: 'salida',  quantity: qty, reason: `Traspaso a ${locName(toCode)}`,     location_id: fromId },
        { insumo_id: it.insumo_id, type: 'entrada', quantity: qty, reason: `Traspaso desde ${locName(fromCode)}`, location_id: toId },
      ])
    }

    // 3. Refrescar stock del origen e historial, limpiar formulario
    const { data: refreshed } = await supabase.from('insumo_costs').select('insumo_id, stock, avg_cost').eq('location_id', fromId)
    const map = {}
    for (const row of refreshed || []) map[row.insumo_id] = { stock: Number(row.stock) || 0, avg_cost: Number(row.avg_cost) || 0 }
    setOriginCosts(map)

    setItems([{ insumo_id: '', quantity: '' }])
    setNotes('')
    setSuccess(true)
    setSaving(false)
    fetchHistory()
    setTimeout(() => setSuccess(false), 4000)
  }

  return (
    <main className="min-h-screen bg-gray-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto flex flex-col gap-8">

        <div>
          <Link href="/inventario/conteos" className="text-gray-500 text-sm hover:text-gray-300 mb-1 inline-block">
            ← Inventario
          </Link>
          <h1 className="text-2xl font-bold text-white">🔁 Traspaso entre locales</h1>
          <p className="text-gray-500 text-sm mt-1">
            Mueve insumos de un local a otro: descuenta el stock del origen y lo suma al destino.
          </p>
        </div>

        {success && (
          <div className="bg-green-900 text-green-300 rounded-xl p-3 font-semibold">
            ✅ Traspaso registrado. Stock actualizado en ambos locales.
          </div>
        )}
        {error && (
          <div className="bg-red-900 text-red-300 rounded-xl p-3 font-semibold text-sm">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">

          {/* Origen / Destino / Fecha */}
          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Desde *</label>
                <select value={fromId} onChange={e => handleFromChange(e.target.value)} required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white">
                  {locations.map(l => <option key={l.id} value={l.id}>{locName(l.short_code)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Hacia *</label>
                <select value={toId} onChange={e => handleToChange(e.target.value)} required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white">
                  {locations.map(l => <option key={l.id} value={l.id}>{locName(l.short_code)}</option>)}
                </select>
              </div>
            </div>
            <div className="text-center text-gray-500 text-sm">
              {codeOf(fromId)} <span className="text-orange-400">→</span> {codeOf(toId)}
            </div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} required
              className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white" />
          </div>

          {/* Insumos */}
          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 flex flex-col gap-3">
            <h2 className="font-semibold text-white">Insumos a traspasar</h2>
            {items.map((item, index) => {
              const avail = availableFor(item.insumo_id)
              const qty   = parseFloat(item.quantity) || 0
              const unit  = insumos.find(i => i.id === item.insumo_id)?.unit || ''
              const insufficient = item.insumo_id && avail !== null && qty > avail
              return (
                <div key={index} className="flex flex-col gap-2 border-b border-gray-800 pb-3">
                  <select value={item.insumo_id} onChange={e => updateItem(index, 'insumo_id', e.target.value)} required
                    className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white">
                    <option value="">Seleccionar insumo...</option>
                    {insumos.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                  <div className="flex gap-2 items-center">
                    <input type="number" step="any" min="0" placeholder={`Cantidad${unit ? ' (' + unit + ')' : ''}`}
                      value={item.quantity} onChange={e => updateItem(index, 'quantity', e.target.value)} required
                      className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white w-1/2" />
                    {item.insumo_id && avail !== null && (
                      <span className={`text-xs ${insufficient ? 'text-yellow-400' : 'text-gray-500'}`}>
                        Disponible en {codeOf(fromId)}: {avail.toLocaleString('es-CL', { maximumFractionDigits: 2 })} {unit}
                      </span>
                    )}
                  </div>
                  {insufficient && (
                    <p className="text-yellow-400 text-xs">
                      Ojo: estás traspasando más de lo que figura en stock. Se registrará igual (el origen quedará en negativo).
                    </p>
                  )}
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(index)} className="text-red-400 text-sm text-right">Eliminar</button>
                  )}
                </div>
              )
            })}
            <button type="button" onClick={addItem} className="text-gray-500 text-sm border border-dashed border-gray-700 rounded-lg p-2 hover:bg-gray-800">
              + Agregar insumo
            </button>
          </div>

          {/* Notas */}
          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
            <label className="text-gray-400 text-xs mb-1 block">Nota (opcional)</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Ej: faltaban cajas de bebida en Los Andes"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm" />
          </div>

          <button type="submit" disabled={saving}
            className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl p-3 font-semibold transition disabled:opacity-50">
            {saving ? 'Registrando...' : 'Registrar traspaso'}
          </button>
        </form>

        {/* Historial */}
        <div className="flex flex-col gap-3">
          <h2 className="font-semibold text-white">Últimos traspasos</h2>
          {loadingHistory ? (
            <p className="text-gray-600 text-sm">Cargando...</p>
          ) : history.length === 0 ? (
            <p className="text-gray-600 text-sm">Aún no hay traspasos registrados.</p>
          ) : (
            history.map(t => (
              <div key={t.id} className="bg-gray-900 rounded-xl p-3 border border-gray-800">
                <div className="flex justify-between items-center">
                  <span className="text-white font-medium text-sm">
                    {codeOf(t.from_location_id)} <span className="text-orange-400">→</span> {codeOf(t.to_location_id)}
                  </span>
                  <span className="text-gray-500 text-xs">{t.date}</span>
                </div>
                <ul className="mt-2 flex flex-col gap-0.5">
                  {(t.transfer_items || []).map((ti, i) => (
                    <li key={i} className="text-gray-400 text-xs">
                      • {ti.insumos?.name} — {Number(ti.quantity).toLocaleString('es-CL', { maximumFractionDigits: 2 })} {ti.insumos?.unit || ''}
                    </li>
                  ))}
                </ul>
                {t.notes && <p className="text-gray-600 text-xs mt-1 italic">{t.notes}</p>}
              </div>
            ))
          )}
        </div>

      </div>
    </main>
  )
}
