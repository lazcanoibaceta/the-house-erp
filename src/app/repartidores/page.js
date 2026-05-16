'use client'

import { useState } from 'react'
import * as XLSX from 'xlsx'

function serialToDateKey(serial) {
  const ms = Math.round((Math.floor(serial) - 25569) * 86400 * 1000)
  return new Date(ms).toISOString().split('T')[0]
}

function serialToTime(serial) {
  const fraction = serial - Math.floor(serial)
  const mins = Math.round(fraction * 24 * 60)
  const h = Math.floor(mins / 60).toString().padStart(2, '0')
  const m = (mins % 60).toString().padStart(2, '0')
  return `${h}:${m}`
}

export default function Repartidores() {
  const [datos, setDatos] = useState(null)
  const [archivo, setArchivo] = useState('')
  const [diaActivo, setDiaActivo] = useState(null)
  const [asignaciones, setAsignaciones] = useState({})
  const [error, setError] = useState(null)

  function procesarExcel(file) {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

        const validas = rows.filter(r => r['Estado'] !== 'Anulada' && r['Despacho'] > 0)

        const byDay = {}
        for (const row of validas) {
          const dateKey = serialToDateKey(row['Fecha de creación'])
          if (!byDay[dateKey]) byDay[dateKey] = { conRepartidor: [], sinRepartidor: [] }
          if (row['Repartidor']) {
            byDay[dateKey].conRepartidor.push(row)
          } else {
            byDay[dateKey].sinRepartidor.push(row)
          }
        }

        const repartidores = [...new Set(rows.map(r => r['Repartidor']).filter(Boolean))]
        const dias = Object.keys(byDay).sort()

        setDatos({ byDay, repartidores })
        setDiaActivo(dias[0])
        setAsignaciones({})
        setError(null)
      } catch (err) {
        setError('Error al procesar el archivo: ' + err.message)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setArchivo(file.name)
    procesarExcel(file)
  }

  function asignar(idCuenta, repartidor) {
    setAsignaciones(prev => ({ ...prev, [idCuenta]: repartidor }))
  }

  if (!datos) {
    return (
      <main className="min-h-screen bg-gray-950 p-4 md:p-8">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-white">🛵 Repartidores</h1>
            <p className="text-gray-500 text-sm mt-1">Sube el Excel de Justo Hub para ver los despachos del día</p>
          </div>
          <div className="bg-gray-900 rounded-2xl p-8 border border-gray-800">
            <label className="flex flex-col items-center gap-3 cursor-pointer">
              <span className="text-4xl">📋</span>
              <span className="text-white font-semibold">Seleccionar Excel de Justo Hub</span>
              <span className="text-gray-500 text-sm text-center">
                Exportado desde "Ventas" en Justo Hub (.xlsx)<br />
                Puede ser de un día o varios días
              </span>
              <input type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
              <span className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2 rounded-lg text-sm font-semibold transition">
                Elegir archivo
              </span>
            </label>
          </div>
          {error && (
            <div className="mt-4 bg-red-950 border border-red-800 text-red-300 rounded-xl p-4">❌ {error}</div>
          )}
        </div>
      </main>
    )
  }

  const dias = Object.keys(datos.byDay).sort()
  const dia = datos.byDay[diaActivo] || { conRepartidor: [], sinRepartidor: [] }

  // Totales por repartidor para el día activo, incluyendo asignaciones manuales
  const totales = {}
  for (const row of dia.conRepartidor) {
    const name = row['Repartidor']
    totales[name] = (totales[name] || 0) + row['Despacho']
  }
  for (const row of dia.sinRepartidor) {
    const asignado = asignaciones[row['Id Cuenta']]
    if (asignado) totales[asignado] = (totales[asignado] || 0) + row['Despacho']
  }

  const pendientes = dia.sinRepartidor.filter(r => !asignaciones[r['Id Cuenta']])
  const totalDia = Object.values(totales).reduce((s, v) => s + v, 0)

  return (
    <main className="min-h-screen bg-gray-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">🛵 Repartidores</h1>
            <p className="text-gray-500 text-sm mt-0.5 truncate max-w-xs">{archivo}</p>
          </div>
          <button
            onClick={() => { setDatos(null); setArchivo('') }}
            className="text-gray-400 hover:text-white text-sm transition shrink-0"
          >
            Cargar otro →
          </button>
        </div>

        {/* Tabs por día */}
        {dias.length > 1 && (
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
            {dias.map(d => (
              <button
                key={d}
                onClick={() => setDiaActivo(d)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  diaActivo === d
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {new Date(d + 'T12:00:00Z').toLocaleDateString('es-CL', {
                  weekday: 'short', day: 'numeric', month: 'short'
                })}
              </button>
            ))}
          </div>
        )}

        {/* Encabezado del día */}
        <div className="bg-gray-900 rounded-2xl p-4 border border-orange-500 mb-4">
          <p className="text-orange-400 text-xs uppercase tracking-wide mb-1">
            {new Date(diaActivo + 'T12:00:00Z').toLocaleDateString('es-CL', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
            })}
          </p>
          <div className="flex items-end justify-between">
            <p className="text-white font-bold text-2xl">${totalDia.toLocaleString('es-CL')}</p>
            <p className="text-gray-500 text-sm">
              {dia.conRepartidor.length + dia.sinRepartidor.filter(r => asignaciones[r['Id Cuenta']]).length} despachos asignados
              {pendientes.length > 0 && ` · ${pendientes.length} sin asignar`}
            </p>
          </div>
        </div>

        {/* Tabla repartidores */}
        {Object.keys(totales).length > 0 && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 mb-4 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800">
              <h3 className="text-white font-semibold">Por repartidor</h3>
            </div>
            {Object.entries(totales)
              .sort((a, b) => b[1] - a[1])
              .map(([name, total]) => {
                const ordenes = [
                  ...dia.conRepartidor.filter(r => r['Repartidor'] === name),
                  ...dia.sinRepartidor.filter(r => asignaciones[r['Id Cuenta']] === name),
                ]
                return (
                  <div key={name} className="flex items-center justify-between px-4 py-3 border-b border-gray-800 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-orange-900/60 flex items-center justify-center text-orange-400 font-bold">
                        {name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-white font-medium">{name}</p>
                        <p className="text-gray-500 text-xs">{ordenes.length} despacho{ordenes.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <span className="text-green-400 font-bold text-xl">${total.toLocaleString('es-CL')}</span>
                  </div>
                )
              })}
          </div>
        )}

        {/* Sin repartidor asignado */}
        {dia.sinRepartidor.length > 0 && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-white font-semibold">Sin repartidor asignado</h3>
              {pendientes.length > 0 && (
                <span className="text-xs bg-yellow-900/50 text-yellow-400 px-2 py-0.5 rounded-full">
                  {pendientes.length} pendiente{pendientes.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {dia.sinRepartidor.map(row => {
              const asignado = asignaciones[row['Id Cuenta']]
              return (
                <div
                  key={row['Id Cuenta']}
                  className={`px-4 py-3 border-b border-gray-800 last:border-0 transition ${asignado ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium truncate">
                        {row['Cliente'] || 'Sin nombre'}
                      </p>
                      <p className="text-gray-500 text-xs mt-0.5">
                        {serialToTime(row['Fecha de creación'])} · {row['Cuenta']} · {row['Plataforma']}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-yellow-400 font-semibold">${row['Despacho'].toLocaleString('es-CL')}</span>
                      {asignado ? (
                        <div className="flex items-center gap-1">
                          <span className="text-green-400 text-xs bg-green-900/30 px-2 py-1 rounded-lg">{asignado}</span>
                          <button
                            onClick={() => setAsignaciones(prev => { const n = {...prev}; delete n[row['Id Cuenta']]; return n })}
                            className="text-gray-600 hover:text-gray-400 text-xs"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <select
                          onChange={e => e.target.value && asignar(row['Id Cuenta'], e.target.value)}
                          defaultValue=""
                          className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg px-2 py-1.5 cursor-pointer"
                        >
                          <option value="" disabled>Asignar →</option>
                          {datos.repartidores.map(r => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

      </div>
    </main>
  )
}
