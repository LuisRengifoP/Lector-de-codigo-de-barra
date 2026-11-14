/**
 * convertir-listado.js — Convierte el listado de precios del ERP en los dos
 * archivos que necesita el sistema, sin abrir el navegador.
 *
 *   node convertir-listado.js <archivo> [--salida carpeta]
 *
 * El archivo de entrada puede ser:
 *   - el Excel (.xlsx) del listado, con una fila por producto  (recomendado)
 *   - el CSV exportado del reporte dis_New_listado_precios.rpt
 *   - el texto del PDF con las columnas conservadas:
 *       pdftotext -layout New_listado_precios.pdf listado.txt
 *   - el PDF directo, si pdftotext esta instalado (se convierte solo)
 *
 * Produce:
 *   listado-skus.csv      las filas con codigo de barras valido, listas para
 *                         importar en la pestana SKU
 *   listado-revision.csv  las filas que necesitan que alguien las resuelva:
 *                         sin codigo, con codigo que no pasa el verificador,
 *                         o que el texto del PDF trajo incompletas
 *
 * El segundo archivo es el importante. Es el trabajo pendiente de compras, y
 * sale aparte justamente para que no entre a la tabla como si fuera dato
 * bueno.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

require('./js/barcode.js');
require('./js/xlsx.js');
const { Listado } = require('./js/listado.js');

const ESTADOS = Listado.ESTADOS;

function uso(mensaje) {
  if (mensaje) console.error('\n' + mensaje);
  console.error(`
Uso: node convertir-listado.js <archivo> [--salida carpeta]

  <archivo>   Excel (.xlsx), CSV, texto del PDF con columnas, o el PDF.
  --salida    Carpeta donde escribir los CSV. Por omision, la del archivo.
`);
  process.exit(mensaje ? 1 : 0);
}

/** El PDF se lee como texto con columnas. Sin pdftotext no hay forma. */
function textoDesdePdf(archivo) {
  const destino = path.join(os.tmpdir(), 'listado-' + Date.now() + '.txt');
  try {
    execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', archivo, destino], { stdio: 'pipe' });
  } catch (e) {
    console.error(
`\nNo se pudo ejecutar pdftotext, que es lo que convierte el PDF en texto con
columnas. Hay dos caminos:

  1. Pedir el reporte exportado a CSV desde el ERP. Es el camino bueno: el PDF
     pierde las columnas de algunas filas y el CSV no.
  2. Instalar poppler (trae pdftotext). Git para Windows ya lo incluye en
     C:\\Program Files\\Git\\mingw64\\bin.

Detalle: ${e.message}`);
    process.exit(1);
  }
  const texto = fs.readFileSync(destino, 'utf8');
  try { fs.unlinkSync(destino); } catch (e) { /* el temporal no importa */ }
  return texto;
}

/**
 * Los reportes de Crystal salen en cp1252, no en UTF-8. Si se lee como UTF-8
 * aparecen caracteres de reemplazo en las tildes y la enie.
 */
function leerTexto(archivo) {
  if (/\.pdf$/i.test(archivo)) return textoDesdePdf(archivo);
  const crudo = fs.readFileSync(archivo);
  const comoUtf8 = crudo.toString('utf8');
  if (comoUtf8.indexOf('\uFFFD') === -1) return comoUtf8;
  return crudo.toString('latin1');
}

function comilla(v) {
  return '"' + String(v === undefined || v === null ? '' : v).replace(/"/g, '""') + '"';
}

/**
 * El CSV de SKU usa las mismas columnas que importa js/sku.js, mas precio y
 * cajas. Una fila por codigo.
 */
function csvSkus(filas) {
  const cab = ['sku', 'nombre', 'categoria', 'codigo', 'nivel', 'cantidad',
               'proveedor', 'nombre_proveedor', 'precio', 'precio_sin_iva', 'iva',
               'cajas', 'empaque', 'unidades_por_caja'];
  const salida = [cab.join(',')];
  for (const f of filas) {
    salida.push([
      f.sku, comilla(f.descripcion), comilla(f.categoria), f.codigo,
      f.nivel, f.cantidad === null ? '' : f.cantidad,
      comilla(f.proveedor), '',
      f.precioFinal === null ? '' : f.precioFinal,
      f.precioUnd === null ? '' : f.precioUnd,
      f.iva === null ? '' : f.iva,
      f.cajas === null ? '' : f.cajas,
      f.empaque || '',
      f.unidadesPorCaja || ''
    ].join(','));
  }
  return salida.join('\r\n');
}

/** El CSV de revision lleva el motivo y, cuando hay, el codigo propuesto. */
function csvRevision(filas) {
  const cab = ['sku', 'descripcion', 'proveedor', 'codigo_en_el_reporte', 'estado',
               'motivo', 'codigo_propuesto', 'precio', 'cajas', 'linea_original'];
  const salida = [cab.join(',')];
  for (const f of filas) {
    salida.push([
      f.sku, comilla(f.descripcion), comilla(f.proveedor),
      f.codigoBruto || '', f.estado, comilla(f.motivo),
      f.sugerencia || '',
      f.precioFinal === null ? '' : f.precioFinal,
      f.cajas === null ? '' : f.cajas,
      comilla(f.linea || '')
    ].join(','));
  }
  return salida.join('\r\n');
}

function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.indexOf('--help') !== -1 || args.indexOf('-h') !== -1) uso();

  const archivo = args[0];
  if (!fs.existsSync(archivo)) uso('No existe el archivo: ' + archivo);

  const iSalida = args.indexOf('--salida');
  const carpeta = iSalida !== -1 && args[iSalida + 1] ? args[iSalida + 1] : path.dirname(path.resolve(archivo));

  return Listado.leerArchivo(
    /\.xlsx?$/i.test(archivo) ? fs.readFileSync(archivo) : leerTexto(archivo),
    archivo
  ).then((resultado) => informar(resultado, carpeta));
}

function informar(resultado, carpeta) {
  if (!resultado.ok) {
    console.error('\n' + resultado.error);
    process.exit(1);
  }

  const r = resultado.resumen;
  const buenas = resultado.filas.filter((f) => f.estado === ESTADOS.OK);
  const revision = resultado.filas.filter((f) => f.estado !== ESTADOS.OK);

  const archivoSkus = path.join(carpeta, 'listado-skus.csv');
  const archivoRevision = path.join(carpeta, 'listado-revision.csv');
  fs.writeFileSync(archivoSkus, csvSkus(buenas), 'utf8');
  fs.writeFileSync(archivoRevision, csvRevision(revision), 'utf8');

  console.log(`
Formato leido: ${resultado.formato}${resultado.hoja ? ' (hoja "' + resultado.hoja + '")' : ''}
Proveedores:   ${r.proveedores.length}
Filas:         ${r.total}

  Con codigo de barras valido   ${r.ok}
    unidad                      ${r.unidades}
    caja                        ${r.cajas}
    paca                        ${r.pacas}
  Sin codigo en Alterna         ${r.sinCodigo}
  Codigo que no es un GTIN      ${r.invalidos}
    de esos, relleno del ERP    ${r.derivadosDelSku}
    con un digito propuesto     ${r.conSugerencia}
  Filas incompletas en el texto ${r.incompletas}

  Con precio final              ${r.conPrecio}
  Precio que no cuadra          ${r.precioNoCuadra}
  Codigos repetidos             ${r.duplicados.length}
`);

  if (r.precioNoCuadra) {
    console.log(
`En ${r.precioNoCuadra} filas, Precio Und x (1 - Desc) x (1 + IVA) no da el Precio
Final del listado. En cigarrillos y algunas bebidas eso es normal: llevan
impuesto al consumo, que no sale en ninguna columna. En el resto significa que
los datos de esa fila se corrieron de renglon al armar la tabla, y entonces el
codigo de barras puede no ser el de ese producto.
`);
  }


  if (r.duplicados.length) {
    console.log('Codigos en mas de un SKU (hay que decidir a cual pertenecen):');
    for (const d of r.duplicados.slice(0, 10)) {
      console.log(`  ${d.codigo}  SKU ${d.otroSku} y SKU ${d.sku}`);
    }
    if (r.duplicados.length > 10) console.log(`  y ${r.duplicados.length - 10} mas`);
    console.log('');
  }

  console.log(`Escritos:
  ${archivoSkus}        ${buenas.length} filas listas para importar
  ${archivoRevision}    ${revision.length} filas para que compras resuelva
`);

  if (resultado.formato === 'texto' && r.incompletas > 0) {
    console.log(
`Aviso: ${r.incompletas} filas vinieron del PDF sin descripcion ni precios. No es
un fallo del reporte, es el texto del PDF que pierde las columnas cuando la
descripcion es larga. El CSV exportado del ERP no tiene ese problema.
`);
  }
}

main().catch((e) => {
  console.error('\n' + e.message);
  process.exit(1);
});
