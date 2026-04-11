import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <h1 className="text-3xl font-bold text-gray-800 mb-2">The House ERP</h1>
      <p className="text-gray-500 mb-8">Panel de administración</p>

      <div className="grid grid-cols-1 gap-4">
        <Link href="/inventario">
          <div className="bg-white rounded-2xl p-6 shadow hover:shadow-md transition cursor-pointer">
            <h2 className="text-xl font-semibold text-gray-700">📦 Inventario</h2>
            <p className="text-gray-400 text-sm mt-1">Gestión de insumos y stock</p>
          </div>
        </Link>
        <Link href="/compras">
  <div className="bg-white rounded-2xl p-6 shadow hover:shadow-md transition cursor-pointer">
    <h2 className="text-xl font-semibold text-gray-700">🛒 Compras</h2>
    <p className="text-gray-400 text-sm mt-1">Registro de compras a proveedores</p>
  </div>
</Link>
      </div>
    </main>
  )
}
