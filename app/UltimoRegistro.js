"use client";

// Texto de referencia informativo: "último registro cargado", para no
// cargar dos veces lo mismo. Solo lee y muestra — no cambia cómo se carga
// nada. `texto` ya viene armado por quien lo usa (cada módulo arma su propia
// frase con sus propios datos); este componente solo pone el estilo.
export default function UltimoRegistro({ cargando, texto }) {
  if (cargando) return null;

  return (
    <div className="mb-4 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
      {texto ?? "Todavía no hay registros cargados."}
    </div>
  );
}
