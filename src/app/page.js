'use client'

import { useLocation } from '@/hooks/useLocation'
import Link from 'next/link'

export default function Home() {
  const { locationCode } = useLocation()

  const kpis = [
    {
      label: 'Food Cost',
      value: '-',
      unit: '%',
      meta: 'Meta 28–32%',
      color: 'text-yellow-400',
    },
    {
      label: 'Labor Cost',
      value: '-',
      unit: '%',
      meta: 'Meta 25–30%',
      color: 'text-blue-400',
    },
    {
      label: 'Prime Cost',
      value: '-',
      unit: '%',
      meta: 'Meta <60%',
      color: 'text-purple-400',
    },
    {
      label: 'Ticket Promedio',
      value: '-',
      unit: '',
      meta: 'Por pedido',
      color: 'text-green-400',
    },
    {
      label: 'Descuentos',
      value: '9,6',
      unit: '%',
      meta: 'Meta bajar a 6%',
      color: 'text-red-400',
    },
    {
      label: 'Retención 60 días',
      value: '-',
      unit: '%',
      meta: 'Clientes que repiten',
      color: 'text-orange-400',
    },
  ]

  return (
    <main className="min-h-screen bg-gray-950 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">

        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Panel principal</h1>
            <p className="text-gray-500 text-sm mt-1">Resumen del negocio</p>
          </div>
          <span className="bg-orange-500 text-white text-sm font-bold px-3 py-1 rounded-lg">
            {locationCode}
          </span>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10">
          {kpis.map(kpi => (
            <div key={kpi.label} className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">{kpi.label}</p>
              <p className={`text-3xl font-bold ${kpi.color}`}>
                {kpi.value}{kpi.unit && <span className="text-lg ml-1">{kpi.unit}</span>}
              </p>
              <p className="text-gray-600 text-xs mt-2">{kpi.meta}</p>
            </div>
          ))}
        </div>

        {/* Módulos */}
        <h2 className="text-gray-400 text-sm uppercase tracking-wide mb-4">Módulos</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link href="/inventario" className="bg-gray-900 rounded-2xl p-6 border border-gray-800 hover:border-orange-500 transition">
            <p className="text-white font-semibold">📦 Inventario</p>
            <p className="text-gray-500 text-sm mt-1">Gestión de insumos y stock</p>
          </Link>
          <Link href="/compras" className="bg-gray-900 rounded-2xl p-6 border border-gray-800 hover:border-orange-500 transition">
            <p className="text-white font-semibold">🛒 Compras</p>
            <p className="text-gray-500 text-sm mt-1">Registro de compras a proveedores</p>
          </Link>
          <Link href="/inventario/conteo" className="bg-gray-900 rounded-2xl p-6 border border-gray-800 hover:border-orange-500 transition">
            <p className="text-white font-semibold">📋 Conteo</p>
            <p className="text-gray-500 text-sm mt-1">Conteo físico de inventario</p>
          </Link>
          <Link href="/ventas" className="bg-gray-900 rounded-2xl p-6 border border-gray-800 hover:border-orange-500 transition">
            <p className="text-white font-semibold">📊 Ventas</p>
            <p className="text-gray-500 text-sm mt-1">Importar y analizar ventas</p>
          </Link>
        </div>

      </div>
    </main>
  )
}