# The House ERP — Memoria de cálculos contables (para validación)

**Contexto:** ERP de una hamburguesería en Chile, 2 locales (SF = San Felipe, LA = Los Andes). Vende presencial y por delivery (Justo, PedidosYa). IVA Chile = 19%. Todo el modelo financiero trabaja **en neto**; el IVA se trata como flujo fiscal (no entra al estado de resultados).

---

## 1. Convención de IVA (regla base de todo)

| Concepto | Cómo se guarda | Para obtener el neto |
|---|---|---|
| **Compras de insumos** | NETO (sin IVA) | ya es neto |
| **Precio de venta (carta)** | CON IVA (precio al cliente) | precio ÷ 1,19 |
| **Ventas (`total_sales`)** | CON IVA | ventas ÷ 1,19 |
| **Gasto con factura** | usuario ingresa el NETO | neto directo; total = neto × 1,19 |
| **Gasto con boleta** | usuario ingresa el TOTAL | neto = total ÷ 1,19 |
| **Gasto "otro" (sin doc)** | sin IVA | neto = total |
| **Costo laboral** | monto total del mes | sin IVA (sueldos exentos) |

**Punto clave:** el estado de resultados se calcula 100% en neto. El IVA no es ni ingreso ni gasto; es un flujo aparte (débito/crédito fiscal).

---

## 2. Importación de VENTAS (API de Justo v3)

Se consultan todas las órdenes ("tabs") del mes por local. Por cada orden:

- **`foodSales(orden)` = `totalPrice` − costo de despacho (deliveryFee)**
  → se resta el despacho porque ese ingreso es del repartidor/plataforma, no del local.
- `totalPrice` es el **precio de menú que pagó el cliente, CON IVA, y ya descontadas las promociones** (es el precio final cobrado).

**Valores que se calculan y guardan (todos CON IVA):**
- `total_sales` = suma de `foodSales` de las órdenes activas (cerradas y no canceladas).
- Ventas por canal (justo / pedidosya / pos-presencial), por día de semana, por método de pago.
- `total_discounts` = suma de descuentos aplicados (solo informativo; **NO se vuelve a restar** en el P&L porque las ventas ya están netas de descuento).
- Unidades vendidas por producto (para costeo y merma).

**Punto crítico para validar:** las ventas de PedidosYa se registran al **precio bruto de menú (con la comisión incluida, antes de que PedidosYa la descuente)**. La comisión se trata como un costo aparte (ver sección 4). Por eso **restar la comisión una vez es correcto, no hay doble conteo.**

---

## 3. Compras y costo promedio de insumos

- Las compras se ingresan en **neto**. Cada compra tiene ítems: insumo, cantidad, precio unitario (neto).
- **Costo promedio ponderado por insumo y por local** (`avg_cost`):
  → `avg_cost = Σ(cantidad × precio_unitario_neto) / Σ(cantidad)` de las últimas compras.
- Este `avg_cost` neto se usa para **valorizar inventarios** (food cost) y **costear recetas**.

---

## 4. Comisiones de delivery / pago (entran al P&L como gasto)

### 4a. PedidosYa (importación semanal de liquidación)
- De la liquidación se leen por local: ventas brutas, comisión ("Comisión por pedidos"), cargos plus ("Costo por pedido plus").
- **La comisión en la liquidación viene NETA** (el IVA aparece en línea separada "Impuesto en comisiones - IVA", que es ~19% de la comisión). *Verificado con liquidación real: comisión 299.539 + IVA 56.953 = 19%.*
- Se crea un **gasto operativo** por local:
  - `amount_net` = comisión + cargos plus (neto, tal cual)
  - `amount_total` = neto × 1,19
  - Categoría "Comisiones", fecha = fin de la semana liquidada.
- Este gasto **sí entra al estado de resultados**. (La liquidación cruda se guarda aparte solo para análisis.)

### 4b. MercadoPago (procesa los pagos con Tarjeta presenciales)
- Factura mensual única de la empresa (un solo total neto, ej. $191.055).
- Se **prorratea entre SF y LA según las ventas con "Tarjeta"** de cada local:
  → `gasto_local = total_factura_neto × (ventas_tarjeta_local / ventas_tarjeta_totales)`
- Crea 2 gastos (uno por local), categoría Comisiones, neto + IVA.
- *Solo "Tarjeta" es base, porque PedidosYa/Justo/Amipass los procesa otro; efectivo y transferencia no pasan por MercadoPago.*

---

## 5. Costeo y margen por producto

Por cada producto de la carta:
- `precio_neto = precio_venta_con_IVA / 1,19`
- `costo = Σ (cantidad_receta × costo_neto_insumo)` — explotando sub-recetas a ingredientes base.
- `margen % = (precio_neto − costo) / precio_neto × 100`
- `food_cost % = costo / precio_neto × 100`

**Recetas y sub-recetas:**
- Receta: producto → insumos con cantidad (ej. hamburguesa → 0,12 kg de Blend de Carnes).
- Sub-receta: insumo preparado → ingredientes base (ej. Blend = 0,28 Sobrecostilla + 0,28 Tapapecho + 0,28 Plateada + 0,16 Grasa = 1 kg). Al usar Blend, se descuenta de los cortes + grasa.

---

## 6. Food Cost mensual (el del estado de resultados)

Método de **inventario real** (no teórico). Usa los 2 conteos físicos de cierre de mes que enmarcan el período:

```
Costo de mercadería = Inventario inicial + Compras − Inventario final
Food Cost % = Costo de mercadería / Ventas netas × 100
```

Donde:
- **Inventario inicial/final** = Σ (cantidad contada × `avg_cost` neto), valorizado a costo promedio.
- **Compras** = suma de todas las compras (neto) entre los dos conteos.
- **Ventas netas** = `total_sales` del período ÷ 1,19.

> Como es por inventario real, este food cost **ya incluye la merma** (lo que se perdió/desperdició está en el consumo real).

---

## 7. Merma (consumo teórico vs real) — reporte de control

Compara, **a nivel de ingrediente base**:

- **Consumo teórico** = Σ (unidades vendidas de cada producto × cantidad de receta), explotando sub-recetas.
- **Consumo real** = Inventario inicial + Compras (en cantidad) − Inventario final, explotando los preparados (el "blend" contado se cuenta como cortes).
- **Merma = real − teórico**, valorizada a `avg_cost` neto.
- Insumos que se consumen pero ninguna receta usa (mantequilla a ojo, bebidas de reventa) se reportan como "consumo directo", fuera de la merma.

*(Esto es un reporte de control, separado del food cost del P&L.)*

---

## 8. Estado de Resultados (P&L) mensual, por local o ambos

```
  Ventas Netas            = total_sales ÷ 1,19                     (100%)
− Food Cost               = invInicial + compras − invFinal        (% s/ventas netas)
− Packaging               = costo estimado de envases por unidad vendida
− Costo Laboral           = monto mensual ingresado (sueldos + leyes)
− Gastos Operativos       = Σ amount_net de todos los gastos del mes
                            (arriendo, servicios, gas, comisiones PeYa + MercadoPago, etc.)
─────────────────────────────────────────────
= Resultado               = Ventas netas − Food − Packaging − Labor − Gastos

Prime Cost % = (Food Cost + Labor) / Ventas netas × 100   (meta ≤ 60%)
```

- Todos los montos en **neto**.
- **Packaging**: costo de envase por unidad según tipo de producto, sumado sobre las unidades vendidas (estimación, neto).
- **Gastos Operativos** leen la tabla de gastos (`amount_net`). Aquí entran ahora las comisiones de PedidosYa y MercadoPago.
- **Resultado** es el **resultado operacional**.

---

## 9. Qué NO incluye / supuestos (para que el validador lo evalúe)

- **No incluye** (debajo del resultado operacional): impuesto a la renta, **depreciación de equipos**, costos financieros/intereses, retiros del dueño.
- **IVA**: tratado como pass-through (no entra al P&L). El P&L es todo neto. *(¿Correcto? Sí en términos de resultado, pero el flujo de caja del IVA es aparte.)*
- **Descuentos**: ya vienen restados en las ventas (no se restan de nuevo).
- **Food cost por inventario**: depende de la calidad de los conteos físicos. Un error de conteo distorsiona el mes.
- **Costo laboral**: se ingresa manual; incluye lo que el dueño cargue (idealmente sueldo líquido + leyes sociales + finiquitos).
- **Comisión delivery**: las ventas se registran brutas y la comisión se resta una vez como gasto (verificado, sin doble conteo).
- **Packaging** es una estimación por receta de envase, no un gasto real conciliado.
