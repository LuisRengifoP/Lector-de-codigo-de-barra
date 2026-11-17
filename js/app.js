/**
 * app.js — Orquesta la interfaz: entrada del codigo, consulta a la base,
 * presentacion del nombre del producto, alta de productos nuevos,
 * administracion de la base e historial.
 */
(function () {
  'use strict';

  var el = {};
  // Peso colombiano: sin decimales, separador de miles con punto.
  var moneda = new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0
  });
  var fecha = new Intl.DateTimeFormat('es', { dateStyle: 'short', timeStyle: 'medium' });
  var codigoEnCurso = '';

  // Un paginador por tabla. Se crean en iniciar(), cuando ya existe el DOM.
  var pagProductos, pagSkus, pagRevision, pagHistorial;

  function $(id) { return document.getElementById(id); }

  function cachearElementos() {
    [
      'entrada-codigo', 'btn-buscar', 'btn-camara', 'camara-envoltorio', 'video',
      'aviso-camara', 'estado-escaner', 'resultado', 'panel-alta',
      'form-alta', 'alta-codigo', 'alta-nombre', 'alta-categoria',
      'btn-cancelar-alta', 'lista-categorias',
      'metricas', 'cuerpo-productos', 'busqueda-productos', 'sin-productos',
      'btn-nuevo', 'btn-exportar-json', 'btn-exportar-csv', 'entrada-importar',
      'btn-vaciar', 'cuerpo-historial', 'sin-historial', 'btn-limpiar-historial',
      'estado-fuentes', 'estado-tabla',
      'dialogo-editar', 'form-editar', 'editar-codigo', 'editar-nombre',
      'editar-categoria', 'editar-marca', 'btn-cerrar-dialogo',
      'titulo-editar', 'editar-codigo-aviso', 'avisos',
      // Tabla de SKU: dato propio de la empresa.
      'bloque-sku', 'metricas-sku', 'cuerpo-skus', 'busqueda-skus', 'sin-skus',
      'btn-sku-nuevo', 'btn-sku-exportar-csv', 'btn-sku-exportar-json',
      'entrada-importar-sku', 'btn-sku-vaciar',
      'dialogo-sku', 'form-sku', 'titulo-sku', 'sku-codigo-interno',
      'sku-nombre', 'sku-categoria', 'btn-cerrar-sku', 'lista-categorias-sku',
      'dialogo-vincular', 'form-vincular', 'vinc-codigo', 'vinc-info',
      'vinc-sugerencias', 'vinc-sku', 'vinc-sku-buscar', 'vinc-nuevo', 'vinc-nuevo-sku',
      'vinc-nuevo-nombre', 'vinc-nivel', 'vinc-cantidad', 'vinc-proveedor',
      'vinc-nombre-proveedor', 'btn-cerrar-vincular', 'lista-proveedores',
      // Listado de precios del ERP y lo que deja pendiente.
      'entrada-listado', 'btn-listado-pegar', 'btn-listado-leer',
      'campo-listado-texto', 'listado-texto', 'resumen-listado',
      'metricas-revision', 'cuerpo-revision', 'busqueda-revision', 'sin-revision',
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
    div.textContent = mensaje;
    el['avisos'].appendChild(div);
    setTimeout(function () { div.remove(); }, 3600);
  }

  function estado(texto, clase) {
    el['estado-escaner'].textContent = texto;
    el['estado-escaner'].className = 'pildora' + (clase ? ' pildora-' + clase : '');
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
   * Punto unico de entrada: toda lectura (camara, USB, manual) pasa por aqui.
   *
   * Orden: validar el codigo, mirar la cache local, y si no esta, consultar en
   * linea a traves del servidor. El usuario no registra nada; el nombre llega
   * de la fuente y se memoriza solo.
   */
  function procesarCodigo(entrada, fuente) {
    var validacion = window.Barcode.validar(entrada);
    codigoEnCurso = validacion.codigo;
    el['panel-alta'].hidden = true;
    el['bloque-sku'].innerHTML = '';

    if (!validacion.valido) {
      window.Scanner.pitar(false);
      mostrarFallo(validacion);
      estado('Codigo invalido', 'error');
      window.DB.registrarLectura({
        codigo: validacion.codigo, encontrado: false, valido: false, fuente: fuente
      });
      refrescarHistorial();
      seleccionarCampo();
      return;
    }

    // El bloque de SKU se pinta ya: el SKU, el nombre interno y el precio son
    // datos de la empresa, estan en esta maquina y no dependen de internet.
    // Esperar la consulta en linea para mostrarlos dejaria la caja en blanco
    // varios segundos, o para siempre si no hay red.
    pintarBloqueSku(validacion);

    var enCache = window.DB.buscar(validacion.codigo);
    if (enCache) {
      window.Scanner.pitar(true);
      mostrarProducto(enCache, validacion, fuente, true);
      estado('Encontrado en cache', 'ok');
      window.DB.registrarLectura({
        codigo: validacion.codigo, nombre: enCache.nombre, encontrado: true, fuente: fuente
      });
      refrescarHistorial();
      seleccionarCampo();
      return;
    }

    // No esta en cache: se consulta en linea.
    mostrarConsultando(validacion);
    estado('Consultando...', 'activa');

    window.DB.consultarEnLinea(validacion.codigo).then(function (r) {
      if (r.ok && r.producto) {
        var guardado = window.DB.guardarEnCache(validacion.codigo, r.producto);
        window.Scanner.pitar(true);
        mostrarProducto(guardado, validacion, fuente, false, r);
          estado('Producto identificado', 'ok');
        window.DB.registrarLectura({
          codigo: validacion.codigo, nombre: guardado.nombre, encontrado: true,
          fuente: fuente + ' / ' + r.producto.fuente
        });
        refrescarProductos();
      } else {
        window.Scanner.pitar(false);
        mostrarSinResultado(validacion, r);
          estado('Sin resultado', 'aviso');
        window.DB.registrarLectura({
          codigo: validacion.codigo, encontrado: false, valido: true, fuente: fuente
        });
      }
      refrescarHistorial();
      seleccionarCampo();
    });
  }

  /** Texto seleccionado: el siguiente disparo del escaner lo reemplaza, no lo concatena. */
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
          '<p class="ayuda">Buscando el nombre en las fuentes en linea...</p>' +
        '</div>' +
      '</div>';
  }

  function mostrarProducto(p, validacion, fuente, deCache, respuesta) {
    var origen = window.Barcode.origenGs1(p.codigo);
    var pildoraFuente = p.oficial ? 'pildora-ok' : 'pildora';

    el['resultado'].className = '';
    el['resultado'].innerHTML =
      '<div class="hallazgo-cabecera">' +
        '<h3 class="hallazgo-nombre">' + escapar(p.nombre) + '</h3>' +
        (p.marca ? '<p class="hallazgo-marca">' + escapar(p.marca) + '</p>' : '') +
        '<span class="pildora pildora-ok">' + escapar(validacion.tipo.nombre) + '</span> ' +
        '<span class="pildora ' + pildoraFuente + '">' + escapar(p.origen) + '</span> ' +
        (deCache ? '<span class="pildora">cache local</span>' : '') +
      '</div>' +
      '<dl class="hallazgo-datos">' +
        dato('Codigo', p.codigo, true) +
        (p.empresa ? dato('Empresa titular', p.empresa) : '') +
        dato('Categoria', p.categoria) +
        (origen ? dato('Origen GS1', origen) : '') +
      '</dl>' +
      (respuesta && respuesta.intentos ? detalleIntentos(respuesta.intentos) : '') +
      '<div class="hallazgo-acciones">' +
        '<button class="btn btn-secundario btn-pequeno" data-accion="recargar">Volver a consultar</button>' +
        '<button class="btn btn-secundario btn-pequeno" data-accion="editar">Corregir nombre</button>' +
      '</div>';

    el['resultado'].querySelector('[data-accion="recargar"]').onclick = function () {
      // Se descarta lo memorizado de ese codigo y se vuelve a preguntar a las fuentes.
      window.DB.eliminar(p.codigo);
      refrescarProductos();
      procesarCodigo(p.codigo, 'reconsulta');
    };
    el['resultado'].querySelector('[data-accion="editar"]').onclick = function () {
      abrirDialogo(p);
    };
  }

  /** Lista plegable de que respondio cada fuente. Util para entender la cobertura. */
  function detalleIntentos(intentos) {
    if (!intentos.length) return '';
    return '<details class="intentos">' +
      '<summary>Que respondio cada fuente</summary>' +
      '<ul>' + intentos.map(function (i) {
        return '<li><strong>' + escapar(i.fuente) + ':</strong> ' + escapar(i.estado) +
               (i.detalle ? ' (' + escapar(i.detalle) + ')' : '') + '</li>';
      }).join('') + '</ul></details>';
  }

  function mostrarSinResultado(validacion, respuesta) {
    var origen = window.Barcode.origenGs1(validacion.codigo);
    // Un codigo de caja casi nunca esta en las fuentes publicas: ahi se
    // publica la unidad que compra el consumidor. Si la tabla de SKU ya lo
    // tiene, el producto esta identificado y no falta ningun nombre.
    var enSku = window.SKU.buscarPorCodigo(validacion.codigo);

    el['resultado'].className = '';
    el['resultado'].innerHTML =
      '<div class="fallo">' +
        '<strong>Ninguna fuente en linea tiene este codigo</strong>' +
        '<span>Codigo leido: <code>' + escapar(validacion.codigo) + '</code> (' +
        escapar(validacion.tipo.nombre) + ')</span>' +
        (origen ? '<span>Prefijo GS1: ' + escapar(origen) + '</span>' : '') +
        (respuesta && respuesta.error ? '<span>' + escapar(respuesta.error) + '</span>' : '') +
        '<span>' + (enSku
          ? 'No hace falta: tu tabla de SKU ya lo identifica, y ese dato manda ' +
            'sobre cualquier fuente externa.'
          : 'El codigo es valido y existe, pero no esta publicado en las fuentes ' +
            'consultadas. Puedes ponerle nombre tu mismo: queda guardado y la ' +
            'proxima lectura lo muestra.') + '</span>' +
      '</div>' +
      (respuesta && respuesta.intentos ? detalleIntentos(respuesta.intentos) : '') +
      '<div class="hallazgo-acciones">' +
        (enSku ? '' :
          '<button class="btn btn-secundario btn-pequeno" data-accion="nombrar">Ponerle nombre</button>') +
        '<button class="btn btn-plano btn-pequeno" data-accion="reintentar">Reintentar</button>' +
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

  /** Lectura que ni siquiera supera el digito verificador: no se consulta nada. */
  function mostrarFallo(validacion) {
    el['resultado'].className = '';
    el['resultado'].innerHTML =
      '<div class="fallo es-error">' +
        '<strong>Lectura invalida</strong>' +
        '<span>Codigo leido: <code>' + escapar(validacion.codigo || '(vacio)') + '</code> ' +
        '(' + escapar(validacion.tipo.nombre) + ')</span>' +
        '<span>' + escapar(validacion.motivo) +
        '. Vuelve a escanear; si el codigo esta danado, escribelo a mano.</span>' +
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
    // El foco vuelve al campo para encadenar la siguiente lectura sin usar el raton.
    el['entrada-codigo'].focus();
    el['entrada-codigo'].select();
  }

  // ───────────────── Vista de productos ─────────────────

  function refrescarProductos() {
    var todos = window.DB.todos();
    var deFuente = todos.filter(function (p) {
      return p.origen !== 'manual' && p.origen !== 'editado';
    }).length;
    var oficiales = todos.filter(function (p) { return p.oficial; }).length;

    el['metricas'].innerHTML =
      metrica(todos.length, 'En cache') +
      metrica(deFuente, 'Identificados en linea') +
      metrica(oficiales, 'Desde GS1 oficial') +
      metrica(todos.length - deFuente, 'Nombrados a mano');

    var lista = window.DB.buscarTexto(el['busqueda-productos'].value);
    lista.sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });

    // Solo la pagina que se esta mirando. Con la cache llena, pintar miles de
    // filas tarda mas que la consulta en linea que las lleno.
    var pagina = pagProductos.recortar(lista);

    el['cuerpo-productos'].innerHTML = pagina.map(function (p) {
      return '<tr>' +
        '<td class="mono" data-etiqueta="Codigo">' + escapar(p.codigo) + '</td>' +
        '<td class="celda-principal" data-etiqueta="Nombre">' + escapar(p.nombre) +
          (p.marca ? '<br><span class="ayuda">' + escapar(p.marca) + '</span>' : '') + '</td>' +
        '<td class="col-media" data-etiqueta="Categoria">' + escapar(p.categoria) + '</td>' +
        '<td class="col-baja" data-etiqueta="Fuente"><span class="pildora' +
          (p.oficial ? ' pildora-ok' : '') + '">' + escapar(p.origen) + '</span></td>' +
        '<td class="num celda-acciones"><div class="tabla-acciones">' +
          '<button class="btn btn-secundario btn-pequeno" data-editar="' + escapar(p.codigo) + '">Editar</button>' +
          '<button class="btn btn-peligro btn-pequeno" data-borrar="' + escapar(p.codigo) + '">Borrar</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');

    pagProductos.pintar();
    el['sin-productos'].classList.toggle('oculto', lista.length > 0);

    el['lista-categorias'].innerHTML = window.DB.categorias().map(function (c) {
      return '<option value="' + escapar(c) + '">';
    }).join('');

  }

  /**
   * Precio en pesos. Sin decimales: el listado del DMS no los trae y la
   * tienda no los cobra.
   */
  function dinero(valor) {
    if (valor === null || valor === undefined || valor === '') return '';
    var n = Number(valor);
    if (!isFinite(n)) return '';
    return '$ ' + n.toLocaleString('es-CO', { maximumFractionDigits: 0 });
  }

  /**
   * Dice de donde sale la tabla que se esta usando. Importa verlo: si el
   * servidor no responde, esta caja sigue funcionando con su copia, pero lo
   * que se registre aqui no lo ve nadie mas hasta que vuelva.
   */
  function pintarEstadoTabla() {
    var s = window.Sincronizar;
    var e = window.SKU.estadisticas();
    var pendientes = window.Revision.todos().length;
    var resumen = e.skus + ' SKU y ' + pendientes + ' pendientes';

    if (s.modo === 'servidor') {
      el['estado-tabla'].innerHTML =
        '<span class="pildora pildora-ok">Tabla compartida</span> ' +
        resumen + ', del servidor. Lo que registres aqui lo ven las demas cajas.';
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

  function metrica(valor, clave) {
    return '<div class="metrica"><div class="metrica-valor">' + escapar(String(valor)) +
           '</div><div class="metrica-clave">' + escapar(clave) + '</div></div>';
  }

  // ───────────────── Verificacion contra la tabla de SKU ─────────────────
  //
  // El nombre que devuelven las fuentes en linea sirve para saber *que* es el
  // producto. No dice a que SKU de la empresa pertenece, ni cuantas unidades
  // trae la caja. Eso sale de la tabla de SKU, y es lo que hace falta para
  // recibir mercancia.

  /** Resumen legible de un empaque: "caja de 24 unidades". */
  function textoEmpaque(entrada) {
    if (entrada.nivel === 'variable') return 'medida variable';
    if (entrada.nivel === 'unidad') return 'unidad';
    if (entrada.cantidad >= 1) return entrada.nivel + ' de ' + entrada.cantidad + ' unidades';
    return entrada.nivel + ' (cantidad sin confirmar)';
  }

  /** Los demas codigos del mismo SKU: la unidad cuando leiste la caja, y al reves. */
  function otrosCodigos(s, entradaActual) {
    var otros = s.codigos.filter(function (c) { return c !== entradaActual; });
    if (!otros.length) return '';
    return '<p class="ayuda">Otros codigos de este SKU: ' +
      otros.map(function (c) {
        return '<code>' + escapar(c.codigo) + '</code> (' + escapar(textoEmpaque(c)) + ')';
      }).join(', ') + '</p>';
  }

  /**
   * Dice a que SKU pertenece el codigo leido, o avisa que no esta vinculado.
   *
   * Un codigo sin vincular no es un error del lector: es una caja que nadie
   * habia registrado todavia. Es el caso normal cuando llega un proveedor
   * nuevo, y se resuelve vinculandolo a un SKU que ya existe.
   */
  function pintarBloqueSku(validacion) {
    if (!validacion || !validacion.valido) { el['bloque-sku'].innerHTML = ''; return; }

    var codigo = validacion.codigo;
    var hallado = window.SKU.buscarPorCodigo(codigo);

    if (hallado) {
      var s = hallado.sku;
      var e = hallado.entrada;
      var faltaCantidad = e.nivel !== 'unidad' && e.nivel !== 'variable' && e.cantidad < 1;

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
          // El precio es lo primero que se mira en tienda, asi que va en
          // grande y arriba de los datos de empaque.
          (s.precioCuadra === false
            ? '<p class="ayuda">El precio del listado no sale de multiplicar el precio ' +
              'unitario por el descuento y el IVA. En cigarrillos y algunas bebidas eso ' +
              'es el impuesto al consumo; en el resto, la fila venia corrida y conviene ' +
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
            ? '<p class="bloque-sku-cuenta">1 ' + escapar(e.nivel) + ' = <strong>' +
              e.cantidad + ' unidades</strong> de ' + escapar(s.sku) + '</p>'
            : '') +
          (s.empaque && s.unidadesPorCaja
            ? '<p class="ayuda">Del proveedor viene en ' + escapar(s.empaque) +
              ' de ' + s.unidadesPorCaja + ' unidades' +
              (s.cajas !== null ? ', hay ' + s.cajas + ' en existencia' : '') + '.</p>'
            : '') +
          (faltaCantidad
            ? '<p class="ayuda">Falta contar cuantas unidades trae este empaque. ' +
              'Sin ese numero una caja recibida no se puede convertir en unidades.</p>'
            : '') +
          (e.nombreProveedor
            ? '<p class="ayuda">El proveedor lo llama <em>' + escapar(e.nombreProveedor) + '</em>' +
              (e.proveedor ? ' — ' + escapar(e.proveedor) : '') + '</p>'
            : '') +
          otrosCodigos(s, e) +
          '<div class="hallazgo-acciones">' +
            '<button class="btn btn-secundario btn-pequeno" data-accion="corregir-vinculo">Corregir este vinculo</button>' +
            '<button class="btn btn-secundario btn-pequeno" data-accion="ver-sku">Ver el SKU</button>' +
          '</div>' +
        '</div>';

      el['bloque-sku'].querySelector('[data-accion="corregir-vinculo"]').onclick = function () {
        abrirVincular(codigo, s.sku);
      };
      el['bloque-sku'].querySelector('[data-accion="ver-sku"]').onclick = function () {
        cambiarVista('skus');
        el['busqueda-skus'].value = s.sku;
        refrescarSkus();
      };
      return;
    }

    // Sin vincular. Se proponen los SKU que comparten los 12 digitos base del
    // GTIN: es como la norma relaciona la caja con la unidad. Es una propuesta
    // para confirmar a mano, no un vinculo automatico.
    var cands = window.SKU.candidatos(codigo);
    var nivel = window.Barcode.nivelProbable(codigo);
    var unidadDerivada = window.Barcode.gtin13DesdeGtin14(codigo);

    el['bloque-sku'].innerHTML =
      '<div class="bloque-sku es-aviso">' +
        '<div class="bloque-sku-pildoras">' +
          '<span class="pildora pildora-aviso">Sin SKU</span>' +
          '<span class="pildora">parece ' + escapar(nivel) + '</span>' +
        '</div>' +
        '<strong class="bloque-sku-nombre">Este codigo no esta vinculado a ningun SKU</strong>' +
        '<p class="ayuda">' +
          (nivel === 'caja'
            ? 'Tiene 14 digitos con digito indicador ' + escapar(window.Barcode.indicador(codigo)) +
              ': es un codigo de caja. El codigo de la unidad que le corresponde por norma seria ' +
              '<code>' + escapar(unidadDerivada) + '</code>, pero hay proveedores que no la respetan.'
            : 'Vinculalo al SKU que compras ya registro. Si el producto es nuevo, crea el SKU aqui mismo.') +
        '</p>' +
        (cands.length
          ? '<div class="sugerencias">' +
              '<p class="campo-etiqueta">Comparte los 12 digitos base con:</p>' +
              cands.map(function (c, i) {
                return '<div class="sugerencia">' +
                  '<div><strong>' + escapar(c.sku.sku) + '</strong> ' + escapar(c.sku.nombre) +
                  '<br><span class="ayuda">por <code>' + escapar(c.porCodigo.codigo) + '</code> (' +
                  escapar(textoEmpaque(c.porCodigo)) + ')</span></div>' +
                  '<button class="btn btn-primario btn-pequeno" data-sugerencia="' + i + '">Vincular aqui</button>' +
                  '</div>';
              }).join('') +
            '</div>'
          : '') +
        '<div class="hallazgo-acciones">' +
          '<button class="btn ' + (cands.length ? 'btn-secundario' : 'btn-primario') +
            ' btn-pequeno" data-accion="vincular">Vincular a un SKU</button>' +
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

  // ───────────────── Dialogo de vinculacion ─────────────────

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

  // Oculta las opciones que no casan con el texto tecleado, para no tener que
  // desplazar una lista larga de SKU con el dedo. "__nuevo__" siempre visible.
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

  /** Proveedores ya escritos alguna vez, para no volver a teclearlos. */
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
    el['vinc-info'].textContent = v.tipo.nombre +
      (window.Barcode.indicador(v.codigo) ? ' — digito indicador ' + window.Barcode.indicador(v.codigo) : '') +
      (window.Barcode.origenGs1(v.codigo) ? ' — ' + window.Barcode.origenGs1(v.codigo) : '');

    el['vinc-nuevo-sku'].value = '';
    el['vinc-nuevo-nombre'].value = '';
    llenarSelectSku(skuSugerido || (yaVinculado ? yaVinculado.sku.sku : null));

    el['vinc-nivel'].value = nivel;
    // Para un empaque hay que contar: no se inventa una cantidad.
    el['vinc-cantidad'].value = yaVinculado
      ? (yaVinculado.entrada.cantidad || '')
      : (nivel === 'unidad' ? 1 : '');
    el['vinc-proveedor'].value = yaVinculado ? yaVinculado.entrada.proveedor : '';
    el['vinc-nombre-proveedor'].value = yaVinculado ? yaVinculado.entrada.nombreProveedor : '';

    el['lista-proveedores'].innerHTML = proveedoresConocidos().map(function (p) {
      return '<option value="' + escapar(p) + '">';
    }).join('');

    // Un codigo ya vinculado se abre para corregir nivel, cantidad o proveedor.
    el['vinc-sugerencias'].innerHTML = yaVinculado
      ? '<p class="ayuda">Este codigo ya pertenece a <strong>' + escapar(yaVinculado.sku.sku) +
        '</strong>. Cambiar el SKU de destino aqui no lo mueve: primero hay que ' +
        'desvincularlo desde la vista SKU.</p>'
      : '';

    el['dialogo-vincular'].showModal();
    (el['vinc-sku'].value === '__nuevo__' ? el['vinc-nuevo-nombre'] : el['vinc-cantidad']).focus();
  }

  /**
   * Agregar un codigo a un SKU que ya existe, sin haber leido nada antes.
   * Es el camino de compras: abre el SKU y dispara el escaner sobre la caja.
   */
  function abrirVincularVacio(s) {
    if (!s) return;
    el['vinc-codigo'].value = '';
    el['vinc-codigo'].readOnly = false;
    el['vinc-info'].textContent = 'Dispara el escaner sobre el empaque, o escribe el codigo.';
    el['vinc-sugerencias'].innerHTML = '';
    el['vinc-nuevo-sku'].value = '';
    el['vinc-nuevo-nombre'].value = '';
    llenarSelectSku(s.sku);
    // Agregar un codigo a un SKU que ya existe casi siempre es la caja.
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

  /** Mientras se escribe el codigo en el dialogo: tipo, validez y nivel probable. */
  function informarCodigoVinculo() {
    var valor = el['vinc-codigo'].value;
    if (!valor.trim()) { el['vinc-info'].textContent = ''; return; }
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
      avisar('Falta el codigo de barras', 'error');
      el['vinc-codigo'].focus();
      return;
    }
    var nivel = el['vinc-nivel'].value;
    var cantidad = el['vinc-cantidad'].value;

    // Una caja sin cantidad no sirve para recibir mercancia: se exige el numero.
    if (nivel !== 'variable' && (!String(cantidad).trim() || Number(cantidad) < 1)) {
      avisar('Cuenta cuantas unidades trae el empaque y escribe el numero', 'error');
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
    avisar('Codigo ' + window.Barcode.normalizar(codigo) + ' vinculado a ' + r.sku.sku, 'ok');
    refrescarSkus();
    pintarBloqueSku(window.Barcode.validar(codigo));
  }

  // ───────────────── Vista de SKU ─────────────────

  /**
   * Celda U/E (unidad de empaque): como viene el producto del proveedor.
   *
   * El dato manda el listado del DMS, que trae la palabra de empaque y las
   * unidades que contiene (CAJ 24, PAC 1000). Cuando el listado no lo trajo,
   * sirve el empaque que alguien confirmo contandolo al escanear: es el mismo
   * dato, obtenido abriendo la caja.
   *
   * Si no hay ninguno de los dos se dice, porque sin U/E una caja recibida no
   * se puede convertir en unidades de inventario.
   */
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

  function refrescarSkus() {
    var e = window.SKU.estadisticas();
    el['metricas-sku'].innerHTML =
      metrica(e.skus, 'SKU registrados') +
      metrica(e.codigos, 'Codigos vinculados') +
      metrica(e.cajas, 'Empaques de caja o paca') +
      metrica(e.sinCantidad, 'Sin cantidad confirmada');

    var lista = window.SKU.buscarTexto(el['busqueda-skus'].value);
    lista.sort(function (a, b) { return a.sku.localeCompare(b.sku, 'es'); });

    var pagina = pagSkus.recortar(lista);

    el['cuerpo-skus'].innerHTML = pagina.map(function (s) {
      var codigos = s.codigos.length
        ? s.codigos.slice().sort(function (a, b) {
            return a.codigo.length - b.codigo.length;
          }).map(function (c) {
            var falta = c.nivel !== 'unidad' && c.nivel !== 'variable' && c.cantidad < 1;
            return '<div class="codigo-fila">' +
              '<code class="mono">' + escapar(c.codigo) + '</code>' +
              '<span class="pildora">' + escapar(c.nivel) + '</span>' +
              (c.nivel === 'variable'
                ? ''
                : '<span class="pildora' + (falta ? ' pildora-aviso' : '') + '">' +
                  (falta ? 'sin cantidad' : c.cantidad + ' u') + '</span>') +
              '<button class="btn btn-plano btn-pequeno" data-desvincular="' + escapar(c.codigo) +
                '" title="Quitar este codigo del SKU">quitar</button>' +
              // El nombre del proveedor va en su propia linea: es largo y es
              // solo referencia para reconocer la factura.
              (c.nombreProveedor
                ? '<span class="ayuda codigo-proveedor">' + escapar(c.nombreProveedor) +
                  (c.proveedor ? ' — ' + escapar(c.proveedor) : '') + '</span>'
                : '') +
              '</div>';
          }).join('')
        : '<span class="ayuda">Sin codigos todavia</span>';

      return '<tr>' +
        '<td class="mono" data-etiqueta="SKU">' + escapar(s.sku) + '</td>' +
        '<td class="celda-principal" data-etiqueta="Nombre interno">' + escapar(s.nombre) + '</td>' +
        '<td class="celda-ancha" data-etiqueta="Codigos de barras">' + codigos + '</td>' +
        '<td class="num" data-etiqueta="U/E">' + celdaUnidadDeEmpaque(s) + '</td>' +
        '<td class="col-baja" data-etiqueta="Categoria">' + escapar(s.categoria) + '</td>' +
        '<td class="num" data-etiqueta="Precio">' + (s.precio === null
          ? '<span class="ayuda">sin precio</span>'
          : '<strong>' + escapar(dinero(s.precio)) + '</strong>' +
            (s.iva ? '<br><span class="ayuda">IVA ' + s.iva + '%</span>' : '') +
            (s.precioCuadra === false
              ? '<br><span class="pildora pildora-aviso">por confirmar</span>'
              : '')) + '</td>' +
        '<td class="num col-media" data-etiqueta="Cajas">' +
          (s.cajas === null ? '<span class="ayuda">-</span>' : s.cajas) + '</td>' +
        '<td class="num celda-acciones"><div class="tabla-acciones">' +
          '<button class="btn btn-secundario btn-pequeno" data-sku-vincular="' + escapar(s.sku) + '">Agregar codigo</button>' +
          '<button class="btn btn-secundario btn-pequeno" data-sku-editar="' + escapar(s.sku) + '">Editar</button>' +
          '<button class="btn btn-peligro btn-pequeno" data-sku-borrar="' + escapar(s.sku) + '">Borrar</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');

    pagSkus.pintar();
    el['sin-skus'].classList.toggle('oculto', lista.length > 0);

    el['lista-categorias-sku'].innerHTML = window.SKU.categorias().map(function (c) {
      return '<option value="' + escapar(c) + '">';
    }).join('');

    // Las cuentas de la tabla cambiaron: el indicador de arriba las repite.
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
    if (!window.confirm(
      'Borrar el SKU ' + s.sku + ' (' + s.nombre + ')?\n\n' +
      'Se pierden sus ' + s.codigos.length + ' codigo(s) vinculado(s). ' +
      'Esta accion no se puede deshacer.'
    )) return;
    var r = window.SKU.eliminar(sku);
    if (!r.ok) { avisar(r.error, 'error'); return; }
    avisar('SKU borrado', 'ok');
    refrescarSkus();
    if (codigoEnCurso) pintarBloqueSku(window.Barcode.validar(codigoEnCurso));
  }

  function quitarVinculo(codigo) {
    var h = window.SKU.buscarPorCodigo(codigo);
    if (!h) return;
    if (!window.confirm(
      'Quitar el codigo ' + codigo + ' del SKU ' + h.sku.sku + '?\n\n' +
      'El SKU se queda, pero ese codigo deja de resolver a ningun producto al leerlo.'
    )) return;
    var r = window.SKU.desvincular(codigo);
    if (!r.ok) { avisar(r.error, 'error'); return; }
    avisar('Codigo desvinculado', 'ok');
    refrescarSkus();
    if (codigoEnCurso) pintarBloqueSku(window.Barcode.validar(codigoEnCurso));
  }

  function importarSku(evento) {
    var archivo = evento.target.files && evento.target.files[0];
    if (!archivo) return;
    var lector = new FileReader();
    lector.onload = function () {
      var reemplazar = window.confirm(
        'Reemplazar toda la tabla de SKU con el contenido del archivo?\n\n' +
        'Aceptar = reemplazar.  Cancelar = agregar o actualizar sin borrar lo existente.'
      );
      var r = window.SKU.importar(String(lector.result), reemplazar);
      if (!r.ok) { avisar(r.error, 'error'); return; }
      avisar(r.skusNuevos + ' SKU nuevos, ' + r.codigosNuevos + ' codigos vinculados, ' +
             r.actualizados + ' actualizados' +
             (r.rechazados.length ? ', ' + r.rechazados.length + ' rechazados' : ''), 'ok');
      if (r.rechazados.length) console.warn('Filas rechazadas al importar SKU:', r.rechazados);
      refrescarSkus();
    };
    lector.readAsText(archivo);
    evento.target.value = '';
  }

  function vaciarSkus() {
    var total = window.SKU.todos().length;
    if (!total) { avisar('La tabla de SKU ya esta vacia', 'ok'); return; }
    if (!window.confirm(
      'Vaciar la tabla de ' + total + ' SKU?\n\n' +
      'Esto borra los vinculos entre codigos y SKU, que son dato propio de la ' +
      'empresa y no se pueden volver a consultar en ninguna fuente. ' +
      'Exportalos antes si los necesitas.'
    )) return;
    window.SKU.vaciar();
    avisar('Tabla de SKU vacia', 'ok');
    refrescarSkus();
    if (codigoEnCurso) pintarBloqueSku(window.Barcode.validar(codigoEnCurso));
  }

  // ───────────────── Dialogo de edicion ─────────────────

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
    el['dialogo-editar'].showModal();
    (producto ? el['editar-nombre'] : el['editar-codigo']).focus();
  }

  function validarCodigoEnVivo() {
    var valor = el['editar-codigo'].value;
    if (!valor) { el['editar-codigo-aviso'].textContent = ''; return; }
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
    if (!window.confirm('Borrar "' + p.nombre + '" (' + p.codigo + ') de la base?\n\nEsta accion no se puede deshacer.')) return;
    var r = window.DB.eliminar(codigo);
    if (!r.ok) { avisar(r.error, 'error'); return; }
    avisar('Producto borrado', 'ok');
    refrescarProductos();
  }

  // ───────────────── Historial ─────────────────

  function refrescarHistorial() {
    var lista = window.DB.obtenerHistorial();
    var pagina = pagHistorial.recortar(lista);

    el['cuerpo-historial'].innerHTML = pagina.map(function (h) {
      return '<tr>' +
        '<td data-etiqueta="Fecha y hora">' + escapar(fecha.format(new Date(h.ts))) + '</td>' +
        '<td class="mono" data-etiqueta="Codigo">' + escapar(h.codigo) + '</td>' +
        '<td class="celda-principal" data-etiqueta="Producto">' + (h.encontrado
          ? escapar(h.nombre)
          : (h.valido === false
              ? '<span class="pildora pildora-error">codigo invalido</span>'
              : '<span class="pildora pildora-aviso">no registrado</span>')) + '</td>' +
        '<td class="col-media" data-etiqueta="Fuente">' + escapar(h.fuente) + '</td>' +
      '</tr>';
    }).join('');

    pagHistorial.pintar();
    el['sin-historial'].classList.toggle('oculto', lista.length > 0);
  }

  // ───────────────── Camara ─────────────────

  function alternarCamara() {
    if (window.Scanner.estaActivo()) {
      window.Scanner.detener();
      el['camara-envoltorio'].classList.add('oculto');
      el['btn-camara'].textContent = 'Usar la camara';
      estado('Listo');
      return;
    }

    el['camara-envoltorio'].classList.remove('oculto');
    estado('Abriendo camara...', 'activa');

    window.Scanner.iniciar({
      video: el['video'],
      onLectura: function (codigo, formato) {
        el['aviso-camara'].classList.add('oculto');
        el['entrada-codigo'].value = codigo;
        procesarCodigo(codigo, 'camara' + (formato ? ' (' + formato + ')' : ''));
      },
      onPista: function (mensaje) {
        // Consejo, no error: la camara sigue encendida y buscando.
        el['aviso-camara'].textContent = mensaje;
        el['aviso-camara'].classList.remove('oculto');
        estado('Buscando codigo...', 'activa');
      },
      onError: function (mensaje) {
        el['aviso-camara'].textContent = mensaje;
        el['aviso-camara'].classList.remove('oculto');
        el['camara-envoltorio'].classList.add('oculto');
        estado('Camara no disponible', 'error');
        avisar(mensaje, 'error');
      }
    }).then(function (ok) {
      if (ok) {
        el['btn-camara'].textContent = 'Detener la camara';
        el['aviso-camara'].classList.add('oculto');
        estado('Camara activa — apunta al codigo', 'activa');
      }
    });
  }

  // ───────────────── Vista del listado de precios ─────────────────
  //
  // El listado del DMS es la fuente del precio y del SKU. Se lee en dos pasos
  // a proposito: primero se muestra que trae el archivo, despues se carga. Un
  // listado puede traer mal la columna de codigos, y eso hay que verlo antes
  // de escribir nada en la tabla.

  // Lo ultimo que se leyo, a la espera de que alguien confirme la carga.
  var listadoLeido = null;

  function leerListado(texto) {
    mostrarListado(window.Listado.leer(texto));
  }

  function mostrarListado(r) {
    if (!r.ok) {
      listadoLeido = null;
      el['resumen-listado'].innerHTML =
        '<div class="aviso aviso-error">' + escapar(r.error) + '</div>';
      return;
    }

    listadoLeido = r;
    var n = r.resumen;

    el['resumen-listado'].innerHTML =
      '<div class="separador"></div>' +
      '<div class="metricas">' +
        metrica(n.total, 'Filas leidas') +
        metrica(n.ok, 'Con codigo de barras') +
        metrica(n.sinCodigo + n.invalidos + n.incompletas, 'A revision') +
        metrica(n.proveedores.length, 'Proveedores') +
      '</div>' +

      '<dl class="hallazgo-datos">' +
        dato('Formato', r.formato === 'excel'
          ? 'Excel, hoja "' + r.hoja + '"'
          : (r.formato === 'csv' ? 'CSV con cabecera' : 'texto del reporte con columnas')) +
        dato('Codigos de unidad', String(n.unidades)) +
        dato('Codigos de empaque agrupado (GTIN-14)', String(n.cajas)) +
        dato('Filas con precio final', String(n.conPrecio)) +
      '</dl>' +

      (n.invalidos
        ? '<div class="aviso aviso-error">' +
            n.invalidos + ' filas traen en la columna Alterna un numero que no es un ' +
            'codigo de barras' +
            (n.derivadosDelSku
              ? ', y ' + n.derivadosDelSku + ' de esas son relleno del DMS armado con el propio SKU'
              : '') +
            '. No se guardan como codigo: van a la cola de pendientes.' +
          '</div>'
        : '') +

      (n.precioNoCuadra
        ? '<div class="aviso aviso-error">' +
            'En ' + n.precioNoCuadra + ' filas el precio final no sale de Precio Und, ' +
            'el descuento y el IVA. En cigarrillos y algunas bebidas es el impuesto al ' +
            'consumo, que no aparece en ninguna columna. En el resto, la fila viene ' +
            'corrida de renglon y su codigo de barras puede no ser el de ese producto.' +
          '</div>'
        : '') +

      (n.duplicados.length
        ? '<div class="aviso aviso-error">' +
            n.duplicados.length + ' codigos aparecen en mas de un SKU. El primero se ' +
            'vincula y los demas quedan rechazados: hay que decidir a cual pertenecen.' +
          '</div>'
        : '') +

      (n.incompletas
        ? '<div class="aviso">' +
            n.incompletas + ' filas vinieron sin descripcion ni precios. Si el archivo ' +
            'es el texto de un PDF, es el PDF que pierde las columnas cuando la ' +
            'descripcion es larga; el CSV exportado del DMS no tiene ese problema.' +
          '</div>'
        : '') +

      '<div class="campo-grupo">' +
        '<button id="btn-listado-cargar" class="btn btn-primario">' +
          'Cargar ' + n.ok + ' productos y ' + (n.total - n.ok) + ' pendientes' +
        '</button>' +
        '<button id="btn-listado-cargar-limpio" class="btn btn-secundario">' +
          'Reemplazar todo lo que haya' +
        '</button>' +
      '</div>';

    document.getElementById('btn-listado-cargar').onclick = function () { aplicarListado(false); };
    document.getElementById('btn-listado-cargar-limpio').onclick = function () { aplicarListado(true); };
  }

  function aplicarListado(reemplazar) {
    if (!listadoLeido) return;

    if (reemplazar && !window.confirm(
      'Borrar la tabla de SKU y la cola de pendientes, y cargar el listado desde cero?\n\n' +
      'Se pierden los codigos que se vincularon escaneando y las correcciones a mano. ' +
      'Exportalos antes si los necesitas.'
    )) return;

    var filas = listadoLeido.filas;
    el['resumen-listado'].innerHTML =
      '<div class="aviso">Cargando ' + filas.length + ' filas...</div>';

    window.Sincronizar.aplicarListado(filas, reemplazar).then(function (r) {
      terminarCarga(r);
    });
  }

  function terminarCarga(r) {
    if (!r || !r.ok) { avisar((r && r.error) || 'No se pudo cargar el listado', 'error'); return; }

    avisar(r.skusNuevos + ' SKU nuevos, ' + r.codigosNuevos + ' codigos vinculados, ' +
           r.aRevision + ' a revision' +
           (r.rechazados.length ? ', ' + r.rechazados.length + ' rechazados' : ''), 'ok');

    // El resumen se reemplaza por el resultado: deja de haber nada que
    // confirmar, y un boton que ya no hace nada confunde mas que ayuda.
    el['resumen-listado'].innerHTML =
      '<div class="separador"></div>' +
      '<div class="aviso aviso-ok">' +
        'Listado cargado: ' + r.skusNuevos + ' SKU nuevos, ' +
        r.codigosNuevos + ' codigos de barras vinculados, ' +
        r.actualizados + ' codigos actualizados y ' +
        r.aRevision + ' filas en la cola de pendientes.' +
      '</div>' +
      (r.rechazados.length
        ? '<div class="aviso aviso-error">' + r.rechazados.length +
          ' filas quedaron sin vincular porque su codigo ya pertenece a otro SKU. ' +
          'Hay que decidir a cual pertenece cada uno; el detalle esta en la consola ' +
          'del navegador.</div>'
        : '');

    if (r.rechazados.length) {
      // A cual SKU pertenece un codigo repetido es una decision de compras,
      // no algo que se pueda resolver aqui: se deja el detalle a la vista.
      console.warn('Filas rechazadas al cargar el listado:', r.rechazados);
    }

    listadoLeido = null;
    el['listado-texto'].value = '';
    el['campo-listado-texto'].classList.add('oculto');
    refrescarSkus();
    refrescarRevision();
  }

  function importarListado(evento) {
    var archivo = evento.target.files && evento.target.files[0];
    if (!archivo) return;

    var esExcel = /\.xlsx?$/i.test(archivo.name);
    var lector = new FileReader();

    lector.onload = function () {
      el['resumen-listado'].innerHTML = '<div class="aviso">Leyendo ' + escapar(archivo.name) + '...</div>';
      window.Listado.leerArchivo(lector.result, archivo.name)
        .then(mostrarListado)
        .catch(function (e) {
          listadoLeido = null;
          el['resumen-listado'].innerHTML =
            '<div class="aviso aviso-error">' + escapar(e.message) + '</div>';
        });
    };

    if (esExcel) {
      lector.readAsArrayBuffer(archivo);
    } else {
      // Los reportes de Crystal salen en cp1252. Leerlos como UTF-8 rompe las
      // tildes y la enie, que estan en casi todas las descripciones.
      lector.readAsText(archivo, 'windows-1252');
    }
    evento.target.value = '';
  }

  // ───────────────── Cola de pendientes de compras ─────────────────

  function refrescarRevision() {
    var e = window.Revision.estadisticas();
    el['metricas-revision'].innerHTML =
      metrica(e.total, 'Pendientes') +
      metrica(e.sinCodigo, 'Sin codigo en el listado') +
      metrica(e.invalidos, 'Codigo que no es GTIN') +
      metrica(e.incompletas, 'Filas incompletas');

    var lista = window.Revision.buscarTexto(el['busqueda-revision'].value);
    lista.sort(function (a, b) { return a.sku.localeCompare(b.sku, 'es'); });

    var pagina = pagRevision.recortar(lista);

    el['cuerpo-revision'].innerHTML = pagina.map(function (p) {
      return '<tr>' +
        '<td class="mono" data-etiqueta="SKU">' + escapar(p.sku) + '</td>' +
        '<td class="celda-principal" data-etiqueta="Descripcion">' + (p.descripcion
            ? escapar(p.descripcion)
            : '<span class="ayuda">sin descripcion en el listado</span>') +
          (p.proveedor ? '<br><span class="ayuda">' + escapar(p.proveedor) + '</span>' : '') +
        '</td>' +
        '<td class="celda-ancha" data-etiqueta="Problema">' +
          '<span class="pildora pildora-aviso">' + escapar(p.estado) + '</span>' +
          '<div class="ayuda">' + escapar(p.motivo) + '</div>' +
          (p.codigoEnElReporte
            ? '<div class="ayuda">En el reporte: <code>' + escapar(p.codigoEnElReporte) + '</code></div>'
            : '') +
          (p.sugerencia
            ? '<div class="ayuda">Corrigiendo el verificador seria <code>' +
              escapar(p.sugerencia) + '</code>. Comparalo con el empaque antes de usarlo.</div>'
            : '') +
        '</td>' +
        '<td class="num col-media" data-etiqueta="Precio">' + (p.precio === null
            ? '<span class="ayuda">-</span>'
            : escapar(dinero(p.precio))) + '</td>' +
        '<td class="num celda-acciones"><div class="tabla-acciones">' +
          '<button class="btn btn-primario btn-pequeno" data-revision-escanear="' +
            escapar(p.sku) + '">Escanear</button>' +
          '<button class="btn btn-plano btn-pequeno" data-revision-quitar="' +
            escapar(p.sku) + '">Descartar</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');

    pagRevision.pintar();
    el['sin-revision'].classList.toggle('oculto', lista.length > 0);
  }

  var revisionAbierta = null;

  function abrirRevision(sku) {
    var p = window.Revision.buscar(sku);
    if (!p) { avisar('Ese pendiente ya no esta en la cola', 'error'); return; }

    revisionAbierta = p.sku;
    el['revision-detalle'].innerHTML =
      'SKU <code>' + escapar(p.sku) + '</code>' +
      (p.descripcion ? ' — ' + escapar(p.descripcion) : '') +
      (p.precio !== null ? '<br>Precio del listado: ' + escapar(dinero(p.precio)) : '') +
      '<br>' + escapar(p.motivo);
    el['revision-codigo'].value = '';
    el['revision-aviso'].textContent = p.sugerencia
      ? 'El listado da para proponer ' + p.sugerencia + ', pero eso es un calculo. Lee el empaque.'
      : 'Dispara el lector sobre el empaque del producto.';
    el['dialogo-revision'].showModal();
    setTimeout(function () { el['revision-codigo'].focus(); }, 50);
  }

  function guardarRevision(evento) {
    evento.preventDefault();
    if (!revisionAbierta) return;

    var r = window.Revision.resolverConCodigo(revisionAbierta, el['revision-codigo'].value);
    if (!r.ok) { el['revision-aviso'].textContent = r.error; return; }

    el['dialogo-revision'].close();
    avisar('Codigo ' + r.entrada.codigo + ' vinculado al SKU ' + r.sku.sku, 'ok');
    revisionAbierta = null;
    refrescarRevision();
    refrescarSkus();
    // Si ese mismo codigo esta en pantalla, ahora si tiene SKU y precio.
    if (codigoEnCurso) pintarBloqueSku(window.Barcode.validar(codigoEnCurso));
  }

  function quitarRevision(sku) {
    var p = window.Revision.buscar(sku);
    if (!p) return;
    if (!window.confirm(
      'Descartar el pendiente ' + p.sku + (p.descripcion ? ' (' + p.descripcion + ')' : '') + '?\n\n' +
      'Sale de la cola y el producto queda sin registrar. Vuelve a aparecer si se ' +
      'carga otra vez un listado que lo traiga igual.'
    )) return;
    window.Revision.quitar(sku);
    refrescarRevision();
  }

  // ───────────────── Importar / exportar ─────────────────

  function importarArchivo(evento) {
    var archivo = evento.target.files && evento.target.files[0];
    if (!archivo) return;
    var lector = new FileReader();
    lector.onload = function () {
      var reemplazar = window.confirm(
        'Reemplazar toda la base con el contenido del archivo?\n\n' +
        'Aceptar = reemplazar.  Cancelar = agregar o actualizar sin borrar lo existente.'
      );
      var r = window.DB.importar(String(lector.result), reemplazar);
      if (!r.ok) { avisar(r.error, 'error'); return; }
      avisar(r.agregados + ' agregados, ' + r.actualizados + ' actualizados' +
             (r.rechazados.length ? ', ' + r.rechazados.length + ' rechazados' : ''), 'ok');
      if (r.rechazados.length) {
        console.warn('Codigos rechazados en la importacion:', r.rechazados);
      }
      refrescarProductos();
    };
    lector.readAsText(archivo);
    evento.target.value = '';
  }

  function vaciar() {
    var total = window.DB.todos().length;
    if (!total) { avisar('La cache ya esta vacia', 'ok'); return; }
    if (!window.confirm(
      'Vaciar la cache de ' + total + ' productos?\n\n' +
      'Los nombres que vinieron de las fuentes se vuelven a consultar al leerlos. ' +
      'Los que escribiste tu se pierden; exportalos antes si los necesitas.'
    )) return;
    window.DB.vaciarCache();
    avisar('Cache vacia', 'ok');
    refrescarProductos();
  }

  // ───────────────── Pestanas ─────────────────

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

  // ───────────────── Arranque ─────────────────

  function conectarEventos() {
    el['btn-buscar'].onclick = function () {
      if (el['entrada-codigo'].value.trim()) procesarCodigo(el['entrada-codigo'].value, 'manual');
    };

    el['entrada-codigo'].addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (el['entrada-codigo'].value.trim()) procesarCodigo(el['entrada-codigo'].value, 'escaner o manual');
      }
    });

    el['btn-camara'].onclick = alternarCamara;
    el['form-alta'].onsubmit = guardarAlta;
    el['btn-cancelar-alta'].onclick = function () { el['panel-alta'].hidden = true; };

    // Al cambiar la busqueda se vuelve a la primera pagina: quedarse en la
    // pagina 7 de un resultado de dos filas no muestra nada.
    el['busqueda-productos'].oninput = function () {
      pagProductos.reiniciar();
      refrescarProductos();
    };
    el['btn-nuevo'].onclick = function () { abrirDialogo(null); };
    el['btn-exportar-json'].onclick = function () {
      descargar('productos.json', window.DB.exportarJson(), 'application/json');
    };
    el['btn-exportar-csv'].onclick = function () {
      descargar('productos.csv', '﻿' + window.DB.exportarCsv(), 'text/csv;charset=utf-8');
    };
    el['entrada-importar'].onchange = importarArchivo;
    el['btn-vaciar'].onclick = vaciar;

    el['cuerpo-productos'].addEventListener('click', function (e) {
      var editar = e.target.closest('[data-editar]');
      if (editar) { abrirDialogo(window.DB.buscar(editar.dataset.editar)); return; }
      var borrarBtn = e.target.closest('[data-borrar]');
      if (borrarBtn) borrar(borrarBtn.dataset.borrar);
    });

    // ---- Vista y dialogos de SKU ----
    el['busqueda-skus'].oninput = function () {
      pagSkus.reiniciar();
      refrescarSkus();
    };
    el['btn-sku-nuevo'].onclick = function () { abrirDialogoSku(null); };
    el['btn-sku-exportar-csv'].onclick = function () {
      descargar('skus.csv', '﻿' + window.SKU.exportarCsv(), 'text/csv;charset=utf-8');
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
      var borrar = e.target.closest('[data-sku-borrar]');
      if (borrar) { borrarSku(borrar.dataset.skuBorrar); return; }
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
      // El escaner USB manda Enter al final. Aqui ese Enter no envia el
      // formulario: pasa al campo de la cantidad, que es lo que falta contar.
      if (e.key !== 'Enter') return;
      e.preventDefault();
      informarCodigoVinculo();
      el['vinc-cantidad'].focus();
    });
    el['vinc-nivel'].onchange = function () {
      // Al pasar a un empaque, la cantidad se vacia: hay que contarla.
      if (el['vinc-nivel'].value === 'unidad') el['vinc-cantidad'].value = 1;
      else if (el['vinc-nivel'].value === 'variable') el['vinc-cantidad'].value = '';
      else if (Number(el['vinc-cantidad'].value) <= 1) el['vinc-cantidad'].value = '';
    };

    el['form-editar'].onsubmit = guardarEdicion;
    el['btn-cerrar-dialogo'].onclick = function () { el['dialogo-editar'].close(); };
    el['editar-codigo'].oninput = validarCodigoEnVivo;

    el['btn-limpiar-historial'].onclick = function () {
      if (!window.confirm('Borrar todo el historial de lecturas?')) return;
      window.DB.limpiarHistorial();
      refrescarHistorial();
      avisar('Historial vacio', 'ok');
    };

    // ── Listado de precios ──
    el['entrada-listado'].onchange = importarListado;
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
    el['cuerpo-revision'].addEventListener('click', function (e) {
      var escanear = e.target.getAttribute('data-revision-escanear');
      var quitar = e.target.getAttribute('data-revision-quitar');
      if (escanear) abrirRevision(escanear);
      if (quitar) quitarRevision(quitar);
    });
    el['form-revision'].onsubmit = guardarRevision;
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
      if (!total) { avisar('La cola ya esta vacia', 'ok'); return; }
      if (!window.confirm(
        'Vaciar la cola de ' + total + ' pendientes?\n\n' +
        'Se pierde la lista de lo que falta resolver. Los productos siguen sin ' +
        'registrar, solo deja de verse que faltan. Exportala antes si la necesitas.'
      )) return;
      window.Revision.vaciar();
      refrescarRevision();
      avisar('Cola vacia', 'ok');
    };

    document.querySelectorAll('.pestana').forEach(function (b) {
      b.onclick = function () { cambiarVista(b.dataset.vista); };
    });

    // Escaner USB con el foco fuera del campo: se capta igual.
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

    // Tema claro/oscuro: el atributo ya lo puso el script del <head>; aqui se
    // conecta el boton y se sigue al sistema mientras nadie elija.
    window.UI.iniciarTema();

    pagProductos = window.UI.paginador('pag-productos', refrescarProductos);
    pagSkus = window.UI.paginador('pag-skus', refrescarSkus);
    pagRevision = window.UI.paginador('pag-revision', refrescarRevision, { tamano: 10 });
    pagHistorial = window.UI.paginador('pag-historial', refrescarHistorial, { tamano: 25 });

    conectarEventos();


    // Estado real del servidor: dice si la fuente oficial de GS1 esta disponible.
    window.DB.estadoConsulta().then(function (estadoServidor) {
      if (!estadoServidor) {
        el['estado-fuentes'].innerHTML =
          '<span class="pildora pildora-error">Sin servidor de consulta</span> ' +
          'Arranca <code>node server.js</code> y abre la pagina desde http://localhost. ' +
          'Sin el no se puede consultar ningun nombre.';
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
      // La cola de pendientes se lee despues de la tabla: resolver un
      // pendiente escribe en los dos lados.
      return window.Revision.iniciar();
    }).then(function () {
      // Y encima de las dos, la tabla del servidor, que manda sobre la copia
      // local cuando esta disponible.
      return window.Sincronizar.iniciar({
        alCambiar: function () {
          // Cambio algo en otra caja: se vuelve a pintar lo que esta a la vista.
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
        avisar('No se puede guardar en este navegador (almacenamiento bloqueado). La cache se perdera al recargar.', 'error');
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
