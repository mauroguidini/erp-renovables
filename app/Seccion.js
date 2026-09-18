"use client";

import { useState } from "react";

// Envoltorio visual compartido: una sección que arranca plegada mostrando
// solo el título, y se despliega al tocarla. Puramente de presentación —
// no toca ningún dato ni lógica de lo que envuelve.
//
// tono="peligro" es para secciones de acciones destructivas (ej: "Zona
// peligrosa") — mismo comportamiento, solo cambia el color para que se
// note que es distinta.
export default function Seccion({ titulo, defaultAbierto = false, tono = "normal", children }) {
  const [abierto, setAbierto] = useState(defaultAbierto);
  const esPeligro = tono === "peligro";

  return (
    <div
      className={`mt-4 rounded-lg border bg-white p-4 sm:mt-6 sm:p-5 ${
        esPeligro ? "border-accent/30" : "border-zinc-200"
      }`}
    >
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="text-xs text-zinc-400">{abierto ? "▾" : "▸"}</span>
        <h2
          className={`text-base font-semibold sm:text-lg ${
            esPeligro ? "text-accent" : "text-primary"
          }`}
        >
          {titulo}
        </h2>
      </button>
      {abierto && <div className="mt-3 sm:mt-4">{children}</div>}
    </div>
  );
}
