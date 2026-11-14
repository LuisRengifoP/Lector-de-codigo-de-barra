/**
 * ean13.js — Dibuja un codigo de barras EAN-13 en un canvas.
 *
 * Sirve para probar la camara sin tener productos a mano: se muestra el codigo
 * en pantalla o impreso y se apunta la webcam. La codificacion sigue la norma
 * EAN-13: zona muda, marca de inicio, seis digitos con paridad variable,
 * marca central, seis digitos derechos y marca de cierre.
 */
(function (global) {
  'use strict';

  // Juegos de patrones de la norma. Cada digito son 7 modulos.
  var L = ['0001101', '0011001', '0010011', '0111101', '0100011',
           '0110001', '0101111', '0111011', '0110111', '0001011'];
  var G = ['0100111', '0110011', '0011011', '0100001', '0011101',
           '0111001', '0000101', '0010001', '0001001', '0010111'];
  var R = ['1110010', '1100110', '1101100', '1000010', '1011100',
           '1001110', '1010000', '1000100', '1001000', '1110100'];

  // El primer digito no se dibuja: se codifica en la paridad de los seis siguientes.
  var PARIDAD = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
                 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

  var MODULOS_ZONA_MUDA = 11; // Margen blanco obligatorio a cada lado.

  /** Cadena de modulos (1 = barra, 0 = espacio) de un EAN-13 completo. */
  function patron(codigo) {
    var c = String(codigo).replace(/[^0-9]/g, '');
    if (c.length !== 13) throw new Error('EAN-13 requiere 13 digitos, llegaron ' + c.length);

    var d = c.split('').map(Number);
    var par = PARIDAD[d[0]];
    var bits = '101'; // Marca de inicio.

    for (var i = 1; i <= 6; i++) {
      bits += (par.charAt(i - 1) === 'L' ? L : G)[d[i]];
    }
    bits += '01010'; // Marca central.
    for (var j = 7; j <= 12; j++) {
      bits += R[d[j]];
    }
    return bits + '101'; // Marca de cierre.
  }

  /**
   * Dibuja el codigo en un canvas.
   * opciones: { modulo, alto, texto }
   */
  function dibujar(canvas, codigo, opciones) {
    var o = opciones || {};
    var modulo = o.modulo || 3;       // Ancho en pixeles del modulo mas fino.
    var alto = o.alto || 120;
    var margenTexto = o.texto === false ? 8 : 26;

    var bits = patron(codigo);
    var anchoTotal = (bits.length + MODULOS_ZONA_MUDA * 2) * modulo;

    canvas.width = anchoTotal;
    canvas.height = alto + 16 + margenTexto;

    var g = canvas.getContext('2d');
    // Fondo blanco: el contraste es lo que permite decodificar.
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, canvas.width, canvas.height);

    g.fillStyle = '#000000';
    for (var i = 0; i < bits.length; i++) {
      if (bits.charAt(i) === '1') {
        g.fillRect((i + MODULOS_ZONA_MUDA) * modulo, 8, modulo, alto);
      }
    }

    if (o.texto !== false) {
      g.fillStyle = '#000000';
      g.font = Math.max(11, modulo * 4) + 'px ui-monospace, Consolas, monospace';
      g.textAlign = 'center';
      g.fillText(String(codigo), canvas.width / 2, alto + 28);
    }
    return canvas;
  }

  global.Ean13 = { patron: patron, dibujar: dibujar };
})(typeof window !== 'undefined' ? window : globalThis);
