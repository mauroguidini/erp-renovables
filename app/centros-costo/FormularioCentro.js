"use client";

// Los campos del formulario de un centro de costos — se usa tanto para dar
// de alta uno nuevo (centros-costo/nueva) como para editar uno ya cargado
// (el "Editar" de cada fila en la lista).
export default function FormularioCentro({ form, setForm, obras }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label className="block text-xs font-medium text-zinc-700">Número *</label>
        <input
          required
          type="number"
          step="1"
          value={form.numero}
          onChange={(e) => setForm((f) => ({ ...f, numero: e.target.value }))}
          placeholder="Ej: 100"
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-700">Nombre *</label>
        <input
          required
          type="text"
          value={form.nombre}
          onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
          placeholder='Ej: "Vehículos" o "Obra Cangallo"'
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-700">Tipo *</label>
        <select
          required
          value={form.tipo}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              tipo: e.target.value,
              obra_id: e.target.value === "general" ? "" : f.obra_id,
            }))
          }
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
        >
          <option value="obra">Obra</option>
          <option value="general">General</option>
        </select>
      </div>
      {form.tipo === "obra" && (
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-zinc-700">
            Obra vinculada (opcional)
          </label>
          <select
            value={form.obra_id}
            onChange={(e) => setForm((f) => ({ ...f, obra_id: e.target.value }))}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
          >
            <option value="">Sin vincular todavía</option>
            {obras.map((o) => (
              <option key={o.id} value={o.id}>
                {o.direccion}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-zinc-400">
            Se puede dejar sin vincular y completar después, cuando la obra exista en el sistema.
          </p>
        </div>
      )}
    </div>
  );
}
