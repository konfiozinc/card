/**
 * KZ-MINI-001 · Datos de las plantillas del demostrador de Mini Webs.
 *
 * Cada plantilla es SOLO datos: identidad visual (tipografía, formas, radio,
 * sombra) y valores por defecto. La interfaz (mini-demo.js) se encarga de
 * pintarlas. Esto permite cambiar o añadir plantillas sin tocar la UI.
 *
 * No contiene URLs externas: las fotografías de muestra se generan como SVG
 * locales (data: URI) en `imagenDeMuestra()`.
 */

export const PLANTILLAS = {
  elegancia: {
    id: "elegancia",
    nombre: "Elegancia",
    lema: "Sobria, luminosa y con personalidad.",
    paraQuien: "Restaurantes de autor, hoteles, joyerías, consultorios.",
    estilo: {
      titulo: "Georgia, 'Times New Roman', serif",
      cuerpo: "system-ui, -apple-system, 'Segoe UI', sans-serif",
      radio: "2px",
      sombra: "0 18px 50px rgba(16, 24, 40, .12)",
      hero: "centrado",
      mayusculas: true,
      separador: "línea",
      boton: "contorno"
    },
    colores: { primario: "#1f3a5f", secundario: "#c9a227" },
    muestra: [
      { titulo: "Plato de la casa", subtitulo: "servicio estrella" },
      { titulo: "Detalle del salón", subtitulo: "ambiente" },
      { titulo: "Materia prima", subtitulo: "producto" }
    ],
    servicios: [
      { nombre: "Menú degustación", precio: "$120.000" },
      { nombre: "Reserva privada", precio: "$250.000" },
      { nombre: "Evento a medida", precio: "Cotizar" }
    ]
  },

  sabores: {
    id: "sabores",
    nombre: "Sabores",
    lema: "Cálida, cercana y con hambre de más.",
    paraQuien: "Restaurantes, cafeterías, panaderías, comidas rápidas.",
    estilo: {
      titulo: "'Trebuchet MS', 'Segoe UI', sans-serif",
      cuerpo: "system-ui, -apple-system, 'Segoe UI', sans-serif",
      radio: "22px",
      sombra: "0 16px 40px rgba(120, 40, 10, .18)",
      hero: "izquierda",
      mayusculas: false,
      separador: "píldora",
      boton: "relleno"
    },
    colores: { primario: "#c2410c", secundario: "#fde68a" },
    muestra: [
      { titulo: "Combo de la casa", subtitulo: "para compartir" },
      { titulo: "Recién horneado", subtitulo: "todos los días" },
      { titulo: "Nuestra salsa", subtitulo: "secreta" }
    ],
    servicios: [
      { nombre: "Hamburguesa clásica", precio: "$18.000" },
      { nombre: "Combo familiar", precio: "$49.000" },
      { nombre: "Postre del día", precio: "$8.000" }
    ]
  },

  profesional: {
    id: "profesional",
    nombre: "Profesional",
    lema: "Clara, ordenada y directa al servicio.",
    paraQuien: "Consultores, abogados, médicos, inmobiliarias, servicios.",
    estilo: {
      titulo: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
      cuerpo: "system-ui, -apple-system, 'Segoe UI', sans-serif",
      radio: "10px",
      sombra: "0 10px 30px rgba(15, 23, 42, .10)",
      hero: "izquierda",
      mayusculas: false,
      separador: "ninguno",
      boton: "relleno"
    },
    colores: { primario: "#0f766e", secundario: "#e2e8f0" },
    muestra: [
      { titulo: "Asesoría inicial", subtitulo: "primera visita" },
      { titulo: "Espacio de trabajo", subtitulo: "atención" },
      { titulo: "Resultados", subtitulo: "casos reales" }
    ],
    servicios: [
      { nombre: "Consulta inicial", precio: "$90.000" },
      { nombre: "Acompañamiento mensual", precio: "$320.000" },
      { nombre: "Diagnóstico completo", precio: "Cotizar" }
    ]
  }
};

/** Paletas sugeridas para el editor (no imponen la marca de KONFÍO ZINC). */
export const PALETAS = [
  { nombre: "Corporativo", primario: "#1d4ed8", secundario: "#dbeafe" },
  { nombre: "Cálido", primario: "#b45309", secundario: "#fef3c7" },
  { nombre: "Natural", primario: "#15803d", secundario: "#dcfce7" },
  { nombre: "Nocturno", primario: "#3730a3", secundario: "#e0e7ff" },
  { nombre: "Minimal", primario: "#111827", secundario: "#f3f4f6" },
  { nombre: "Rosado", primario: "#be185d", secundario: "#fce7f3" }
];

/**
 * Fotografía de muestra: se genera localmente como SVG (data: URI).
 * Sin red, sin archivos externos, sin nada que cargar del visitante.
 *
 * `caja` permite generar la imagen con la proporción exacta del hueco donde se
 * va a dibujar: así ningún recorte (object-fit: cover) corta el título ni el
 * subtítulo. El texto se coloca siempre dentro de una zona segura con margen
 * inferior, sea cual sea el tamaño pedido.
 */
export function imagenDeMuestra(titulo, subtitulo, primario, secundario, i, caja) {
  const W = 400;
  const razon = caja && caja.ancho > 0 && caja.alto > 0 ? caja.alto / caja.ancho : 0.75;
  const H = Math.max(120, Math.round(W * razon));
  const menor = Math.min(W, H);

  /* Zona segura: el bloque de texto nunca baja del 10 % inferior. */
  const margenInferior = Math.round(H * 0.10);
  const fuenteSub = Math.max(10, Math.round(menor * 0.038));
  const fuenteTit = Math.max(13, Math.round(menor * 0.062));
  const subY = H - margenInferior;
  const titY = subY - Math.round(fuenteTit * 1.25);
  const x = Math.round(W * 0.06);

  const formas = [
    `<circle cx="${Math.round(W * 0.35)}" cy="${Math.round(H * 0.5)}" r="${Math.round(menor * 0.23)}" fill="${secundario}" opacity=".9"/>`,
    `<rect x="${Math.round(W * 0.15)}" y="${Math.round(H * 0.28)}" width="${Math.round(W * 0.5)}" height="${Math.round(H * 0.34)}" rx="${Math.round(menor * 0.06)}" fill="${secundario}" opacity=".85"/>`,
    `<path d="M${Math.round(W * 0.1)} ${Math.round(H * 0.72)} Q${Math.round(W * 0.35)} ${Math.round(H * 0.22)} ${Math.round(W * 0.6)} ${Math.round(H * 0.72)} Z" fill="${secundario}" opacity=".85"/>`
  ];
  const lineas = [0.15, 0.32, 0.5, 0.68, 0.85]
    .map((f) => `<line x1="${Math.round(W * f)}" y1="0" x2="${Math.round(W * f)}" y2="${H}" stroke="#fff" stroke-width="1"/>`)
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${primario}"/>
    <g opacity=".18">${lineas}</g>
    ${formas[i % formas.length]}
    <text x="${x}" y="${titY}" font-family="Georgia, serif" font-size="${fuenteTit}" fill="#fff" opacity=".95">${esc(titulo)}</text>
    <text x="${x}" y="${subY}" font-family="system-ui, sans-serif" font-size="${fuenteSub}" fill="#fff" opacity=".7">${esc(subtitulo)}</text>
  </svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

function esc(t) {
  return String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
