'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useLocation } from '@/hooks/useLocation'

const supabase = createClient()

const LOCATION_NAMES = { SF: 'San Felipe', LA: 'Los Andes', FT: 'Foodtruck' }
const PAYMENT_LABELS = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' }

const clp = (n) => '$' + Math.round(n || 0).toLocaleString('es-CL')

// ── Precios con modificadores ───────────────────────────────────────────────
const modsPerUnit = (mods) => (mods || []).reduce((s, m) => s + Number(m.price || 0) * Number(m.qty || 1), 0)
const lineTotal   = (base, mods, qty) => (Number(base || 0) + modsPerUnit(mods)) * Number(qty || 1)

// ── Estado de pago derivado de los pagos ────────────────────────────────────
const paidOf    = (o) => (o.pos_payments || []).reduce((s, p) => s + Number(p.amount || 0), 0)
const balanceOf = (o) => Math.max(0, Number(o.total || 0) - paidOf(o))
function payStateOf(o) {
  if (o.status === 'anulado') return 'anulado'
  const p = paidOf(o)
  if (p <= 0) return 'por_pagar'
  if (p < Number(o.total || 0)) return 'parcial'
  return 'pagado'
}
function statusForPaid(total, paid) {
  if (paid <= 0) return 'por_pagar'
  if (paid < Number(total || 0)) return 'parcial'
  return 'pagado'
}

export default function POSPage() {
  const { locationCode } = useLocation()

  const [locations, setLocations] = useState([])
  const [loc, setLoc]             = useState('')
  const [products, setProducts]   = useState([])
  const [modifiers, setModifiers] = useState([])
  const [userEmail, setUserEmail] = useState('')
  const [booting, setBooting]     = useState(true)

  const [session, setSession] = useState(null)
  const [orders, setOrders]   = useState([])

  const locId = locations.find(l => l.short_code === loc)?.id || null

  useEffect(() => {
    async function boot() {
      const [{ data: locs }, { data: prods }, { data: mods }, { data: auth }] = await Promise.all([
        supabase.from('locations').select('id, short_code, name').order('short_code'),
        supabase.from('products').select('id, name, category, sale_price').eq('active', true).order('category').order('name'),
        supabase.from('pos_modifiers').select('*').eq('active', true).order('sort_order'),
        supabase.auth.getUser(),
      ])
      setLocations(locs || [])
      setProducts(prods || [])
      setModifiers(mods || [])
      setUserEmail(auth?.user?.email || '')
      setBooting(false)
    }
    boot()
  }, [])

  useEffect(() => {
    if (!loc && locationCode) setLoc(locationCode)
  }, [loc, locationCode])

  useEffect(() => {
    if (!locId) return
    loadSession(locId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locId])

  async function loadSession(id) {
    const { data } = await supabase
      .from('cash_sessions').select('*')
      .eq('location_id', id).eq('status', 'abierta')
      .order('opened_at', { ascending: false }).limit(1).maybeSingle()
    setSession(data || null)
    if (data) loadOrders(data.id)
    else setOrders([])
  }

  async function loadOrders(sessionId) {
    const { data } = await supabase
      .from('pos_sales')
      .select('*, pos_sale_items(*), pos_payments(*)')
      .eq('session_id', sessionId)
      .order('order_number', { ascending: false })
    setOrders(data || [])
  }

  if (booting) {
    return <main className="min-h-screen bg-gray-950 p-4 md:p-8"><p className="text-gray-500">Cargando…</p></main>
  }

  return (
    <main className="min-h-screen bg-gray-950 p-4 md:p-8">
      <PrintStyles />
      <div className="max-w-6xl mx-auto no-print">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white">Venta presencial</h1>
              <span className="text-[10px] font-bold uppercase tracking-wide bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full">Beta</span>
            </div>
            <p className="text-gray-500 text-sm mt-0.5">Caja y comandas para el foodtruck (o respaldo en local)</p>
          </div>
          <div className="flex items-center bg-gray-800 rounded-lg p-1 gap-0.5">
            {locations.map(l => (
              <button key={l.short_code} onClick={() => setLoc(l.short_code)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${loc === l.short_code ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'}`}>
                {LOCATION_NAMES[l.short_code] || l.short_code}
              </button>
            ))}
          </div>
        </div>

        {!session ? (
          <AbrirCaja locName={LOCATION_NAMES[loc] || loc} locId={locId} userEmail={userEmail} onOpened={() => loadSession(locId)} />
        ) : (
          <CajaAbierta
            session={session} locName={LOCATION_NAMES[loc] || loc} locId={locId}
            products={products} modifiers={modifiers} orders={orders}
            reload={() => loadSession(locId)} reloadOrders={() => loadOrders(session.id)}
          />
        )}
      </div>
    </main>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Abrir caja
// ════════════════════════════════════════════════════════════════════════════
function AbrirCaja({ locName, locId, userEmail, onOpened }) {
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  async function abrir() {
    if (!locId) { setError('Selecciona un local.'); return }
    setSaving(true); setError('')
    const { error } = await supabase.from('cash_sessions').insert({
      location_id: locId, opening_amount: parseFloat(amount) || 0, opened_by: userEmail || null, status: 'abierta',
    })
    setSaving(false)
    if (error) {
      setError(error.message.includes('duplicate') || error.code === '23505'
        ? 'Ya hay una caja abierta para este local.' : 'No se pudo abrir la caja: ' + error.message)
      return
    }
    onOpened()
  }

  return (
    <div className="max-w-md mx-auto bg-gray-900 border border-gray-800 rounded-2xl p-6 mt-6">
      <h2 className="text-lg font-bold text-white mb-1">Abrir caja — {locName}</h2>
      <p className="text-gray-500 text-sm mb-5">Antes de vender, cuenta el efectivo con que parte la caja. En la noche vas a cuadrar contra este monto.</p>
      <label className="block text-sm text-gray-400 mb-1.5">Efectivo inicial en caja</label>
      <div className="relative mb-4">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
        <input type="number" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-7 pr-3 py-2.5 text-white text-lg focus:outline-none focus:border-orange-500" />
      </div>
      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
      <button onClick={abrir} disabled={saving} className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition">
        {saving ? 'Abriendo…' : 'Abrir caja'}
      </button>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Caja abierta
// ════════════════════════════════════════════════════════════════════════════
function CajaAbierta({ session, locName, locId, products, modifiers, orders, reload, reloadOrders }) {
  const [showSale, setShowSale]       = useState(false)
  const [editingOrder, setEditingOrder] = useState(null)
  const [showClose, setShowClose]     = useState(false)
  const [comanda, setComanda]         = useState(null)
  const [cobrarId, setCobrarId]       = useState(null)
  const [view, setView]               = useState('activos')

  const activos   = orders.filter(o => !o.delivered && o.status !== 'anulado')
  const historial = orders.filter(o => o.delivered || o.status === 'anulado')
  const cobrarOrder = orders.find(o => o.id === cobrarId) || null

  const stats = useMemo(() => {
    const vivos = orders.filter(o => o.status !== 'anulado')
    const byMethod = (m) => vivos.reduce((s, o) =>
      s + (o.pos_payments || []).filter(p => p.method === m).reduce((a, p) => a + Number(p.amount), 0), 0)
    const efectivo = byMethod('efectivo'), tarjeta = byMethod('tarjeta'), transferencia = byMethod('transferencia')
    const porCobrar = vivos.reduce((s, o) => s + balanceOf(o), 0)
    return {
      efectivo, tarjeta, transferencia,
      totalPagado: efectivo + tarjeta + transferencia,
      totalPorPagar: porCobrar,
      countPorPagar: vivos.filter(o => balanceOf(o) > 0).length,
      countPedidos: vivos.length,
    }
  }, [orders])

  const expectedCash = Number(session.opening_amount || 0) + stats.efectivo

  function buildComanda(items, meta, mode) {
    return {
      mode, sale_code: meta.sale_code, order_number: meta.order_number,
      customer_name: meta.customer_name, locName, total: meta.total,
      created_at: meta.created_at || new Date().toISOString(), items,
    }
  }
  function cartToComandaItems(cart) {
    return cart.map(l => ({ quantity: l.qty, product_name: l.name, unit_price: l.unit_price, mods: l.mods || [], note: l.note || '' }))
  }
  function itemsFromOrder(order) {
    return (order.pos_sale_items || []).map(it => ({
      quantity: it.quantity, product_name: it.product_name, unit_price: Number(it.unit_price),
      mods: it.modifiers || [], note: it.note || '',
    }))
  }
  function imprimir(order, mode) {
    setComanda(buildComanda(itemsFromOrder(order), order, mode))
    setTimeout(() => window.print(), 60)
  }

  function abrirNueva() { setEditingOrder(null); setShowSale(true) }
  function abrirEditar(order) { setEditingOrder(order); setShowSale(true) }

  async function confirmSale({ customerName, cart }) {
    const total = cart.reduce((s, l) => s + lineTotal(l.unit_price, l.mods, l.qty), 0)

    if (editingOrder) {
      // Editar venta existente
      const paid = paidOf(editingOrder)
      const { error } = await supabase.from('pos_sales').update({
        customer_name: customerName || null, total, status: statusForPaid(total, paid),
      }).eq('id', editingOrder.id)
      if (error) { alert('No se pudo editar: ' + error.message); return }
      await supabase.from('pos_sale_items').delete().eq('sale_id', editingOrder.id)
      await supabase.from('pos_sale_items').insert(cart.map(l => ({
        sale_id: editingOrder.id, product_id: l.product_id, product_name: l.name,
        unit_price: l.unit_price, quantity: l.qty, note: l.note || null, modifiers: l.mods || [],
      })))
      setShowSale(false); setEditingOrder(null)
      await reloadOrders()
      setComanda(buildComanda(cartToComandaItems(cart),
        { sale_code: editingOrder.sale_code, order_number: editingOrder.order_number, customer_name: customerName, total }, 'cocina'))
      setTimeout(() => window.print(), 60)
      return
    }

    // Nueva venta
    const nextNumber = orders.reduce((m, o) => Math.max(m, o.order_number || 0), 0) + 1
    const { data: sale, error } = await supabase.from('pos_sales').insert({
      session_id: session.id, location_id: locId, order_number: nextNumber,
      customer_name: customerName || null, total, status: 'por_pagar',
    }).select().single()
    if (error) { alert('No se pudo guardar el pedido: ' + error.message); return }

    await supabase.from('pos_sale_items').insert(cart.map(l => ({
      sale_id: sale.id, product_id: l.product_id, product_name: l.name,
      unit_price: l.unit_price, quantity: l.qty, note: l.note || null, modifiers: l.mods || [],
    })))
    setShowSale(false)
    await reloadOrders()
    setComanda(buildComanda(cartToComandaItems(cart),
      { sale_code: sale.sale_code, order_number: nextNumber, customer_name: customerName, total }, 'cocina'))
    setTimeout(() => window.print(), 60)
  }

  async function addPayment(order, method, amount) {
    if (!amount || amount <= 0) return
    const { error } = await supabase.from('pos_payments').insert({ sale_id: order.id, method, amount })
    if (error) { alert('No se pudo registrar el pago: ' + error.message); return }
    const paid = paidOf(order) + amount
    await supabase.from('pos_sales').update({
      status: statusForPaid(order.total, paid),
      paid_at: paid >= Number(order.total) ? new Date().toISOString() : null,
    }).eq('id', order.id)
    reloadOrders()
  }

  async function deletePayment(order, paymentId) {
    const { error } = await supabase.from('pos_payments').delete().eq('id', paymentId)
    if (error) { alert('No se pudo borrar el pago: ' + error.message); return }
    const paid = paidOf(order) - Number((order.pos_payments || []).find(p => p.id === paymentId)?.amount || 0)
    await supabase.from('pos_sales').update({ status: statusForPaid(order.total, paid) }).eq('id', order.id)
    reloadOrders()
  }

  async function markDelivered(order) {
    await supabase.from('pos_sales').update({ delivered: true }).eq('id', order.id)
    reloadOrders()
  }
  async function reabrir(order) {
    const paid = paidOf(order)
    await supabase.from('pos_sales').update({
      delivered: false, status: order.status === 'anulado' ? statusForPaid(order.total, paid) : order.status,
    }).eq('id', order.id)
    reloadOrders()
  }
  async function anular(order) {
    if (!confirm(`¿Anular la cuenta #${order.order_number} (${order.sale_code})?`)) return
    await supabase.from('pos_sales').update({ status: 'anulado' }).eq('id', order.id)
    reloadOrders()
  }

  return (
    <>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-5 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Caja {locName}</p>
          <p className="text-green-400 text-sm font-medium">● Abierta</p>
        </div>
        <Stat label="Inicial" value={clp(session.opening_amount)} />
        <Stat label="Cobrado" value={clp(stats.totalPagado)} accent />
        <Stat label="Por cobrar" value={clp(stats.totalPorPagar)} warn={stats.countPorPagar > 0} />
        <Stat label="Pedidos" value={stats.countPedidos} />
        <div className="ml-auto flex gap-2">
          <button onClick={abrirNueva} className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-5 py-2.5 rounded-lg transition">+ Nueva venta</button>
          <button onClick={() => setShowClose(true)} className="bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white px-4 py-2.5 rounded-lg transition text-sm">Cerrar caja</button>
        </div>
      </div>

      {/* Toggle vista */}
      <div className="flex items-center gap-1 mb-3">
        {[['activos', `Activos (${activos.length})`], ['historial', `Historial (${historial.length})`]].map(([v, label]) => (
          <button key={v} onClick={() => setView(v)}
            className={`text-sm px-3 py-1.5 rounded-lg font-medium transition ${view === v ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
            {label}
          </button>
        ))}
      </div>

      <OrdersList
        orders={view === 'activos' ? activos : historial}
        historial={view === 'historial'}
        emptyLabel={view === 'activos' ? 'No hay ventas activas.' : 'Sin ventas entregadas o anuladas todavía.'}
        onCobrar={(o) => setCobrarId(o.id)}
        onEditar={abrirEditar}
        onDelivered={markDelivered}
        onReabrir={reabrir}
        onAnular={anular}
        onCocina={(o) => imprimir(o, 'cocina')}
        onPrecuenta={(o) => imprimir(o, 'precuenta')}
        onNueva={abrirNueva}
      />

      {showSale && (
        <NuevaVenta
          products={products} modifiers={modifiers} editing={editingOrder}
          onClose={() => { setShowSale(false); setEditingOrder(null) }}
          onConfirm={confirmSale}
        />
      )}

      {cobrarOrder && (
        <CobrarModal order={cobrarOrder} onAdd={addPayment} onDelete={deletePayment} onClose={() => setCobrarId(null)} />
      )}

      {showClose && (
        <CerrarCaja session={session} locName={locName} stats={stats} expectedCash={expectedCash}
          onClose={() => setShowClose(false)} onClosed={() => { setShowClose(false); reload() }} />
      )}

      <ComandaPrint comanda={comanda} />
    </>
  )
}

function Stat({ label, value, accent, warn }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-sm font-bold ${accent ? 'text-green-400' : warn ? 'text-amber-400' : 'text-white'}`}>{value}</p>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Lista de pedidos
// ════════════════════════════════════════════════════════════════════════════
function OrdersList({ orders, historial, emptyLabel, onCobrar, onEditar, onDelivered, onReabrir, onAnular, onCocina, onPrecuenta, onNueva }) {
  if (orders.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 border-dashed rounded-2xl p-10 text-center">
        <p className="text-gray-400 mb-4">{emptyLabel}</p>
        {!historial && <button onClick={onNueva} className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-5 py-2.5 rounded-lg transition">+ Nueva venta</button>}
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      {orders.map(o => {
        const state = payStateOf(o)
        const paid = paidOf(o), balance = balanceOf(o)
        const borderCls = state === 'anulado' ? 'border-gray-800 opacity-60'
          : state === 'pagado' ? 'border-green-900/60'
          : state === 'parcial' ? 'border-blue-900/60' : 'border-amber-900/60'
        return (
          <div key={o.id} className={`bg-gray-900 border rounded-2xl overflow-hidden ${borderCls}`}>
            <div className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-bold">#{o.order_number}</span>
                  <span className="text-gray-600 text-xs font-mono">{o.sale_code}</span>
                  <span className="text-gray-300 truncate">{o.customer_name || 'Sin nombre'}</span>
                  <StateBadge state={state} />
                  {o.delivered && <span className="text-[10px] uppercase bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">Entregado</span>}
                </div>
                <div className="text-gray-500 text-xs mt-1 space-y-0.5">
                  {(o.pos_sale_items || []).map((it, i) => (
                    <div key={i}>
                      <span className="text-gray-400">{it.quantity}× {it.product_name}</span>
                      {(it.modifiers || []).length > 0 && <span> {it.modifiers.map(m => `+${m.qty > 1 ? m.qty + '× ' : ''}${m.name}`).join(', ')}</span>}
                      {it.note && <span className="text-amber-500/80 italic"> — {it.note}</span>}
                    </div>
                  ))}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-white font-bold text-lg">{clp(o.total)}</p>
                {state === 'parcial' && <p className="text-blue-300 text-xs">Pagó {clp(paid)} · falta {clp(balance)}</p>}
              </div>
            </div>

            <div className="border-t border-gray-800 px-4 py-2 flex flex-wrap items-center gap-2">
              {historial ? (
                <button onClick={() => onReabrir(o)} className="bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-medium px-4 py-1.5 rounded-lg transition">↩ Reabrir</button>
              ) : (
                <>
                  {balance > 0 && (
                    <button onClick={() => onCobrar(o)} className="bg-green-600 hover:bg-green-500 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition">
                      Cobrar {clp(balance)}
                    </button>
                  )}
                  {state === 'pagado' && (
                    <button onClick={() => onDelivered(o)} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition">✓ Entregado</button>
                  )}
                  <button onClick={() => onEditar(o)} className="text-gray-300 hover:text-white text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition">✎ Editar</button>
                </>
              )}
              <button onClick={() => onCocina(o)} className="text-gray-300 hover:text-white text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition">🖨 Cocina</button>
              <button onClick={() => onPrecuenta(o)} className="text-gray-300 hover:text-white text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition">🧾 Pre-cuenta</button>
              {!historial && state !== 'anulado' && (
                <button onClick={() => onAnular(o)} className="text-gray-600 hover:text-red-400 text-xs px-2 py-1.5 ml-auto">Anular</button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function StateBadge({ state }) {
  const map = {
    por_pagar: ['bg-amber-900/50 text-amber-400', 'Por pagar'],
    parcial:   ['bg-blue-900/50 text-blue-300', 'Pago parcial'],
    pagado:    ['bg-green-900/50 text-green-400', 'Pagado'],
    anulado:   ['bg-gray-800 text-gray-500', 'Anulado'],
  }
  const [cls, label] = map[state] || map.por_pagar
  return <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${cls}`}>{label}</span>
}

// ════════════════════════════════════════════════════════════════════════════
// Cobrar (pagos parciales / múltiples)
// ════════════════════════════════════════════════════════════════════════════
function CobrarModal({ order, onAdd, onDelete, onClose }) {
  const payments = order.pos_payments || []
  const paid = paidOf(order), balance = balanceOf(order)
  const [method, setMethod] = useState('efectivo')
  const [amount, setAmount] = useState('')

  async function quick(m) { await onAdd(order, m, balance) }
  async function manual() {
    const a = parseFloat(amount) || 0
    if (a <= 0) return
    await onAdd(order, method, a)
    setAmount('')
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-gray-950 rounded-2xl border border-gray-800 w-full max-w-md p-6 my-8">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-white">Cobrar cuenta #{order.order_number}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1">
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <p className="text-gray-600 text-xs font-mono mb-4">{order.sale_code} · {order.customer_name || 'Sin nombre'}</p>

        <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800 mb-4 text-sm">
          <Row label="Total cuenta" value={clp(order.total)} bold />
          <Row label="Pagado" value={clp(paid)} />
          <Row label="Saldo pendiente" value={clp(balance)} bold warn={balance > 0} />
        </div>

        {payments.length > 0 && (
          <div className="mb-4">
            <p className="text-gray-500 text-xs uppercase tracking-wide mb-1.5">Pagos registrados</p>
            <div className="space-y-1">
              {payments.map(p => (
                <div key={p.id} className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5 text-sm">
                  <span className="text-gray-300">{PAYMENT_LABELS[p.method]}</span>
                  <span className="text-white">{clp(p.amount)}</span>
                  <button onClick={() => onDelete(order, p.id)} className="text-gray-600 hover:text-red-400 text-xs ml-2">Quitar</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {balance > 0 ? (
          <>
            <p className="text-gray-400 text-sm mb-2">Cobrar el saldo completo con:</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {['efectivo', 'tarjeta', 'transferencia'].map(m => (
                <button key={m} onClick={() => quick(m)} className="bg-green-600 hover:bg-green-500 text-white text-sm font-medium py-2.5 rounded-lg transition">
                  {PAYMENT_LABELS[m]}
                </button>
              ))}
            </div>

            <p className="text-gray-400 text-sm mb-2">O registrar un pago parcial:</p>
            <div className="flex gap-2">
              <select value={method} onChange={e => setMethod(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-white text-sm focus:outline-none focus:border-orange-500">
                {['efectivo', 'tarjeta', 'transferencia'].map(m => <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>)}
              </select>
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <input type="number" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} placeholder={String(Math.round(balance))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-7 pr-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
              </div>
              <button onClick={manual} className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-4 rounded-lg transition">Agregar</button>
            </div>
          </>
        ) : (
          <div className="bg-green-900/30 text-green-400 rounded-lg px-3 py-2.5 text-sm font-medium text-center">✓ Cuenta pagada completa</div>
        )}

        <button onClick={onClose} className="w-full mt-5 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2.5 rounded-lg transition">Listo</button>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Nueva venta / Editar venta
// ════════════════════════════════════════════════════════════════════════════
function NuevaVenta({ products, modifiers, editing, onClose, onConfirm }) {
  const [customerName, setCustomerName] = useState(editing?.customer_name || '')
  const [cart, setCart] = useState(() => editing
    ? (editing.pos_sale_items || []).map(it => ({
        key: crypto.randomUUID(), product_id: it.product_id, name: it.product_name,
        unit_price: Number(it.unit_price), category: products.find(p => p.id === it.product_id)?.category || 'Otros',
        qty: it.quantity, mods: it.modifiers || [], note: it.note || '',
      }))
    : [])
  const [expandedKey, setExpandedKey] = useState(null)
  const [saving, setSaving] = useState(false)

  const grouped = useMemo(() => {
    const g = {}
    for (const p of products) { const c = p.category || 'Otros'; (g[c] = g[c] || []).push(p) }
    return Object.entries(g)
  }, [products])

  const total = cart.reduce((s, l) => s + lineTotal(l.unit_price, l.mods, l.qty), 0)
  const modsForCategory = (cat) => modifiers.filter(m => m.applies_to === 'all' || m.applies_to === cat)

  function addProduct(p) {
    setCart(prev => {
      const i = prev.findIndex(l => l.product_id === p.id && l.mods.length === 0 && !l.note)
      if (i >= 0) { const copy = [...prev]; copy[i] = { ...copy[i], qty: copy[i].qty + 1 }; return copy }
      return [...prev, { key: crypto.randomUUID(), product_id: p.id, name: p.name, unit_price: Number(p.sale_price), category: p.category || 'Otros', qty: 1, mods: [], note: '' }]
    })
  }
  const changeQty = (key, d) => setCart(prev => prev.map(l => l.key === key ? { ...l, qty: l.qty + d } : l).filter(l => l.qty > 0))
  function removeLine(key) { setCart(prev => prev.filter(l => l.key !== key)); if (expandedKey === key) setExpandedKey(null) }
  function setModCount(key, mod, count) {
    setCart(prev => prev.map(l => {
      if (l.key !== key) return l
      let mods = l.mods.filter(m => m.name !== mod.name)
      if (count > 0) mods = [...mods, { name: mod.name, price: Number(mod.price), qty: count }]
      return { ...l, mods }
    }))
  }
  const setNote = (key, note) => setCart(prev => prev.map(l => l.key === key ? { ...l, note } : l))

  async function confirm() {
    if (cart.length === 0) return
    setSaving(true)
    await onConfirm({ customerName: customerName.trim(), cart })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-stretch md:items-center justify-center p-0 md:p-4">
      <div className="bg-gray-950 md:rounded-2xl border border-gray-800 w-full max-w-5xl h-full md:h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 shrink-0">
          <h2 className="text-white font-bold text-lg">{editing ? `Editar cuenta #${editing.order_number}` : 'Nueva venta'}</h2>
          <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Nombre del cliente" autoFocus
            className="flex-1 max-w-xs bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
          <button onClick={onClose} className="ml-auto text-gray-500 hover:text-white p-1.5">
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="flex-1 flex flex-col md:flex-row min-h-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {grouped.map(([cat, prods]) => (
              <div key={cat}>
                <p className="text-orange-400 text-xs uppercase tracking-wide font-medium mb-2">{cat}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {prods.map(p => (
                    <button key={p.id} onClick={() => addProduct(p)}
                      className="text-left bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-orange-500/50 rounded-xl p-3 transition">
                      <p className="text-white text-sm font-medium leading-tight">{p.name}</p>
                      <p className="text-gray-400 text-sm mt-1">{clp(p.sale_price)}</p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="w-full md:w-96 border-t md:border-t-0 md:border-l border-gray-800 flex flex-col bg-gray-900/50 shrink-0">
            <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-[120px]">
              {cart.length === 0 ? (
                <p className="text-gray-600 text-sm text-center mt-8">Toca un producto para agregarlo</p>
              ) : cart.map(l => {
                const opts = modsForCategory(l.category)
                const expanded = expandedKey === l.key
                return (
                  <div key={l.key} className="bg-gray-900 border border-gray-800 rounded-lg">
                    <div className="flex items-center gap-2 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-white text-sm truncate">{l.name}</p>
                        <p className="text-gray-500 text-xs">{clp(l.unit_price)} c/u</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => changeQty(l.key, -1)} className="w-7 h-7 rounded-md bg-gray-800 hover:bg-gray-700 text-white font-bold">−</button>
                        <span className="text-white text-sm w-5 text-center">{l.qty}</span>
                        <button onClick={() => changeQty(l.key, +1)} className="w-7 h-7 rounded-md bg-gray-800 hover:bg-gray-700 text-white font-bold">+</button>
                      </div>
                      <span className="text-white text-sm font-medium w-16 text-right shrink-0">{clp(lineTotal(l.unit_price, l.mods, l.qty))}</span>
                    </div>
                    {(l.mods.length > 0 || l.note) && (
                      <div className="px-3 pb-1.5 -mt-0.5 text-xs">
                        {l.mods.map(m => <span key={m.name} className="text-gray-400">+{m.qty > 1 ? `${m.qty}× ` : ''}{m.name} </span>)}
                        {l.note && <span className="text-amber-500/90 italic block">» {l.note}</span>}
                      </div>
                    )}
                    <div className="flex items-center gap-3 px-3 pb-2">
                      <button onClick={() => setExpandedKey(expanded ? null : l.key)} className="text-orange-400 hover:text-orange-300 text-xs font-medium">
                        {expanded ? 'Listo' : 'Personalizar'}
                      </button>
                      <button onClick={() => removeLine(l.key)} className="text-gray-600 hover:text-red-400 text-xs ml-auto">Quitar</button>
                    </div>
                    {expanded && (
                      <div className="border-t border-gray-800 px-3 py-2.5 space-y-2">
                        {opts.length > 0 && (
                          <div className="space-y-1.5">
                            {opts.map(mod => {
                              const count = l.mods.find(m => m.name === mod.name)?.qty || 0
                              return (
                                <div key={mod.id} className="flex items-center gap-2">
                                  <span className="text-gray-300 text-xs flex-1 truncate">{mod.name} <span className="text-gray-500">{mod.price > 0 ? `+${clp(mod.price)}` : 'sin costo'}</span></span>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button onClick={() => setModCount(l.key, mod, Math.max(0, count - 1))} className="w-6 h-6 rounded bg-gray-800 hover:bg-gray-700 text-white text-sm">−</button>
                                    <span className="text-white text-xs w-4 text-center">{count}</span>
                                    <button onClick={() => setModCount(l.key, mod, count + 1)} className="w-6 h-6 rounded bg-gray-800 hover:bg-gray-700 text-white text-sm">+</button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                        <input value={l.note} onChange={e => setNote(l.key, e.target.value)} placeholder="Nota (ej: sin tomate, bien cocida)"
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-orange-500" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="border-t border-gray-800 p-4 shrink-0">
              <div className="flex items-center justify-between mb-3">
                <span className="text-gray-400">Total</span>
                <span className="text-white text-2xl font-bold">{clp(total)}</span>
              </div>
              <button onClick={confirm} disabled={cart.length === 0 || saving}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition">
                {saving ? 'Guardando…' : editing ? 'Guardar cambios e imprimir comanda' : 'Confirmar e imprimir comanda'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Cerrar caja
// ════════════════════════════════════════════════════════════════════════════
function CerrarCaja({ session, locName, stats, expectedCash, onClose, onClosed }) {
  const [counted, setCounted]   = useState('')
  const [card, setCard]         = useState('')
  const [transfer, setTransfer] = useState('')
  const [notes, setNotes]       = useState('')
  const [saving, setSaving]     = useState(false)

  const cashDiff     = counted === ''  ? null : (parseFloat(counted) || 0) - expectedCash
  const cardDiff     = card === ''     ? null : (parseFloat(card) || 0) - stats.tarjeta
  const transferDiff = transfer === '' ? null : (parseFloat(transfer) || 0) - stats.transferencia

  async function cerrar() {
    setSaving(true)
    const countedNum = parseFloat(counted) || 0
    const { error } = await supabase.from('cash_sessions').update({
      status: 'cerrada', closing_counted: countedNum, expected_cash: expectedCash,
      difference: countedNum - expectedCash,
      card_reported: card === '' ? null : (parseFloat(card) || 0),
      transfer_reported: transfer === '' ? null : (parseFloat(transfer) || 0),
      closed_at: new Date().toISOString(), notes: notes.trim() || null,
    }).eq('id', session.id)
    setSaving(false)
    if (error) { alert('No se pudo cerrar la caja: ' + error.message); return }
    onClosed()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-gray-950 rounded-2xl border border-gray-800 w-full max-w-md p-6 my-8">
        <h2 className="text-lg font-bold text-white mb-1">Cerrar caja — {locName}</h2>
        <p className="text-gray-500 text-sm mb-5">Cuadra el efectivo, la tarjeta y las transferencias contra lo que registró el sistema.</p>

        <p className="text-orange-400 text-xs uppercase tracking-wide font-medium mb-1.5">Efectivo</p>
        <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800 mb-2 text-sm">
          <Row label="Efectivo inicial" value={clp(session.opening_amount)} />
          <Row label="+ Ventas en efectivo" value={clp(stats.efectivo)} />
          <Row label="= Esperado en caja" value={clp(expectedCash)} bold />
        </div>
        <MoneyInput label="Efectivo real contado" value={counted} onChange={setCounted} autoFocus />
        <DiffBadge diff={cashDiff} />

        <p className="text-orange-400 text-xs uppercase tracking-wide font-medium mb-1.5 mt-5">Tarjeta</p>
        <div className="bg-gray-900 border border-gray-800 rounded-xl mb-2 text-sm">
          <Row label="Ventas con tarjeta (sistema)" value={clp(stats.tarjeta)} bold />
        </div>
        <MoneyInput label="Total impreso por la maquinita" value={card} onChange={setCard} />
        <DiffBadge diff={cardDiff} />

        <p className="text-orange-400 text-xs uppercase tracking-wide font-medium mb-1.5 mt-5">Transferencias</p>
        <div className="bg-gray-900 border border-gray-800 rounded-xl mb-2 text-sm">
          <Row label="Ventas por transferencia (sistema)" value={clp(stats.transferencia)} bold />
        </div>
        <MoneyInput label="Suma de transferencias recibidas" value={transfer} onChange={setTransfer} />
        <DiffBadge diff={transferDiff} />

        {stats.countPorPagar > 0 && (
          <div className="bg-amber-900/30 text-amber-400 rounded-lg px-3 py-2 text-sm mt-4">
            ⚠ Quedan {stats.countPorPagar} cuenta(s) con saldo por {clp(stats.totalPorPagar)}
          </div>
        )}

        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notas del cierre (opcional)" rows={2}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm mt-4 mb-4 focus:outline-none focus:border-orange-500" />

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2.5 rounded-lg transition">Cancelar</button>
          <button onClick={cerrar} disabled={saving || counted === ''}
            className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg transition">
            {saving ? 'Cerrando…' : 'Cerrar caja'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MoneyInput({ label, value, onChange, autoFocus }) {
  return (
    <>
      <label className="block text-sm text-gray-400 mb-1.5">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
        <input type="number" inputMode="numeric" value={value} onChange={e => onChange(e.target.value)} placeholder="0" autoFocus={autoFocus}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-7 pr-3 py-2.5 text-white text-lg focus:outline-none focus:border-orange-500" />
      </div>
    </>
  )
}

function DiffBadge({ diff }) {
  if (diff === null) return <div className="h-2" />
  return (
    <div className={`rounded-lg px-3 py-2 mt-2 text-sm font-medium ${diff === 0 ? 'bg-green-900/30 text-green-400' : diff > 0 ? 'bg-blue-900/30 text-blue-300' : 'bg-red-900/30 text-red-400'}`}>
      {diff === 0 ? '✓ Cuadrado exacto' : diff > 0 ? `Sobran ${clp(diff)}` : `Faltan ${clp(Math.abs(diff))}`}
    </div>
  )
}

function Row({ label, value, bold, muted, warn }) {
  return (
    <div className="flex justify-between px-3 py-2">
      <span className={warn ? 'text-amber-400' : muted ? 'text-gray-500' : 'text-gray-400'}>{label}</span>
      <span className={`${bold ? 'text-white font-bold' : warn ? 'text-amber-400 font-medium' : muted ? 'text-gray-500' : 'text-gray-300'}`}>{value}</span>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Impresión térmica 80mm — Comanda cocina (sin precios) / Pre-cuenta (con precios)
// ════════════════════════════════════════════════════════════════════════════
function ComandaPrint({ comanda }) {
  if (!comanda) return null
  const esCocina = comanda.mode === 'cocina'
  const fecha = new Date(comanda.created_at)
  return (
    <div id="comanda-area" className="hidden print:block">
      <div style={{ textAlign: 'center', borderBottom: '1px dashed #000', paddingBottom: 6, marginBottom: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 15, textTransform: 'uppercase' }}>THE HOUSE</div>
        <div style={{ fontSize: 12 }}>{comanda.locName}</div>
        <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{esCocina ? 'COMANDA COCINA' : 'PRE-CUENTA'}</div>
      </div>
      <div style={{ fontSize: 12, marginBottom: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Cuenta</span><span style={{ fontWeight: 700 }}>#{comanda.order_number}</span></div>
        {comanda.sale_code && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Código</span><span>{comanda.sale_code}</span></div>}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Cliente</span><span style={{ fontWeight: 700 }}>{comanda.customer_name || '—'}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Hora</span><span>{fecha.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></div>
      </div>
      <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '4px 0' }}>
        {comanda.items.map((it, i) => (
          <div key={i} style={{ margin: '4px 0', fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700 }}>{it.quantity}× {it.product_name}</span>
              {!esCocina && <span>{clp(Number(it.unit_price) * it.quantity)}</span>}
            </div>
            {(it.mods || []).map((m, j) => (
              <div key={j} style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 10, fontSize: 12 }}>
                <span>+ {m.qty > 1 ? `${m.qty}× ` : ''}{m.name}</span>
                {!esCocina && <span>{Number(m.price) > 0 ? clp(Number(m.price) * Number(m.qty || 1) * it.quantity) : ''}</span>}
              </div>
            ))}
            {it.note && <div style={{ paddingLeft: 10, fontSize: 12, fontWeight: 700 }}>» {it.note}</div>}
          </div>
        ))}
      </div>
      {!esCocina && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, marginTop: 6 }}>
          <span>TOTAL</span><span>{clp(comanda.total)}</span>
        </div>
      )}
      <div style={{ textAlign: 'center', fontSize: 11, marginTop: 8, borderTop: '1px dashed #000', paddingTop: 6 }}>
        {esCocina ? '— Cocina —' : 'Documento no válido como boleta'}
      </div>
    </div>
  )
}

function PrintStyles() {
  return (
    <style>{`
      @media print {
        @page { size: 80mm auto; margin: 3mm; }
        body { background: #fff; font-family: 'Courier New', monospace; color: #000; }
        body * { visibility: hidden !important; }
        #comanda-area, #comanda-area * { visibility: visible !important; }
        #comanda-area { position: absolute; left: 0; top: 0; width: 74mm; color: #000; }
      }
    `}</style>
  )
}
