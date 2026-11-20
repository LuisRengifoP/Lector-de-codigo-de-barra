/**
 * app.js — Orquesta la interfaz: entrada del código, consulta a la base,
 * presentación del nombre del producto, alta de productos nuevos,
 * administración de la base e historial.
 */
(function () {
  'use strict';

  var el = {};
  var moneda = new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0
  });
  var fecha = new Intl.DateTimeFormat('es', { dateStyle: 'short', timeStyle: 'medium' });
  var codigoEnCurso = '';

  // Estado de filtros rápidos por vista (puramente de presentación).
  var filtroSku = 'todos';
  var filtroRevision = 'todos';
  var filtroProducto = 'todos';
  var filtroHistorial = 'todos';

  // Un paginador por tabla. Se crean en iniciar(), cuando ya existe el DOM.
  var pagProductos, pagSkus, pagRevision, pagHistorial;

  var ICONOS = {
    ok: '<svg class="aviso-icono" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>',
    error: '<svg class="aviso-icono" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
    info: '<svg class="aviso-icono" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>',
    cerrar: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    copiar: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    recargar: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/></svg>',
    editar: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    borrar: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
    mas: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    escaner: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8v8M11 8v8M15 8v8"/></svg>',
    caja: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8 12 3 3 8l9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/></svg>',
    camara: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    detener: '<rect x="6" y="6" width="12" height="12" rx="2"/>'
  };

  function $(id) { return document.getElementById(id); }

  function cachearElementos() {
    [
      'entrada-codigo', 'btn-limpiar-codigo', 'btn-buscar', 'btn-camara',
      'btn-camara-icono', 'btn-camara-texto', 'camara-envoltorio', 'video',
      'aviso-camara', 'estado-escaner', 'panel-resultado', 'resultado',
      'resultado-codigo-badge', 'panel-alta', 'form-alta', 'alta-codigo',
      'alta-nombre', 'alta-categoria', 'btn-cancelar-alta', 'lista-categorias',
      'metricas', 'cuerpo-productos', 'busqueda-productos', 'sin-productos',
      'filtros-productos', 'btn-limpiar-filtros-productos',
      'btn-nuevo', 'btn-exportar-json', 'btn-exportar-csv', 'entrada-importar',
      'btn-vaciar', 'cuerpo-historial', 'sin-historial', 'btn-limpiar-historial',
      'busqueda-historial', 'filtros-historial',
      'estado-fuentes', 'estado-tabla', 'indicador-red',
      'badge-skus', 'badge-pendientes',
      'dialogo-editar', 'form-editar', 'editar-codigo', 'editar-nombre',
      'editar-categoria', 'editar-marca', 'btn-cerrar-dialogo',
      'titulo-editar', 'editar-codigo-aviso', 'avisos',
      // Tabla de SKU: dato propio de la empresa.
      'bloque-sku', 'metricas-sku', 'cuerpo-skus', 'busqueda-skus', 'sin-skus',
      'filtros-skus', 'btn-limpiar-filtros-sku',
      'btn-sku-nuevo', 'btn-sku-exportar-csv', 'btn-sku-exportar-json',
      'entrada-importar-sku', 'btn-sku-vaciar',
      'dialogo-sku', 'form-sku', 'titulo-sku', 'sku-codigo-interno',
      'sku-nombre', 'sku-categoria', 'btn-cerrar-sku', 'lista-categorias-sku',
      'dialogo-vincular', 'form-vincular', 'vinc-codigo', 'vinc-info',
      'vinc-sugerencias', 'vinc-sku', 'vinc-sku-buscar', 'vinc-nuevo', 'vinc-nuevo-sku',
      'vinc-nuevo-nombre', 'vinc-nivel', 'vinc-cantidad', 'vinc-proveedor',
      'vinc-nombre-proveedor', 'btn-cerrar-vincular', 'lista-proveedores',
      // Listado de precios del ERP y lo que deja pendiente.
      'zona-listado', 'entrada-listado', 'btn-listado-pegar', 'btn-listado-leer',
      'campo-listado-texto', 'listado-texto', 'resumen-listado',
      'metricas-revision', 'cuerpo-revision', 'busqueda-revision', 'sin-revision',
      'filtros-revision', 'btn-limpiar-filtros-revision',
      'btn-revision-csv', 'btn-revision-vaciar',
      'dialogo-revision', 'form-revision', 'revision-codigo', 'revision-detalle',
      'revision-aviso', 'btn-cerrar-revision'
    ].forEach(function (id) {
      el[id] = $(id);
    });
  }

  // ───────────────── Utilidades de interfaz ─────────────────

  function escapar(texto) {
    return String(texto)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function avisar(mensaje, clase) {
    var div = document.createElement('div');
    div.className = 'aviso' + (clase ? ' aviso-' + clase : '');
    var icono = clase === 'ok' ? ICONOS.ok : (clase === 'error' ? ICONOS.error : ICONOS.info);
    div.innerHTML =
      icono +
      '<span class="aviso-texto">' + escapar(mensaje) + '</span>' +
      '<button type="button" class="aviso-cerrar" aria-label="Cerrar aviso">' + ICONOS.cerrar + '</button>';

    var cerrado = false;
    function cerrar() {
      if (cerrado) return;
      cerrado = true;
      div.classList.add('aviso-saliendo');
      setTimeout(function () { div.remove(); }, 180);
    }

    div.querySelector('.aviso-cerrar').onclick = cerrar;
    el['avisos'].appendChild(div);
    setTimeout(cerrar, 3800);
  }

  function estado(texto, clase) {
    el['estado-escaner'].textContent = texto;
    el['estado-escaner'].className = 'pildora' + (clase ? ' pildora-' + clase : '');
  }

  function pulsarResultado(tipo) {
    var panel = el['panel-resultado'];
    if (!panel) return;
    panel.classList.remove('pulso-ok', 'pulso-aviso', 'pulso-error');
    void panel.offsetWidth; // reinicia animación CSS
    if (tipo) panel.classList.add('pulso-' + tipo);
  }

  function botonCopiar(valor, etiqueta) {
    return '<button type="button" class="btn-copiar" data-copiar="' + escapar(valor) +
           '" title="Copiar ' + escapar(etiqueta || valor) + '">' +
           '<span>' + escapar(valor) + '</span>' + ICONOS.copiar + '</button>';
  }

  function actualizarLimpiarCodigo() {
    if (!el['btn-limpiar-codigo']) return;
    el['btn-limpiar-codigo'].classList.toggle('oculto', !el['entrada-codigo'].value);
  }

  function descargar(nombreArchivo, contenido, tipo) {
    var blob = new Blob([contenido], { type: tipo });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // ───────────────── Flujo principal: leer y mostrar ─────────────────

  /**
   * Punto único de entrada: toda lectura (cámara, USB, manual) pasa por aquí.
   */
  function procesarCodigo(entrada, fuente) {
    var validacion = window.Barcode.validar(entrada);
    codigoEnCurso = validacion.codigo;
    el['panel-alta'].hidden = true;
    el['bloque-sku'].innerHTML = '';
    el['bloque-sku'].className = '';
    actualizarLimpiarCodigo();

    if (el['resultado-codigo-badge']) {
      if (validacion.codigo) {
        el['resultado-codigo-badge'].textContent = validacion.codigo;
        el['resultado-codigo-badge'].classList.remove('oculto');
      } else {
        el['resultado-codigo-badge'].classList.add('oculto');
      }
    }

    if (!validacion.valido) {
      window.Scanner.pitar(false);
      mostrarFallo(validacion);
      estado('Código inválido', 'error');
      pulsarResultado('error');
      window.DB.registrarLectura({
        codigo: validacion.codigo, encontrado: false, valido: false, fuente: fuente
      });
      refrescarHistorial();
      seleccionarCampo();
      return;
    }

    // El bloque de SKU se pinta de inmediato: el dato propio no depende de red.
    pintarBloqueSku(validacion);

    var enCache = window.DB.buscar(validacion.codigo);
    if (enCache) {
      window.Scanner.pitar(true);
      mostrarProducto(enCache, validacion, fuente, true);
      estado('Encontrado en caché', 'ok');
      pulsarResultado('ok');
      window.DB.registrarLectura({
        codigo: validacion.codigo, nombre: enCache.nombre, encontrado: true, fuente: fuente
      });
      refrescarHistorial();
      seleccionarCampo();
      return;
    }

    // No está en caché: se consulta en línea.
    mostrarConsultando(validacion);
    estado('Consultando…', 'activa');

    window.DB.consultarEnLinea(validacion.codigo).then(function (r) {
      if (r.ok && r.producto) {
        var guardado = window.DB.guardarEnCache(validacion.codigo, r.producto);
        window.Scanner.pitar(true);
        mostrarProducto(guardado, validacion, fuente, false, r);
        estado('Producto identificado', 'ok');
        pulsarResultado('ok');
        window.DB.registrarLectura({
          codigo: validacion.codigo, nombre: guardado.nombre, encontrado: true,
          fuente: fuente + ' / ' + r.producto.fuente
        });
        refrescarProductos();
      } else {
        window.Scanner.pitar(false);
        mostrarSinResultado(validacion, r);
        var tieneSku = !!window.SKU.buscarPorCodigo(validacion.codigo);
        estado(tieneSku ? 'Identificado en SKU' : 'Sin resultado en línea', tieneSku ? 'ok' : 'aviso');
        pulsarResultado(tieneSku ? 'ok' : 'aviso');
        window.DB.registrarLectura({
          codigo: validacion.codigo, encontrado: false, valido: true, fuente: fuente
        });
      }
      refrescarHistorial();
      seleccionarCampo();
    });
  }

  function seleccionarCampo() {
    if (document.activeElement === el['entrada-codigo']) el['entrada-codigo'].select();
  }

  function mostrarConsultando(validacion) {
    el['resultado'].className = '';
    el['resultado'].innerHTML =
      '<div class="consultando">' +
        '<div class="girador" aria-hidden="true"></div>' +
        '<div>' +
          '<strong>Consultando ' + escapar(validacion.codigo) + '</strong>' +
          '<p class="ayuda">Buscando el nombre en las fuentes en línea…</p>' +
        '</div>' +
      '</div>';
  }

  function mostrarProducto(p, validacion, fuente, deCache, respuesta) {
    var origen = window.Barcode.origenGs1(p.codigo);
    var pildoraFuente = p.oficial ? 'pildora-ok' : 'pildora';

    el['resultado'].className = 'hallazgo-bloque';
    el['resultado'].innerHTML =
      '<div class="hallazgo-cabecera">' +
        '<span class="hallazgo-etiqueta-bloque">Catálogo en línea</span>' +
        '<h3 class="hallazgo-nombre">' + escapar(p.nombre) + '</h3>' +
        (p.marca ? '<p class="hallazgo-marca">' + escapar(p.marca) + '</p>' : '') +
        '<div class="hallazgo-pildoras">' +
          '<span class="pildora pildora-ok">' + escapar(validacion.tipo.nombre) + '</span>' +
          '<span class="pildora ' + pildoraFuente + '">' + escapar(p.origen) + '</span>' +
          (deCache ? '<span class="pildora">caché local</span>' : '') +
        '</div>' +
      '</div>' +
      '<dl class="hallazgo-datos">' +
        '<div><dt class="dato-clave">Código</dt><dd class="dato-valor mono" style="margin:0">' +
          botonCopiar(p.codigo, 'código') + '</dd></div>' +
        (p.empresa ? dato('Empresa titular', p.empresa) : '') +
        dato('Categoría', p.categoria) +
        (origen ? dato('Origen GS1', origen) : '') +
      '</dl>' +
      (respuesta && respuesta.intentos ? detalleIntentos(respuesta.intentos) : '') +
      '<div class="hallazgo-acciones">' +
        '<button type="button" class="btn btn-secundario btn-pequeno" data-accion="recargar">' + ICONOS.recargar + ' Volver a consultar</button>' +
        '<button type="button" class="btn btn-secundario btn-pequeno" data-accion="editar">' + ICONOS.editar + ' Corregir nombre</button>' +
      '</div>';

    el['resultado'].querySelector('[data-accion="recargar"]').onclick = function () {
      window.DB.eliminar(p.codigo);
      refrescarProductos();
      procesarCodigo(p.codigo, 'reconsulta');
    };
    el['resultado'].querySelector('[data-accion="editar"]').onclick = function () {
      abrirDialogo(p);
    };
  }

  function detalleIntentos(intentos) {
    if (!intentos.length) return '';
    return '<details class="intentos">' +
      '<summary>Qué respondió cada fuente</summary>' +
      '<ul>' + intentos.map(function (i) {
        return '<li><strong>' + escapar(i.fuente) + ':</strong> ' + escapar(i.estado) +
               (i.detalle ? ' (' + escapar(i.detalle) + ')' : '') + '</li>';
      }).join('') + '</ul></details>';
  }

  function mostrarSinResultado(validacion, respuesta) {
    var origen = window.Barcode.origenGs1(validacion.codigo);
    var enSku = window.SKU.buscarPorCodigo(validacion.codigo);

    el['resultado'].className = '';
    el['resultado'].innerHTML =
      '<div class="fallo">' +
        '<strong>Ninguna fuente en línea tiene este código</strong>' +
        '<span>Código leído: <code>' + escapar(validacion.codigo) + '</code> (' +
        escapar(validacion.tipo.nombre) + ')</span>' +
        (origen ? '<span>Prefijo GS1: ' + escapar(origen) + '</span>' : '') +
        (respuesta && respuesta.error ? '<span>' + escapar(respuesta.error) + '</span>' : '') +
        '<span>' + (enSku
          ? 'No hace falta: tu tabla de SKU ya lo identifica, y ese dato manda ' +
            'sobre cualquier fuente externa.'
          : 'El código es válido y existe, pero no está publicado en las fuentes ' +
            'consultadas. Puedes ponerle nombre tú mismo: queda guardado y la ' +
            'próxima lectura lo muestra.') + '</span>' +
      '</div>' +
      (respuesta && respuesta.intentos ? detalleIntentos(respuesta.intentos) : '') +
      '<div class="hallazgo-acciones" style="margin-top:10px">' +
        (enSku ? '' :
          '<button type="button" class="btn btn-primario btn-pequeno" data-accion="nombrar">' + ICONOS.editar + ' Ponerle nombre</button>') +
        '<button type="button" class="btn btn-secundario btn-pequeno" data-accion="reintentar">' + ICONOS.recargar + ' Reintentar</button>' +
      '</div>';

    var botonNombrar = el['resultado'].querySelector('[data-accion="nombrar"]');
    if (botonNombrar) {
      botonNombrar.onclick = function () { abrirAlta(validacion.codigo); };
    }
    el['resultado'].querySelector('[data-accion="reintentar"]').onclick = function () {
      procesarCodigo(validacion.codigo, 'reintento');
    };
  }

  function dato(clave, valor, mono) {
    return '<div><dt class="dato-clave">' + escapar(clave) + '</dt>' +
           '<dd class="dato-valor' + (mono ? ' mono' : '') + '" style="margin:0">' +
           escapar(valor) + '</dd></div>';
  }

  function mostrarFallo(validacion) {
    el['resultado'].className = '';
    el['resultado'].innerHTML =
      '<div class="fallo es-error">' +
        '<strong>Lectura inválida</strong>' +
        '<span>Código leído: <code>' + escapar(validacion.codigo || '(vacío)') + '</code> ' +
        '(' + escapar(validacion.tipo.nombre) + ')</span>' +
        '<span>' + escapar(validacion.motivo) +
        '. Vuelve a escanear; si el código está dañado, escríbelo a mano.</span>' +
      '</div>';
  }

  function ajustar(codigo, delta) {
    var r = window.DB.ajustarStock(codigo, delta);
    if (!r.ok) { avisar(r.error, 'error'); return; }
    avisar('Stock de ' + r.producto.nombre + ': ' + r.producto.stock + ' u', 'ok');
    mostrarProducto(r.producto, window.Barcode.validar(codigo), 'ajuste');
    refrescarProductos();
  }

  // ───────────────── Alta de productos ─────────────────

  function abrirAlta(codigo) {
    el['panel-alta'].hidden = false;
    el['alta-codigo'].value = codigo;
    el['alta-nombre'].value = '';
    el['alta-categoria'].value = '';
    if (typeof el['panel-alta'].scrollIntoView === 'function') {
      el['panel-alta'].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    el['alta-nombre'].focus();
  }

  function guardarAlta(evento) {
    evento.preventDefault();
    var r = window.DB.guardar({
      codigo: el['alta-codigo'].value,
      nombre: el['alta-nombre'].value,
      categoria: el['alta-categoria'].value,
      origen: 'manual'
    });
    if (!r.ok) { avisar(r.error, 'error'); return; }
    avisar('Producto guardado: ' + r.producto.nombre, 'ok');
    el['panel-alta'].hidden = true;
    refrescarProductos();
    procesarCodigo(r.producto.codigo, 'nombre propio');
    el['entrada-codigo'].focus();
    el['entrada-codigo'].select();
  }

  // ───────────────── Vista de productos ─────────────────

  function aplicarFiltroProductos(lista) {
    if (filtroProducto === 'oficial') {
      return lista.filter(function (p) { return !!p.oficial; });
    }
    if (filtroProducto === 'en-linea') {
      return lista.filter(function (p) {
        return !p.oficial && p.origen !== 'manual' && p.origen !== 'editado';
      });
    }
    if (filtroProducto === 'manual') {
      return lista.filter(function (p) {
        return p.origen === 'manual' || p.origen === 'editado';
      });
    }
    return lista;
  }

  function refrescarProductos() {
    var todos = window.DB.todos();
    var deFuente = todos.filter(function (p) {
      return p.origen !== 'manual' && p.origen !== 'editado';
    }).length;
    var oficiales = todos.filter(function (p) { return p.oficial; }).length;

    el['metricas'].innerHTML =
      metrica(todos.length, 'En caché') +
      metrica(deFuente, 'Identificados en línea', 'ok') +
      metrica(oficiales, 'Desde GS1 oficial') +
      metrica(todos.length - deFuente, 'Nombrados a mano');

    var consulta = el['busqueda-productos'].value;
    var lista = aplicarFiltroProductos(window.DB.buscarTexto(consulta));
    lista.sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });

    var pagina = pagProductos.recortar(lista);

    el['cuerpo-productos'].innerHTML = pagina.map(function (p) {
      return '<tr>' +
        '<td class="mono" data-etiqueta="Código">' + botonCopiar(p.codigo, 'código') + '</td>' +
        '<td class="celda-principal" data-etiqueta="Nombre">' + escapar(p.nombre) +
          (p.marca ? '<br><span class="ayuda">' + escapar(p.marca) + '</span>' : '') + '</td>' +
        '<td class="col-media" data-etiqueta="Categoría">' + escapar(p.categoria) + '</td>' +
        '<td class="col-baja" data-etiqueta="Fuente"><span class="pildora' +
          (p.oficial ? ' pildora-ok' : '') + '">' + escapar(p.origen) + '</span></td>' +
        '<td class="num celda-acciones"><div class="tabla-acciones">' +
          '<button type="button" class="btn btn-plano btn-pequeno" data-consultar="' + escapar(p.codigo) + '" title="Ver en el escáner">' + ICONOS.escaner + ' Ver</button>' +
          '<button type="button" class="btn btn-secundario btn-pequeno" data-editar="' + escapar(p.codigo) + '">' + ICONOS.editar + ' Editar</button>' +
          '<button type="button" class="btn btn-peligro-suave btn-pequeno" data-borrar="' + escapar(p.codigo) + '" title="Borrar producto">' + ICONOS.borrar + '</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');

    pagProductos.pintar();
    el['sin-productos'].classList.toggle('oculto', lista.length > 0);
    var hayFiltro = !!(consulta.trim() || filtroProducto !== 'todos');
    var msgProd = el['sin-productos'].querySelector('p');
    if (msgProd) {
      msgProd.textContent = todos.length === 0
        ? 'Todavía no hay productos en caché. Aparecen aquí al consultar códigos en el escáner o agregarlos a mano.'
        : 'Ningún producto coincide con el filtro o la búsqueda.';
    }
    if (el['btn-limpiar-filtros-productos']) {
      el['btn-limpiar-filtros-productos'].classList.toggle('oculto', !hayFiltro || !todos.length);
    }

    el['lista-categorias'].innerHTML = window.DB.categorias().map(function (c) {
      return '<option value="' + escapar(c) + '">';
    }).join('');
  }

  function dinero(valor) {
    if (valor === null || valor === undefined || valor === '') return '';
    var n = Number(valor);
    if (!isFinite(n)) return '';
    return '$ ' + n.toLocaleString('es-CO', { maximumFractionDigits: 0 });
  }

  /**
   * Actualiza los indicadores globales de sincronización y conteo en el header
   * y en las barras de estado de la vista Escanear.
   */
  function pintarEstadoTabla() {
    var s = window.Sincronizar;
    var e = window.SKU.estadisticas();
    var pendientes = window.Revision.todos().length;
    var resumen = e.skus + ' SKU y ' + pendientes + ' pendientes';

    if (el['badge-skus']) {
      el['badge-skus'].textContent = e.skus > 0 ? String(e.skus) : '';
      el['badge-skus'].classList.toggle('oculto', e.skus === 0);
    }
    if (el['badge-pendientes']) {
      el['badge-pendientes'].textContent = pendientes > 0 ? String(pendientes) : '';
      el['badge-pendientes'].classList.toggle('oculto', pendientes === 0);
    }

    if (el['indicador-red']) {
      var textoRed = s.modo === 'servidor'
        ? 'Tabla compartida'
        : (s.modo === 'sin-conexion' ? 'Sin servidor' : 'Solo este equipo');
      var claseRed = s.modo === 'servidor'
        ? 'pildora-ok'
        : (s.modo === 'sin-conexion' ? 'pildora-aviso' : '');
      el['indicador-red'].className = 'pildora indicador-red' + (claseRed ? ' ' + claseRed : '');
      el['indicador-red'].title = textoRed + ' — ' + resumen;
      el['indicador-red'].innerHTML = '<span class="indicador-red-texto">' + escapar(textoRed) + '</span>';
    }

    if (s.modo === 'servidor') {
      el['estado-tabla'].innerHTML =
        '<span class="pildora pildora-ok">Tabla compartida</span> ' +
        resumen + ', del servidor. Lo que registres aquí lo ven las demás cajas.';
      return;
    }

    if (s.modo === 'sin-conexion') {
      el['estado-tabla'].innerHTML =
        '<span class="pildora pildora-aviso">Sin servidor</span> ' +
        resumen + ', de la copia de este equipo. Se sigue trabajando igual' +
        (s.pendientesDeEnvio
          ? ', y hay ' + s.pendientesDeEnvio + ' cambios esperando para subir.'
          : '; los cambios se suben solos cuando el servidor vuelva.');
      return;
    }

    el['estado-tabla'].innerHTML =
      '<span class="pildora">Solo este equipo</span> ' + resumen +
      '. Arranca <code>node server.js</code> para compartir la tabla entre varias cajas.';
  }

  function metrica(valor, clave, variante) {
    return '<div class="metrica' + (variante ? ' metrica-' + variante : '') + '">' +
           '<div class="metrica-valor">' + escapar(String(valor)) + '</div>' +
           '<div class="metrica-clave">' + escapar(clave) + '</div></div>';
  }

  // ───────────────── Verificación contra la tabla de SKU ─────────────────

  function textoEmpaque(entrada) {
    if (entrada.nivel === 'variable') return 'medida variable';
    if (entrada.nivel === 'unidad') return 'unidad';
    if (entrada.cantidad >= 1) return entrada.nivel + ' de ' + entrada.cantidad + ' unidades';
    return entrada.nivel + ' (cantidad sin confirmar)';
  }

  function otrosCodigos(s, entradaActual) {
    var otros = s.codigos.filter(function (c) { return c !== entradaActual; });
    if (!otros.length) return '';
    return '<p class="ayuda">Otros códigos de este SKU: ' +
      otros.map(function (c) {
        return '<code>' + escapar(c.codigo) + '</code> (' + escapar(textoEmpaque(c)) + ')';
      }).join(', ') + '</p>';
  }

  function pintarBloqueSku(validacion) {
    if (!validacion || !validacion.valido) {
      el['bloque-sku'].innerHTML = '';
      el['bloque-sku'].className = '';
      return;
    }

    var codigo = validacion.codigo;
    var hallado = window.SKU.buscarPorCodigo(codigo);

    if (hallado) {
      var s = hallado.sku;
      var e = hallado.entrada;
      var faltaCantidad = e.nivel !== 'unidad' && e.nivel !== 'variable' && e.cantidad < 1;

      el['bloque-sku'].className = 'tiene-sku';
      el['bloque-sku'].innerHTML =
        '<div class="bloque-sku">' +
          '<div class="bloque-sku-pildoras">' +
            '<span class="pildora pildora-ok">SKU ' + escapar(s.sku) + '</span>' +
            '<span class="pildora">' + escapar(e.nivel) + '</span>' +
            (s.precioCuadra === false
              ? '<span class="pildora pildora-aviso">precio por confirmar</span>'
              : '') +
            (faltaCantidad
              ? '<span class="pildora pildora-aviso">cantidad sin confirmar</span>'
              : (e.nivel === 'variable'
                  ? ''
                  : '<span class="pildora pildora-ok">' + e.cantidad + ' u por empaque</span>')) +
          '</div>' +
          '<strong class="bloque-sku-nombre">' + escapar(s.nombre) + '</strong>' +
          (s.precioCuadra === false
            ? '<p class="ayuda">El precio del listado no sale de multiplicar el precio ' +
              'unitario por el descuento y el IVA. En cigarrillos y algunas bebidas eso ' +
              'es el impuesto al consumo; en el resto, la fila venía corrida y conviene ' +
              'confirmar el precio antes de cobrarlo.</p>'
            : '') +
          (s.precio !== null
            ? '<p class="bloque-sku-precio">' + escapar(dinero(s.precio)) +
              (s.iva ? ' <span class="ayuda">IVA ' + s.iva + '% incluido</span>' : '') +
              (s.precioSinIva !== null
                ? '<br><span class="ayuda">Sin IVA ' + escapar(dinero(s.precioSinIva)) + '</span>'
                : '') + '</p>'
            : '<p class="ayuda">Este SKU no tiene precio cargado. ' +
              'El precio entra con el listado de precios del DMS.</p>') +
          (e.nivel !== 'unidad' && e.cantidad >= 1
            ? '<p class="bloque-sku-cuenta">' + ICONOS.caja + ' <span>1 ' + escapar(e.nivel) + ' = <strong>' +
              e.cantidad + ' unidades</strong> de ' + escapar(s.sku) + '</span></p>'
            : '') +
          (s.empaque && s.unidadesPorCaja
            ? '<p class="ayuda">Del proveedor viene en ' + escapar(s.empaque) +
              ' de ' + s.unidadesPorCaja + ' unidades' +
              (s.cajas !== null ? ', hay ' + s.cajas + ' en existencia' : '') + '.</p>'
            : '') +
          (faltaCantidad
            ? '<p class="ayuda">Falta contar cuántas unidades trae este empaque. ' +
              'Sin ese número una caja recibida no se puede convertir en unidades.</p>'
            : '') +
          (e.nombreProveedor
            ? '<p class="ayuda">El proveedor lo llama <em>' + escapar(e.nombreProveedor) + '</em>' +
              (e.proveedor ? ' — ' + escapar(e.proveedor) : '') + '</p>'
            : '') +
          otrosCodigos(s, e) +
          '<div class="hallazgo-acciones">' +
            '<button type="button" class="btn btn-secundario btn-pequeno" data-accion="corregir-vinculo">' + ICONOS.editar + ' Corregir este vínculo</button>' +
            '<button type="button" class="btn btn-secundario btn-pequeno" data-accion="ver-sku">' + ICONOS.caja + ' Ver el SKU</button>' +
          '</div>' +
        '</div>';

      el['bloque-sku'].querySelector('[data-accion="corregir-vinculo"]').onclick = function () {
        abrirVincular(codigo, s.sku);
      };
      el['bloque-sku'].querySelector('[data-accion="ver-sku"]').onclick = function () {
        cambiarVista('skus');
        filtroSku = 'todos';
        sincronizarChipsFiltro(el['filtros-skus'], 'data-filtro-sku', 'todos');
        el['busqueda-skus'].value = s.sku;
        pagSkus.reiniciar();
        refrescarSkus();
      };
      return;
    }

    var cands = window.SKU.candidatos(codigo);
    var nivel = window.Barcode.nivelProbable(codigo);
    var unidadDerivada = window.Barcode.gtin13DesdeGtin14(codigo);

    el['bloque-sku'].className = '';
    el['bloque-sku'].innerHTML =
      '<div class="bloque-sku es-aviso">' +
        '<div class="bloque-sku-pildoras">' +
          '<span class="pildora pildora-aviso">Sin SKU</span>' +
          '<span class="pildora">parece ' + escapar(nivel) + '</span>' +
        '</div>' +
        '<strong class="bloque-sku-nombre">Este código no está vinculado a ningún SKU</strong>' +
        '<p class="ayuda">' +
          (nivel === 'caja'
            ? 'Tiene 14 dígitos con dígito indicador ' + escapar(window.Barcode.indicador(codigo)) +
              ': es un código de caja. El código de la unidad que le corresponde por norma sería ' +
              '<code>' + escapar(unidadDerivada) + '</code>, pero hay proveedores que no la respetan.'
            : 'Vincúlalo al SKU que compras ya registró. Si el producto es nuevo, crea el SKU aquí mismo.') +
        '</p>' +
        (cands.length
          ? '<div class="sugerencias">' +
              '<p class="campo-etiqueta">Comparte los 12 dígitos base con:</p>' +
              cands.map(function (c, i) {
                return '<div class="sugerencia">' +
                  '<div><strong>' + escapar(c.sku.sku) + '</strong> ' + escapar(c.sku.nombre) +
                  '<br><span class="ayuda">por <code>' + escapar(c.porCodigo.codigo) + '</code> (' +
                  escapar(textoEmpaque(c.porCodigo)) + ')</span></div>' +
                  '<button type="button" class="btn btn-primario btn-pequeno" data-sugerencia="' + i + '">Vincular aquí</button>' +
                  '</div>';
              }).join('') +
            '</div>'
          : '') +
        '<div class="hallazgo-acciones">' +
          '<button type="button" class="btn ' + (cands.length ? 'btn-secundario' : 'btn-primario') +
            ' btn-pequeno" data-accion="vincular">' + ICONOS.mas + ' Vincular a un SKU</button>' +
        '</div>' +
      '</div>';

    el['bloque-sku'].querySelectorAll('[data-sugerencia]').forEach(function (btn) {
      btn.onclick = function () {
        abrirVincular(codigo, cands[Number(btn.dataset.sugerencia)].sku.sku);
      };
    });
    el['bloque-sku'].querySelector('[data-accion="vincular"]').onclick = function () {
      abrirVincular(codigo, null);
    };
  }

  // ───────────────── Diálogo de vinculación ─────────────────

  function llenarSelectSku(seleccion) {
    var lista = window.SKU.todos().slice().sort(function (a, b) {
      return a.sku.localeCompare(b.sku, 'es');
    });
    el['vinc-sku'].innerHTML =
      '<option value="__nuevo__">— Crear un SKU nuevo —</option>' +
      lista.map(function (s) {
        return '<option value="' + escapar(s.sku) + '">' +
               escapar(s.sku) + ' — ' + escapar(s.nombre) + '</option>';
      }).join('');
    el['vinc-sku'].value = seleccion && window.SKU.buscarSku(seleccion) ? seleccion : '__nuevo__';
    el['vinc-sku-buscar'].value = '';
    filtrarSelectSku();
    alternarSkuNuevo();
  }

  function filtrarSelectSku() {
    var q = el['vinc-sku-buscar'].value.trim().toLowerCase();
    var opciones = el['vinc-sku'].options;
    for (var i = 0; i < opciones.length; i++) {
      var o = opciones[i];
      var casa = o.value === '__nuevo__' || !q ||
                 o.text.toLowerCase().indexOf(q) !== -1;
      o.hidden = !casa;
    }
  }

  function alternarSkuNuevo() {
    var nuevo = el['vinc-sku'].value === '__nuevo__';
    el['vinc-nuevo'].hidden = !nuevo;
    if (nuevo && !el['vinc-nuevo-sku'].value) {
      el['vinc-nuevo-sku'].value = window.SKU.siguienteSku();
    }
  }

  function proveedoresConocidos() {
    var vistos = {}, lista = [];
    window.SKU.todos().forEach(function (s) {
      s.codigos.forEach(function (c) {
        if (c.proveedor && !vistos[c.proveedor]) { vistos[c.proveedor] = true; lista.push(c.proveedor); }
      });
    });
    return lista.sort();
  }

  function abrirVincular(codigo, skuSugerido) {
    var v = window.Barcode.validar(codigo);
    if (!v.valido) { avisar(v.motivo, 'error'); return; }

    var yaVinculado = window.SKU.buscarPorCodigo(v.codigo);
    var nivel = yaVinculado ? yaVinculado.entrada.nivel : window.Barcode.nivelProbable(v.codigo);

    el['vinc-codigo'].value = v.codigo;
    el['vinc-codigo'].readOnly = true;
    el['vinc-info'].style.color = '';
    el['vinc-info'].textContent = v.tipo.nombre +
      (window.Barcode.indicador(v.codigo) ? ' — dígito indicador ' + window.Barcode.indicador(v.codigo) : '') +
      (window.Barcode.origenGs1(v.codigo) ? ' — ' + window.Barcode.origenGs1(v.codigo) : '');

    el['vinc-nuevo-sku'].value = '';
    el['vinc-nuevo-nombre'].value = '';
    llenarSelectSku(skuSugerido || (yaVinculado ? yaVinculado.sku.sku : null));

    el['vinc-nivel'].value = nivel;
    el['vinc-cantidad'].value = yaVinculado
      ? (yaVinculado.entrada.cantidad || '')
      : (nivel === 'unidad' ? 1 : '');
    el['vinc-proveedor'].value = yaVinculado ? yaVinculado.entrada.proveedor : '';
    el['vinc-nombre-proveedor'].value = yaVinculado ? yaVinculado.entrada.nombreProveedor : '';

    el['lista-proveedores'].innerHTML = proveedoresConocidos().map(function (p) {
      return '<option value="' + escapar(p) + '">';
    }).join('');

    el['vinc-sugerencias'].innerHTML = yaVinculado
      ? '<p class="nota"><span>Este código ya pertenece a <strong>' + escapar(yaVinculado.sku.sku) +
        '</strong>. Cambiar el SKU de destino aquí no lo mueve: primero hay que ' +
        'desvincularlo desde la vista SKU.</span></p>'
      : '';

    el['dialogo-vincular'].showModal();
    (el['vinc-sku'].value === '__nuevo__' ? el['vinc-nuevo-nombre'] : el['vinc-cantidad']).focus();
  }

  function abrirVincularVacio(s) {
    if (!s) return;
    el['vinc-codigo'].value = '';
    el['vinc-codigo'].readOnly = false;
    el['vinc-info'].style.color = '';
    el['vinc-info'].textContent = 'Dispara el escáner sobre el empaque, o escribe el código.';
    el['vinc-sugerencias'].innerHTML = '';
    el['vinc-nuevo-sku'].value = '';
    el['vinc-nuevo-nombre'].value = '';
    llenarSelectSku(s.sku);
    el['vinc-nivel'].value = 'caja';
    el['vinc-cantidad'].value = '';
    el['vinc-proveedor'].value = '';
    el['vinc-nombre-proveedor'].value = '';
    el['lista-proveedores'].innerHTML = proveedoresConocidos().map(function (p) {
      return '<option value="' + escapar(p) + '">';
    }).join('');
    el['dialogo-vincular'].showModal();
    el['vinc-codigo'].focus();
  }

  function informarCodigoVinculo() {
    var valor = el['vinc-codigo'].value;
    if (!valor.trim()) {
      el['vinc-info'].textContent = '';
      el['vinc-info'].style.color = '';
      return;
    }
    var v = window.Barcode.validar(valor);
    el['vinc-info'].textContent = v.tipo.nombre + ' — ' + v.motivo;
    el['vinc-info'].style.color = v.valido ? 'var(--ok)' : 'var(--error)';
    if (!v.valido) return;
    var ocupado = window.SKU.buscarPorCodigo(v.codigo);
    if (ocupado) {
      el['vinc-info'].textContent += ' — ya vinculado a ' + ocupado.sku.sku;
      el['vinc-info'].style.color = 'var(--error)';
      return;
    }
    el['vinc-nivel'].value = window.Barcode.nivelProbable(v.codigo);
    if (el['vinc-nivel'].value === 'unidad') el['vinc-cantidad'].value = 1;
  }

  function guardarVinculo(evento) {
    evento.preventDefault();

    var codigo = el['vinc-codigo'].value;
    if (!String(codigo).trim()) {
      avisar('Falta el código de barras', 'error');
      el['vinc-codigo'].focus();
      return;
    }
    var nivel = el['vinc-nivel'].value;
    var cantidad = el['vinc-cantidad'].value;

    if (nivel !== 'variable' && (!String(cantidad).trim() || Number(cantidad) < 1)) {
      avisar('Cuenta cuántas unidades trae el empaque y escribe el número', 'error');
      el['vinc-cantidad'].focus();
      return;
    }

    var datos = {
      codigo: codigo,
      nivel: nivel,
      cantidad: nivel === 'variable' ? 0 : Number(cantidad),
      proveedor: el['vinc-proveedor'].value,
      nombreProveedor: el['vinc-nombre-proveedor'].value
    };

    var r;
    if (el['vinc-sku'].value === '__nuevo__') {
      datos.sku = el['vinc-nuevo-sku'].value;
      datos.nombre = el['vinc-nuevo-nombre'].value;
      r = window.SKU.crear(datos);
    } else {
      r = window.SKU.vincular(el['vinc-sku'].value, datos);
    }

    if (!r.ok) { avisar(r.error, 'error'); return; }

    el['dialogo-vincular'].close();
    avisar('Código ' + window.Barcode.normalizar(codigo) + ' vinculado a ' + r.sku.sku, 'ok');
    refrescarSkus();
    pintarBloqueSku(window.Barcode.validar(codigo));
  }

  // ───────────────── Vista de SKU ─────────────────

  function celdaUnidadDeEmpaque(s) {
    if (s.unidadesPorCaja) {
      return '<strong>' + (s.empaque ? escapar(s.empaque) + ' ' : '') +
             s.unidadesPorCaja + '</strong>';
    }
    if (s.empaque) return '<strong>' + escapar(s.empaque) + '</strong>';

    var mayor = null;
    for (var i = 0; i < s.codigos.length; i++) {
      var c = s.codigos[i];
      if (c.nivel === 'unidad' || c.nivel === 'variable') continue;
      if (c.cantidad >= 1 && (!mayor || c.cantidad > mayor.cantidad)) mayor = c;
    }
    if (mayor) {
      return '<strong>' + escapar(mayor.nivel.slice(0, 3).toUpperCase()) + ' ' +
             mayor.cantidad + '</strong><br><span class="ayuda">contado</span>';
    }

    var soloUnidades = s.codigos.length > 0 && s.codigos.every(function (e) {
      return e.nivel === 'unidad';
    });
    if (soloUnidades) return '<strong>UND 1</strong>';

    return '<span class="pildora pildora-aviso">sin U/E</span>';
  }

  function skuTieneCantidadPendiente(s) {
    for (var i = 0; i < s.codigos.length; i++) {
      var c = s.codigos[i];
      if (c.nivel !== 'unidad' && c.nivel !== 'variable' && c.cantidad < 1) return true;
    }
    return false;
  }

  function skuTieneCaja(s) {
    for (var i = 0; i < s.codigos.length; i++) {
      var n = s.codigos[i].nivel;
      if (n === 'caja' || n === 'paca' || n === 'display') return true;
    }
    return false;
  }

  function aplicarFiltroSkus(lista) {
    if (filtroSku === 'sin-cantidad') {
      return lista.filter(function (s) {
        return skuTieneCantidadPendiente(s) || (!s.unidadesPorCaja && !s.empaque && !s.codigos.length);
      });
    }
    if (filtroSku === 'precio-pendiente') {
      return lista.filter(function (s) { return s.precioCuadra === false; });
    }
    if (filtroSku === 'sin-codigo') {
      return lista.filter(function (s) { return s.codigos.length === 0; });
    }
    if (filtroSku === 'con-caja') {
      return lista.filter(skuTieneCaja);
    }
    return lista;
  }

  function refrescarSkus() {
    var e = window.SKU.estadisticas();
    el['metricas-sku'].innerHTML =
      metrica(e.skus, 'SKU registrados') +
      metrica(e.codigos, 'Códigos vinculados', 'ok') +
      metrica(e.cajas, 'Empaques de caja o paca') +
      metrica(e.sinCantidad, 'Sin cantidad confirmada', e.sinCantidad > 0 ? 'aviso' : '');

    var consulta = el['busqueda-skus'].value;
    var lista = aplicarFiltroSkus(window.SKU.buscarTexto(consulta));
    lista.sort(function (a, b) { return a.sku.localeCompare(b.sku, 'es'); });

    var pagina = pagSkus.recortar(lista);

    el['cuerpo-skus'].innerHTML = pagina.map(function (s) {
      var codigos = s.codigos.length
        ? s.codigos.slice().sort(function (a, b) {
            return a.codigo.length - b.codigo.length;
          }).map(function (c) {
            var falta = c.nivel !== 'unidad' && c.nivel !== 'variable' && c.cantidad < 1;
            return '<div class="codigo-fila">' +
              botonCopiar(c.codigo, 'código de barras') +
              '<span class="pildora">' + escapar(c.nivel) + '</span>' +
              (c.nivel === 'variable'
                ? ''
                : '<span class="pildora' + (falta ? ' pildora-aviso' : '') + '">' +
                  (falta ? 'sin cantidad' : c.cantidad + ' u') + '</span>') +
              '<button type="button" class="btn-icono btn-icono-peligro" data-desvincular="' + escapar(c.codigo) +
                '" title="Quitar este código del SKU" aria-label="Quitar código ' + escapar(c.codigo) + '">' + ICONOS.cerrar + '</button>' +
              (c.nombreProveedor
                ? '<span class="ayuda codigo-proveedor">' + escapar(c.nombreProveedor) +
                  (c.proveedor ? ' — ' + escapar(c.proveedor) : '') + '</span>'
                : '') +
              '</div>';
          }).join('')
        : '<span class="ayuda">Sin códigos todavía</span>';

      return '<tr>' +
        '<td class="mono" data-etiqueta="SKU">' + botonCopiar(s.sku, 'SKU') + '</td>' +
        '<td class="celda-principal" data-etiqueta="Nombre interno">' + escapar(s.nombre) + '</td>' +
        '<td class="celda-ancha" data-etiqueta="Códigos de barras">' + codigos + '</td>' +
        '<td class="num" data-etiqueta="U/E">' + celdaUnidadDeEmpaque(s) + '</td>' +
        '<td class="col-baja" data-etiqueta="Categoría">' + escapar(s.categoria) + '</td>' +
        '<td class="num" data-etiqueta="Precio">' + (s.precio === null
          ? '<span class="ayuda">sin precio</span>'
          : '<strong>' + escapar(dinero(s.precio)) + '</strong>' +
            (s.iva ? '<br><span class="ayuda">IVA ' + s.iva + '%</span>' : '') +
            (s.precioCuadra === false
              ? '<br><span class="pildora pildora-aviso">por confirmar</span>'
              : '')) + '</td>' +
        '<td class="num col-media" data-etiqueta="Cajas">' +
          (s.cajas === null ? '<span class="ayuda">—</span>' : s.cajas) + '</td>' +
        '<td class="num celda-acciones"><div class="tabla-acciones">' +
          '<button type="button" class="btn btn-secundario btn-pequeno" data-sku-vincular="' + escapar(s.sku) + '" title="Agregar otro código de barras">' + ICONOS.mas + ' Código</button>' +
          '<button type="button" class="btn btn-secundario btn-pequeno" data-sku-editar="' + escapar(s.sku) + '">' + ICONOS.editar + ' Editar</button>' +
          '<button type="button" class="btn btn-peligro-suave btn-pequeno" data-sku-borrar="' + escapar(s.sku) + '" title="Borrar SKU">' + ICONOS.borrar + '</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');

    pagSkus.pintar();
    el['sin-skus'].classList.toggle('oculto', lista.length > 0);
    var hayFiltro = !!(consulta.trim() || filtroSku !== 'todos');
    var msgSku = el['sin-skus'].querySelector('p');
    if (msgSku) {
      msgSku.textContent = e.skus === 0
        ? 'Todavía no hay SKU registrados. Crea uno nuevo o carga el listado en la pestaña Listado.'
        : 'Ningún SKU coincide con el filtro o la búsqueda.';
    }
    if (el['btn-limpiar-filtros-sku']) {
      el['btn-limpiar-filtros-sku'].classList.toggle('oculto', !hayFiltro || e.skus === 0);
    }

    el['lista-categorias-sku'].innerHTML = window.SKU.categorias().map(function (c) {
      return '<option value="' + escapar(c) + '">';
    }).join('');

    pintarEstadoTabla();
  }

  var skuEditando = null;

  function abrirDialogoSku(s) {
    skuEditando = s ? s.sku : null;
    el['titulo-sku'].textContent = s ? 'Editar SKU' : 'Nuevo SKU';
    el['sku-codigo-interno'].value = s ? s.sku : window.SKU.siguienteSku();
    el['sku-codigo-interno'].readOnly = !!s;
    el['sku-nombre'].value = s ? s.nombre : '';
    el['sku-categoria'].value = s ? s.categoria : '';
    el['dialogo-sku'].showModal();
    el['sku-nombre'].focus();
  }

  function guardarSku(evento) {
    evento.preventDefault();
    var r = skuEditando
      ? window.SKU.actualizar(skuEditando, {
          nombre: el['sku-nombre'].value,
          categoria: el['sku-categoria'].value
        })
      : window.SKU.crear({
          sku: el['sku-codigo-interno'].value,
          nombre: el['sku-nombre'].value,
          categoria: el['sku-categoria'].value
        });
    if (!r.ok) { avisar(r.error, 'error'); return; }
    el['dialogo-sku'].close();
    avisar(skuEditando ? 'SKU actualizado' : 'SKU ' + r.sku.sku + ' creado', 'ok');
    refrescarSkus();
    if (codigoEnCurso) pintarBloqueSku(window.Barcode.validar(codigoEnCurso));
  }

  function borrarSku(sku) {
    var s = window.SKU.buscarSku(sku);
    if (!s) return;
    window.UI.confirmar({
      titulo: 'Borrar SKU ' + s.sku,
      mensaje: '¿Seguro que quieres borrar "' + s.nombre + '"?',
      detalle: 'Se pierden sus ' + s.codigos.length + ' código(s) vinculado(s). Esta acción no se puede deshacer.',
      textoConfirmar: 'Borrar SKU'
    }).then(function (ok) {
      if (!ok) return;
      var r = window.SKU.eliminar(sku);
      if (!r.ok) { avisar(r.error, 'error'); return; }
      avisar('SKU borrado', 'ok');
      refrescarSkus();
      if (codigoEnCurso) pintarBloqueSku(window.Barcode.validar(codigoEnCurso));
    });
  }

  function quitarVinculo(codigo) {
    var h = window.SKU.buscarPorCodigo(codigo);
    if (!h) return;
    window.UI.confirmar({
      titulo: 'Desvincular código',
      mensaje: '¿Quitar el código ' + codigo + ' del SKU ' + h.sku.sku + '?',
      detalle: 'El SKU permanece en la tabla, pero ese código dejará de identificar al producto al escanearlo.',
      textoConfirmar: 'Desvincular'
    }).then(function (ok) {
      if (!ok) return;
      var r = window.SKU.desvincular(codigo);
      if (!r.ok) { avisar(r.error, 'error'); return; }
      avisar('Código desvinculado', 'ok');
      refrescarSkus();
      if (codigoEnCurso) pintarBloqueSku(window.Barcode.validar(codigo));
    });
  }

  function importarSku(evento) {
    var archivo = evento.target.files && evento.target.files[0];
    if (!archivo) return;
    var lector = new FileReader();
    lector.onload = function () {
      var contenido = String(lector.result);
      window.UI.elegirImportacion({
        titulo: 'Importar tabla de SKU',
        mensaje: 'Archivo: ' + archivo.name + '. Elige cómo aplicar los datos:'
      }).then(function (modo) {
        if (!modo) return;
        var reemplazar = modo === 'reemplazar';
        var r = window.SKU.importar(contenido, reemplazar);
        if (!r.ok) { avisar(r.error, 'error'); return; }
        avisar(r.skusNuevos + ' SKU nuevos, ' + r.codigosNuevos + ' códigos vinculados, ' +
               r.actualizados + ' actualizados' +
               (r.rechazados.length ? ', ' + r.rechazados.length + ' rechazados' : ''), 'ok');
        if (r.rechazados.length) console.warn('Filas rechazadas al importar SKU:', r.rechazados);
        refrescarSkus();
      });
    };
    lector.readAsText(archivo);
    evento.target.value = '';
  }

  function vaciarSkus() {
    var total = window.SKU.todos().length;
    if (!total) { avisar('La tabla de SKU ya está vacía', 'ok'); return; }
    window.UI.confirmar({
      titulo: 'Vaciar tabla de SKU',
      mensaje: '¿Vaciar la tabla completa de ' + total + ' SKU?',
      detalle: 'Esto borra los vínculos entre códigos y SKU, que son dato propio de la empresa y no se pueden volver a consultar en ninguna fuente. Expórtalos antes si los necesitas.',
      textoConfirmar: 'Sí, vaciar tabla'
    }).then(function (ok) {
      if (!ok) return;
      window.SKU.vaciar();
      avisar('Tabla de SKU vacía', 'ok');
      refrescarSkus();
      if (codigoEnCurso) pintarBloqueSku(window.Barcode.validar(codigoEnCurso));
    });
  }

  // ───────────────── Diálogo de edición ─────────────────

  var codigoEditando = null;

  function abrirDialogo(producto) {
    codigoEditando = producto ? producto.codigo : null;
    el['titulo-editar'].textContent = producto ? 'Editar producto' : 'Nuevo producto';
    el['editar-codigo'].value = producto ? producto.codigo : '';
    el['editar-codigo'].readOnly = !!producto;
    el['editar-nombre'].value = producto ? producto.nombre : '';
    el['editar-categoria'].value = producto ? producto.categoria : '';
    el['editar-marca'].value = producto ? (producto.marca || '') : '';
    el['editar-codigo-aviso'].textContent = '';
    el['editar-codigo-aviso'].style.color = '';
    el['dialogo-editar'].showModal();
    (producto ? el['editar-nombre'] : el['editar-codigo']).focus();
  }

  function validarCodigoEnVivo() {
    var valor = el['editar-codigo'].value;
    if (!valor) {
      el['editar-codigo-aviso'].textContent = '';
      el['editar-codigo-aviso'].style.color = '';
      return;
    }
    var v = window.Barcode.validar(valor);
    el['editar-codigo-aviso'].textContent = v.tipo.nombre + ' — ' + v.motivo;
    el['editar-codigo-aviso'].style.color = v.valido ? 'var(--ok)' : 'var(--error)';
  }

  function guardarEdicion(evento) {
    evento.preventDefault();
    var codigo = codigoEditando || el['editar-codigo'].value;
    var r = window.DB.guardar({
      codigo: codigo,
      nombre: el['editar-nombre'].value,
      categoria: el['editar-categoria'].value,
      marca: el['editar-marca'].value,
      origen: codigoEditando ? 'editado' : 'manual'
    });
    if (!r.ok) { avisar(r.error, 'error'); return; }
    el['dialogo-editar'].close();
    avisar(r.nuevo ? 'Producto agregado' : 'Producto actualizado', 'ok');
    refrescarProductos();
  }

  function borrar(codigo) {
    var p = window.DB.buscar(codigo);
    if (!p) return;
    window.UI.confirmar({
      titulo: 'Borrar producto de la caché',
      mensaje: '¿Borrar "' + p.nombre + '" (' + p.codigo + ')?',
      detalle: 'Esta acción no se puede deshacer.',
      textoConfirmar: 'Borrar'
    }).then(function (ok) {
      if (!ok) return;
      var r = window.DB.eliminar(codigo);
      if (!r.ok) { avisar(r.error, 'error'); return; }
      avisar('Producto borrado', 'ok');
      refrescarProductos();
    });
  }

  // ───────────────── Historial ─────────────────

  function historialSkuDe(h) {
    if (h.encontrado || h.valido === false || !h.codigo) return null;
    return window.SKU.buscarPorCodigo(h.codigo);
  }

  function aplicarFiltroHistorial(lista) {
    var q = el['busqueda-historial'] ? el['busqueda-historial'].value.trim().toLowerCase() : '';
    var filtrada = lista;

    if (filtroHistorial === 'encontrados') {
      filtrada = filtrada.filter(function (h) { return !!h.encontrado || !!historialSkuDe(h); });
    } else if (filtroHistorial === 'no-registrados') {
      filtrada = filtrada.filter(function (h) { return !h.encontrado && h.valido !== false && !historialSkuDe(h); });
    } else if (filtroHistorial === 'invalidos') {
      filtrada = filtrada.filter(function (h) { return h.valido === false; });
    }

    if (!q) return filtrada;
    return filtrada.filter(function (h) {
      var enSku = historialSkuDe(h);
      var nombreSku = enSku ? (enSku.sku.nombre + ' ' + enSku.sku.sku) : '';
      return String(h.codigo || '').toLowerCase().indexOf(q) !== -1 ||
             String(h.nombre || '').toLowerCase().indexOf(q) !== -1 ||
             nombreSku.toLowerCase().indexOf(q) !== -1 ||
             String(h.fuente || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  function refrescarHistorial() {
    var todos = window.DB.obtenerHistorial();
    var lista = aplicarFiltroHistorial(todos);
    var pagina = pagHistorial.recortar(lista);

    el['cuerpo-historial'].innerHTML = pagina.map(function (h) {
      var enSku = historialSkuDe(h);
      var celdaProducto;
      if (h.encontrado) {
        celdaProducto = escapar(h.nombre);
      } else if (h.valido === false) {
        celdaProducto = '<span class="pildora pildora-error">código inválido</span>';
      } else if (enSku) {
        celdaProducto = escapar(enSku.sku.nombre) +
          ' <span class="pildora pildora-ok">SKU ' + escapar(enSku.sku.sku) + '</span>';
      } else {
        celdaProducto = '<span class="pildora pildora-aviso">no registrado</span>';
      }
      return '<tr>' +
        '<td data-etiqueta="Fecha y hora">' + escapar(fecha.format(new Date(h.ts))) + '</td>' +
        '<td class="mono" data-etiqueta="Código">' + (h.codigo ? botonCopiar(h.codigo, 'código') : '<span class="ayuda">(vacío)</span>') + '</td>' +
        '<td class="celda-principal" data-etiqueta="Producto">' + celdaProducto + '</td>' +
        '<td class="col-media" data-etiqueta="Fuente">' + escapar(h.fuente) + '</td>' +
        '<td class="num celda-acciones"><div class="tabla-acciones">' +
          (h.codigo
            ? '<button type="button" class="btn btn-plano btn-pequeno" data-historial-ver="' + escapar(h.codigo) + '" title="Consultar este código en el escáner">' + ICONOS.escaner + ' Ver</button>'
            : '') +
        '</div></td>' +
      '</tr>';
    }).join('');

    pagHistorial.pintar();
    el['sin-historial'].classList.toggle('oculto', lista.length > 0);
    var msgHist = el['sin-historial'].querySelector('p');
    if (msgHist) {
      msgHist.textContent = todos.length === 0
        ? 'Todavía no hay lecturas registradas en este equipo.'
        : 'Ninguna lectura coincide con el filtro o la búsqueda.';
    }
  }

  // ───────────────── Cámara ─────────────────

  function actualizarBotonCamara(activa) {
    if (el['btn-camara-texto']) {
      el['btn-camara-texto'].textContent = activa ? 'Detener la cámara' : 'Usar la cámara';
    }
    if (el['btn-camara-icono']) {
      el['btn-camara-icono'].innerHTML = activa ? ICONOS.detener : ICONOS.camara;
    }
    el['btn-camara'].classList.toggle('btn-camara-activa', activa);
    el['btn-camara'].classList.toggle('btn-secundario', !activa);
  }

  function alternarCamara() {
    if (window.Scanner.estaActivo()) {
      window.Scanner.detener();
      el['camara-envoltorio'].classList.add('oculto');
      actualizarBotonCamara(false);
      estado('Listo');
      return;
    }

    el['camara-envoltorio'].classList.remove('oculto');
    estado('Abriendo cámara…', 'activa');

    window.Scanner.iniciar({
      video: el['video'],
      onLectura: function (codigo, formato) {
        el['aviso-camara'].classList.add('oculto');
        el['entrada-codigo'].value = codigo;
        procesarCodigo(codigo, 'cámara' + (formato ? ' (' + formato + ')' : ''));
      },
      onPista: function (mensaje) {
        el['aviso-camara'].textContent = mensaje;
        el['aviso-camara'].classList.remove('oculto');
        estado('Buscando código…', 'activa');
      },
      onError: function (mensaje) {
        el['aviso-camara'].textContent = mensaje;
        el['aviso-camara'].classList.remove('oculto');
        el['camara-envoltorio'].classList.add('oculto');
        actualizarBotonCamara(false);
        estado('Cámara no disponible', 'error');
        avisar(mensaje, 'error');
      }
    }).then(function (ok) {
      if (ok) {
        actualizarBotonCamara(true);
        el['aviso-camara'].classList.add('oculto');
        estado('Cámara activa — apunta al código', 'activa');
      }
    });
  }

  // ───────────────── Vista del listado de precios ─────────────────

  var listadoLeido = null;

  function leerListado(texto) {
    mostrarListado(window.Listado.leer(texto));
  }

  function mostrarListado(r) {
    if (!r.ok) {
      listadoLeido = null;
      el['resumen-listado'].innerHTML =
        '<div class="aviso aviso-error">' + ICONOS.error + '<span class="aviso-texto">' + escapar(r.error) + '</span></div>';
      return;
    }

    listadoLeido = r;
    var n = r.resumen;

    el['resumen-listado'].innerHTML =
      '<div class="separador"><span>Vista previa del archivo</span></div>' +
      '<div class="metricas">' +
        metrica(n.total, 'Filas leídas') +
        metrica(n.ok, 'Con código de barras', 'ok') +
        metrica(n.sinCodigo + n.invalidos + n.incompletas, 'A revisión', (n.sinCodigo + n.invalidos + n.incompletas) > 0 ? 'aviso' : '') +
        metrica(n.proveedores.length, 'Proveedores') +
      '</div>' +

      '<dl class="hallazgo-datos">' +
        dato('Formato', r.formato === 'excel'
          ? 'Excel, hoja "' + r.hoja + '"'
          : (r.formato === 'csv' ? 'CSV con cabecera' : 'texto del reporte con columnas')) +
        dato('Códigos de unidad', String(n.unidades)) +
        dato('Códigos de empaque agrupado (GTIN-14)', String(n.cajas)) +
        dato('Filas con precio final', String(n.conPrecio)) +
      '</dl>' +

      (n.invalidos
        ? '<div class="aviso aviso-error">' + ICONOS.error + '<span class="aviso-texto">' +
            n.invalidos + ' filas traen en la columna Alterna un número que no es un ' +
            'código de barras' +
            (n.derivadosDelSku
              ? ', y ' + n.derivadosDelSku + ' de esas son relleno del DMS armado con el propio SKU'
              : '') +
            '. No se guardan como código: van a la cola de pendientes.</span></div>'
        : '') +

      (n.precioNoCuadra
        ? '<div class="aviso aviso-error">' + ICONOS.error + '<span class="aviso-texto">' +
            'En ' + n.precioNoCuadra + ' filas el precio final no sale de Precio Und, ' +
            'el descuento y el IVA. En cigarrillos y algunas bebidas es el impuesto al ' +
            'consumo, que no aparece en ninguna columna. En el resto, la fila viene ' +
            'corrida de renglón y su código de barras puede no ser el de ese producto.' +
          '</span></div>'
        : '') +

      (n.duplicados.length
        ? '<div class="aviso aviso-error">' + ICONOS.error + '<span class="aviso-texto">' +
            n.duplicados.length + ' códigos aparecen en más de un SKU. El primero se ' +
            'vincula y los demás quedan rechazados: hay que decidir a cuál pertenecen.' +
          '</span></div>'
        : '') +

      (n.incompletas
        ? '<div class="aviso">' + ICONOS.info + '<span class="aviso-texto">' +
            n.incompletas + ' filas vinieron sin descripción ni precios. Si el archivo ' +
            'es el texto de un PDF, es el PDF que pierde las columnas cuando la ' +
            'descripción es larga; el CSV exportado del DMS no tiene ese problema.' +
          '</span></div>'
        : '') +

      '<div class="campo-grupo">' +
        '<button id="btn-listado-cargar" type="button" class="btn btn-primario">' +
          'Cargar ' + n.ok + ' productos y ' + (n.total - n.ok) + ' pendientes' +
        '</button>' +
        '<button id="btn-listado-cargar-limpio" type="button" class="btn btn-peligro-suave">' +
          'Reemplazar todo lo que haya' +
        '</button>' +
      '</div>';

    document.getElementById('btn-listado-cargar').onclick = function () { aplicarListado(false); };
    document.getElementById('btn-listado-cargar-limpio').onclick = function () { aplicarListado(true); };
  }

  function aplicarListado(reemplazar) {
    if (!listadoLeido) return;

    var continuar = reemplazar
      ? window.UI.confirmar({
          titulo: 'Reemplazar tabla completa con el listado',
          mensaje: '¿Borrar la tabla de SKU y la cola de pendientes, y cargar este listado desde cero?',
          detalle: 'Se pierden los códigos vinculados escaneando y las correcciones a mano. Expórtalos antes si los necesitas.',
          textoConfirmar: 'Reemplazar todo'
        })
      : Promise.resolve(true);

    continuar.then(function (ok) {
      if (!ok || !listadoLeido) return;
      var filas = listadoLeido.filas;
      el['resumen-listado'].innerHTML =
        '<div class="consultando"><div class="girador" aria-hidden="true"></div>' +
        '<div><strong>Cargando ' + filas.length + ' filas…</strong>' +
        '<p class="ayuda">Actualizando precios, empaques y cola de pendientes.</p></div></div>';

      window.Sincronizar.aplicarListado(filas, reemplazar).then(function (r) {
        terminarCarga(r);
      });
    });
  }

  function terminarCarga(r) {
    if (!r || !r.ok) { avisar((r && r.error) || 'No se pudo cargar el listado', 'error'); return; }

    avisar(r.skusNuevos + ' SKU nuevos, ' + r.codigosNuevos + ' códigos vinculados, ' +
           r.aRevision + ' a revisión' +
           (r.rechazados.length ? ', ' + r.rechazados.length + ' rechazados' : ''), 'ok');

    el['resumen-listado'].innerHTML =
      '<div class="separador"><span>Resultado de la carga</span></div>' +
      '<div class="aviso aviso-ok">' + ICONOS.ok + '<span class="aviso-texto">' +
        'Listado cargado: ' + r.skusNuevos + ' SKU nuevos, ' +
        r.codigosNuevos + ' códigos de barras vinculados, ' +
        r.actualizados + ' códigos actualizados y ' +
        r.aRevision + ' filas en la cola de pendientes.' +
      '</span></div>' +
      (r.rechazados.length
        ? '<div class="aviso aviso-error">' + ICONOS.error + '<span class="aviso-texto">' +
          r.rechazados.length +
          ' filas quedaron sin vincular porque su código ya pertenece a otro SKU. ' +
          'Hay que decidir a cuál pertenece cada uno; el detalle está en la consola ' +
          'del navegador.</span></div>'
        : '');

    if (r.rechazados.length) {
      console.warn('Filas rechazadas al cargar el listado:', r.rechazados);
    }

    listadoLeido = null;
    el['listado-texto'].value = '';
    el['campo-listado-texto'].classList.add('oculto');
    refrescarSkus();
    refrescarRevision();
  }

  function procesarArchivoListado(archivo) {
    if (!archivo) return;
    var esExcel = /\.xlsx?$/i.test(archivo.name);
    var lector = new FileReader();

    lector.onload = function () {
      el['resumen-listado'].innerHTML =
        '<div class="consultando"><div class="girador" aria-hidden="true"></div>' +
        '<div><strong>Leyendo ' + escapar(archivo.name) + '…</strong>' +
        '<p class="ayuda">Validando columnas, precios y códigos de barras.</p></div></div>';
      window.Listado.leerArchivo(lector.result, archivo.name)
        .then(mostrarListado)
        .catch(function (e) {
          listadoLeido = null;
          el['resumen-listado'].innerHTML =
            '<div class="aviso aviso-error">' + ICONOS.error + '<span class="aviso-texto">' + escapar(e.message) + '</span></div>';
        });
    };

    if (esExcel) {
      lector.readAsArrayBuffer(archivo);
    } else {
      lector.readAsText(archivo, 'windows-1252');
    }
  }

  function importarListado(evento) {
    var archivo = evento.target.files && evento.target.files[0];
    if (!archivo) return;
    procesarArchivoListado(archivo);
    evento.target.value = '';
  }

  // ───────────────── Cola de pendientes de compras ─────────────────

  function aplicarFiltroRevision(lista) {
    if (filtroRevision === 'sin-codigo') {
      return lista.filter(function (p) { return p.estado === 'sin-codigo'; });
    }
    if (filtroRevision === 'codigo-invalido') {
      return lista.filter(function (p) { return p.estado === 'codigo-invalido'; });
    }
    if (filtroRevision === 'con-sugerencia') {
      return lista.filter(function (p) { return !!p.sugerencia; });
    }
    if (filtroRevision === 'fila-incompleta') {
      return lista.filter(function (p) {
        return p.estado !== 'sin-codigo' && p.estado !== 'codigo-invalido';
      });
    }
    return lista;
  }

  function refrescarRevision() {
    var e = window.Revision.estadisticas();
    el['metricas-revision'].innerHTML =
      metrica(e.total, 'Pendientes', e.total > 0 ? 'aviso' : 'ok') +
      metrica(e.sinCodigo, 'Sin código en el listado') +
      metrica(e.invalidos, 'Código que no es GTIN') +
      metrica(e.incompletas, 'Filas incompletas');

    var consulta = el['busqueda-revision'].value;
    var lista = aplicarFiltroRevision(window.Revision.buscarTexto(consulta));
    lista.sort(function (a, b) { return a.sku.localeCompare(b.sku, 'es'); });

    var pagina = pagRevision.recortar(lista);

    el['cuerpo-revision'].innerHTML = pagina.map(function (p) {
      return '<tr>' +
        '<td class="mono" data-etiqueta="SKU">' + botonCopiar(p.sku, 'SKU') + '</td>' +
        '<td class="celda-principal" data-etiqueta="Descripción">' + (p.descripcion
            ? escapar(p.descripcion)
            : '<span class="ayuda">sin descripción en el listado</span>') +
          (p.proveedor ? '<br><span class="ayuda">' + escapar(p.proveedor) + '</span>' : '') +
        '</td>' +
        '<td class="celda-ancha" data-etiqueta="Problema">' +
          '<span class="pildora pildora-aviso">' + escapar(p.estado) + '</span>' +
          '<div class="ayuda">' + escapar(p.motivo) + '</div>' +
          (p.codigoEnElReporte
            ? '<div class="ayuda">En el reporte: <code>' + escapar(p.codigoEnElReporte) + '</code></div>'
            : '') +
          (p.sugerencia
            ? '<div class="ayuda">Corrigiendo el verificador sería <code>' +
              escapar(p.sugerencia) + '</code>. Compáralo con el empaque antes de usarlo.</div>'
            : '') +
        '</td>' +
        '<td class="num col-media" data-etiqueta="Precio">' + (p.precio === null
            ? '<span class="ayuda">—</span>'
            : escapar(dinero(p.precio))) + '</td>' +
        '<td class="num celda-acciones"><div class="tabla-acciones">' +
          '<button type="button" class="btn btn-primario btn-pequeno" data-revision-escanear="' +
            escapar(p.sku) + '">' + ICONOS.escaner + ' Escanear</button>' +
          '<button type="button" class="btn btn-plano btn-pequeno" data-revision-quitar="' +
            escapar(p.sku) + '">Descartar</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');

    pagRevision.pintar();
    el['sin-revision'].classList.toggle('oculto', lista.length > 0);
    var hayFiltro = !!(consulta.trim() || filtroRevision !== 'todos');
    var msgRev = el['sin-revision'].querySelector('p');
    if (msgRev) {
      msgRev.textContent = e.total === 0
        ? 'No hay ningún pendiente de compras por resolver.'
        : 'No hay pendientes que coincidan con el filtro o la búsqueda.';
    }
    if (el['btn-limpiar-filtros-revision']) {
      el['btn-limpiar-filtros-revision'].classList.toggle('oculto', !hayFiltro || e.total === 0);
    }
    pintarEstadoTabla();
  }

  var revisionAbierta = null;

  function textoAyudaRevision(p) {
    return p && p.sugerencia
      ? 'El listado da para proponer ' + p.sugerencia + ', pero eso es un cálculo. Lee el empaque.'
      : 'Dispara el lector sobre el empaque del producto.';
  }

  function informarCodigoRevision() {
    var p = revisionAbierta ? window.Revision.buscar(revisionAbierta) : null;
    var valor = el['revision-codigo'].value;
    if (!valor.trim()) {
      el['revision-aviso'].style.color = '';
      el['revision-aviso'].textContent = textoAyudaRevision(p);
      return;
    }
    var v = window.Barcode.validar(valor);
    if (!v.valido) {
      el['revision-aviso'].style.color = 'var(--error)';
      el['revision-aviso'].textContent = v.tipo.nombre + ' — ' + v.motivo;
      return;
    }
    if (!v.tipo.gtin) {
      el['revision-aviso'].style.color = 'var(--error)';
      el['revision-aviso'].textContent = 'Un código de ' + v.codigo.length + ' dígitos no es un código de barras de producto.';
      return;
    }
    var ocupado = window.SKU.buscarPorCodigo(v.codigo);
    if (ocupado && (!p || ocupado.sku.sku !== p.sku)) {
      el['revision-aviso'].style.color = 'var(--error)';
      el['revision-aviso'].textContent = 'Ya está vinculado al SKU ' + ocupado.sku.sku + ' (' + ocupado.sku.nombre + ').';
      return;
    }
    el['revision-aviso'].style.color = 'var(--ok)';
    el['revision-aviso'].textContent = v.tipo.nombre + ' válido (' + window.Barcode.nivelProbable(v.codigo) + ').';
  }

  function abrirRevision(sku) {
    var p = window.Revision.buscar(sku);
    if (!p) { avisar('Ese pendiente ya no está en la cola', 'error'); return; }

    revisionAbierta = p.sku;
    el['revision-detalle'].innerHTML =
      '<span><strong>SKU <code>' + escapar(p.sku) + '</code></strong>' +
      (p.descripcion ? ' — ' + escapar(p.descripcion) : '') +
      (p.precio !== null ? '<br>Precio del listado: <strong>' + escapar(dinero(p.precio)) + '</strong>' : '') +
      (p.codigoEnElReporte ? '<br>En el reporte: <code>' + escapar(p.codigoEnElReporte) + '</code>' : '') +
      '<br><span class="ayuda">' + escapar(p.motivo) + '</span></span>';
    el['revision-codigo'].value = '';
    el['revision-aviso'].style.color = '';
    el['revision-aviso'].textContent = textoAyudaRevision(p);
    el['dialogo-revision'].showModal();
    setTimeout(function () { el['revision-codigo'].focus(); }, 50);
  }

  function guardarRevision(evento) {
    evento.preventDefault();
    if (!revisionAbierta) return;

    var r = window.Revision.resolverConCodigo(revisionAbierta, el['revision-codigo'].value);
    if (!r.ok) {
      el['revision-aviso'].textContent = r.error;
      el['revision-aviso'].style.color = 'var(--error)';
      return;
    }

    el['dialogo-revision'].close();
    avisar('Código ' + r.entrada.codigo + ' vinculado al SKU ' + r.sku.sku, 'ok');
    revisionAbierta = null;
    refrescarRevision();
    refrescarSkus();
    if (codigoEnCurso) pintarBloqueSku(window.Barcode.validar(codigoEnCurso));
  }

  function quitarRevision(sku) {
    var p = window.Revision.buscar(sku);
    if (!p) return;
    window.UI.confirmar({
      titulo: 'Descartar pendiente',
      mensaje: '¿Descartar el pendiente ' + p.sku + (p.descripcion ? ' (' + p.descripcion + ')' : '') + '?',
      detalle: 'Sale de la cola y el producto queda sin registrar. Volverá a aparecer si se carga otro listado igual.',
      textoConfirmar: 'Descartar'
    }).then(function (ok) {
      if (!ok) return;
      window.Revision.quitar(sku);
      avisar('Pendiente descartado', 'ok');
      refrescarRevision();
    });
  }

  // ───────────────── Importar / exportar ─────────────────

  function importarArchivo(evento) {
    var archivo = evento.target.files && evento.target.files[0];
    if (!archivo) return;
    var lector = new FileReader();
    lector.onload = function () {
      var contenido = String(lector.result);
      window.UI.elegirImportacion({
        titulo: 'Importar caché de productos',
        mensaje: 'Archivo: ' + archivo.name + '. Elige cómo aplicar los datos:'
      }).then(function (modo) {
        if (!modo) return;
        var reemplazar = modo === 'reemplazar';
        var r = window.DB.importar(contenido, reemplazar);
        if (!r.ok) { avisar(r.error, 'error'); return; }
        avisar(r.agregados + ' agregados, ' + r.actualizados + ' actualizados' +
               (r.rechazados.length ? ', ' + r.rechazados.length + ' rechazados' : ''), 'ok');
        if (r.rechazados.length) {
          console.warn('Códigos rechazados en la importación:', r.rechazados);
        }
        refrescarProductos();
      });
    };
    lector.readAsText(archivo);
    evento.target.value = '';
  }

  function vaciar() {
    var total = window.DB.todos().length;
    if (!total) { avisar('La caché ya está vacía', 'ok'); return; }
    window.UI.confirmar({
      titulo: 'Vaciar caché de productos',
      mensaje: '¿Vaciar la caché de ' + total + ' productos?',
      detalle: 'Los nombres que vinieron de las fuentes se vuelven a consultar al leerlos. Los que escribiste tú se pierden; expórtalos antes si los necesitas.',
      textoConfirmar: 'Vaciar caché'
    }).then(function (ok) {
      if (!ok) return;
      window.DB.vaciarCache();
      avisar('Caché vacía', 'ok');
      refrescarProductos();
    });
  }

  // ───────────────── Pestañas y navegación ─────────────────

  function cambiarVista(nombre) {
    document.querySelectorAll('.pestana').forEach(function (b) {
      var activa = b.dataset.vista === nombre;
      b.classList.toggle('activa', activa);
      b.setAttribute('aria-selected', activa ? 'true' : 'false');
    });
    document.querySelectorAll('.vista').forEach(function (v) {
      v.classList.toggle('activa', v.id === 'vista-' + nombre);
    });
    if (nombre === 'escanear') el['entrada-codigo'].focus();
  }

  function sincronizarChipsFiltro(contenedor, atributo, valorActivo) {
    if (!contenedor) return;
    contenedor.querySelectorAll('[' + atributo + ']').forEach(function (btn) {
      btn.classList.toggle('activo', btn.getAttribute(atributo) === valorActivo);
    });
  }

  function irAEscanearConCodigo(codigo) {
    if (!codigo) return;
    cambiarVista('escanear');
    el['entrada-codigo'].value = codigo;
    procesarCodigo(codigo, 'consulta directa');
  }

  // ───────────────── Arranque ─────────────────

  function conectarEventos() {
    el['btn-buscar'].onclick = function () {
      if (el['entrada-codigo'].value.trim()) procesarCodigo(el['entrada-codigo'].value, 'manual');
    };

    el['entrada-codigo'].addEventListener('input', actualizarLimpiarCodigo);
    if (el['btn-limpiar-codigo']) {
      el['btn-limpiar-codigo'].onclick = function () {
        el['entrada-codigo'].value = '';
        actualizarLimpiarCodigo();
        el['entrada-codigo'].focus();
      };
    }

    el['entrada-codigo'].addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (el['entrada-codigo'].value.trim()) procesarCodigo(el['entrada-codigo'].value, 'escáner o manual');
      }
    });

    el['btn-camara'].onclick = alternarCamara;
    el['form-alta'].onsubmit = guardarAlta;
    el['btn-cancelar-alta'].onclick = function () { el['panel-alta'].hidden = true; };

    // Copiado al portapapeles delegado para cualquier código o SKU.
    document.body.addEventListener('click', function (e) {
      var btnCopiar = e.target.closest('[data-copiar]');
      if (btnCopiar) {
        var texto = btnCopiar.getAttribute('data-copiar');
        window.UI.copiar(texto).then(function (ok) {
          if (ok) avisar('Copiado: ' + texto, 'ok');
        });
        return;
      }

      var btnCerrarModal = e.target.closest('[data-cerrar-dialogo]');
      if (btnCerrarModal) {
        var idDlg = btnCerrarModal.getAttribute('data-cerrar-dialogo');
        var dlg = document.getElementById(idDlg);
        if (idDlg === 'dialogo-revision') revisionAbierta = null;
        if (dlg && dlg.open) dlg.close();
      }
    });

    // Atajo F2 (o '/' fuera de inputs) para volver al campo de escaneo.
    document.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
      var enCampo = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (e.key === 'F2' || (e.key === '/' && !enCampo && !document.querySelector('dialog[open]'))) {
        e.preventDefault();
        cambiarVista('escanear');
        el['entrada-codigo'].focus();
        el['entrada-codigo'].select();
      }
    });

    // ---- Vista de productos ----
    el['busqueda-productos'].oninput = function () {
      pagProductos.reiniciar();
      refrescarProductos();
    };
    if (el['filtros-productos']) {
      el['filtros-productos'].addEventListener('click', function (e) {
        var btn = e.target.closest('[data-filtro-producto]');
        if (!btn) return;
        filtroProducto = btn.dataset.filtroProducto;
        sincronizarChipsFiltro(el['filtros-productos'], 'data-filtro-producto', filtroProducto);
        pagProductos.reiniciar();
        refrescarProductos();
      });
    }
    if (el['btn-limpiar-filtros-productos']) {
      el['btn-limpiar-filtros-productos'].onclick = function () {
        el['busqueda-productos'].value = '';
        filtroProducto = 'todos';
        sincronizarChipsFiltro(el['filtros-productos'], 'data-filtro-producto', 'todos');
        pagProductos.reiniciar();
        refrescarProductos();
      };
    }

    el['btn-nuevo'].onclick = function () { abrirDialogo(null); };
    el['btn-exportar-json'].onclick = function () {
      descargar('productos.json', window.DB.exportarJson(), 'application/json');
    };
    el['btn-exportar-csv'].onclick = function () {
      descargar('productos.csv', '\ufeff' + window.DB.exportarCsv(), 'text/csv;charset=utf-8');
    };
    el['entrada-importar'].onchange = importarArchivo;
    el['btn-vaciar'].onclick = vaciar;

    el['cuerpo-productos'].addEventListener('click', function (e) {
      var consultar = e.target.closest('[data-consultar]');
      if (consultar) { irAEscanearConCodigo(consultar.dataset.consultar); return; }
      var editar = e.target.closest('[data-editar]');
      if (editar) { abrirDialogo(window.DB.buscar(editar.dataset.editar)); return; }
      var borrarBtn = e.target.closest('[data-borrar]');
      if (borrarBtn) borrar(borrarBtn.dataset.borrar);
    });

    // ---- Vista y diálogos de SKU ----
    el['busqueda-skus'].oninput = function () {
      pagSkus.reiniciar();
      refrescarSkus();
    };
    if (el['filtros-skus']) {
      el['filtros-skus'].addEventListener('click', function (e) {
        var btn = e.target.closest('[data-filtro-sku]');
        if (!btn) return;
        filtroSku = btn.dataset.filtroSku;
        sincronizarChipsFiltro(el['filtros-skus'], 'data-filtro-sku', filtroSku);
        pagSkus.reiniciar();
        refrescarSkus();
      });
    }
    if (el['btn-limpiar-filtros-sku']) {
      el['btn-limpiar-filtros-sku'].onclick = function () {
        el['busqueda-skus'].value = '';
        filtroSku = 'todos';
        sincronizarChipsFiltro(el['filtros-skus'], 'data-filtro-sku', 'todos');
        pagSkus.reiniciar();
        refrescarSkus();
      };
    }

    el['btn-sku-nuevo'].onclick = function () { abrirDialogoSku(null); };
    el['btn-sku-exportar-csv'].onclick = function () {
      descargar('skus.csv', '\ufeff' + window.SKU.exportarCsv(), 'text/csv;charset=utf-8');
    };
    el['btn-sku-exportar-json'].onclick = function () {
      descargar('skus.json', window.SKU.exportarJson(), 'application/json');
    };
    el['entrada-importar-sku'].onchange = importarSku;
    el['btn-sku-vaciar'].onclick = vaciarSkus;

    el['cuerpo-skus'].addEventListener('click', function (e) {
      var vincular = e.target.closest('[data-sku-vincular]');
      if (vincular) {
        var s = window.SKU.buscarSku(vincular.dataset.skuVincular);
        abrirVincularVacio(s);
        return;
      }
      var editar = e.target.closest('[data-sku-editar]');
      if (editar) { abrirDialogoSku(window.SKU.buscarSku(editar.dataset.skuEditar)); return; }
      var borrarBtn = e.target.closest('[data-sku-borrar]');
      if (borrarBtn) { borrarSku(borrarBtn.dataset.skuBorrar); return; }
      var quitar = e.target.closest('[data-desvincular]');
      if (quitar) quitarVinculo(quitar.dataset.desvincular);
    });

    el['form-sku'].onsubmit = guardarSku;
    el['btn-cerrar-sku'].onclick = function () { el['dialogo-sku'].close(); };
    el['form-vincular'].onsubmit = guardarVinculo;
    el['btn-cerrar-vincular'].onclick = function () { el['dialogo-vincular'].close(); };
    el['vinc-sku'].onchange = alternarSkuNuevo;
    el['vinc-sku-buscar'].oninput = filtrarSelectSku;
    el['vinc-codigo'].oninput = informarCodigoVinculo;
    el['vinc-codigo'].addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      informarCodigoVinculo();
      el['vinc-cantidad'].focus();
    });
    el['vinc-nivel'].onchange = function () {
      if (el['vinc-nivel'].value === 'unidad') el['vinc-cantidad'].value = 1;
      else if (el['vinc-nivel'].value === 'variable') el['vinc-cantidad'].value = '';
      else if (Number(el['vinc-cantidad'].value) <= 1) el['vinc-cantidad'].value = '';
    };

    el['form-editar'].onsubmit = guardarEdicion;
    el['btn-cerrar-dialogo'].onclick = function () { el['dialogo-editar'].close(); };
    el['editar-codigo'].oninput = validarCodigoEnVivo;

    // ---- Historial ----
    if (el['busqueda-historial']) {
      el['busqueda-historial'].oninput = function () {
        pagHistorial.reiniciar();
        refrescarHistorial();
      };
    }
    if (el['filtros-historial']) {
      el['filtros-historial'].addEventListener('click', function (e) {
        var btn = e.target.closest('[data-filtro-historial]');
        if (!btn) return;
        filtroHistorial = btn.dataset.filtroHistorial;
        sincronizarChipsFiltro(el['filtros-historial'], 'data-filtro-historial', filtroHistorial);
        pagHistorial.reiniciar();
        refrescarHistorial();
      });
    }
    el['cuerpo-historial'].addEventListener('click', function (e) {
      var btnVer = e.target.closest('[data-historial-ver]');
      if (btnVer) irAEscanearConCodigo(btnVer.dataset.historialVer);
    });

    el['btn-limpiar-historial'].onclick = function () {
      var total = window.DB.obtenerHistorial().length;
      if (!total) { avisar('El historial ya está vacío', 'ok'); return; }
      window.UI.confirmar({
        titulo: 'Limpiar historial de lecturas',
        mensaje: '¿Borrar todo el historial de ' + total + ' lecturas de este equipo?',
        detalle: 'Solo se borra el registro de lecturas recientes; no afecta ni los SKU ni la caché.',
        textoConfirmar: 'Limpiar historial'
      }).then(function (ok) {
        if (!ok) return;
        window.DB.limpiarHistorial();
        refrescarHistorial();
        avisar('Historial vacío', 'ok');
      });
    };

    // ── Listado de precios ──
    el['entrada-listado'].onchange = importarListado;
    if (el['zona-listado']) {
      el['zona-listado'].addEventListener('dragover', function (e) {
        e.preventDefault();
        el['zona-listado'].classList.add('arrastrando');
      });
      el['zona-listado'].addEventListener('dragleave', function () {
        el['zona-listado'].classList.remove('arrastrando');
      });
      el['zona-listado'].addEventListener('drop', function (e) {
        e.preventDefault();
        el['zona-listado'].classList.remove('arrastrando');
        var archivo = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (archivo) procesarArchivoListado(archivo);
      });
    }

    el['btn-listado-pegar'].onclick = function () {
      el['campo-listado-texto'].classList.toggle('oculto');
      if (!el['campo-listado-texto'].classList.contains('oculto')) el['listado-texto'].focus();
    };
    el['btn-listado-leer'].onclick = function () {
      if (!el['listado-texto'].value.trim()) { avisar('Pega primero el listado', 'error'); return; }
      leerListado(el['listado-texto'].value);
    };

    // ── Cola de pendientes ──
    el['busqueda-revision'].oninput = function () {
      pagRevision.reiniciar();
      refrescarRevision();
    };
    if (el['filtros-revision']) {
      el['filtros-revision'].addEventListener('click', function (e) {
        var btn = e.target.closest('[data-filtro-revision]');
        if (!btn) return;
        filtroRevision = btn.dataset.filtroRevision;
        sincronizarChipsFiltro(el['filtros-revision'], 'data-filtro-revision', filtroRevision);
        pagRevision.reiniciar();
        refrescarRevision();
      });
    }
    if (el['btn-limpiar-filtros-revision']) {
      el['btn-limpiar-filtros-revision'].onclick = function () {
        el['busqueda-revision'].value = '';
        filtroRevision = 'todos';
        sincronizarChipsFiltro(el['filtros-revision'], 'data-filtro-revision', 'todos');
        pagRevision.reiniciar();
        refrescarRevision();
      };
    }

    el['cuerpo-revision'].addEventListener('click', function (e) {
      var btnEscanear = e.target.closest('[data-revision-escanear]');
      var btnQuitar = e.target.closest('[data-revision-quitar]');
      if (btnEscanear) abrirRevision(btnEscanear.dataset.revisionEscanear);
      if (btnQuitar) quitarRevision(btnQuitar.dataset.revisionQuitar);
    });
    el['form-revision'].onsubmit = guardarRevision;
    el['revision-codigo'].oninput = informarCodigoRevision;
    el['btn-cerrar-revision'].onclick = function () {
      revisionAbierta = null;
      el['dialogo-revision'].close();
    };
    el['btn-revision-csv'].onclick = function () {
      if (!window.Revision.todos().length) { avisar('No hay pendientes que exportar', 'error'); return; }
      descargar('pendientes-compras.csv', window.Revision.exportarCsv(), 'text/csv');
    };
    el['btn-revision-vaciar'].onclick = function () {
      var total = window.Revision.todos().length;
      if (!total) { avisar('La cola ya está vacía', 'ok'); return; }
      window.UI.confirmar({
        titulo: 'Vaciar cola de pendientes',
        mensaje: '¿Vaciar la cola de ' + total + ' pendientes?',
        detalle: 'Se pierde la lista de lo que falta resolver. Los productos siguen sin registrar, solo deja de verse que faltan. Expórtala antes si la necesitas.',
        textoConfirmar: 'Vaciar cola'
      }).then(function (ok) {
        if (!ok) return;
        window.Revision.vaciar();
        refrescarRevision();
        avisar('Cola vacía', 'ok');
      });
    };

    document.querySelectorAll('.pestana').forEach(function (b) {
      b.onclick = function () { cambiarVista(b.dataset.vista); };
    });

    // Escáner USB con el foco fuera del campo: se capta igual.
    window.Scanner.escucharTeclado({
      onLectura: function (codigo, fuente) {
        cambiarVista('escanear');
        el['entrada-codigo'].value = codigo;
        procesarCodigo(codigo, fuente);
      }
    });
  }

  function iniciar() {
    cachearElementos();
    window.UI.iniciarTema();

    pagProductos = window.UI.paginador('pag-productos', refrescarProductos);
    pagSkus = window.UI.paginador('pag-skus', refrescarSkus);
    pagRevision = window.UI.paginador('pag-revision', refrescarRevision, { tamano: 10 });
    pagHistorial = window.UI.paginador('pag-historial', refrescarHistorial, { tamano: 25 });

    conectarEventos();

    window.DB.estadoConsulta().then(function (estadoServidor) {
      if (!estadoServidor) {
        el['estado-fuentes'].innerHTML =
          '<span class="pildora pildora-error">Sin servidor de consulta</span> ' +
          'Arranca <code>node server.js</code> y abre la página desde http://localhost. ' +
          'Sin él no se puede consultar ningún nombre.';
        return;
      }
      el['estado-fuentes'].innerHTML = estadoServidor.gs1Configurado
        ? '<span class="pildora pildora-ok">Verified by GS1 activo</span> ' +
          'Se consulta primero la fuente oficial, luego Open Food Facts y UPCitemdb.'
        : '<span class="pildora pildora-aviso">Sin credenciales de GS1</span> ' +
          'Se consultan Open Food Facts y UPCitemdb. Para la fuente oficial hace falta ' +
          'contrato con GS1 Colombia; ver el README.';
    });

    window.SKU.iniciar().then(function (infoSku) {
      if (!infoSku.almacenamientoOk) {
        avisar('No se puede guardar la tabla de SKU en este navegador (almacenamiento bloqueado).', 'error');
      }
      return window.Revision.iniciar();
    }).then(function () {
      return window.Sincronizar.iniciar({
        alCambiar: function () {
          refrescarSkus();
          refrescarRevision();
          pintarEstadoTabla();
          if (codigoEnCurso) pintarBloqueSku(window.Barcode.validar(codigoEnCurso));
        }
      });
    }).then(function (info) {
      refrescarSkus();
      refrescarRevision();
      pintarEstadoTabla();
      if (info.modo === 'sin-conexion' && info.skus) {
        avisar('Sin servidor: se trabaja con la copia de este equipo', 'error');
      }
    });

    window.DB.iniciar().then(function (info) {
      refrescarProductos();
      refrescarHistorial();

      if (!info.almacenamientoOk) {
        avisar('No se puede guardar en este navegador (almacenamiento bloqueado). La caché se perderá al recargar.', 'error');
      }

      var problema = window.Scanner.diagnostico();
      if (problema) {
        el['aviso-camara'].textContent = problema;
        el['aviso-camara'].classList.remove('oculto');
        el['btn-camara'].disabled = !window.Scanner.contextoSeguro() || !window.Scanner.camaraSoportada();
      }

      el['entrada-codigo'].focus();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
