export const ESTADOS = [
  { value: "pendiente", label: "Pendiente", activo: "bg-zinc-600 text-white" },
  { value: "cumplida", label: "Cumplida", activo: "bg-green-600 text-white" },
  { value: "parcial", label: "Parcial", activo: "bg-yellow-500 text-white" },
  { value: "no_cumplida", label: "No cumplida", activo: "bg-accent text-white" },
];

export const MOTIVOS = [
  { value: "falta_material", label: "Falta de material" },
  { value: "clima", label: "Clima" },
  { value: "falta_personal", label: "Falta de personal" },
  { value: "otro", label: "Otro" },
];

export const TIPOS = [
  { value: "programada", label: "Programada", color: "bg-blue-100 text-blue-800" },
  { value: "puntual", label: "Puntual", color: "bg-zinc-100 text-zinc-700" },
];
