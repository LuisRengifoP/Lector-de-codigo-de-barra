/**
 * sku.js — Tabla de SKU con varios codigos de barras por producto.
 *
 * Por que existe esta capa, aparte de la cache de db.js:
 *
 * Cuando llega mercancia del proveedor, la caja trae un codigo (ITF-14) y la
 * unidad trae otro (EAN-13). No son el mismo numero, y hay proveedores que
 * ni siquiera los relacionan. El proveedor le pone al producto su propio
 * nombre, distinto del que usa compras. Compras asigna el SKU y el nombre
 * interno.
 *
 * Conclusion: el nombre no sirve para cruzar nada. El codigo de barras es la
 * unica llave de verificacion. Y un SKU tiene *varios* codigos, no uno.
 *
 *   SKU-00412  "Harina de maiz blanco PAN 1 kg"
 *     7702084137520   EAN-13   unidad    1 u
 *     17702084137527  ITF-14   caja     24 u
 *
 * db.js sigue siendo la cache de lo que respondieron las fuentes en linea.
 * Esta tabla es dato propio de la empresa: la construye compras y nadie mas.
 *
 * Persiste en localStorage bajo slb.skus.v1.
 */
(function (global) {
  'use strict';

  var CLAVE = 'slb.skus.v1';
  // Niveles de empaque, de la unidad hacia arriba. 'display' es un empaque
  // intermedio que agrupa pocas unidades para exhibir (la cajita de las
  // Piazza, una bolsa con varias unidades). No todos los productos lo tienen.
  // 'variable' va aparte: no son unidades contables sino peso.
  var NIVELES = ['unidad', 'display', 'paca', 'caja', 'variable'];

  var skus = [];
  var indiceCodigo = {};  // clave de codigo -> { sku: <objeto>, entrada: <codigo> }
  var indiceSku = {};     // SKU en mayusculas -> objeto
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
    return escribirCrudo(JSON.stringify({ version: 1, skus: skus }));
  }

  function reconstruirIndices() {
    indiceCodigo = {};
    indiceSku = {};
    for (var i = 0; i < skus.length; i++) {
      var s = skus[i];
      indiceSku[s.sku.toUpperCase()] = s;
      for (var j = 0; j < s.codigos.length; j++) {
        var entrada = s.codigos[j];
        var claves = global.Barcode.clavesEquivalentes(entrada.codigo);
        for (var k = 0; k < claves.length; k++) {
          indiceCodigo[claves[k]] = { sku: s, entrada: entrada };
        }
      }
    }
  }

  function normalizarNivel(nivel, codigo) {
    var n = String(nivel || '').trim().toLowerCase();
    if (NIVELES.indexOf(n) !== -1) return n;
    return global.Barcode.nivelProbable(codigo);
  }

  function normalizarEntrada(bruto) {
    var codigo = global.Barcode.normalizar(bruto.codigo);
    var nivel = normalizarNivel(bruto.nivel, codigo);
    var cantidad = Math.trunc(Number(bruto.cantidad));
    if (!Number.isFinite(cantidad) || cantidad < 1) cantidad = nivel === 'unidad' ? 1 : 0;
    return {
      codigo: codigo,
      tipo: global.Barcode.tipo(codigo).nombre,
      nivel: nivel,
      // Unidades que contiene este empaque. 0 = todavia sin confirmar.
      cantidad: cantidad,
      proveedor: String(bruto.proveedor || '').trim(),
      // El nombre que le da el proveedor. Solo referencia: nunca es llave.
      nombreProveedor: String(bruto.nombreProveedor || '').trim(),
      agregado: bruto.agregado || new Date().toISOString()
    };
  }

  /** Numero o null. No confunde el 0 con "sin dato": 0 cajas es un dato. */
  function numeroOpcional(valor) {
    if (valor === null || valor === undefined || valor === '') return null;
    var n = Number(String(valor).replace(/[^0-9.]/g, ''));
    return isFinite(n) ? n : null;
  }

  function normalizarSku(bruto) {
    var codigos = (bruto.codigos || []).map(normalizarEntrada);
    return {
      sku: String(bruto.sku || '').trim().toUpperCase(),
      nombre: String(bruto.nombre || '').trim(),
      categoria: String(bruto.categoria || 'Sin categoria').trim(),
      codigos: codigos,

      // ── Datos comerciales del listado de precios ──
      //
      // El proveedor vive tambien aqui, no solo en cada codigo: una fila del
      // listado puede llegar sin codigo de barras, y el proveedor de ese
      // producto se sabe igual.
      proveedor: String(bruto.proveedor || '').trim(),
      // Precio de gondola, con IVA. Es el que se muestra al escanear.
      precio: numeroOpcional(bruto.precio),
      precioSinIva: numeroOpcional(bruto.precioSinIva),
      iva: numeroOpcional(bruto.iva),
      // Existencia en empaques completos, como la cuenta el ERP.
      cajas: numeroOpcional(bruto.cajas),
      // Como viene del proveedor: CAJ de 72, PAC de 1000. Dato de compras.
      empaque: String(bruto.empaque || '').trim().toUpperCase(),
      unidadesPorCaja: numeroOpcional(bruto.unidadesPorCaja),
      // false cuando el precio final del listado no sale de multiplicar el
      // precio unitario por el descuento y el IVA. null si no se pudo saber.
      precioCuadra: bruto.precioCuadra === undefined || bruto.precioCuadra === null
        ? null : !!bruto.precioCuadra,
      // De donde salieron estos datos: 'listado' o 'manual'.
      origen: bruto.origen || 'manual',

      creado: bruto.creado || new Date().toISOString(),
      actualizado: bruto.actualizado || new Date().toISOString()
    };
  }

  function iniciar() {
    var guardado = leerCrudo();
    if (guardado) {
      try {
        var datos = JSON.parse(guardado);
        skus = (datos.skus || []).map(normalizarSku).filter(function (s) { return s.sku; });
      } catch (e) {
        skus = [];
      }
    } else {
      skus = [];
    }
    reconstruirIndices();
    return Promise.resolve({ skus: skus, almacenamientoOk: almacenamientoOk });
  }

  // ───────────────── Consultas ─────────────────

  /** Busca el SKU al que pertenece un codigo. Devuelve { sku, entrada } o null. */
  function buscarPorCodigo(codigo) {
    var claves = global.Barcode.clavesEquivalentes(codigo);
    for (var i = 0; i < claves.length; i++) {
      if (indiceCodigo[claves[i]]) return indiceCodigo[claves[i]];
    }
    return null;
  }

  function buscarSku(sku) {
    return indiceSku[String(sku || '').trim().toUpperCase()] || null;
  }

  /**
   * SKU que podrian ser el mismo producto que este codigo, por compartir los
   * 12 digitos base del GTIN. Es lo que pasa entre la caja y la unidad cuando
   * el proveedor numera segun la norma.
   *
   * Es una propuesta para que una persona la confirme. No se vincula solo:
   * hay proveedores que numeran la caja sin relacion con la unidad, y
   * vincular mal mezcla dos productos distintos bajo un SKU.
   */
  function candidatos(codigo) {
    var base = global.Barcode.baseGtin(codigo);
    if (!base) return [];
    var yaVinculado = buscarPorCodigo(codigo);
    var salida = [];
    for (var i = 0; i < skus.length; i++) {
      var s = skus[i];
      if (yaVinculado && yaVinculado.sku === s) continue;
      for (var j = 0; j < s.codigos.length; j++) {
        if (global.Barcode.baseGtin(s.codigos[j].codigo) === base) {
          salida.push({ sku: s, porCodigo: s.codigos[j] });
          break;
        }
      }
    }
    return salida;
  }

  function buscarTexto(consulta) {
    var q = String(consulta || '').trim().toLowerCase();
    if (!q) return skus.slice();
    return skus.filter(function (s) {
      if (s.sku.toLowerCase().indexOf(q) !== -1) return true;
      if (s.nombre.toLowerCase().indexOf(q) !== -1) return true;
      if (s.categoria.toLowerCase().indexOf(q) !== -1) return true;
      for (var i = 0; i < s.codigos.length; i++) {
        var c = s.codigos[i];
        if (c.codigo.indexOf(q) !== -1) return true;
        if (c.nombreProveedor.toLowerCase().indexOf(q) !== -1) return true;
        if (c.proveedor.toLowerCase().indexOf(q) !== -1) return true;
      }
      return false;
    });
  }

  function todos() { return skus.slice(); }

  /**
   * Reemplaza la tabla entera con la que manda el servidor.
   *
   * Se persiste igual en localStorage, pero como copia: si el servidor no
   * responde mañana, la caja sigue leyendo codigos con lo ultimo que vio.
   */
  function cargar(lista) {
    skus = (lista || []).map(normalizarSku).filter(function (s) { return s.sku; });
    reconstruirIndices();
    persistir();
    return skus.length;
  }

  function categorias() {
    var vistas = {}, lista = [];
    for (var i = 0; i < skus.length; i++) {
      var c = skus[i].categoria;
      if (c && !vistas[c]) { vistas[c] = true; lista.push(c); }
    }
    return lista.sort();
  }

  /** Siguiente SKU libre con el patron SKU-00000. */
  function siguienteSku() {
    var mayor = 0;
    for (var i = 0; i < skus.length; i++) {
      var m = /^SKU-([0-9]+)$/.exec(skus[i].sku);
      if (m && Number(m[1]) > mayor) mayor = Number(m[1]);
    }
    var n = String(mayor + 1);
    while (n.length < 5) n = '0' + n;
    return 'SKU-' + n;
  }

  function estadisticas() {
    var codigos = 0, cajas = 0, sinCantidad = 0, soloUnCodigo = 0;
    for (var i = 0; i < skus.length; i++) {
      var cs = skus[i].codigos;
      codigos += cs.length;
      if (cs.length === 1) soloUnCodigo++;
      for (var j = 0; j < cs.length; j++) {
        if (cs[j].nivel === 'caja' || cs[j].nivel === 'paca' || cs[j].nivel === 'display') cajas++;
        if (cs[j].nivel !== 'variable' && cs[j].cantidad < 1) sinCantidad++;
      }
    }
    return {
      skus: skus.length,
      codigos: codigos,
      cajas: cajas,
      // Un empaque sin cantidad confirmada no sirve para recibir mercancia.
      sinCantidad: sinCantidad,
      soloUnCodigo: soloUnCodigo
    };
  }

  // ───────────────── Escritura ─────────────────

  /** Crea un SKU. El primer codigo es opcional. */
  function crear(bruto) {
    var sku = String(bruto.sku || '').trim().toUpperCase();
    if (!sku) return { ok: false, error: 'El SKU es obligatorio' };
    if (buscarSku(sku)) return { ok: false, error: 'El SKU ' + sku + ' ya existe' };
    if (!String(bruto.nombre || '').trim()) {
      return { ok: false, error: 'El nombre interno es obligatorio' };
    }

    if (bruto.codigo) {
      var ocupado = buscarPorCodigo(bruto.codigo);
      if (ocupado) {
        return {
          ok: false,
          error: 'El codigo ' + global.Barcode.normalizar(bruto.codigo) +
                 ' ya esta vinculado al SKU ' + ocupado.sku.sku + ' (' + ocupado.sku.nombre + ')'
        };
      }
      var v = global.Barcode.validar(bruto.codigo);
      if (!v.valido) return { ok: false, error: v.motivo };
    }

    var nuevo = normalizarSku({
      sku: sku,
      nombre: bruto.nombre,
      categoria: bruto.categoria,
      proveedor: bruto.proveedor,
      precio: bruto.precio,
      precioSinIva: bruto.precioSinIva,
      iva: bruto.iva,
      cajas: bruto.cajas,
      empaque: bruto.empaque,
      unidadesPorCaja: bruto.unidadesPorCaja,
      precioCuadra: bruto.precioCuadra,
      origen: bruto.origen,
      codigos: bruto.codigo ? [{
        codigo: bruto.codigo,
        nivel: bruto.nivel,
        cantidad: bruto.cantidad,
        proveedor: bruto.proveedor,
        nombreProveedor: bruto.nombreProveedor
      }] : []
    });

    skus.push(nuevo);
    reconstruirIndices();
    persistir();
    return { ok: true, sku: nuevo };
  }

  function actualizar(sku, cambios) {
    var s = buscarSku(sku);
    if (!s) return { ok: false, error: 'SKU no encontrado' };
    if (cambios.nombre !== undefined) {
      if (!String(cambios.nombre).trim()) {
        return { ok: false, error: 'El nombre interno es obligatorio' };
      }
      s.nombre = String(cambios.nombre).trim();
    }
    if (cambios.categoria !== undefined) {
      s.categoria = String(cambios.categoria).trim() || 'Sin categoria';
    }
    if (cambios.proveedor !== undefined) s.proveedor = String(cambios.proveedor).trim();
    if (cambios.precioCuadra !== undefined) {
      s.precioCuadra = cambios.precioCuadra === null ? null : !!cambios.precioCuadra;
    }
    if (cambios.empaque !== undefined) s.empaque = String(cambios.empaque).trim().toUpperCase();
    ['precio', 'precioSinIva', 'iva', 'cajas', 'unidadesPorCaja'].forEach(function (campo) {
      if (cambios[campo] !== undefined) s[campo] = numeroOpcional(cambios[campo]);
    });
    if (cambios.origen !== undefined) s.origen = String(cambios.origen).trim() || 'manual';
    s.actualizado = new Date().toISOString();
    persistir();
    return { ok: true, sku: s };
  }

  /**
   * Vincula un codigo a un SKU que ya existe. Este es el caso frecuente en
   * recepcion: llega una caja con un codigo que nadie habia visto, de un
   * producto que si esta registrado.
   *
   * Un codigo vinculado a otro SKU no se mueve en silencio: se rechaza y se
   * dice a cual pertenece. Mover un codigo entre SKU es una decision, no un
   * efecto secundario.
   */
  function vincular(sku, bruto) {
    var s = buscarSku(sku);
    if (!s) return { ok: false, error: 'SKU no encontrado' };

    var v = global.Barcode.validar(bruto.codigo);
    if (!v.valido) return { ok: false, error: v.motivo };
    var codigo = v.codigo;

    var ocupado = buscarPorCodigo(codigo);
    if (ocupado && ocupado.sku !== s) {
      return {
        ok: false,
        error: 'El codigo ' + codigo + ' ya esta vinculado al SKU ' +
               ocupado.sku.sku + ' (' + ocupado.sku.nombre + '). ' +
               'Desvinculalo de ahi primero si de verdad pertenece a este.'
      };
    }

    var entrada = normalizarEntrada({
      codigo: codigo,
      nivel: bruto.nivel,
      cantidad: bruto.cantidad,
      proveedor: bruto.proveedor,
      nombreProveedor: bruto.nombreProveedor
    });

    if (ocupado) {
      // Mismo SKU: se actualizan nivel, cantidad y datos del proveedor.
      ocupado.entrada.nivel = entrada.nivel;
      ocupado.entrada.cantidad = entrada.cantidad;
      ocupado.entrada.tipo = entrada.tipo;
      if (entrada.proveedor) ocupado.entrada.proveedor = entrada.proveedor;
      if (entrada.nombreProveedor) ocupado.entrada.nombreProveedor = entrada.nombreProveedor;
      s.actualizado = new Date().toISOString();
      reconstruirIndices();
      persistir();
      return { ok: true, sku: s, entrada: ocupado.entrada, nuevo: false };
    }

    s.codigos.push(entrada);
    s.actualizado = new Date().toISOString();
    reconstruirIndices();
    persistir();
    return { ok: true, sku: s, entrada: entrada, nuevo: true };
  }

  function desvincular(codigo) {
    var hallado = buscarPorCodigo(codigo);
    if (!hallado) return { ok: false, error: 'Ese codigo no esta vinculado a ningun SKU' };
    var s = hallado.sku;
    s.codigos = s.codigos.filter(function (c) { return c !== hallado.entrada; });
    s.actualizado = new Date().toISOString();
    reconstruirIndices();
    persistir();
    return { ok: true, sku: s };
  }

  function eliminar(sku) {
    var s = buscarSku(sku);
    if (!s) return { ok: false, error: 'SKU no encontrado' };
    skus = skus.filter(function (x) { return x !== s; });
    reconstruirIndices();
    persistir();
    return { ok: true };
  }

  function vaciar() {
    skus = [];
    reconstruirIndices();
    persistir();
    return { ok: true };
  }

  // ───────────────── Importar / exportar ─────────────────
  //
  // El CSV lleva una fila por codigo, no por SKU: es el formato que compras
  // puede revisar en una hoja de calculo y devolver corregido.

  var CABECERA_CSV = ['sku', 'nombre', 'categoria', 'codigo', 'tipo', 'nivel',
                      'cantidad', 'proveedor', 'nombre_proveedor',
                      'precio', 'precio_sin_iva', 'iva', 'cajas',
                      'empaque', 'unidades_por_caja'];

  /** Las columnas comerciales de un SKU, en el orden de CABECERA_CSV. */
  function colaComercial(s) {
    return [
      s.precio === null ? '' : s.precio,
      s.precioSinIva === null ? '' : s.precioSinIva,
      s.iva === null ? '' : s.iva,
      s.cajas === null ? '' : s.cajas,
      s.empaque,
      s.unidadesPorCaja === null ? '' : s.unidadesPorCaja
    ];
  }

  function comilla(texto) {
    return '"' + String(texto === undefined || texto === null ? '' : texto).replace(/"/g, '""') + '"';
  }

  function exportarCsv() {
    var filas = [CABECERA_CSV.join(',')];
    for (var i = 0; i < skus.length; i++) {
      var s = skus[i];
      if (!s.codigos.length) {
        filas.push([
          s.sku, comilla(s.nombre), comilla(s.categoria), '', '', '', '',
          comilla(s.proveedor), ''
        ].concat(colaComercial(s)).join(','));
        continue;
      }
      for (var j = 0; j < s.codigos.length; j++) {
        var c = s.codigos[j];
        filas.push([
          s.sku, comilla(s.nombre), comilla(s.categoria),
          c.codigo, comilla(c.tipo), c.nivel, c.cantidad,
          comilla(c.proveedor || s.proveedor), comilla(c.nombreProveedor)
        ].concat(colaComercial(s)).join(','));
      }
    }
    return filas.join('\r\n');
  }

  function exportarJson() {
    return JSON.stringify({ version: 1, exportado: new Date().toISOString(), skus: skus }, null, 2);
  }

  function partirCsv(linea) {
    var campos = [], actual = '', enComillas = false;
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
        campos.push(actual.trim()); actual = '';
      } else {
        actual += ch;
      }
    }
    campos.push(actual.trim());
    return campos;
  }

  /** Importa el JSON de exportacion, o el CSV de una fila por codigo. */
  function importar(texto, reemplazar) {
    var limpio = String(texto || '').trim();
    if (!limpio) return { ok: false, error: 'Archivo vacio' };

    var filas = [];

    if (limpio.charAt(0) === '{' || limpio.charAt(0) === '[') {
      var datos;
      try { datos = JSON.parse(limpio); }
      catch (e) { return { ok: false, error: 'JSON invalido: ' + e.message }; }
      var lista = Array.isArray(datos) ? datos : (datos.skus || []);
      for (var i = 0; i < lista.length; i++) {
        var s = lista[i];
        var cs = s.codigos || [];
        var comercial = {
          proveedor: s.proveedor, precio: s.precio, precioSinIva: s.precioSinIva,
          iva: s.iva, cajas: s.cajas, empaque: s.empaque,
          unidadesPorCaja: s.unidadesPorCaja, origen: s.origen
        };
        if (!cs.length) {
          filas.push(Object.assign({
            sku: s.sku, nombre: s.nombre, categoria: s.categoria, codigo: ''
          }, comercial));
        }
        for (var j = 0; j < cs.length; j++) {
          filas.push(Object.assign({
            sku: s.sku, nombre: s.nombre, categoria: s.categoria,
            codigo: cs[j].codigo, nivel: cs[j].nivel, cantidad: cs[j].cantidad,
            nombreProveedor: cs[j].nombreProveedor
          }, comercial, { proveedor: cs[j].proveedor || s.proveedor }));
        }
      }
    } else {
      var lineas = limpio.split(/\r?\n/).filter(function (l) { return l.trim(); });
      var cab = partirCsv(lineas.shift()).map(function (h) { return h.toLowerCase().trim(); });
      var iSku = cab.indexOf('sku');
      var iNom = cab.indexOf('nombre');
      var iCod = cab.indexOf('codigo');
      if (iSku === -1 || iNom === -1) {
        return { ok: false, error: 'El CSV debe tener columnas "sku" y "nombre"' };
      }
      var iCat = cab.indexOf('categoria');
      var iNiv = cab.indexOf('nivel');
      var iCan = cab.indexOf('cantidad');
      var iPro = cab.indexOf('proveedor');
      var iNpr = cab.indexOf('nombre_proveedor');
      var iPre = cab.indexOf('precio');
      var iPsi = cab.indexOf('precio_sin_iva');
      var iIva = cab.indexOf('iva');
      var iCaj = cab.indexOf('cajas');
      var iEmp = cab.indexOf('empaque');
      var iUpc = cab.indexOf('unidades_por_caja');
      filas = lineas.map(function (linea) {
        var f = partirCsv(linea);
        return {
          sku: f[iSku], nombre: f[iNom], codigo: iCod !== -1 ? f[iCod] : '',
          categoria: iCat !== -1 ? f[iCat] : '',
          nivel: iNiv !== -1 ? f[iNiv] : '',
          cantidad: iCan !== -1 ? f[iCan] : '',
          proveedor: iPro !== -1 ? f[iPro] : '',
          nombreProveedor: iNpr !== -1 ? f[iNpr] : '',
          precio: iPre !== -1 ? f[iPre] : '',
          precioSinIva: iPsi !== -1 ? f[iPsi] : '',
          iva: iIva !== -1 ? f[iIva] : '',
          cajas: iCaj !== -1 ? f[iCaj] : '',
          empaque: iEmp !== -1 ? f[iEmp] : '',
          unidadesPorCaja: iUpc !== -1 ? f[iUpc] : '',
          origen: 'listado'
        };
      });
    }

    if (reemplazar) vaciar();

    var skusNuevos = 0, codigosNuevos = 0, actualizados = 0, rechazados = [];

    for (var k = 0; k < filas.length; k++) {
      var f = filas[k];
      var clave = String(f.sku || '').trim().toUpperCase();
      if (!clave) { rechazados.push({ fila: k + 2, error: 'Fila sin SKU' }); continue; }

      var destino = buscarSku(clave);
      if (!destino) {
        var r = crear({
          sku: clave, nombre: f.nombre, categoria: f.categoria,
          proveedor: f.proveedor, precio: f.precio, precioSinIva: f.precioSinIva,
          iva: f.iva, cajas: f.cajas, empaque: f.empaque,
          unidadesPorCaja: f.unidadesPorCaja, origen: f.origen
        });
        if (!r.ok) { rechazados.push({ fila: k + 2, error: r.error }); continue; }
        destino = r.sku;
        skusNuevos++;
      } else {
        // El SKU ya existe: el listado manda en precio y existencia, que es
        // justo lo que cambia de un listado al siguiente. El nombre interno
        // no se pisa: puede estar corregido a mano.
        actualizar(clave, {
          proveedor: f.proveedor || undefined,
          precio: f.precio === '' ? undefined : f.precio,
          precioSinIva: f.precioSinIva === '' ? undefined : f.precioSinIva,
          iva: f.iva === '' ? undefined : f.iva,
          cajas: f.cajas === '' ? undefined : f.cajas,
          empaque: f.empaque || undefined,
          unidadesPorCaja: f.unidadesPorCaja === '' ? undefined : f.unidadesPorCaja
        });
      }

      if (!String(f.codigo || '').trim()) continue;

      var rv = vincular(destino.sku, f);
      if (!rv.ok) rechazados.push({ fila: k + 2, codigo: f.codigo, error: rv.error });
      else if (rv.nuevo) codigosNuevos++;
      else actualizados++;
    }

    return {
      ok: true, skusNuevos: skusNuevos, codigosNuevos: codigosNuevos,
      actualizados: actualizados, rechazados: rechazados
    };
  }

  global.SKU = {
    NIVELES: NIVELES,
    iniciar: iniciar,
    todos: todos,
    cargar: cargar,
    buscarSku: buscarSku,
    buscarPorCodigo: buscarPorCodigo,
    buscarTexto: buscarTexto,
    candidatos: candidatos,
    categorias: categorias,
    siguienteSku: siguienteSku,
    estadisticas: estadisticas,
    crear: crear,
    actualizar: actualizar,
    vincular: vincular,
    desvincular: desvincular,
    eliminar: eliminar,
    vaciar: vaciar,
    exportarCsv: exportarCsv,
    exportarJson: exportarJson,
    importar: importar,
    get almacenamientoOk() { return almacenamientoOk; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
