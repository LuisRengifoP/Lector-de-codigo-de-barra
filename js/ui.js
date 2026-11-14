/**
 * ui.js — Dos piezas de interfaz que no saben nada del dominio: el tema
 * claro/oscuro y la paginacion de las tablas.
 *
 * Las dos guardan su estado en localStorage bajo una sola clave, igual que el
 * resto de la app (slb.*). Si el almacenamiento esta bloqueado la interfaz
 * sigue funcionando: solo deja de recordar la eleccion.
 *
 * Paginacion: las tablas se pintan con innerHTML en cada refresco, asi que el
 * paginador no guarda filas. Recibe la lista completa, devuelve el trozo que
 * toca pintar y dibuja sus controles. El modulo que lo usa vuelve a llamar a
 * su propia funcion de refresco cuando el paginador cambia de pagina.
 */
(function (global) {
  'use strict';

  var CLAVE = 'slb.ui.v1';
  var TAMANOS = [10, 25, 50, 100, 0];   // 0 = todos
  var TAMANO_POR_DEFECTO = 25;

  var preferencias = { tema: null, tamanos: {} };

  function leer() {
    try {
      var crudo = global.localStorage.getItem(CLAVE);
      if (!crudo) return;
      var datos = JSON.parse(crudo) || {};
      if (datos.tema === 'claro' || datos.tema === 'oscuro') preferencias.tema = datos.tema;
      if (datos.tamanos && typeof datos.tamanos === 'object') preferencias.tamanos = datos.tamanos;
    } catch (e) { /* almacenamiento bloqueado o dato corrupto: valores por defecto */ }
  }

  function guardar() {
    try {
      global.localStorage.setItem(CLAVE, JSON.stringify(preferencias));
    } catch (e) { /* no se puede recordar; la sesion actual funciona igual */ }
  }

  leer();

  // ───────────────── Tema ─────────────────

  function temaDelSistema() {
    return global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'oscuro' : 'claro';
  }

  /** El tema que se esta viendo: el elegido, o el del sistema si no hay ninguno. */
  function temaActual() {
    return preferencias.tema || temaDelSistema();
  }

  function aplicarTema(tema) {
    document.documentElement.setAttribute('data-tema', tema);
    var boton = document.getElementById('btn-tema');
    if (!boton) return;
    var siguiente = tema === 'oscuro' ? 'claro' : 'oscuro';
    boton.setAttribute('aria-label', 'Cambiar al tema ' + siguiente);
    boton.setAttribute('title', 'Cambiar al tema ' + siguiente);
    boton.setAttribute('aria-pressed', tema === 'oscuro' ? 'true' : 'false');
  }

  function fijarTema(tema) {
    preferencias.tema = tema === 'oscuro' ? 'oscuro' : 'claro';
    guardar();
    aplicarTema(preferencias.tema);
  }

  function alternarTema() {
    fijarTema(temaActual() === 'oscuro' ? 'claro' : 'oscuro');
  }

  function iniciarTema() {
    aplicarTema(temaActual());
    var boton = document.getElementById('btn-tema');
    if (boton) boton.addEventListener('click', alternarTema);

    // Mientras el usuario no haya elegido, el sistema sigue mandando: si el
    // telefono pasa a modo oscuro de noche, la app lo sigue.
    if (global.matchMedia) {
      var consulta = global.matchMedia('(prefers-color-scheme: dark)');
      var alCambiar = function () { if (!preferencias.tema) aplicarTema(temaDelSistema()); };
      if (consulta.addEventListener) consulta.addEventListener('change', alCambiar);
      else if (consulta.addListener) consulta.addListener(alCambiar);
    }
  }

  // ───────────────── Paginacion ─────────────────

  var ICONO_ANTERIOR =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M15 18l-6-6 6-6"/></svg>';
  var ICONO_SIGUIENTE =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M9 18l6-6-6-6"/></svg>';

  /**
   * Las paginas que se muestran como boton: siempre la primera, la ultima y
   * las vecinas de la actual. El resto se resume con puntos suspensivos, para
   * que una tabla de 400 paginas no dibuje 400 botones.
   */
  function paginasVisibles(actual, total) {
    var cerca = {};
    cerca[1] = true;
    cerca[total] = true;
    for (var p = actual - 1; p <= actual + 1; p++) {
      if (p >= 1 && p <= total) cerca[p] = true;
    }
    var lista = Object.keys(cerca).map(Number).sort(function (a, b) { return a - b; });

    var salida = [];
    for (var i = 0; i < lista.length; i++) {
      if (i > 0 && lista[i] - lista[i - 1] > 1) salida.push('salto');
      salida.push(lista[i]);
    }
    return salida;
  }

  /**
   * Crea un paginador para una tabla.
   *
   * @param idContenedor  div vacio donde van los controles.
   * @param alCambiar     se llama cuando cambia la pagina o el tamano; el
   *                      modulo vuelve a pintar su tabla desde cero.
   * @param opciones      { tamano: filas por pagina por defecto }
   */
  function paginador(idContenedor, alCambiar, opciones) {
    var contenedor = document.getElementById(idContenedor);
    var guardadoTamano = Number(preferencias.tamanos[idContenedor]);
    var tamano = TAMANOS.indexOf(guardadoTamano) !== -1
      ? guardadoTamano
      : ((opciones && opciones.tamano) || TAMANO_POR_DEFECTO);

    var pagina = 1;
    var total = 0;

    function paginas() {
      if (!tamano) return 1;
      return Math.max(1, Math.ceil(total / tamano));
    }

    function ir(nueva) {
      var limite = paginas();
      var destino = Math.min(Math.max(1, nueva), limite);
      if (destino === pagina) return;
      pagina = destino;
      if (alCambiar) alCambiar();
    }

    function cambiarTamano(nuevo) {
      tamano = Number(nuevo) || 0;
      preferencias.tamanos[idContenedor] = tamano;
      guardar();
      pagina = 1;
      if (alCambiar) alCambiar();
    }

    if (contenedor) {
      contenedor.addEventListener('click', function (e) {
        var boton = e.target.closest('button');
        if (!boton || boton.disabled) return;
        if (boton.dataset.pagIr) { ir(Number(boton.dataset.pagIr)); return; }
        if (boton.dataset.pag === 'anterior') ir(pagina - 1);
        if (boton.dataset.pag === 'siguiente') ir(pagina + 1);
      });
      contenedor.addEventListener('change', function (e) {
        if (e.target.matches('[data-pag-tamano]')) cambiarTamano(e.target.value);
      });
    }

    /**
     * Devuelve solo las filas de la pagina actual. Si la lista se encogio
     * (una busqueda, un borrado), la pagina se ajusta en vez de quedar vacia.
     */
    function recortar(lista) {
      total = lista.length;
      var limite = paginas();
      if (pagina > limite) pagina = limite;
      if (!tamano) return lista;
      var desde = (pagina - 1) * tamano;
      return lista.slice(desde, desde + tamano);
    }

    /** Dibuja los controles. Se llama despues de recortar(). */
    function pintar() {
      if (!contenedor) return;

      if (!total) { contenedor.innerHTML = ''; return; }

      var limite = paginas();
      var desde = tamano ? (pagina - 1) * tamano + 1 : 1;
      var hasta = tamano ? Math.min(total, pagina * tamano) : total;

      var numeros = '';
      if (limite > 1) {
        numeros = paginasVisibles(pagina, limite).map(function (p) {
          if (p === 'salto') return '<span class="pag-salto" aria-hidden="true">...</span>';
          return '<button type="button" class="pag-btn' + (p === pagina ? ' activa' : '') +
            '" data-pag-ir="' + p + '"' +
            (p === pagina ? ' aria-current="page"' : '') +
            ' aria-label="Pagina ' + p + '">' + p + '</button>';
        }).join('');
      }

      contenedor.innerHTML =
        '<span class="paginacion-info">' +
          (tamano
            ? '<strong>' + desde + '-' + hasta + '</strong> de ' + total + ' registros'
            : '<strong>' + total + '</strong> registros') +
        '</span>' +
        (limite > 1
          ? '<div class="paginacion-botones">' +
              '<button type="button" class="pag-btn" data-pag="anterior" aria-label="Pagina anterior"' +
                (pagina <= 1 ? ' disabled' : '') + '>' + ICONO_ANTERIOR + '</button>' +
              numeros +
              '<span class="paginacion-paso">' + pagina + ' de ' + limite + '</span>' +
              '<button type="button" class="pag-btn" data-pag="siguiente" aria-label="Pagina siguiente"' +
                (pagina >= limite ? ' disabled' : '') + '>' + ICONO_SIGUIENTE + '</button>' +
            '</div>'
          : '') +
        '<label class="paginacion-tamano"><span>Filas por pagina</span>' +
          '<select data-pag-tamano aria-label="Filas por pagina">' +
            TAMANOS.map(function (t) {
              return '<option value="' + t + '"' + (t === tamano ? ' selected' : '') + '>' +
                     (t ? t : 'Todas') + '</option>';
            }).join('') +
          '</select>' +
        '</label>';
    }

    /** Vuelve a la primera pagina. Se usa al cambiar la busqueda. */
    function reiniciar() { pagina = 1; }

    return {
      recortar: recortar,
      pintar: pintar,
      reiniciar: reiniciar,
      get pagina() { return pagina; },
      get tamano() { return tamano; }
    };
  }

  global.UI = {
    iniciarTema: iniciarTema,
    temaActual: temaActual,
    alternarTema: alternarTema,
    fijarTema: fijarTema,
    paginador: paginador
  };
})(typeof window !== 'undefined' ? window : globalThis);
