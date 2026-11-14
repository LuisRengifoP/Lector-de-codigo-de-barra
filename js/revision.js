/**
 * revision.js — Cola de lo que el listado dejo sin resolver.
 *
 * Al cargar el listado de precios hay filas que no se pueden guardar como
 * producto escaneable:
 *
 *   sin-codigo        el reporte no trae nada en la columna Alterna
 *   codigo-invalido   trae un numero que no es un codigo de barras: unos son
 *                     relleno del ERP armado con el propio SKU, otros fallan
 *                     el digito verificador por un digito
 *   fila-incompleta   el texto del PDF perdio las columnas de esa fila
 *
 * Esas filas no se descartan y tampoco entran a la tabla de SKU: quedan aqui.
 * Es el trabajo pendiente de compras, con el motivo escrito.
 *
 * Por que una cola y no guardar el codigo igual: un codigo inventado en la
 * tabla no se nota nunca. Nadie lo escanea, porque no existe impreso en
 * ningun empaque, y mientras tanto el producto figura como registrado. Una
 * fila en esta cola si se nota: esta contada y tiene un boton.
 *
 * Se resuelve de dos maneras:
 *   escaneando el producto, que es la unica fuente confiable del codigo
 *   descartando la fila, cuando el producto ya no se maneja
 *
 * Persiste en localStorage bajo slb.revision.v1.
 */
(function (global) {
  'use strict';

  var CLAVE = 'slb.revision.v1';

  var pendientes = [];
  var indice = {};          // sku -> pendiente
  var almacenamientoOk = true;

  function leerCrudo() {
    try { return global.localStorage.getItem(CLAVE); }
    catch (e) { almacenamientoOk = false; return null; }
  }

  function escribirCrudo(valor) {
    try { global.localStorage.setItem(CLAVE, valor); return true; }
    catch (e) { almacenamientoOk = false; return false; }
  }

  function persistir() {
    return escribirCrudo(JSON.stringify({ version: 1, pendientes: pendientes }));
  }

  function reconstruirIndice() {
    indice = {};
    for (var i = 0; i < pendientes.length; i++) indice[pendientes[i].sku] = pendientes[i];
  }

  function numeroOpcional(valor) {
    if (valor === null || valor === undefined || valor === '') return null;
    var n = Number(String(valor).replace(/[^0-9.]/g, ''));
    return isFinite(n) ? n : null;
  }

  function normalizar(bruto) {
    return {
      sku: String(bruto.sku || '').trim().toUpperCase(),
      descripcion: String(bruto.descripcion || bruto.nombre || '').trim(),
      proveedor: String(bruto.proveedor || '').trim(),
      categoria: String(bruto.categoria || '').trim(),
      // El valor tal como vino en el reporte. Se guarda para poder compararlo
      // con lo que diga el empaque, nunca para usarlo como codigo.
      codigoEnElReporte: String(bruto.codigoBruto || bruto.codigoEnElReporte || '').trim(),
      estado: String(bruto.estado || '').trim(),
      motivo: String(bruto.motivo || '').trim(),
      // Codigo que saldria de corregir el digito verificador. Es una
      // propuesta para verificar contra el empaque, no un dato.
      sugerencia: String(bruto.sugerencia || '').trim(),
      precio: numeroOpcional(bruto.precio !== undefined ? bruto.precio : bruto.precioFinal),
      precioSinIva: numeroOpcional(bruto.precioSinIva !== undefined ? bruto.precioSinIva : bruto.precioUnd),
      iva: numeroOpcional(bruto.iva),
      cajas: numeroOpcional(bruto.cajas),
      empaque: String(bruto.empaque || '').trim().toUpperCase(),
      unidadesPorCaja: numeroOpcional(
        bruto.unidadesPorCaja !== undefined ? bruto.unidadesPorCaja : bruto.ue),
      linea: String(bruto.linea || '').trim(),
      agregado: bruto.agregado || new Date().toISOString()
    };
  }

  function iniciar() {
    var guardado = leerCrudo();
    if (guardado) {
      try {
        var datos = JSON.parse(guardado);
        pendientes = (datos.pendientes || []).map(normalizar).filter(function (p) { return p.sku; });
      } catch (e) {
        pendientes = [];
      }
    } else {
      pendientes = [];
    }
    reconstruirIndice();
    return Promise.resolve({ pendientes: pendientes, almacenamientoOk: almacenamientoOk });
  }

  function todos() { return pendientes.slice(); }

  /** Reemplaza la cola entera con la que manda el servidor. */
  function cargar(lista) {
    pendientes = (lista || []).map(normalizar).filter(function (p) { return p.sku; });
    reconstruirIndice();
    persistir();
    return pendientes.length;
  }

  function buscar(sku) {
    return indice[String(sku || '').trim().toUpperCase()] || null;
  }

  function buscarTexto(consulta) {
    var q = String(consulta || '').trim().toLowerCase();
    if (!q) return pendientes.slice();
    return pendientes.filter(function (p) {
      return p.sku.toLowerCase().indexOf(q) !== -1 ||
             p.descripcion.toLowerCase().indexOf(q) !== -1 ||
             p.proveedor.toLowerCase().indexOf(q) !== -1 ||
             p.codigoEnElReporte.indexOf(q) !== -1 ||
             p.estado.indexOf(q) !== -1;
    });
  }

  /** Agrega o reemplaza por SKU. Devuelve el pendiente guardado. */
  function agregar(bruto) {
    var p = normalizar(bruto);
    if (!p.sku) return null;
    var existente = buscar(p.sku);
    if (existente) {
      // Un listado mas nuevo manda: trae el precio y la existencia de hoy.
      p.agregado = existente.agregado;
      pendientes[pendientes.indexOf(existente)] = p;
    } else {
      pendientes.push(p);
    }
    reconstruirIndice();
    persistir();
    return p;
  }

  /** Mete varias de una vez: una sola escritura a localStorage. */
  function agregarVarias(brutos) {
    var nuevas = 0, reemplazadas = 0;
    for (var i = 0; i < brutos.length; i++) {
      var p = normalizar(brutos[i]);
      if (!p.sku) continue;
      var existente = buscar(p.sku);
      if (existente) {
        p.agregado = existente.agregado;
        pendientes[pendientes.indexOf(existente)] = p;
        indice[p.sku] = p;
        reemplazadas++;
      } else {
        pendientes.push(p);
        indice[p.sku] = p;
        nuevas++;
      }
    }
    persistir();
    return { nuevas: nuevas, reemplazadas: reemplazadas, total: pendientes.length };
  }

  function quitar(sku) {
    var p = buscar(sku);
    if (!p) return { ok: false, error: 'Ese SKU no esta en la cola de revision' };
    pendientes = pendientes.filter(function (x) { return x !== p; });
    reconstruirIndice();
    persistir();
    return { ok: true, pendiente: p };
  }

  function vaciar() {
    pendientes = [];
    reconstruirIndice();
    persistir();
    return { ok: true };
  }

  /**
   * Resuelve un pendiente con el codigo que se acaba de escanear.
   *
   * Crea el SKU si no existe, le vincula el codigo y lo saca de la cola.
   * Pide SKU.vincular, que es quien rechaza un codigo que ya pertenece a otro
   * SKU: eso no se resuelve aqui, es una decision de compras.
   */
  function resolverConCodigo(sku, codigo) {
    var p = buscar(sku);
    if (!p) return { ok: false, error: 'Ese SKU no esta en la cola de revision' };

    var v = global.Barcode.validar(codigo);
    if (!v.valido) return { ok: false, error: v.motivo };
    var tipo = global.Barcode.tipo(v.codigo);
    if (!tipo.gtin) {
      return {
        ok: false,
        error: 'Un codigo de ' + v.codigo.length + ' digitos no es un codigo de barras ' +
               'de producto. Escanea el empaque para leer el codigo real.'
      };
    }

    var destino = global.SKU.buscarSku(p.sku);
    if (!destino) {
      var r = global.SKU.crear({
        sku: p.sku,
        nombre: p.descripcion || ('Producto ' + p.sku),
        categoria: p.categoria,
        proveedor: p.proveedor,
        precio: p.precio,
        precioSinIva: p.precioSinIva,
        iva: p.iva,
        cajas: p.cajas,
        empaque: p.empaque,
        unidadesPorCaja: p.unidadesPorCaja,
        origen: 'listado'
      });
      if (!r.ok) return r;
      destino = r.sku;
    }

    var nivel = global.Barcode.nivelProbable(v.codigo);
    var rv = global.SKU.vincular(p.sku, {
      codigo: v.codigo,
      nivel: nivel,
      cantidad: nivel === 'unidad' ? 1 : (p.unidadesPorCaja || 0),
      proveedor: p.proveedor
    });
    if (!rv.ok) return rv;

    quitar(p.sku);
    return { ok: true, sku: rv.sku, entrada: rv.entrada, pendiente: p };
  }

  function estadisticas() {
    var r = { total: pendientes.length, sinCodigo: 0, invalidos: 0, incompletas: 0, conSugerencia: 0 };
    for (var i = 0; i < pendientes.length; i++) {
      var p = pendientes[i];
      if (p.estado === 'sin-codigo') r.sinCodigo++;
      else if (p.estado === 'codigo-invalido') r.invalidos++;
      else r.incompletas++;
      if (p.sugerencia) r.conSugerencia++;
    }
    return r;
  }

  function comilla(v) {
    return '"' + String(v === undefined || v === null ? '' : v).replace(/"/g, '""') + '"';
  }

  /** CSV para que compras lo trabaje en una hoja de calculo. */
  function exportarCsv() {
    var filas = [['sku', 'descripcion', 'proveedor', 'codigo_en_el_reporte', 'estado',
                  'motivo', 'codigo_propuesto', 'precio', 'cajas', 'linea_original'].join(',')];
    for (var i = 0; i < pendientes.length; i++) {
      var p = pendientes[i];
      filas.push([
        p.sku, comilla(p.descripcion), comilla(p.proveedor),
        p.codigoEnElReporte, p.estado, comilla(p.motivo), p.sugerencia,
        p.precio === null ? '' : p.precio,
        p.cajas === null ? '' : p.cajas,
        comilla(p.linea)
      ].join(','));
    }
    return filas.join('\r\n');
  }

  var api = {
    iniciar: iniciar,
    todos: todos,
    cargar: cargar,
    buscar: buscar,
    buscarTexto: buscarTexto,
    agregar: agregar,
    agregarVarias: agregarVarias,
    quitar: quitar,
    vaciar: vaciar,
    resolverConCodigo: resolverConCodigo,
    estadisticas: estadisticas,
    exportarCsv: exportarCsv,
    get almacenamientoOk() { return almacenamientoOk; }
  };

  global.Revision = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = { Revision: api };
})(typeof window !== 'undefined' ? window : globalThis);
