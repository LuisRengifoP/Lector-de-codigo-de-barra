/**
 * listado.js — Lectura del listado de precios del ERP.
 *
 * La empresa saca su maestro de productos de un reporte de Crystal Reports
 * (dis_New_listado_precios.rpt) sobre el DMS SQL. Las columnas son:
 *
 *   Codigo | Alterna | Descripcion | u/e | Cajas | Precio Und | Desc Max | IVA | Precio Final
 *
 *   Codigo       el SKU que asigna el area de compras
 *   Alterna      el codigo de barras de la unidad de venta
 *   u/e          palabra de empaque (PAC, CAJ) mas las unidades que trae
 *   Precio Und   precio sin IVA
 *   Precio Final precio con IVA: el de gondola
 *
 * Dos cosas que el reporte *no* pone en una columna:
 *
 *   El proveedor es una linea de encabezado de seccion, no un campo. Cada
 *   bloque de proveedor repite la cabecera de columnas.
 *   La categoria tambien viene como linea sola dentro del bloque
 *   ("CIG. LUCKIES", "CARAMELOS").
 *
 * Por eso el parseo es secuencial y lleva proveedor y categoria como estado.
 *
 * Y una advertencia que decide el diseno de este modulo: la columna Alterna
 * no siempre trae un codigo de barras. En el listado revisado, de 439 filas
 * con valor, 69 no pasan el digito verificador GTIN. Unas son relleno del ERP
 * construido con el propio SKU (SKU 10223103 -> Alterna 102231031) y otras
 * fallan por un solo digito, como un error de digitacion. Ninguna existe
 * impresa en un empaque.
 *
 * Nada de eso se guarda como codigo de barras. Este modulo clasifica cada
 * fila y manda las dudosas a una cola de revision para que compras las
 * resuelva. Un codigo inventado en la tabla es peor que una fila faltante:
 * el faltante se nota al escanear, el inventado no.
 *
 * Corre igual en el navegador y en Node (lo usa convertir-listado.js).
 */
(function (global) {
  'use strict';

  // barcode.js se publica en el objeto global, no por module.exports: se carga
  // por su efecto y despues se lee de ahi. Asi sirve igual en los dos entornos.
  if (!global.Barcode && typeof require === 'function') require('./barcode.js');
  var Barcode = global.Barcode;

  // Palabras de empaque que usa la columna u/e.
  var EMPAQUES = ['PAC', 'CAJ', 'UND', 'PAQ', 'BLS', 'DPL', 'DSP', 'DIS', 'KIT', 'BOL', 'SOB'];
  // Tarifas de IVA vigentes en Colombia. Sirven de ancla para leer la cola
  // numerica de la fila: es la unica columna con un conjunto cerrado de valores.
  var TARIFAS_IVA = ['0', '5', '19'];

  // Estados posibles de una fila leida.
  var ESTADOS = {
    OK: 'ok',                        // Codigo de barras valido.
    SIN_CODIGO: 'sin-codigo',        // Fila sin nada en Alterna.
    INVALIDO: 'codigo-invalido',     // Alterna presente que no es un GTIN valido.
    INCOMPLETA: 'fila-incompleta'    // El texto no trajo descripcion ni cola de precios.
  };

  function limpiar(t) {
    return String(t === undefined || t === null ? '' : t).replace(/\s+/g, ' ').trim();
  }

  /** "1,449" -> 1449. Devuelve null si no hay numero. */
  function aNumero(texto) {
    var t = String(texto === undefined || texto === null ? '' : texto).replace(/[^0-9.]/g, '');
    if (!t) return null;
    var n = Number(t);
    return isFinite(n) ? n : null;
  }

  /**
   * Un porcentaje puede venir como 19 o como 0,19 segun quien exporte la hoja.
   * Una tarifa de IVA o un descuento nunca llegan al 100%, asi que un valor
   * menor o igual a 1 es una fraccion.
   */
  function aPorcentaje(valor) {
    var n = aNumero(valor);
    if (n === null) return null;
    return n > 0 && n <= 1 ? n * 100 : n;
  }

  function esNumerico(t) {
    return /^[0-9][0-9,]*$/.test(t);
  }

  function esDecimal(t) {
    return /^[0-9]+\.[0-9]+$/.test(t);
  }

  // ───────────────── Validacion estricta del codigo ─────────────────

  /**
   * Barcode.validar acepta un numero de 9, 10 u 11 digitos como "codigo
   * interno": correcto para un codigo que la empresa se inventa a proposito,
   * equivocado para esta columna. Aqui un codigo solo pasa si es un GTIN de
   * 8, 12, 13 o 14 digitos con digito verificador correcto.
   *
   * Devuelve { ok, codigo, motivo, sugerencia, derivadoDelSku }.
   */
  function revisarCodigo(bruto, sku) {
    var c = Barcode.normalizar(bruto);
    if (!c) return { ok: false, codigo: '', motivo: 'Sin codigo en la columna Alterna' };

    if (!/^[0-9]+$/.test(c)) {
      return { ok: false, codigo: c, motivo: 'Tiene caracteres que no son digitos' };
    }
    if ([8, 12, 13, 14].indexOf(c.length) === -1) {
      return {
        ok: false,
        codigo: c,
        motivo: 'Tiene ' + c.length + ' digitos: ningun codigo de barras los tiene ' +
                '(EAN-8 son 8, UPC-A 12, EAN-13 13, GTIN-14 14)',
        derivadoDelSku: pareceDerivadoDelSku(c, sku)
      };
    }

    var cuerpo = c.slice(0, -1);
    var esperado = Barcode.digitoVerificador(cuerpo);
    var leido = Number(c.slice(-1));
    if (leido !== esperado) {
      return {
        ok: false,
        codigo: c,
        motivo: 'Digito verificador incorrecto: dice ' + leido + ' y deberia ser ' + esperado,
        // Da por hecho que el error esta en el ultimo digito, que es solo una
        // de las posibilidades. Se propone para comparar contra el empaque,
        // nunca para guardar sin que alguien lo verifique.
        sugerencia: cuerpo + esperado,
        derivadoDelSku: pareceDerivadoDelSku(c, sku)
      };
    }

    return { ok: true, codigo: c, tipo: Barcode.tipo(c).nombre, nivel: Barcode.nivelProbable(c) };
  }

  /** True si la Alterna parece el propio SKU con digitos pegados. */
  function pareceDerivadoDelSku(codigo, sku) {
    var s = String(sku || '').replace(/[^0-9]/g, '');
    if (s.length < 5) return false;
    return codigo.indexOf(s) !== -1;
  }

  // ───────────────── Lectura del texto con columnas ─────────────────

  var RE_CABECERA = /^\s*Codigo\s+Alterna\s+Descripcion/i;
  var RE_PIE = /Page\s+\d+\s+of\s+\d+|echa Impresion|^\\\\|^\s*$/i;

  /** Un codigo interno del ERP: 404240, 10251267, 5171(4835), 30244526-1. */
  var RE_SKU = /^[0-9]+(-[0-9]+)?(\([0-9]+\))?$/;

  /**
   * Parte la linea en campos. El reporte separa columnas con 2 o mas
   * espacios, pero cuando dos columnas quedan pegadas las imprime con uno
   * solo ("5171(4835) 17702993052874", "6 206,723"), asi que despues hay que
   * volver a partir los campos que traen dos valores juntos.
   */
  function partirCampos(linea) {
    var crudos = linea.trim().split(/\s{2,}/);
    var campos = [];
    for (var i = 0; i < crudos.length; i++) {
      var c = crudos[i].trim();
      if (!c) continue;
      var m = /^([0-9]+(?:-[0-9]+)?(?:\([0-9]+\))?)\s([0-9][0-9,]*)$/.exec(c);
      if (m) { campos.push(m[1]); campos.push(m[2]); continue; }
      campos.push(c);
    }
    return campos;
  }

  var RE_EMPAQUE_SOLO = new RegExp('^(' + EMPAQUES.join('|') + ')$', 'i');
  var RE_EMPAQUE_CON_UE = new RegExp('^(' + EMPAQUES.join('|') + ')\\s+([0-9][0-9,]*)$', 'i');

  /**
   * Lee una fila ya partida en campos (sin el SKU, que se saca antes).
   *
   * El ancla del extremo derecho es el IVA: es la unica columna con un
   * conjunto cerrado de valores (0, 5, 19). El ancla del medio es la palabra
   * de empaque de u/e. Hacen falta las dos porque Cajas, Precio Und y Desc
   * Max salen en blanco en muchas filas, y contar por posicion desde
   * cualquiera de los dos extremos las corre.
   *
   * Devuelve null si la fila no trae la cola de precios: eso significa que el
   * texto perdio las columnas y la fila no se puede leer.
   */
  function leerFila(campos) {
    var n = campos.length;
    if (n < 3) return null;

    // ── Extremo derecho: Precio Final e IVA.
    if (!esNumerico(campos[n - 1])) return null;
    if (TARIFAS_IVA.indexOf(campos[n - 2]) === -1) return null;
    var precioFinal = campos[n - 1];
    var iva = campos[n - 2];

    // ── Medio: la palabra de empaque parte la fila en dos.
    var empaque = '';
    var ue = null;
    var iEmpaque = -1;
    for (var i = 0; i < n - 2; i++) {
      if (RE_EMPAQUE_SOLO.test(campos[i])) { iEmpaque = i; empaque = campos[i].toUpperCase(); break; }
      var m = RE_EMPAQUE_CON_UE.exec(campos[i]);
      if (m) { iEmpaque = i; empaque = m[1].toUpperCase(); ue = m[2]; break; }
    }

    var inicioMedio;   // Primer campo numerico despues de la descripcion.
    var descripcion;

    if (iEmpaque !== -1) {
      descripcion = campos.slice(0, iEmpaque).join(' ');
      inicioMedio = iEmpaque + 1;
      // u/e en su propio campo, justo despues de la palabra de empaque.
      if (ue === null && inicioMedio < n - 2 && esNumerico(campos[inicioMedio])) {
        ue = campos[inicioMedio];
        inicioMedio++;
      }
    } else {
      // Sin palabra de empaque: la descripcion llega hasta el primer campo
      // que es solo numeros.
      var corte = n - 2;
      for (var j = 0; j < n - 2; j++) {
        if (esNumerico(campos[j]) || esDecimal(campos[j])) { corte = j; break; }
      }
      descripcion = campos.slice(0, corte).join(' ');
      inicioMedio = corte;
    }

    // ── Entre el medio y el IVA: Cajas, Precio Und y Desc Max, cada una
    // opcional. Se asignan de derecha a izquierda.
    var medio = campos.slice(inicioMedio, n - 2);
    var descMax = null, precioUnd = null, cajas = null;
    var k = medio.length - 1;

    if (k >= 0 && esDecimal(medio[k])) { descMax = medio[k]; k--; }
    if (k >= 0 && esNumerico(medio[k])) {
      if (k === 0) {
        // Un solo valor: el separador de miles lo desempata. Los precios de
        // este listado siempre pasan de mil y salen con coma; las cajas son
        // un conteo y salen sin coma.
        if (medio[k].indexOf(',') !== -1) precioUnd = medio[k];
        else cajas = medio[k];
        k--;
      } else {
        precioUnd = medio[k]; k--;
      }
    }
    if (k >= 0 && /^[0-9]+$/.test(medio[k])) { cajas = medio[k]; k--; }

    return {
      descripcion: limpiar(descripcion),
      empaque: empaque,
      ue: ue,
      cajas: cajas,
      precioUnd: precioUnd,
      descMax: descMax,
      iva: iva,
      precioFinal: precioFinal,
      // Campos del medio que no se pudieron ubicar: si quedan, la fila es
      // rara y vale decirlo en vez de inventar una lectura.
      sobrantes: k >= 0 ? medio.slice(0, k + 1) : []
    };
  }

  /**
   * ¿Es esta linea el nombre de una categoria?
   *
   * Dentro del bloque de un proveedor el reporte intercala lineas sueltas con
   * el nombre de la categoria ("CARAMELOS", "CIG. LUCKIES"). El problema es
   * que tambien intercala lineas de relleno con la columna u/e y un descuento
   * ("PAC 1,000      0.0"), que no son categorias de nada.
   *
   * Devuelve el nombre, o '' si la linea no es una categoria.
   */
  function esCategoria(linea) {
    // La linea de categoria tambien arrastra las columnas de relleno
    // ("CIG. LUCKIES          PAC 1,000          0.0"), asi que solo cuenta
    // el primer campo.
    var t = limpiar(linea.trim().split(/\s{2,}/)[0]);
    if (t.length < 3 || t.length > 60) return '';
    if (/[0-9]/.test(t)) return '';                      // Relleno de u/e y descuentos.
    if (RE_EMPAQUE_SOLO.test(t)) return '';
    if (!/[A-ZÁÉÍÓÚÑ]{3}/.test(t)) return '';
    if (t !== t.toUpperCase()) return '';                // Las categorias van en mayuscula.
    return t;
  }

  /**
   * Lee el texto del reporte (la salida de `pdftotext -layout`, o el mismo
   * reporte pegado tal cual).
   *
   * Devuelve { filas, proveedores, descartadas }.
   */
  function parsearTexto(texto) {
    var lineas = String(texto || '').split(/\r?\n/);
    var filas = [];
    var descartadas = [];
    var proveedor = '';
    var categoria = '';
    var proveedores = [];

    for (var i = 0; i < lineas.length; i++) {
      var linea = lineas[i].replace(/\s+$/, '');
      if (!linea.trim()) continue;

      if (RE_CABECERA.test(linea)) {
        // El proveedor es la ultima linea con texto antes de la cabecera.
        for (var j = i - 1; j >= 0 && j >= i - 5; j--) {
          var cand = lineas[j].trim();
          if (!cand || RE_PIE.test(cand) || RE_CABECERA.test(cand)) continue;
          if (/^[0-9]/.test(cand)) continue;
          proveedor = cand;
          if (proveedores.indexOf(proveedor) === -1) proveedores.push(proveedor);
          categoria = '';
          break;
        }
        continue;
      }

      if (RE_PIE.test(linea)) continue;

      // Linea de producto: empieza en la columna 0 con el codigo interno.
      if (/^[0-9]/.test(linea)) {
        var campos = partirCampos(linea);
        var sku = campos.shift();
        if (!RE_SKU.test(sku)) { descartadas.push(linea); continue; }

        // Un numero de 6 o mas digitos justo despues del SKU es la Alterna.
        // La prueba de leerFila evita comerse la cola de precios cuando la
        // fila viene sin Alterna y el primer campo ya es un numero de esa cola.
        var codigoBruto = '';
        if (campos.length > 3 && /^[0-9]{6,15}$/.test(campos[0]) &&
            TARIFAS_IVA.indexOf(campos[1]) === -1) {
          codigoBruto = campos.shift();
        }

        var cola = leerFila(campos);
        if (!cola) {
          // El texto del PDF perdio las columnas de esta fila: queda el SKU y
          // poco mas. No se adivina nada, se manda a revision tal cual.
          filas.push({
            sku: sku,
            proveedor: proveedor,
            categoria: categoria,
            codigoBruto: codigoBruto,
            descripcion: limpiar(campos.join(' ')),
            empaque: '', ue: null, cajas: null,
            precioUnd: null, descMax: null, iva: null, precioFinal: null,
            estado: ESTADOS.INCOMPLETA,
            motivo: 'El texto del reporte no trajo las columnas de esta fila',
            linea: linea.trim()
          });
          continue;
        }

        filas.push({
          sku: sku,
          proveedor: proveedor,
          categoria: categoria,
          codigoBruto: codigoBruto,
          descripcion: cola.descripcion,
          empaque: cola.empaque,
          ue: aNumero(cola.ue),
          cajas: aNumero(cola.cajas),
          precioUnd: aNumero(cola.precioUnd),
          descMax: aNumero(cola.descMax),
          iva: aNumero(cola.iva),
          precioFinal: aNumero(cola.precioFinal),
          sobrantes: cola.sobrantes,
          linea: linea.trim()
        });
        continue;
      }

      // Linea de texto sin codigo dentro del bloque: es la categoria.
      var t = esCategoria(linea);
      if (t) categoria = t;
    }

    return { filas: filas, proveedores: proveedores, descartadas: descartadas };
  }

  // ───────────────── Lectura del CSV exportado del ERP ─────────────────

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
      } else if (ch === ',' || ch === ';' || ch === '\t') {
        campos.push(actual.trim()); actual = '';
      } else actual += ch;
    }
    campos.push(actual.trim());
    return campos;
  }

  function sinTildes(t) {
    return String(t || '').toLowerCase()
      .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
      .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u').replace(/ñ/g, 'n')
      .replace(/[^a-z0-9]/g, '');
  }

  // Nombres de columna que se aceptan para cada campo. Primero los del
  // reporte del ERP, despues los que usa la exportacion de este sistema.
  var ALIAS = {
    sku:          ['codigosku', 'codigo', 'sku', 'codigointerno'],
    codigo:       ['codigoalternobarras', 'codigoalterno', 'alterna', 'codigodebarras',
                   'codigobarras', 'ean', 'gtin', 'barras'],
    descripcion:  ['descripcion', 'nombre', 'nombreinterno', 'producto'],
    empaque:      ['empaque', 'ue', 'unidadempaque', 'tipoempaque'],
    ue:           ['ueundporempaque', 'unidadesporempaque', 'ue', 'unidades', 'cantidad'],
    cajas:        ['cajas', 'stock', 'existencia', 'existencias'],
    precioUnd:    ['preciound', 'preciounitario', 'preciosiniva', 'precio'],
    descMax:      ['descmax', 'descmaximo', 'descuentomax', 'descuento'],
    iva:          ['iva'],
    precioFinal:  ['preciofinallistado', 'preciofinal', 'preciototal', 'preciocliente',
                   'preciogondola'],
    proveedor:    ['proveedor', 'nombreproveedor', 'laboratorio'],
    categoria:    ['categoria', 'linea', 'grupo']
  };

  function indiceDe(cabecera, nombres) {
    for (var i = 0; i < nombres.length; i++) {
      var p = cabecera.indexOf(nombres[i]);
      if (p !== -1) return p;
    }
    return -1;
  }

  /** Lee un CSV con las columnas del reporte. Devuelve { ok, filas, error }. */
  function parsearCsv(texto) {
    var lineas = String(texto || '').split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!lineas.length) return { ok: false, error: 'Archivo vacio' };

    var cab = partirCsv(lineas.shift()).map(sinTildes);
    var iSku = indiceDe(cab, ALIAS.sku);
    var iCod = indiceDe(cab, ALIAS.codigo);
    var iDes = indiceDe(cab, ALIAS.descripcion);

    if (iSku === -1 || iDes === -1) {
      return {
        ok: false,
        error: 'El CSV necesita al menos una columna de codigo interno ("Codigo" o "sku") ' +
               'y una de descripcion ("Descripcion" o "nombre"). ' +
               'Se leyeron estas columnas: ' + cab.join(', ')
      };
    }

    var iEmp = indiceDe(cab, ALIAS.empaque);
    var iUe  = indiceDe(cab, ALIAS.ue);
    var iCaj = indiceDe(cab, ALIAS.cajas);
    var iPu  = indiceDe(cab, ALIAS.precioUnd);
    var iDm  = indiceDe(cab, ALIAS.descMax);
    var iIva = indiceDe(cab, ALIAS.iva);
    var iPf  = indiceDe(cab, ALIAS.precioFinal);
    var iPro = indiceDe(cab, ALIAS.proveedor);
    var iCat = indiceDe(cab, ALIAS.categoria);

    var filas = [];
    for (var k = 0; k < lineas.length; k++) {
      var f = partirCsv(lineas[k]);
      var sku = limpiar(f[iSku]);
      if (!sku) continue;

      // u/e puede venir como "CAJ 18" en una sola celda.
      var empaque = iEmp !== -1 ? limpiar(f[iEmp]) : '';
      var ue = iUe !== -1 && iUe !== iEmp ? f[iUe] : '';
      var mEmp = new RegExp('^(' + EMPAQUES.join('|') + ')\\s*([0-9][0-9,]*)?$', 'i').exec(empaque);
      if (mEmp) { empaque = mEmp[1].toUpperCase(); if (!ue && mEmp[2]) ue = mEmp[2]; }
      else if (esNumerico(empaque) && !ue) { ue = empaque; empaque = ''; }

      filas.push({
        sku: sku,
        proveedor: iPro !== -1 ? limpiar(f[iPro]) : '',
        categoria: iCat !== -1 ? limpiar(f[iCat]) : '',
        codigoBruto: iCod !== -1 ? limpiar(f[iCod]) : '',
        descripcion: limpiar(f[iDes]),
        empaque: empaque,
        ue: aNumero(ue),
        cajas: iCaj !== -1 ? aNumero(f[iCaj]) : null,
        precioUnd: iPu !== -1 ? aNumero(f[iPu]) : null,
        descMax: iDm !== -1 ? aPorcentaje(f[iDm]) : null,
        iva: iIva !== -1 ? aPorcentaje(f[iIva]) : null,
        precioFinal: iPf !== -1 ? aNumero(f[iPf]) : null,
        linea: lineas[k].trim(),
        numeroFila: k + 2
      });
    }

    return { ok: true, filas: filas };
  }

  // ───────────────── Clasificacion ─────────────────

  /**
   * Nivel de empaque de la fila. La forma del codigo manda sobre la palabra
   * de la columna u/e: un GTIN-14 es un empaque agrupado por norma, diga lo
   * que diga el reporte.
   */
  function nivelDe(fila, revision) {
    if (revision && revision.ok) return Barcode.nivelProbable(revision.codigo);
    return 'unidad';
  }

  /**
   * Unidades que trae el empaque que identifica *este* codigo.
   *
   * Hay que separar dos numeros que el reporte pone en la misma columna:
   *
   *   u/e dice cuantas unidades trae la caja del proveedor. Es dato de
   *   compras: "JAB PROTEX OMEGA 3 X 110 GR, CAJ 72" son 72 jabones por caja.
   *   El precio de esa fila, 2.972, es el de un jabon, no el de la caja.
   *
   *   Lo que el codigo de barras identifica es la unidad, porque la Alterna es
   *   un EAN-13. Entonces su cantidad es 1, y el 72 pertenece al SKU.
   *
   * Cuando la Alterna es un GTIN-14 el codigo si identifica el empaque
   * agrupado, y ahi u/e si son las unidades que contiene.
   */
  function cantidadDe(fila, nivel) {
    if (nivel === 'unidad') return 1;
    if (nivel === 'variable') return 0;
    return fila.ue || 0;
  }

  /**
   * El listado trae los tres numeros del precio: el de costo, el descuento y
   * el IVA. Si el precio final no sale de esos tres, algo no cuadra en la
   * fila. Es la unica comprobacion que el propio archivo permite hacer, y
   * sirve para detectar lo que ningun ojo detecta: una fila donde los datos
   * se corrieron de renglon al convertir un PDF a tabla.
   *
   * Hay un caso legitimo: los productos con impuesto al consumo (cigarrillos,
   * algunas bebidas) tienen un precio final mas alto que lo que explican el
   * IVA y el descuento. Por eso esto no rechaza la fila: la marca.
   *
   * Devuelve { cuadra, esperado, diferencia } o null si faltan datos.
   */
  function revisarPrecio(fila) {
    if (fila.precioUnd === null || fila.precioFinal === null || fila.iva === null) return null;
    var descuento = (fila.descMax || 0) / 100;
    var esperado = Math.round(fila.precioUnd * (1 - descuento) * (1 + fila.iva / 100));
    var diferencia = fila.precioFinal - esperado;
    // Un peso o dos son redondeo; un 1% tapa el redondeo de los precios altos.
    var tolerancia = Math.max(2, fila.precioFinal * 0.01);
    return {
      cuadra: Math.abs(diferencia) <= tolerancia,
      esperado: esperado,
      diferencia: diferencia
    };
  }

  /** Clasifica cada fila y arma el resumen. */
  function clasificar(filas) {
    var salida = [];
    for (var i = 0; i < filas.length; i++) {
      var f = filas[i];
      var fila = {};
      for (var k in f) if (Object.prototype.hasOwnProperty.call(f, k)) fila[k] = f[k];

      if (fila.estado === ESTADOS.INCOMPLETA) { salida.push(fila); continue; }

      var rev = revisarCodigo(fila.codigoBruto, fila.sku);
      fila.codigo = rev.ok ? rev.codigo : '';
      fila.tipo = rev.tipo || '';
      fila.nivel = nivelDe(fila, rev);
      fila.cantidad = cantidadDe(fila, fila.nivel);
      // Las unidades por caja del proveedor son dato del SKU, no del codigo.
      fila.unidadesPorCaja = fila.nivel === 'unidad' ? (fila.ue || 0) : 0;
      fila.sugerencia = rev.sugerencia || '';
      fila.derivadoDelSku = !!rev.derivadoDelSku;

      if (rev.ok) {
        fila.estado = ESTADOS.OK;
        fila.motivo = '';
      } else if (!fila.codigoBruto) {
        fila.estado = ESTADOS.SIN_CODIGO;
        fila.motivo = 'La fila no trae codigo de barras en la columna Alterna';
      } else {
        fila.estado = ESTADOS.INVALIDO;
        fila.motivo = rev.motivo;
        if (fila.derivadoDelSku) {
          fila.motivo += '. Parece relleno del ERP: contiene el propio SKU ' + fila.sku;
        }
      }

      var precio = revisarPrecio(fila);
      fila.precioCuadra = precio ? precio.cuadra : null;
      fila.precioEsperado = precio ? precio.esperado : null;

      if (!fila.descripcion) {
        fila.motivo = (fila.motivo ? fila.motivo + '. ' : '') + 'Fila sin descripcion';
        if (fila.estado === ESTADOS.OK) fila.estado = ESTADOS.INCOMPLETA;
      }

      salida.push(fila);
    }
    return salida;
  }

  function resumir(filas) {
    var r = {
      total: filas.length,
      ok: 0, sinCodigo: 0, invalidos: 0, incompletas: 0,
      derivadosDelSku: 0, conSugerencia: 0, precioNoCuadra: 0,
      unidades: 0, cajas: 0, pacas: 0,
      conPrecio: 0,
      proveedores: [], duplicados: []
    };
    var vistos = {};
    var provs = {};

    for (var i = 0; i < filas.length; i++) {
      var f = filas[i];
      if (f.estado === ESTADOS.OK) r.ok++;
      else if (f.estado === ESTADOS.SIN_CODIGO) r.sinCodigo++;
      else if (f.estado === ESTADOS.INVALIDO) r.invalidos++;
      else r.incompletas++;

      if (f.derivadoDelSku) r.derivadosDelSku++;
      if (f.precioCuadra === false) r.precioNoCuadra++;
      if (f.sugerencia) r.conSugerencia++;
      if (f.precioFinal) r.conPrecio++;
      if (f.nivel === 'unidad' && f.codigo) r.unidades++;
      if (f.nivel === 'caja') r.cajas++;
      if (f.nivel === 'paca') r.pacas++;
      if (f.proveedor) provs[f.proveedor] = true;

      if (f.codigo) {
        if (vistos[f.codigo]) r.duplicados.push({ codigo: f.codigo, sku: f.sku, otroSku: vistos[f.codigo] });
        else vistos[f.codigo] = f.sku;
      }
    }

    r.proveedores = Object.keys(provs);
    return r;
  }

  /**
   * Punto de entrada: recibe el contenido del archivo y decide si es CSV o el
   * texto del reporte con columnas.
   *
   * Devuelve { ok, formato, filas, resumen, error }.
   */
  function leer(texto) {
    var limpio = String(texto || '').replace(/^﻿/, '');
    if (!limpio.trim()) return { ok: false, error: 'Archivo vacio' };

    var primera = limpio.split(/\r?\n/).find(function (l) { return l.trim(); }) || '';
    var pareceCsv = /[,;\t]/.test(primera) && /[a-z]/i.test(primera) &&
                    !RE_CABECERA.test(primera) &&
                    partirCsv(primera).length >= 3;

    if (pareceCsv) {
      var r = parsearCsv(limpio);
      if (!r.ok) return r;
      var filasCsv = clasificar(r.filas);
      return { ok: true, formato: 'csv', filas: filasCsv, resumen: resumir(filasCsv) };
    }

    var t = parsearTexto(limpio);
    if (!t.filas.length) {
      return {
        ok: false,
        error: 'No se reconocio ninguna fila de producto. Si es el PDF del reporte, ' +
               'conviertelo a texto conservando las columnas (pdftotext -layout) ' +
               'o pide el mismo reporte exportado a CSV.'
      };
    }
    var filas = clasificar(t.filas);
    return {
      ok: true,
      formato: 'texto',
      filas: filas,
      resumen: resumir(filas),
      descartadas: t.descartadas
    };
  }

  // ───────────────── Carga en la tabla de SKU ─────────────────

  /**
   * Guarda las filas leidas: las que tienen codigo de barras valido van a la
   * tabla de SKU, las demas a la cola de revision.
   *
   * reemplazar vacia las dos antes de cargar. Sirve para empezar de cero con
   * un listado nuevo; sin eso, un listado mas nuevo actualiza precio y
   * existencia de los SKU que ya estaban y agrega los que falten.
   *
   * Devuelve { ok, skusNuevos, codigosNuevos, actualizados, aRevision, rechazados }.
   */
  function aplicar(filas, reemplazar) {
    if (!global.SKU || !global.Revision) {
      return { ok: false, error: 'Faltan los modulos SKU y Revision' };
    }

    if (reemplazar) {
      global.SKU.vaciar();
      global.Revision.vaciar();
    }

    var buenas = [];
    var dudosas = [];
    for (var i = 0; i < filas.length; i++) {
      if (filas[i].estado === ESTADOS.OK) buenas.push(filas[i]);
      else dudosas.push(filas[i]);
    }

    var skusNuevos = 0, codigosNuevos = 0, actualizados = 0, rechazados = [];

    for (var j = 0; j < buenas.length; j++) {
      var f = buenas[j];
      var clave = String(f.sku).trim().toUpperCase();
      var destino = global.SKU.buscarSku(clave);

      var comercial = {
        proveedor: f.proveedor,
        precio: f.precioFinal,
        precioSinIva: f.precioUnd,
        iva: f.iva,
        cajas: f.cajas,
        empaque: f.empaque,
        unidadesPorCaja: f.unidadesPorCaja,
        precioCuadra: f.precioCuadra
      };

      if (!destino) {
        var r = global.SKU.crear(Object.assign({
          sku: clave,
          nombre: f.descripcion,
          categoria: f.categoria
        }, comercial, { origen: 'listado' }));
        if (!r.ok) { rechazados.push({ sku: clave, codigo: f.codigo, error: r.error }); continue; }
        destino = r.sku;
        skusNuevos++;
      } else {
        // El nombre interno no se pisa: puede estar corregido a mano. Precio y
        // existencia si, que es lo que cambia de un listado al siguiente.
        global.SKU.actualizar(clave, comercial);
      }

      var rv = global.SKU.vincular(clave, {
        codigo: f.codigo,
        nivel: f.nivel,
        cantidad: f.cantidad,
        proveedor: f.proveedor
      });
      if (!rv.ok) rechazados.push({ sku: clave, codigo: f.codigo, error: rv.error });
      else if (rv.nuevo) codigosNuevos++;
      else actualizados++;
    }

    // Las filas dudosas van a la cola con su motivo. El SKU y el precio se
    // guardan ahi mismo: cuando alguien escanee el producto, el pendiente ya
    // trae todo y solo falta el codigo.
    var cola = global.Revision.agregarVarias(dudosas);

    return {
      ok: true,
      skusNuevos: skusNuevos,
      codigosNuevos: codigosNuevos,
      actualizados: actualizados,
      aRevision: cola.nuevas + cola.reemplazadas,
      pendientesTotal: cola.total,
      rechazados: rechazados
    };
  }

  /**
   * Lee un archivo cualquiera: .xlsx, CSV o el texto del reporte.
   *
   * Es asincrono porque descomprimir el .xlsx lo es en el navegador. Para el
   * texto y el CSV devuelve lo mismo que leer(), ya resuelto.
   *
   * `origen` es texto, o un ArrayBuffer/Uint8Array cuando es un .xlsx.
   */
  function leerArchivo(origen, nombreArchivo) {
    var pareceBinario = typeof origen !== 'string';
    var pareceExcel = /\.xlsx?$/i.test(String(nombreArchivo || ''));

    if (!pareceBinario) return Promise.resolve(leer(origen));

    if (!pareceExcel && !esZip(origen)) {
      return Promise.reject(new Error(
        'No se reconoce el formato del archivo. Se aceptan .xlsx, CSV y el texto ' +
        'del reporte con las columnas conservadas.'
      ));
    }

    var Xlsx = global.Xlsx;
    if (!Xlsx && typeof require === 'function') { require('./xlsx.js'); Xlsx = global.Xlsx; }
    if (!Xlsx) return Promise.reject(new Error('Falta el modulo Xlsx para leer el archivo'));

    return Xlsx.leer(origen).then(function (libro) {
      var hoja = hojaConElListado(libro.hojas);
      if (!hoja) {
        return {
          ok: false,
          error: 'Ninguna hoja del archivo tiene columnas de listado de precios. ' +
                 'Se buscaron una columna de codigo interno y una de descripcion en: ' +
                 libro.hojas.map(function (h) { return h.nombre; }).join(', ')
        };
      }
      var r = parsearCsv(filasATexto(hoja.filas));
      if (!r.ok) return r;
      var filas = clasificar(r.filas);
      return {
        ok: true,
        formato: 'excel',
        hoja: hoja.nombre,
        hojas: libro.hojas.map(function (h) { return h.nombre; }),
        filas: filas,
        resumen: resumir(filas)
      };
    });
  }

  /** Los cuatro primeros bytes de todo ZIP, y un .xlsx es un ZIP. */
  function esZip(origen) {
    try {
      var b = origen instanceof Uint8Array ? origen : new Uint8Array(origen);
      return b[0] === 0x50 && b[1] === 0x4b;
    } catch (e) {
      return false;
    }
  }

  /**
   * Un libro trae varias hojas y solo una es el listado: las otras suelen ser
   * resumenes y notas. Se elige la que tenga las columnas que hacen falta, no
   * la primera.
   */
  function hojaConElListado(hojas) {
    for (var i = 0; i < hojas.length; i++) {
      var filas = hojas[i].filas;
      if (!filas || filas.length < 2) continue;
      var cab = filas[0].map(sinTildes);
      if (indiceDe(cab, ALIAS.sku) !== -1 && indiceDe(cab, ALIAS.descripcion) !== -1) {
        return hojas[i];
      }
    }
    return null;
  }

  /** Las filas de la hoja se vuelven CSV para reusar el mismo lector. */
  function filasATexto(filas) {
    return filas.map(function (fila) {
      return fila.map(function (celda) {
        return '"' + String(celda === undefined || celda === null ? '' : celda)
          .replace(/"/g, '""') + '"';
      }).join(',');
    }).join('\n');
  }

  var api = {
    ESTADOS: ESTADOS,
    leerArchivo: leerArchivo,
    revisarPrecio: revisarPrecio,
    EMPAQUES: EMPAQUES,
    leer: leer,
    aplicar: aplicar,
    parsearTexto: parsearTexto,
    parsearCsv: parsearCsv,
    clasificar: clasificar,
    resumir: resumir,
    revisarCodigo: revisarCodigo,
    aNumero: aNumero
  };

  global.Listado = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = { Listado: api };
})(typeof window !== 'undefined' ? window : globalThis);
