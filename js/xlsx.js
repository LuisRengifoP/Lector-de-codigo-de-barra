/**
 * xlsx.js — Lector minimo de archivos .xlsx, sin librerias.
 *
 * Un .xlsx es un ZIP con XML adentro. Lo que hace falta para leer un listado
 * de precios es poco: la lista de textos compartidos y las celdas de la
 * primera hoja. Eso cabe aqui y evita cargar una libreria de medio mega para
 * leer una tabla.
 *
 * Funciona en el navegador y en Node:
 *   navegador  DecompressionStream('deflate-raw')
 *   Node       zlib.inflateRawSync
 *
 * No entiende formatos, formulas ni fechas: devuelve cada celda como texto,
 * que es justo lo que el importador necesita. Una celda con formula devuelve
 * su ultimo valor calculado, que es el que Excel guardo.
 */
(function (global) {
  'use strict';

  var ES_NODE = typeof process !== 'undefined' && process.versions && process.versions.node;

  // ───────────────── ZIP ─────────────────

  function leerU16(datos, pos) { return datos[pos] | (datos[pos + 1] << 8); }
  function leerU32(datos, pos) {
    return ((datos[pos] | (datos[pos + 1] << 8) | (datos[pos + 2] << 16)) +
            (datos[pos + 3] * 16777216));
  }

  /**
   * Indice de los archivos del ZIP, leido desde el directorio central.
   * Se busca la firma del final (EOCD) desde atras, que es como se lee un ZIP.
   */
  function indiceZip(datos) {
    var fin = -1;
    var minimo = Math.max(0, datos.length - 66000); // Comentario final: 64 KB maximo.
    for (var i = datos.length - 22; i >= minimo; i--) {
      if (datos[i] === 0x50 && datos[i + 1] === 0x4b &&
          datos[i + 2] === 0x05 && datos[i + 3] === 0x06) { fin = i; break; }
    }
    if (fin === -1) throw new Error('No parece un archivo .xlsx: no se encontro el final del ZIP');

    var cuantos = leerU16(datos, fin + 10);
    var inicio = leerU32(datos, fin + 16);
    var entradas = {};
    var pos = inicio;

    for (var n = 0; n < cuantos; n++) {
      if (leerU32(datos, pos) !== 0x02014b50) break;
      var metodo = leerU16(datos, pos + 10);
      var comprimido = leerU32(datos, pos + 20);
      var largoNombre = leerU16(datos, pos + 28);
      var largoExtra = leerU16(datos, pos + 30);
      var largoComentario = leerU16(datos, pos + 32);
      var desplazamiento = leerU32(datos, pos + 42);
      var nombre = textoUtf8(datos.subarray(pos + 46, pos + 46 + largoNombre));
      entradas[nombre] = { metodo: metodo, comprimido: comprimido, desplazamiento: desplazamiento };
      pos += 46 + largoNombre + largoExtra + largoComentario;
    }
    return entradas;
  }

  /** Datos crudos de una entrada, saltando su cabecera local. */
  function bytesDe(datos, entrada) {
    var pos = entrada.desplazamiento;
    if (leerU32(datos, pos) !== 0x04034b50) throw new Error('Entrada del ZIP danada');
    var largoNombre = leerU16(datos, pos + 26);
    var largoExtra = leerU16(datos, pos + 28);
    var inicio = pos + 30 + largoNombre + largoExtra;
    return datos.subarray(inicio, inicio + entrada.comprimido);
  }

  function inflar(bytes) {
    if (ES_NODE) {
      var zlib = require('zlib');
      return Promise.resolve(new Uint8Array(zlib.inflateRawSync(Buffer.from(bytes))));
    }
    if (typeof global.DecompressionStream !== 'function') {
      return Promise.reject(new Error(
        'Este navegador no puede descomprimir el .xlsx. Guarda el archivo como CSV ' +
        'desde Excel y cargalo asi.'
      ));
    }
    var flujo = new global.DecompressionStream('deflate-raw');
    var escritor = flujo.writable.getWriter();
    escritor.write(bytes);
    escritor.close();
    return new global.Response(flujo.readable).arrayBuffer().then(function (b) {
      return new Uint8Array(b);
    });
  }

  function textoUtf8(bytes) {
    if (typeof TextDecoder === 'function') return new TextDecoder('utf-8').decode(bytes);
    return Buffer.from(bytes).toString('utf8');
  }

  function archivo(datos, entradas, nombre) {
    var e = entradas[nombre];
    if (!e) return Promise.resolve(null);
    var bytes = bytesDe(datos, e);
    if (e.metodo === 0) return Promise.resolve(textoUtf8(bytes));      // Sin comprimir.
    if (e.metodo !== 8) return Promise.reject(new Error('Compresion no soportada en ' + nombre));
    return inflar(bytes).then(textoUtf8);
  }

  // ───────────────── XML ─────────────────

  var ENTIDADES = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'"
  };

  function desescapar(t) {
    if (t.indexOf('&') === -1) return t;
    return t.replace(/&(?:amp|lt|gt|quot|apos|#x?[0-9a-fA-F]+);/g, function (e) {
      if (ENTIDADES[e]) return ENTIDADES[e];
      var cuerpo = e.slice(2, -1);
      var codigo = cuerpo.charAt(0) === 'x' || cuerpo.charAt(0) === 'X'
        ? parseInt(cuerpo.slice(1), 16)
        : parseInt(cuerpo, 10);
      return isFinite(codigo) ? String.fromCodePoint(codigo) : e;
    });
  }

  /** Todo el texto de los <t> que haya dentro del fragmento. */
  function textoDeT(fragmento) {
    var salida = '';
    var re = /<t[^>]*>([\s\S]*?)<\/t>|<t[^>]*\/>/g;
    var m;
    while ((m = re.exec(fragmento))) salida += desescapar(m[1] || '');
    return salida;
  }

  function textosCompartidos(xml) {
    if (!xml) return [];
    var lista = [];
    var re = /<si[^>]*>([\s\S]*?)<\/si>|<si[^>]*\/>/g;
    var m;
    while ((m = re.exec(xml))) lista.push(textoDeT(m[1] || ''));
    return lista;
  }

  /** "BC12" -> 54. La columna va en letras y la fila en numeros. */
  function indiceColumna(ref) {
    var n = 0;
    for (var i = 0; i < ref.length; i++) {
      var c = ref.charCodeAt(i);
      if (c < 65 || c > 90) break;
      n = n * 26 + (c - 64);
    }
    return n - 1;
  }

  function filasDeHoja(xml, compartidos) {
    var filas = [];
    var reFila = /<row[^>]*>([\s\S]*?)<\/row>|<row[^>]*\/>/g;
    var mFila;

    while ((mFila = reFila.exec(xml))) {
      var cuerpo = mFila[1] || '';
      var celdas = [];
      var maximo = -1;

      var reCelda = /<c\s([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g;
      var mCelda;
      while ((mCelda = reCelda.exec(cuerpo))) {
        var atributos = mCelda[1];
        var interior = mCelda[3] || '';

        var mRef = /\br="([A-Z]+)\d+"/.exec(atributos);
        var mTipo = /\bt="([^"]+)"/.exec(atributos);
        var tipo = mTipo ? mTipo[1] : 'n';
        var columna = mRef ? indiceColumna(mRef[1]) : celdas.length;

        var valor = '';
        if (tipo === 'inlineStr') {
          valor = textoDeT(interior);
        } else {
          var mV = /<v[^>]*>([\s\S]*?)<\/v>/.exec(interior);
          var crudo = mV ? desescapar(mV[1]) : '';
          if (tipo === 's') {
            var i = parseInt(crudo, 10);
            valor = isFinite(i) && compartidos[i] !== undefined ? compartidos[i] : '';
          } else {
            valor = crudo;
          }
        }

        celdas[columna] = valor;
        if (columna > maximo) maximo = columna;
      }

      var fila = [];
      for (var k = 0; k <= maximo; k++) fila.push(celdas[k] === undefined ? '' : celdas[k]);
      filas.push(fila);
    }
    return filas;
  }

  /** Nombres de las hojas, en el orden del libro. */
  function nombresDeHojas(xmlLibro) {
    var nombres = [];
    if (!xmlLibro) return nombres;
    var re = /<sheet\s[^>]*name="([^"]*)"[^>]*>/g;
    var m;
    while ((m = re.exec(xmlLibro))) nombres.push(desescapar(m[1]));
    return nombres;
  }

  /**
   * Lee el archivo y devuelve { hojas: [{ nombre, filas }] }.
   * `origen` es un ArrayBuffer, un Uint8Array o un Buffer de Node.
   */
  function leer(origen) {
    var datos;
    try {
      datos = origen instanceof Uint8Array ? origen : new Uint8Array(origen);
    } catch (e) {
      return Promise.reject(new Error('No se pudo leer el archivo'));
    }

    var entradas;
    try {
      entradas = indiceZip(datos);
    } catch (e) {
      return Promise.reject(e);
    }

    var nombresHoja = Object.keys(entradas)
      .filter(function (n) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(n); })
      .sort(function (a, b) {
        return Number(/(\d+)/.exec(a)[1]) - Number(/(\d+)/.exec(b)[1]);
      });

    if (!nombresHoja.length) {
      return Promise.reject(new Error('El archivo no tiene ninguna hoja de calculo'));
    }

    return Promise.all([
      archivo(datos, entradas, 'xl/sharedStrings.xml'),
      archivo(datos, entradas, 'xl/workbook.xml')
    ]).then(function (r) {
      var compartidos = textosCompartidos(r[0]);
      var titulos = nombresDeHojas(r[1]);

      return Promise.all(nombresHoja.map(function (n) {
        return archivo(datos, entradas, n);
      })).then(function (xmls) {
        return {
          hojas: xmls.map(function (xml, i) {
            return { nombre: titulos[i] || ('Hoja ' + (i + 1)), filas: filasDeHoja(xml, compartidos) };
          })
        };
      });
    });
  }

  var api = { leer: leer };
  global.Xlsx = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = { Xlsx: api };
})(typeof window !== 'undefined' ? window : globalThis);
