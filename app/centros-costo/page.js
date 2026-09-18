"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../RoleContext";
import Seccion from "../Seccion";
import ImportarCentrosCosto from "./ImportarCentrosCosto";
import FormularioCentro from "./FormularioCentro";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function anioActual() {
  return new Date().getFullYear();
}

function fechaLegible(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-AR");
}

function formatearMonto(monto) {
  return Number(monto).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  });
}

// Una nota de crédito resta en vez de sumar (ver 052) — mismo criterio que
// en la pantalla de Facturas de compra.
function montoFirmado(fila) {
  const monto = Number(fila.importe_total);
  return fila.tipo_documento === "nota_credito" ? -monto : monto;
}

// Del año y mes elegidos (mes "" = todo el año) arma el rango de fechas a
// filtrar. Los totales y el detalle usan siempre este mismo rango.
function rangoFechas(anio, mes) {
  if (mes === "") {
    return { desde: `${anio}-01-01`, hasta: `${anio}-12-31` };
  }
  const mesNum = Number(mes);
  const ultimoDia = new Date(anio, mesNum, 0).getDate();
  const mm = String(mesNum).padStart(2, "0");
  return { desde: `${anio}-${mm}-01`, hasta: `${anio}-${mm}-${String(ultimoDia).padStart(2, "0")}` };
}

function Centro({ centro, obras, onCambio }) {
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  function iniciarEdicion() {
    setForm({
      numero: String(centro.numero),
      nombre: centro.nombre,
      tipo: centro.tipo,
      obra_id: centro.obra_id ?? "",
    });
    setError(null);
    setEditando(true);
  }

  async function handleGuardar(e) {
    e.preventDefault();
    if (!form.nombre.trim() || form.numero === "") return;

    setGuardando(true);
    setError(null);

    const { error } = await supabase
      .from("centros_costo")
      .update({
        numero: Number(form.numero),
        nombre: form.nombre.trim(),
        tipo: form.tipo,
        obra_id: form.tipo === "obra" ? form.obra_id || null : null,
      })
      .eq("id", centro.id);

    if (error) {
      setError(error.message);
      setGuardando(false);
      return;
    }

    setGuardando(false);
    setEditando(false);
    await onCambio();
  }

  async function handleToggleActivo() {
    setGuardando(true);
    setError(null);
    const { error } = await supabase
      .from("centros_costo")
      .update({ activo: !centro.activo })
      .eq("id", centro.id);
    if (error) setError(error.message);
    setGuardando(false);
    await onCambio();
  }

  const nombreObra = obras.find((o) => o.id === centro.obra_id)?.direccion;

  if (editando) {
    return (
      <form onSubmit={handleGuardar} className="py-3">
        <FormularioCentro form={form} setForm={setForm} obras={obras} />

        {error && (
          <p className="mt-2 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>
        )}

        <div className="mt-3 flex gap-2">
          <button
            type="submit"
            disabled={guardando}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {guardando ? "Guardando..." : "Guardar"}
          </button>
          <button
            type="button"
            onClick={() => setEditando(false)}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-3">
      <div>
        <p className={`text-sm font-medium ${centro.activo ? "text-zinc-900" : "text-zinc-400 line-through"}`}>
          {centro.numero} — {centro.nombre}
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {centro.tipo === "obra" ? `Obra${nombreObra ? `: ${nombreObra}` : " (sin vincular)"}` : "General"}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Link
          href={`/centros-costo/${centro.id}`}
          className="text-xs font-medium text-zinc-500 hover:text-primary hover:underline"
        >
          Ver gastos
        </Link>
        <button onClick={handleToggleActivo} disabled={guardando} className="text-xs font-medium text-zinc-500 hover:text-primary hover:underline disabled:opacity-50">
          {centro.activo ? "Desactivar" : "Activar"}
        </button>
        <button onClick={iniciarEdicion} className="text-xs font-medium text-zinc-500 hover:text-primary hover:underline">
          Editar
        </button>
      </div>
      {error && (
        <p className="w-full rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>
      )}
    </div>
  );
}

function DetalleCentro({ centroId, desde, hasta }) {
  const [cargando, setCargando] = useState(true);
  const [facturas, setFacturas] = useState([]);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);

    let query = supabase
      .from("facturas_compra")
      .select("*, proveedores(nombre)")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: false });

    query = centroId === null ? query.is("centro_costo_id", null) : query.eq("centro_costo_id", centroId);

    query.then(({ data }) => {
      if (!cancelado) {
        setFacturas(data ?? []);
        setCargando(false);
      }
    });

    return () => {
      cancelado = true;
    };
  }, [centroId, desde, hasta]);

  if (cargando) return <p className="mt-2 text-xs text-zinc-500">Cargando...</p>;

  if (facturas.length === 0) {
    return <p className="mt-2 text-xs text-zinc-500">Sin facturas en este período.</p>;
  }

  return (
    <ul className="mt-2 space-y-1.5">
      {facturas.map((f) => {
        const esNota = f.tipo_documento === "nota_credito";
        return (
          <li key={f.id} className="text-xs text-zinc-600">
            {fechaLegible(f.fecha)} · {f.proveedores?.nombre ?? "—"} ·{" "}
            {esNota ? "Nota de crédito" : "Factura"} {f.tipo_factura} n.º {f.numero_factura} ·{" "}
            <span className={esNota ? "text-accent" : ""}>
              {esNota ? "− " : ""}
              {formatearMonto(f.importe_total)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function FilaTotal({ nombre, total, centroId, desde, hasta }) {
  const [abierto, setAbierto] = useState(false);

  // Un centro real linkea a su vista de detalle (filtros, agrupados y
  // buscador) — "Sin centro asignado" no tiene id, así que se queda con el
  // acordeón simple de siempre.
  if (centroId !== null) {
    return (
      <div className="py-3">
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`/centros-costo/${centroId}`}
            className="text-left text-sm font-medium text-zinc-900 hover:text-primary hover:underline"
          >
            {nombre}
          </Link>
          <span className="text-sm font-semibold text-zinc-900">{formatearMonto(total)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setAbierto((v) => !v)}
          className="text-left text-sm font-medium text-zinc-900 hover:text-primary"
        >
          {abierto ? "▾" : "▸"} {nombre}
        </button>
        <span className="text-sm font-semibold text-zinc-900">{formatearMonto(total)}</span>
      </div>
      {abierto && <DetalleCentro centroId={centroId} desde={desde} hasta={hasta} />}
    </div>
  );
}

export default function CentrosCosto() {
  const role = useRole();
  const puedeGestionar = role === "administrador" || role === "administracion";

  const [obras, setObras] = useState([]);
  const [centros, setCentros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [anio, setAnio] = useState(anioActual());
  const [mes, setMes] = useState("");
  const [totales, setTotales] = useState(null);
  const [cargandoTotales, setCargandoTotales] = useState(true);

  const [aplicandoRegla, setAplicandoRegla] = useState(false);
  const [mensajeRegla, setMensajeRegla] = useState(null);
  const [errorRegla, setErrorRegla] = useState(null);

  const cargarCentros = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from("centros_costo")
      .select("*")
      .order("numero");
    if (error) setError(error.message);
    else setError(null);
    setCentros(data ?? []);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargarCentros();
    supabase
      .from("obras_visibles")
      .select("id, direccion")
      .order("direccion")
      .then(({ data }) => setObras(data ?? []));
  }, [cargarCentros]);

  const { desde, hasta } = rangoFechas(anio, mes);

  const cargarTotales = useCallback(async () => {
    setCargandoTotales(true);
    const { data } = await supabase
      .from("facturas_compra")
      .select("centro_costo_id, importe_total, tipo_documento")
      .gte("fecha", desde)
      .lte("fecha", hasta);

    const porCentro = {};
    let sinCentro = 0;
    for (const f of data ?? []) {
      if (f.centro_costo_id) {
        porCentro[f.centro_costo_id] = (porCentro[f.centro_costo_id] ?? 0) + montoFirmado(f);
      } else {
        sinCentro += montoFirmado(f);
      }
    }
    setTotales({ porCentro, sinCentro });
    setCargandoTotales(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta]);

  useEffect(() => {
    cargarTotales();
  }, [cargarTotales]);

  // Pasada única (058): la regla de "proveedor habitual" (057) solo actúa
  // al insertar una factura nueva — esto reprocesa las que ya estaban
  // cargadas sin centro, para las que recién ahora tienen un proveedor
  // habitual asignado a un único centro.
  async function handleAplicarRegla() {
    const confirmado = window.confirm(
      "Esto va a imputar automáticamente todas las facturas sin centro cuyo proveedor sea habitual de un solo centro. ¿Continuar?"
    );
    if (!confirmado) return;

    setAplicandoRegla(true);
    setErrorRegla(null);
    setMensajeRegla(null);

    const { data, error } = await supabase.rpc("aplicar_regla_centro_costo_historico");

    if (error) {
      setErrorRegla(error.message);
      setAplicandoRegla(false);
      return;
    }

    setMensajeRegla(
      data > 0
        ? `Se imputaron ${data} facturas que estaban sin centro.`
        : "No había facturas para imputar con la regla actual."
    );
    setAplicandoRegla(false);
    await cargarTotales();
  }

  if (!puedeGestionar) {
    return (
      <div className="min-h-screen bg-zinc-50 p-4 font-sans sm:p-8">
        <div className="mx-auto max-w-3xl">
          <p className="text-zinc-600">No tenés acceso a esta pantalla.</p>
        </div>
      </div>
    );
  }

  const centrosActivos = centros.filter((c) => c.activo);
  const totalGeneral =
    Object.values(totales?.porCentro ?? {}).reduce((a, b) => a + b, 0) + (totales?.sinCentro ?? 0);

  return (
    <div className="min-h-screen bg-zinc-50 p-4 font-sans sm:p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold text-primary">Centros de costos</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Registro interno para saber cuánto se gasta en cada cosa. Por ahora suma facturas de
          compra imputadas — sin comparación contra presupuesto todavía.
        </p>

        <div className="mt-4 flex justify-end sm:mt-6">
          <Link
            href="/centros-costo/nueva"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
          >
            + Nuevo centro
          </Link>
        </div>

        <ImportarCentrosCosto obras={obras} onCentrosImportados={cargarCentros} />

        <Seccion titulo="Aplicar proveedores habituales a facturas ya cargadas">
          <p className="text-sm text-zinc-500">
            La imputación automática por proveedor habitual solo actúa en facturas nuevas. Usá
            esto después de agregar o cambiar proveedores habituales de un centro, para que las
            facturas que ya estaban cargadas sin centro se imputen también (solo si su proveedor
            es habitual de un único centro).
          </p>

          {errorRegla && (
            <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
              {errorRegla}
            </p>
          )}
          {mensajeRegla && (
            <p className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
              {mensajeRegla}
            </p>
          )}

          <button
            type="button"
            onClick={handleAplicarRegla}
            disabled={aplicandoRegla}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {aplicandoRegla ? "Aplicando..." : "Aplicar a facturas sin centro"}
          </button>
        </Seccion>

        <Seccion titulo="Centros" defaultAbierto>
          {error && (
            <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>
          )}

          {cargando && <p className="mt-4 text-sm text-zinc-600">Cargando...</p>}

          {!cargando && centros.length === 0 && (
            <p className="mt-4 text-sm text-zinc-600">Todavía no hay centros de costos cargados.</p>
          )}

          {!cargando && centros.length > 0 && (
            <div className="mt-2 divide-y divide-zinc-100">
              {centros.map((c) => (
                <Centro key={c.id} centro={c} obras={obras} onCambio={cargarCentros} />
              ))}
            </div>
          )}
        </Seccion>

        <Seccion titulo="Costos por período" defaultAbierto>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="flex gap-2">
              <select
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
              >
                <option value="">Todo el año</option>
                {MESES.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={anio}
                onChange={(e) => setAnio(Number(e.target.value))}
                className="w-24 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
              />
            </div>
          </div>

          {cargandoTotales && <p className="mt-4 text-sm text-zinc-600">Cargando...</p>}

          {!cargandoTotales && (
            <>
              <p className="mt-3 text-sm text-zinc-600">
                Total del período:{" "}
                <span className="font-semibold text-zinc-900">{formatearMonto(totalGeneral)}</span>
              </p>

              <div className="mt-2 divide-y divide-zinc-100">
                {centrosActivos.map((c) => (
                  <FilaTotal
                    key={c.id}
                    nombre={`${c.numero} — ${c.nombre}`}
                    total={totales.porCentro[c.id] ?? 0}
                    centroId={c.id}
                    desde={desde}
                    hasta={hasta}
                  />
                ))}
                <FilaTotal
                  nombre="Sin centro asignado"
                  total={totales.sinCentro}
                  centroId={null}
                  desde={desde}
                  hasta={hasta}
                />
              </div>
            </>
          )}
        </Seccion>
      </div>
    </div>
  );
}
