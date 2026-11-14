/**
 * db.js — Memoria local de los productos ya consultados.
 *
 * No es un catalogo que haya que llenar a mano: es la cache de lo que las
 * fuentes en linea ya respondieron. Un codigo consultado una vez vuelve a
 * resolverse al instante, sin red y sin gastar cupo de las APIs.
 *
 * Persiste en localStorage. El indice usa GTIN-13 como clave canonica, para
 * que un mismo producto se encuentre igual si llega como UPC-A de 12 digitos
 * o como EAN-13 con cero inicial.
 */
(function (global) {
  'use strict';

  // v3: cache de consultas en linea. Ya no se siembra con productos de ejemplo.
  var CLAVE_PRODUCTOS = 'slb.productos.v3';
  var CLAVE_HISTORIAL = 'slb.historial.v1';
  var LIMITE_HISTORIAL = 300;

  var productos = [];   // Lista completa.
  var indice = {};      // clave canonica -> producto
  var historial = [];
  var almacenamientoOk = true;

  /** localStorage puede fallar (modo privado, cookies bloqueadas). Nunca debe romper la app. */
  function leerCrudo(clave) {
    try {
      return global.localStorage.getItem(clave);
    } catch (e) {
      almacenamientoOk = false;
      return null;
    }
  }

  function escribirCrudo(clave, valor) {
    try {
      global.localStorage.setItem(clave, valor);
      return true;
    } catch (e) {
      almacenamientoOk = false;
      return false;
    }
  }

  function reconstruirIndice() {
    indice = {};
    for (var i = 0; i < productos.length; i++) {
      var p = productos[i];
      var claves = global.Barcode.clavesEquivalentes(p.codigo);
      for (var j = 0; j < claves.length; j++) {
        indice[claves[j]] = p;
      }
    }
  }

  function persistir() {
    return escribirCrudo(CLAVE_PRODUCTOS, JSON.stringify({ version: 1, productos: productos }));
  }

  function persistirHistorial() {
    return escribirCrudo(CLAVE_HISTORIAL, JSON.stringify(historial));
  }

  function normalizarProducto(bruto) {
    var codigo = global.Barcode.normalizar(bruto.codigo);
    return {
      codigo: codigo,
      nombre: String(bruto.nombre || '').trim() || 'Producto sin nombre',
      marca: bruto.marca ? String(bruto.marca).trim() : '',
      empresa: bruto.empresa ? String(bruto.empresa).trim() : '',
      categoria: String(bruto.categoria || 'Sin categoria').trim(),
      precio: Number(bruto.precio) >= 0 ? Number(bruto.precio) : 0,
      stock: Number.isFinite(Number(bruto.stock)) ? Math.trunc(Number(bruto.stock)) : 0,
      // De donde salio el nombre: una fuente en linea, o el propio usuario.
      origen: bruto.origen || 'manual',
      oficial: !!bruto.oficial,
      actualizado: bruto.actualizado || new Date().toISOString()
    };
  }

  /**
   * Arranca la cache leyendo lo que haya guardado. No siembra nada:
   * los nombres vienen de las consultas en linea.
   */
  function iniciar() {
    var guardado = leerCrudo(CLAVE_PRODUCTOS);
    var hist = leerCrudo(CLAVE_HISTORIAL);

    if (hist) {
      try { historial = JSON.parse(hist) || []; } catch (e) { historial = []; }
    }

    if (guardado) {
      try {
        var datos = JSON.parse(guardado);
        productos = (datos.productos || []).map(normalizarProducto);
      } catch (e) {
        productos = []; // Dato corrupto: se empieza limpio.
      }
    } else {
      productos = [];
    }

    reconstruirIndice();
    return Promise.resolve({ productos: productos, almacenamientoOk: almacenamientoOk });
  }

  /** Busca por codigo, probando todas las claves equivalentes. */
  function buscar(codigo) {
    var claves = global.Barcode.clavesEquivalentes(codigo);
    for (var i = 0; i < claves.length; i++) {
      if (indice[claves[i]]) return indice[claves[i]];
    }
    return null;
  }

  /** Busqueda por texto en nombre, codigo o categoria. */
  function buscarTexto(consulta) {
    var q = String(consulta || '').trim().toLowerCase();
    if (!q) return productos.slice();
    return productos.filter(function (p) {
      return p.nombre.toLowerCase().indexOf(q) !== -1 ||
             p.codigo.indexOf(q) !== -1 ||
             p.categoria.toLowerCase().indexOf(q) !== -1;
    });
  }

  /** Inserta o actualiza. Devuelve { ok, producto, error, nuevo }. */
  function guardar(bruto) {
    var validacion = global.Barcode.validar(bruto.codigo);
    if (!validacion.valido) {
      return { ok: false, error: validacion.motivo };
    }
    if (!String(bruto.nombre || '').trim()) {
      return { ok: false, error: 'El nombre del producto es obligatorio' };
    }

    var producto = normalizarProducto(bruto);
    var existente = buscar(producto.codigo);

    if (existente) {
      existente.nombre = producto.nombre;
      existente.categoria = producto.categoria;
      existente.precio = producto.precio;
      existente.stock = producto.stock;
      existente.actualizado = producto.actualizado;
      reconstruirIndice();
      persistir();
      return { ok: true, producto: existente, nuevo: false };
    }

    productos.push(producto);
    reconstruirIndice();
    persistir();
    return { ok: true, producto: producto, nuevo: true };
  }

  function eliminar(codigo) {
    var producto = buscar(codigo);
    if (!producto) return { ok: false, error: 'Producto no encontrado' };
    productos = productos.filter(function (p) { return p !== producto; });
    reconstruirIndice();
    persistir();
    return { ok: true };
  }

  function ajustarStock(codigo, delta) {
    var producto = buscar(codigo);
    if (!producto) return { ok: false, error: 'Producto no encontrado' };
    producto.stock = Math.max(0, producto.stock + Number(delta));
    producto.actualizado = new Date().toISOString();
    persistir();
    return { ok: true, producto: producto };
  }

  function todos() {
    return productos.slice();
  }

  function categorias() {
    var vistas = {};
    var lista = [];
    for (var i = 0; i < productos.length; i++) {
      var c = productos[i].categoria;
      if (!vistas[c]) { vistas[c] = true; lista.push(c); }
    }
    return lista.sort();
  }

  function estadisticas() {
    var valor = 0;
    var unidades = 0;
    for (var i = 0; i < productos.length; i++) {
      valor += productos[i].precio * productos[i].stock;
      unidades += productos[i].stock;
    }
    return {
      total: productos.length,
      categorias: categorias().length,
      unidades: unidades,
      valorInventario: valor
    };
  }

  // ---- Historial de lecturas ----

  function registrarLectura(entrada) {
    historial.unshift({
      codigo: entrada.codigo,
      nombre: entrada.nombre || null,
      encontrado: !!entrada.encontrado,
      // false solo cuando el digito verificador fallo: lectura danada, no producto ausente.
      valido: entrada.valido !== false,
      fuente: entrada.fuente || 'manual',
      ts: new Date().toISOString()
    });
    if (historial.length > LIMITE_HISTORIAL) historial.length = LIMITE_HISTORIAL;
    persistirHistorial();
  }

  function obtenerHistorial() {
    return historial.slice();
  }

  function limpiarHistorial() {
    historial = [];
    persistirHistorial();
  }

  // ---- Importar / exportar ----

  function exportarJson() {
    return JSON.stringify({ version: 1, exportado: new Date().toISOString(), productos: productos }, null, 2);
  }

  function exportarCsv() {
    var filas = [['codigo', 'nombre', 'categoria', 'precio', 'stock'].join(',')];
    for (var i = 0; i < productos.length; i++) {
      var p = productos[i];
      filas.push([
        p.codigo,
        '"' + p.nombre.replace(/"/g, '""') + '"',
        '"' + p.categoria.replace(/"/g, '""') + '"',
        p.precio,
        p.stock
      ].join(','));
    }
    return filas.join('\r\n');
  }

  /** Importa JSON (formato de exportacion) o CSV con cabecera codigo,nombre,... */
  function importar(texto, reemplazar) {
    var entrantes = [];
    var limpio = String(texto || '').trim();
    if (!limpio) return { ok: false, error: 'Archivo vacio' };

    if (limpio.charAt(0) === '{' || limpio.charAt(0) === '[') {
      try {
        var datos = JSON.parse(limpio);
        entrantes = Array.isArray(datos) ? datos : (datos.productos || []);
      } catch (e) {
        return { ok: false, error: 'JSON invalido: ' + e.message };
      }
    } else {
      var lineas = limpio.split(/\r?\n/).filter(function (l) { return l.trim(); });
      var cabecera = lineas.shift().toLowerCase().split(',').map(function (h) { return h.trim(); });
      var iCod = cabecera.indexOf('codigo');
      var iNom = cabecera.indexOf('nombre');
      if (iCod === -1 || iNom === -1) {
        return { ok: false, error: 'El CSV debe tener columnas "codigo" y "nombre"' };
      }
      var iCat = cabecera.indexOf('categoria');
      var iPre = cabecera.indexOf('precio');
      var iSto = cabecera.indexOf('stock');
      entrantes = lineas.map(function (linea) {
        var campos = partirCsv(linea);
        return {
          codigo: campos[iCod],
          nombre: campos[iNom],
          categoria: iCat !== -1 ? campos[iCat] : 'Sin categoria',
          precio: iPre !== -1 ? campos[iPre] : 0,
          stock: iSto !== -1 ? campos[iSto] : 0,
          origen: 'importado'
        };
      });
    }

    if (reemplazar) {
      productos = [];
      reconstruirIndice();
    }

    var agregados = 0, actualizados = 0, rechazados = [];
    for (var i = 0; i < entrantes.length; i++) {
      var r = guardar(entrantes[i]);
      if (!r.ok) rechazados.push({ codigo: entrantes[i].codigo, error: r.error });
      else if (r.nuevo) agregados++;
      else actualizados++;
    }
    return { ok: true, agregados: agregados, actualizados: actualizados, rechazados: rechazados };
  }

  /** Partidor CSV minimo que respeta comillas dobles. */
  function partirCsv(linea) {
    var campos = [];
    var actual = '';
    var enComillas = false;
    for (var i = 0; i < linea.length; i++) {
      var ch = linea.charAt(i);
      if (enComillas) {
        if (ch === '"') {
          if (linea.charAt(i + 1) === '"') { actual += '"'; i++; }
          else enComillas = false;
        } else actual += ch;
      } else if (ch === '"') {
        enComillas = true;
      } else if (ch === ',') {
        campos.push(actual.trim());
        actual = '';
      } else {
        actual += ch;
      }
    }
    campos.push(actual.trim());
    return campos;
  }

  /** Vacia la cache. Los nombres se vuelven a consultar en linea al leerlos. */
  function vaciarCache() {
    productos = [];
    reconstruirIndice();
    persistir();
    return { ok: true };
  }

  /**
   * Consulta el nombre del producto en linea, a traves del servidor.
   *
   * El servidor encadena Verified by GS1 (si hay credenciales), Open Food Facts
   * y UPCitemdb. Se pasa por el servidor y no directo porque esas APIs no
   * autorizan llamadas desde el navegador y porque la clave de GS1 no debe
   * salir de la maquina.
   *
   * Devuelve { ok, producto, intentos, error }.
   */
  function consultarEnLinea(codigo) {
    var url = 'api/consulta?codigo=' + encodeURIComponent(global.Barcode.normalizar(codigo));
    return fetch(url, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .catch(function (e) {
        return {
          ok: false,
          producto: null,
          intentos: [],
          error: 'No se pudo consultar: ' + e.message +
                 '. Revisa que el servidor este corriendo (node server.js) y que haya internet.'
        };
      });
  }

  /** Guarda en cache lo que devolvio una consulta, sin pedir nada al usuario. */
  function guardarEnCache(codigo, hallado) {
    var producto = normalizarProducto({
      codigo: codigo,
      nombre: hallado.nombre,
      marca: hallado.marca,
      empresa: hallado.empresa,
      categoria: hallado.categoria || (hallado.marca || 'Sin categoria'),
      precio: 0,
      stock: 0,
      origen: hallado.fuente,
      oficial: hallado.oficial
    });

    var existente = buscar(producto.codigo);
    if (existente) {
      // Un nombre ya corregido a mano no se pisa con el de una fuente.
      if (existente.origen === 'manual' || existente.origen === 'editado') return existente;
      existente.nombre = producto.nombre;
      existente.marca = producto.marca;
      existente.empresa = producto.empresa;
      existente.categoria = producto.categoria;
      existente.origen = producto.origen;
      existente.oficial = producto.oficial;
      existente.actualizado = producto.actualizado;
    } else {
      productos.push(producto);
    }
    reconstruirIndice();
    persistir();
    return buscar(producto.codigo);
  }

  /** Estado del servidor de consultas: si GS1 esta configurado y cuantas hay en cache. */
  function estadoConsulta() {
    return fetch('api/estado', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .catch(function () { return null; });
  }

  global.DB = {
    iniciar: iniciar,
    buscar: buscar,
    buscarTexto: buscarTexto,
    guardar: guardar,
    eliminar: eliminar,
    ajustarStock: ajustarStock,
    todos: todos,
    categorias: categorias,
    estadisticas: estadisticas,
    registrarLectura: registrarLectura,
    obtenerHistorial: obtenerHistorial,
    limpiarHistorial: limpiarHistorial,
    exportarJson: exportarJson,
    exportarCsv: exportarCsv,
    importar: importar,
    vaciarCache: vaciarCache,
    consultarEnLinea: consultarEnLinea,
    guardarEnCache: guardarEnCache,
    estadoConsulta: estadoConsulta,
    get almacenamientoOk() { return almacenamientoOk; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
