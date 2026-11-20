/**
 * ui.js — Piezas reutilizables de interfaz sin acoplamiento al dominio:
 * tema claro/oscuro, paginación de tablas, diálogos de confirmación /
 * importación y copiado al portapapeles.
 *
 * Las preferencias guardan su estado en localStorage bajo una sola clave, igual
 * que el resto de la app (slb.*). Si el almacenamiento está bloqueado la
 * interfaz sigue funcionando: solo deja de recordar la elección.
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
    } catch (e) { /* no se puede recordar; la sesión actual funciona igual */ }
  }

  leer();

  // ───────────────── Tema ─────────────────

  function temaDelSistema() {
    return global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'oscuro' : 'claro';
  }

  /** El tema que se está viendo: el elegido, o el del sistema si no hay ninguno. */
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

    if (global.matchMedia) {
      var consulta = global.matchMedia('(prefers-color-scheme: dark)');
      var alCambiar = function () { if (!preferencias.tema) aplicarTema(temaDelSistema()); };
      if (consulta.addEventListener) consulta.addEventListener('change', alCambiar);
      else if (consulta.addListener) consulta.addListener(alCambiar);
    }
  }

  // ───────────────── Paginación ─────────────────

  var ICONO_ANTERIOR =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M15 18l-6-6 6-6"/></svg>';
  var ICONO_SIGUIENTE =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M9 18l6-6-6-6"/></svg>';

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

    function recortar(lista) {
      total = lista.length;
      var limite = paginas();
      if (pagina > limite) pagina = limite;
      if (!tamano) return lista;
      var desde = (pagina - 1) * tamano;
      return lista.slice(desde, desde + tamano);
    }

    function pintar() {
      if (!contenedor) return;

      if (!total) { contenedor.innerHTML = ''; return; }

      var limite = paginas();
      var desde = tamano ? (pagina - 1) * tamano + 1 : 1;
      var hasta = tamano ? Math.min(total, pagina * tamano) : total;

      var numeros = '';
      if (limite > 1) {
        numeros = paginasVisibles(pagina, limite).map(function (p) {
          if (p === 'salto') return '<span class="pag-salto" aria-hidden="true">…</span>';
          return '<button type="button" class="pag-btn' + (p === pagina ? ' activa' : '') +
            '" data-pag-ir="' + p + '"' +
            (p === pagina ? ' aria-current="page"' : '') +
            ' aria-label="Página ' + p + '">' + p + '</button>';
        }).join('');
      }

      contenedor.innerHTML =
        '<span class="paginacion-info">' +
          (tamano
            ? '<strong>' + desde + '–' + hasta + '</strong> de ' + total + ' registros'
            : '<strong>' + total + '</strong> registros') +
        '</span>' +
        (limite > 1
          ? '<div class="paginacion-botones">' +
              '<button type="button" class="pag-btn" data-pag="anterior" aria-label="Página anterior"' +
                (pagina <= 1 ? ' disabled' : '') + '>' + ICONO_ANTERIOR + '</button>' +
              numeros +
              '<span class="paginacion-paso">' + pagina + ' de ' + limite + '</span>' +
              '<button type="button" class="pag-btn" data-pag="siguiente" aria-label="Página siguiente"' +
                (pagina >= limite ? ' disabled' : '') + '>' + ICONO_SIGUIENTE + '</button>' +
            '</div>'
          : '') +
        '<label class="paginacion-tamano"><span>Filas por página</span>' +
          '<select data-pag-tamano aria-label="Filas por página">' +
            TAMANOS.map(function (t) {
              return '<option value="' + t + '"' + (t === tamano ? ' selected' : '') + '>' +
                     (t ? t : 'Todas') + '</option>';
            }).join('') +
          '</select>' +
        '</label>';
    }

    function reiniciar() { pagina = 1; }

    return {
      recortar: recortar,
      pintar: pintar,
      reiniciar: reiniciar,
      get pagina() { return pagina; },
      get tamano() { return tamano; }
    };
  }

  // ───────────────── Diálogos accesibles ─────────────────

  /**
   * Diálogo de confirmación no bloqueante. Devuelve Promise<boolean>.
   * opciones: { titulo, mensaje, detalle, textoConfirmar, textoCancelar, variante }
   */
  function confirmar(opciones) {
    var o = opciones || {};
    var dlg = document.getElementById('dialogo-confirmar');
    if (!dlg || typeof dlg.showModal !== 'function') {
      var texto = (o.mensaje || '¿Confirmar?') + (o.detalle ? '\n\n' + o.detalle : '');
      return Promise.resolve(global.confirm(texto));
    }

    var elTitulo = document.getElementById('confirmar-titulo');
    var elMensaje = document.getElementById('confirmar-mensaje');
    var elDetalle = document.getElementById('confirmar-detalle');
    var btnAceptar = document.getElementById('confirmar-aceptar');
    var btnCancelar = document.getElementById('confirmar-cancelar');
    var btnCerrarX = document.getElementById('confirmar-cerrar-x');

    elTitulo.textContent = o.titulo || 'Confirmar acción';
    elMensaje.textContent = o.mensaje || '';
    elDetalle.textContent = o.detalle || '';
    elDetalle.classList.toggle('oculto', !o.detalle);
    btnAceptar.textContent = o.textoConfirmar || 'Confirmar';
    btnCancelar.textContent = o.textoCancelar || 'Cancelar';
    btnAceptar.className = 'btn ' + (o.variante === 'primario' ? 'btn-primario' : 'btn-peligro');

    return new Promise(function (resolve) {
      var terminado = false;
      function cerrar(resultado) {
        if (terminado) return;
        terminado = true;
        btnAceptar.removeEventListener('click', onAceptar);
        btnCancelar.removeEventListener('click', onCancelar);
        btnCerrarX.removeEventListener('click', onCancelar);
        dlg.removeEventListener('cancel', onCancelEvento);
        if (dlg.open) dlg.close();
        resolve(resultado);
      }
      function onAceptar() { cerrar(true); }
      function onCancelar() { cerrar(false); }
      function onCancelEvento(e) { e.preventDefault(); cerrar(false); }

      btnAceptar.addEventListener('click', onAceptar);
      btnCancelar.addEventListener('click', onCancelar);
      btnCerrarX.addEventListener('click', onCancelar);
      dlg.addEventListener('cancel', onCancelEvento);
      dlg.showModal();
      btnCancelar.focus();
    });
  }

  /**
   * Diálogo de 3 vías para importar sin confundir "Cancelar" con "Agregar".
   * Devuelve Promise<'fusionar' | 'reemplazar' | null>.
   */
  function elegirImportacion(opciones) {
    var o = opciones || {};
    var dlg = document.getElementById('dialogo-importar');
    if (!dlg || typeof dlg.showModal !== 'function') {
      var rep = global.confirm(o.mensaje || '¿Reemplazar la tabla actual?');
      return Promise.resolve(rep ? 'reemplazar' : 'fusionar');
    }

    document.getElementById('importar-titulo').textContent = o.titulo || '¿Cómo importar el archivo?';
    document.getElementById('importar-mensaje').textContent = o.mensaje || '';
    var btnFusionar = document.getElementById('importar-fusionar');
    var btnReemplazar = document.getElementById('importar-reemplazar');
    var btnCancelar = document.getElementById('importar-cancelar');
    var btnCerrarX = document.getElementById('importar-cerrar-x');

    return new Promise(function (resolve) {
      var terminado = false;
      function cerrar(modo) {
        if (terminado) return;
        terminado = true;
        btnFusionar.removeEventListener('click', onFusionar);
        btnReemplazar.removeEventListener('click', onReemplazar);
        btnCancelar.removeEventListener('click', onCancelar);
        btnCerrarX.removeEventListener('click', onCancelar);
        dlg.removeEventListener('cancel', onCancelEvento);
        if (dlg.open) dlg.close();
        resolve(modo);
      }
      function onFusionar() { cerrar('fusionar'); }
      function onReemplazar() { cerrar('reemplazar'); }
      function onCancelar() { cerrar(null); }
      function onCancelEvento(e) { e.preventDefault(); cerrar(null); }

      btnFusionar.addEventListener('click', onFusionar);
      btnReemplazar.addEventListener('click', onReemplazar);
      btnCancelar.addEventListener('click', onCancelar);
      btnCerrarX.addEventListener('click', onCancelar);
      dlg.addEventListener('cancel', onCancelEvento);
      dlg.showModal();
      btnFusionar.focus();
    });
  }

  // ───────────────── Portapapeles ─────────────────

  function copiar(texto) {
    var valor = String(texto || '');
    if (!valor) return Promise.resolve(false);
    if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
      return global.navigator.clipboard.writeText(valor).then(function () { return true; }).catch(function () {
        return copiarRespaldo(valor);
      });
    }
    return Promise.resolve(copiarRespaldo(valor));
  }

  function copiarRespaldo(valor) {
    try {
      var area = document.createElement('textarea');
      area.value = valor;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      var ok = document.execCommand('copy');
      area.remove();
      return !!ok;
    } catch (e) {
      return false;
    }
  }

  global.UI = {
    iniciarTema: iniciarTema,
    temaActual: temaActual,
    alternarTema: alternarTema,
    fijarTema: fijarTema,
    paginador: paginador,
    confirmar: confirmar,
    elegirImportacion: elegirImportacion,
    copiar: copiar
  };
})(typeof window !== 'undefined' ? window : globalThis);
