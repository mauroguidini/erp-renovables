// Reglas de clasificación automática de movimientos bancarios, compartidas
// entre la importación de extractos (ImportarExtracto.js) y la pantalla
// principal (page.js, para sugerir candidatos de emparejamiento de
// cheques sobre lo que YA está importado). Vivir en un solo lugar evita
// que las dos pantallas terminen con reglas ligeramente distintas.

export function normalizarTexto(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

// Clasificación automática de lo obvio — en este orden: sueldos primero,
// impuestos después (Ley 25.413, IVA, Sellos, SIRCREB, percepciones,
// Ingresos Brutos —abreviado "I.B" o escrito entero, como realmente
// aparece en este banco: "Recaudacion Ingresos Brutos Tucuman"—, "Pago
// de Servicios"/"Ente:"), comisiones bancarias después (incluye
// "Comisión por cheque rechazado" — es un gasto, no el cheque en sí), y
// organismos (AFIP/ARCA — el ex-AFIP se renombró —, ATP —el débito
// automático de Ingresos Brutos de Tucumán—, otros entes recaudadores)
// SIEMPRE como impuestos aunque el concepto tenga un CUIT reconocible,
// para no intentar "conciliar" un pago a AFIP contra una factura de
// compra que no existe. Nada de esto llega nunca a la etapa de extraer
// CUIT/buscar factura — por eso no puede interferir con la conciliación
// de transferencias a proveedores.
export function clasificar(conceptoNorm) {
  if (/pago de haberes/.test(conceptoNorm)) {
    return "sueldos";
  }
  if (
    /\b25\.?413\b|ley 25413|\biva\b|\bsellos?\b|sircreb|percepcion|recaudacion.*(ingresos brutos|i\.?\s*b\b)|pago de servicios|\bente:/.test(
      conceptoNorm
    )
  ) {
    return "impuestos";
  }
  if (/comision|mantenimiento de cuenta/.test(conceptoNorm)) {
    return "gastos_bancarios";
  }
  if (/\bafip\b|\barca\b|\barba\b|\batp\b|rentas/.test(conceptoNorm)) {
    return "impuestos";
  }
  return null;
}

// Un eCheque (o cheque de cámara) que ENTRA no es un pago a un proveedor
// — nunca debe llegar a clasificar() ni a extraerCuit(); se resuelve
// aparte, por número de cheque si el extracto lo trae, o por monto+fecha
// si no (page.js). "acred" alcanza para "acreditacion", pero exigimos
// además "valores" o "echeq" al lado para no confundirlo con una
// acreditación de sueldo/transferencia común, que también dice
// "acreditación" pero no es un cheque.
export function esIngresoCheque(conceptoNorm) {
  return /acred/.test(conceptoNorm) && (/echeq/.test(conceptoNorm) || /valores/.test(conceptoNorm));
}

// Ojo: "Comisión por cheque rechazado" (un gasto bancario, ya lo agarra
// clasificar() de arriba) también contiene "cheque" y "rechazado" — hay
// que descartarla ANTES de llamar a esta función, no acá adentro, porque
// acá no sabemos si ya está clasificada.
export function esRechazoCheque(conceptoNorm) {
  return /rechaz/.test(conceptoNorm) && (/echeq/.test(conceptoNorm) || /cheque/.test(conceptoNorm));
}

// "Ch:00004051" (con o sin espacio, mayúscula/minúscula) -> "4051". Se
// sacan los ceros a la izquierda para que dos formas de escribir el mismo
// número de cheque siempre den la misma clave. Muchos extractos (ej. el
// de este banco) no traen ningún número acá — en ese caso conviene
// emparejar por monto+fecha en vez de por número (page.js).
export function extraerNumeroCheque(texto) {
  const match = String(texto ?? "").match(/ch:?\s*0*(\d+)/i);
  return match ? match[1] : null;
}
