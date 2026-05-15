'use client'

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center flex flex-col items-center gap-6 px-4">
        <img
          src="/logo.png"
          alt="The House"
          width={200}
          className="object-contain"
          onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block' }}
        />
        <span className="hidden text-white font-bold text-3xl">The House</span>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white">The House ERP</h1>
          <p className="text-gray-500 text-sm max-w-xs leading-relaxed">
            Sistema de gestión para The House — controla compras, ventas, costos y resultados de San Felipe y Los Andes.
          </p>
        </div>
      </div>
    </main>
  )
}
