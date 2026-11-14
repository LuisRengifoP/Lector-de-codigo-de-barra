/**
 * barcode.js — Normalizacion, deteccion de tipo y validacion de codigos de barras.
 *
 * Soporta las simbologias que aparecen en productos de retail:
 *   EAN-8 (8), UPC-A (12), EAN-13 (13), ITF-14 / GTIN-14 (14).
 * Cualquier otra longitud se trata como codigo interno (Code 128 / Code 39),
 * que no lleva digito verificador estandar.
 */
(function (global) {
  'use strict';

  var PREFIJOS_PAIS = {
    '0': 'Estados Unidos / Canada',
    '1': 'Estados Unidos',
    '30': 'Francia', '31': 'Francia', '32': 'Francia', '33': 'Francia',
    '34': 'Francia', '35': 'Francia', '36': 'Francia', '37': 'Francia',
    '400': 'Alemania', '440': 'Alemania',
    '45': 'Japon', '49': 'Japon',
    '471': 'Taiwan',
    '489': 'Hong Kong',
    '50': 'Reino Unido',
    '539': 'Irlanda',
    '54': 'Belgica / Luxemburgo',
    '560': 'Portugal',
    '57': 'Dinamarca',
    '64': 'Finlandia',
    '690': 'China', '691': 'China', '692': 'China', '693': 'China', '694': 'China',
    '695': 'China', '696': 'China', '697': 'China', '698': 'China', '699': 'China',
    '70': 'Noruega',
    '73': 'Suecia',
    '754': 'Canada', '755': 'Canada',
    '759': 'Venezuela',
    '770': 'Colombia', '771': 'Colombia',
    '773': 'Uruguay',
    '775': 'Peru',
    '777': 'Bolivia',
    '778': 'Argentina', '779': 'Argentina',
    '780': 'Chile',
    '784': 'Paraguay',
    '786': 'Ecuador',
    '789': 'Brasil', '790': 'Brasil',
    '80': 'Italia', '81': 'Italia', '82': 'Italia', '83': 'Italia',
    '84': 'Espana',
    '850': 'Cuba',
    '859': 'Chequia',
    '860': 'Serbia',
    '87': 'Paises Bajos',
    '880': 'Corea del Sur',
    '885': 'Tailandia',
    '888': 'Singapur',
    '890': 'India',
    '893': 'Vietnam',
    '899': 'Indonesia',
    '93': 'Australia',
    '94': 'Nueva Zelanda',
    '950': 'GS1 Global',
    '955': 'Malasia',
    '96': 'GS1 Global',
    '977': 'Publicacion periodica (ISSN)',
    '978': 'Libro (ISBN)',
    '979': 'Libro (ISBN) / Partitura (ISMN)',
    '98': 'Cupon GS1',
    '99': 'Cupon'
  };

  /** Deja solo los caracteres utiles del codigo leido. */
  function normalizar(entrada) {
    if (entrada === null || entrada === undefined) return '';
    // El escaner USB puede anadir Enter, Tab o espacios: se descartan.
    var limpio = String(entrada).trim().toUpperCase();
    // Si es puramente numerico (con posible ruido), se conservan solo digitos.
    if (/^[0-9\s-]+$/.test(limpio)) return limpio.replace(/[^0-9]/g, '');
    // Codigo alfanumerico interno: se permiten letras, digitos, guion y punto.
    return limpio.replace(/[^A-Z0-9.-]/g, '');
  }

  /**
   * Digito verificador GTIN (EAN-8/13, UPC-A, ITF-14).
   * Se ponderan los digitos de derecha a izquierda con 3 y 1 alternados.
   */
  function digitoVerificador(cuerpo) {
    var digitos = String(cuerpo).replace(/[^0-9]/g, '');
    var suma = 0;
    var peso = 3; // El digito mas a la derecha del cuerpo siempre pesa 3.
    for (var i = digitos.length - 1; i >= 0; i--) {
      suma += Number(digitos[i]) * peso;
      peso = peso === 3 ? 1 : 3;
    }
    return (10 - (suma % 10)) % 10;
  }

  /** Identifica la simbologia por longitud. */
  function tipo(codigo) {
    var c = normalizar(codigo);
    if (!/^[0-9]+$/.test(c)) {
      return { nombre: 'Code 128 / interno', gtin: false, longitud: c.length };
    }
    switch (c.length) {
      case 8:  return { nombre: 'EAN-8', gtin: true, longitud: 8 };
      case 12: return { nombre: 'UPC-A', gtin: true, longitud: 12 };
      case 13: return { nombre: 'EAN-13', gtin: true, longitud: 13 };
      case 14: return { nombre: 'ITF-14 (GTIN-14)', gtin: true, longitud: 14 };
      default: return { nombre: 'Numerico interno', gtin: false, longitud: c.length };
    }
  }

  /**
   * Valida el codigo. Devuelve { valido, codigo, tipo, motivo }.
   * Un codigo interno (no GTIN) se acepta: no tiene checksum que comprobar.
   */
  function validar(entrada) {
    var c = normalizar(entrada);
    var t = tipo(c);

    if (c.length === 0) {
      return { valido: false, codigo: c, tipo: t, motivo: 'Codigo vacio' };
    }
    if (c.length < 4) {
      return { valido: false, codigo: c, tipo: t, motivo: 'Codigo demasiado corto (minimo 4 caracteres)' };
    }
    if (!t.gtin) {
      return { valido: true, codigo: c, tipo: t, motivo: 'Codigo interno: sin digito verificador estandar' };
    }

    var cuerpo = c.slice(0, -1);
    var leido = Number(c.slice(-1));
    var esperado = digitoVerificador(cuerpo);
    if (leido !== esperado) {
      return {
        valido: false,
        codigo: c,
        tipo: t,
        motivo: 'Digito verificador incorrecto: se leyo ' + leido + ', se esperaba ' + esperado
      };
    }
    return { valido: true, codigo: c, tipo: t, motivo: 'Digito verificador correcto' };
  }

  /**
   * Convierte a GTIN-13 para que la busqueda sea consistente:
   * un mismo producto puede llegar como UPC-A de 12 digitos o EAN-13 con cero inicial.
   */
  function aGtin13(entrada) {
    var c = normalizar(entrada);
    if (!/^[0-9]+$/.test(c)) return c;
    if (c.length === 12) return '0' + c;
    if (c.length === 14 && c.charAt(0) === '0') return c.slice(1);
    return c;
  }

  /** Claves equivalentes de un mismo producto, para buscar en la base. */
  function clavesEquivalentes(entrada) {
    var c = normalizar(entrada);
    var claves = [c];
    var g13 = aGtin13(c);
    if (claves.indexOf(g13) === -1) claves.push(g13);
    if (g13.length === 13 && g13.charAt(0) === '0') {
      var upc = g13.slice(1);
      if (claves.indexOf(upc) === -1) claves.push(upc);
    }
    return claves;
  }

  /** Pais u origen segun el prefijo GS1. Solo informativo. */
  function origenGs1(entrada) {
    var c = aGtin13(normalizar(entrada));
    if (!/^[0-9]{13}$/.test(c)) return null;
    // Rango reservado para codificacion interna del comercio.
    if (c.charAt(0) === '2') return 'Codigo interno del comercio (peso variable / granel)';
    var candidatos = [c.slice(0, 3), c.slice(0, 2), c.slice(0, 1)];
    for (var i = 0; i < candidatos.length; i++) {
      if (PREFIJOS_PAIS[candidatos[i]]) return PREFIJOS_PAIS[candidatos[i]];
    }
    return null;
  }

  /** Genera un codigo interno valido (prefijo 2) para productos sin codigo de fabrica. */
  function generarCodigoInterno(secuencia) {
    var cuerpo = String(secuencia).replace(/[^0-9]/g, '');
    while (cuerpo.length < 11) cuerpo = '0' + cuerpo;
    var base = '2' + cuerpo.slice(0, 11);
    return base + digitoVerificador(base);
  }

  // ───────────── Niveles de empaque: unidad, caja ─────────────
  //
  // Un mismo SKU llega con codigos distintos segun el empaque:
  //   unidad  ->  EAN-13  (7702084137520)
  //   caja    ->  ITF-14 / GTIN-14  (17702084137527)
  //
  // Un GTIN-14 se compone de: digito indicador + 12 digitos base + digito
  // verificador. Esos 12 digitos base son los mismos del EAN-13 de la unidad.
  // Por eso se puede *proponer* el vinculo entre la caja y la unidad.
  //
  // Es una propuesta, no una certeza: hay proveedores que no respetan la
  // norma y numeran la caja con un GTIN sin relacion con el de la unidad.

  /**
   * Los 12 digitos base de un GTIN, sin importar el nivel de empaque.
   * Devuelve null si el codigo no es un GTIN de 12, 13 o 14 digitos.
   */
  function baseGtin(entrada) {
    var c = normalizar(entrada);
    if (!/^[0-9]+$/.test(c)) return null;
    if (c.length === 14) return c.slice(1, 13);
    if (c.length === 13) return c.slice(0, 12);
    if (c.length === 12) return ('0' + c).slice(0, 12);
    return null; // EAN-8 tiene otra estructura: no comparte base de 12.
  }

  /** True si dos codigos son el mismo producto en distinto empaque. */
  function mismaBase(a, b) {
    var ba = baseGtin(a);
    var bb = baseGtin(b);
    return !!ba && ba === bb;
  }

  /** El EAN-13 de la unidad que corresponde a un GTIN-14 de caja. */
  function gtin13DesdeGtin14(entrada) {
    var base = baseGtin(entrada);
    if (!base) return null;
    return base + digitoVerificador(base);
  }

  /**
   * El GTIN-14 de caja que corresponde a una unidad, para un digito indicador.
   * indicador 1..8: niveles de agrupacion. 9: medida variable.
   */
  function gtin14Desde(entrada, indicador) {
    var base = baseGtin(entrada);
    var i = String(indicador === undefined ? 1 : indicador);
    if (!base || !/^[0-9]$/.test(i)) return null;
    var cuerpo = i + base;
    return cuerpo + digitoVerificador(cuerpo);
  }

  /**
   * Nivel de empaque probable, por la forma del codigo.
   * Es una pista para preseleccionar el campo, no un dato del producto:
   * la cantidad por caja solo la sabe quien abre la caja.
   */
  function nivelProbable(entrada) {
    var c = normalizar(entrada);
    if (!/^[0-9]+$/.test(c)) return 'unidad';
    if (c.length !== 14) return 'unidad';
    var indicador = c.charAt(0);
    if (indicador === '0') return 'unidad';   // GTIN-13 rellenado a 14: mismo nivel.
    if (indicador === '9') return 'variable'; // Medida variable: peso, no unidades.
    return 'caja';
  }

  /** Digito indicador de un GTIN-14. null si el codigo no tiene 14 digitos. */
  function indicador(entrada) {
    var c = normalizar(entrada);
    if (!/^[0-9]{14}$/.test(c)) return null;
    return c.charAt(0);
  }

  global.Barcode = {
    normalizar: normalizar,
    digitoVerificador: digitoVerificador,
    tipo: tipo,
    validar: validar,
    aGtin13: aGtin13,
    clavesEquivalentes: clavesEquivalentes,
    origenGs1: origenGs1,
    generarCodigoInterno: generarCodigoInterno,
    baseGtin: baseGtin,
    mismaBase: mismaBase,
    gtin13DesdeGtin14: gtin13DesdeGtin14,
    gtin14Desde: gtin14Desde,
    nivelProbable: nivelProbable,
    indicador: indicador
  };
})(typeof window !== 'undefined' ? window : globalThis);
