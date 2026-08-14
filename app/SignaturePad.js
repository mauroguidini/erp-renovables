"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

const SignaturePad = forwardRef(function SignaturePad(_props, ref) {
  const canvasRef = useRef(null);
  const dibujando = useRef(false);
  const ultimoPunto = useRef(null);
  const [vacio, setVacio] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = canvas.clientHeight * ratio;
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1f2937";
  }, []);

  function coordenadas(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handlePointerDown(e) {
    e.preventDefault();
    dibujando.current = true;
    ultimoPunto.current = coordenadas(e);
  }

  function handlePointerMove(e) {
    if (!dibujando.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const punto = coordenadas(e);
    ctx.beginPath();
    ctx.moveTo(ultimoPunto.current.x, ultimoPunto.current.y);
    ctx.lineTo(punto.x, punto.y);
    ctx.stroke();
    ultimoPunto.current = punto;
    setVacio(false);
  }

  function handlePointerUp() {
    dibujando.current = false;
  }

  function limpiar() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setVacio(true);
  }

  useImperativeHandle(
    ref,
    () => ({
      estaVacio: () => vacio,
      exportar: () => canvasRef.current.toDataURL("image/png"),
    }),
    [vacio]
  );

  return (
    <div>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="h-40 w-full touch-none rounded-md border border-zinc-300 bg-white"
      />
      <button
        type="button"
        onClick={limpiar}
        className="mt-1 text-xs text-zinc-500 hover:text-zinc-800"
      >
        Limpiar firma
      </button>
    </div>
  );
});

export default SignaturePad;
