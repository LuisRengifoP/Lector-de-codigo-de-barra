/**
 * scanner.js — Dos vias de entrada del codigo:
 *
 *   1. Camara: decodificacion con la libreria ZXing (algoritmo determinista,
 *      no hay modelo de IA ni entrenamiento involucrado).
 *   2. Escaner USB o bluetooth: el aparato se comporta como un teclado
 *      ("keyboard wedge"), teclea los digitos y envia Enter. Se capta como
 *      texto en un campo, sin libreria alguna.
 *
 * La camara exige contexto seguro: http://localhost o https. Con file:// el
 * navegador bloquea getUserMedia; de ahi el servidor local incluido.
 *
 * POR QUE NO SE USA BrowserMultiFormatReader
 * ------------------------------------------
 * La capa de camara de @zxing/library 0.21.3 tiene un defecto que impide leer.
 * Al decodificar desde un <video>, pasa isVideo=true a su fuente de luminancia,
 * y esa funcion invierte el blanco y el negro en fotogramas alternos:
 *
 *   FRAME_INDEX = !FRAME_INDEX
 *   if (FRAME_INDEX || !isVideo) { gris normal } else { gris invertido }
 *
 * La intencion era leer tambien etiquetas en negativo. El efecto real es que la
 * mitad de los intentos analiza una imagen invertida, donde un codigo normal no
 * existe. Peor: FRAME_INDEX es estatico y compartido, y con TRY_HARDER el lector
 * gira la imagen y crea mas fuentes, que vuelven a cambiar la paridad. El
 * resultado medido con un codigo perfecto delante de la camara fue 0 lecturas en
 * cientos de intentos, todos NotFoundException, mientras el mismo fotograma
 * decodificado sin ese indicador daba 10 de 10.
 *
 * Por eso aqui se captura el fotograma y se arma el bitmap a mano, siempre en
 * gris normal, y se llama al decodificador de ZXing, que si es correcto. Es el
 * mismo algoritmo; lo que se evita es su envoltorio de camara.
 */
(function (global) {
  'use strict';

  var lector = null;        // Instancia de ZXing.MultiFormatReader
  var activo = false;
  var ultimoCodigo = '';     // Ultimo codigo entregado a la aplicacion.
  var vistoPorUltimaVez = 0; // Ultimo fotograma donde ese codigo aparecio.
  // Un codigo que sigue frente a la camara se lee en cada fotograma. Para no
  // repetirlo, tiene que desaparecer del encuadre este tiempo antes de contar
  // como lectura nueva. Un fotograma suelto sin leer no basta: la mano tiembla
  // y el enfoque respira, asi que fallar un par de intentos es normal.
  var MS_AUSENTE = 900;
  var MS_PISTA = 10000;      // Tras este tiempo sin leer nada, se sugiere como mejorar la toma.
  var contextoAudio = null;
  var temporizadorPista = null;
  var ultimoPitido = 0;
  var MS_ENTRE_PITIDOS = 120; // Dos pitidos mas juntos que esto se oyen como uno roto.

  var flujo = null;             // MediaStream abierto
  var videoActual = null;
  var temporizadorLectura = null;
  var lienzo = null;            // Fotograma completo
  var lienzoBanda = null;       // Franja central ampliada
  var lienzoGirado = null;      // Fotograma girado un cuarto de vuelta
  var MS_ENTRE_INTENTOS = 90;
  var ANCHO_MAXIMO = 1280;      // Analizar mas ancho cuesta CPU y no mejora la lectura.
  var MS_ESPERA_IMAGEN = 8000;  // Tope esperando que la camara entregue el primer fotograma.

  /** Formatos 1D de retail. Limitar la lista acelera y reduce falsos positivos. */
  function formatos() {
    var F = global.ZXing.BarcodeFormat;
    return [
      F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E,
      F.CODE_128, F.CODE_39, F.ITF, F.CODABAR,
      F.QR_CODE // util para etiquetas internas
    ];
  }

  function libreriaDisponible() {
    var Z = global.ZXing;
    return !!(Z && Z.MultiFormatReader && Z.HTMLCanvasElementLuminanceSource &&
              Z.HybridBinarizer && Z.BinaryBitmap);
  }

  function cancelarPista() {
    if (temporizadorPista) {
      clearTimeout(temporizadorPista);
      temporizadorPista = null;
    }
  }

  /**
   * Una webcam de portatil tarda en enganchar una barra fina. Si pasan varios
   * segundos sin lectura, se sugiere que corregir. No es un error.
   */
  function programarPista(onPista) {
    cancelarPista();
    if (typeof onPista !== 'function') return;
    temporizadorPista = setTimeout(function () {
      onPista('Sin lectura todavia. Acerca el codigo a 15-25 cm, que llene el recuadro, ' +
              'con luz pareja y sin reflejo. Mantenlo plano y quieto un segundo.');
    }, MS_PISTA);
  }

  function camaraSoportada() {
    return !!(global.navigator && global.navigator.mediaDevices && global.navigator.mediaDevices.getUserMedia);
  }

  function contextoSeguro() {
    if (global.isSecureContext) return true;
    var h = global.location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
  }

  /** Motivo por el que la camara no puede usarse, o null si todo esta listo. */
  function diagnostico() {
    if (!camaraSoportada()) return 'Este navegador no expone camaras (getUserMedia no disponible).';
    if (!contextoSeguro()) {
      return 'La camara exige http://localhost o https. Abre la pagina con el servidor incluido: node server.js';
    }
    if (!libreriaDisponible()) {
      return 'No se cargo la libreria ZXing (requiere internet la primera vez). El escaner USB y la entrada manual siguen funcionando.';
    }
    return null;
  }

  /**
   * Lector sin TRY_HARDER, a proposito.
   *
   * TRY_HARDER hace dos cosas: muestrear mas filas y reintentar sobre la imagen
   * girada. Lo segundo es lo unico que hacia falta, y sale carisimo: medido en
   * este proyecto, un fotograma sin codigo cuesta 332 ms con TRY_HARDER y 11 ms
   * sin el. Con la camara apuntando a la nada —que es casi todo el tiempo— eso
   * deja el lector a tres intentos por segundo y la CPU al tope; en un telefono,
   * peor. El giro se resuelve mas abajo rotando el fotograma nosotros mismos,
   * que cuesta unos pocos milisegundos.
   */
  function crearLector() {
    var hints = new Map();
    hints.set(global.ZXing.DecodeHintType.POSSIBLE_FORMATS, formatos());
    var instancia = new global.ZXing.MultiFormatReader();
    instancia.setHints(hints);
    return instancia;
  }

  /**
   * Decodifica un lienzo. Devuelve el resultado de ZXing o null si no hay codigo.
   * El bitmap se arma siempre en gris normal, nunca invertido: ver la cabecera.
   */
  function leerLienzo(fuente) {
    try {
      var luminancia = new global.ZXing.HTMLCanvasElementLuminanceSource(fuente);
      var bitmap = new global.ZXing.BinaryBitmap(new global.ZXing.HybridBinarizer(luminancia));
      return lector.decodeWithState(bitmap);
    } catch (e) {
      // No encontrar codigo en un fotograma es lo normal, no un error.
      return null;
    }
  }

  function prepararLienzos() {
    if (!lienzo) {
      lienzo = global.document.createElement('canvas');
      lienzoBanda = global.document.createElement('canvas');
      lienzoGirado = global.document.createElement('canvas');
    }
  }

  /**
   * Segundo intento sobre la franja central, ampliada al doble.
   * Un codigo lejano o pequeño deja barras de uno o dos pixeles, que el
   * binarizador pierde; al ampliar la zona donde apunta la guia, aparecen.
   */
  function leerBandaCentral(ancho, alto) {
    var altoBanda = Math.round(alto * 0.45);
    var y = Math.round((alto - altoBanda) / 2);
    var destinoAncho = Math.min(ANCHO_MAXIMO, ancho * 2);
    var escala = destinoAncho / ancho;

    lienzoBanda.width = Math.round(destinoAncho);
    lienzoBanda.height = Math.round(altoBanda * escala);

    var g = lienzoBanda.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = false; // Interpolar difumina las barras finas.
    g.drawImage(lienzo, 0, y, ancho, altoBanda, 0, 0, lienzoBanda.width, lienzoBanda.height);
    return leerLienzo(lienzoBanda);
  }

  /**
   * Tercer intento sobre el fotograma girado un cuarto de vuelta.
   * Un lector de una dimension recorre filas horizontales: un codigo vertical
   * —telefono en vertical, o etiqueta pegada de lado— le resulta invisible.
   * Girar el fotograma cuesta unos milisegundos y resuelve ese caso.
   */
  function leerGirado(ancho, alto) {
    lienzoGirado.width = alto;
    lienzoGirado.height = ancho;

    var g = lienzoGirado.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = false;
    g.save();
    g.translate(alto / 2, ancho / 2);
    g.rotate(Math.PI / 2);
    g.drawImage(lienzo, -ancho / 2, -alto / 2);
    g.restore();
    return leerLienzo(lienzoGirado);
  }

  function listarCamaras() {
    if (!camaraSoportada()) return Promise.resolve([]);
    return global.navigator.mediaDevices.enumerateDevices()
      .then(function (dispositivos) {
        return dispositivos.filter(function (d) { return d.kind === 'videoinput'; });
      })
      .catch(function () { return []; });
  }

  /**
   * Pide la camara. Sin deviceId se pide la trasera y la mayor resolucion
   * razonable: una barra fina necesita pixeles, y 640x480 se queda corto.
   */
  function abrirFlujo(deviceId) {
    var video = deviceId
      ? { deviceId: { exact: deviceId } }
      : { facingMode: { ideal: 'environment' } };

    video.width = { ideal: 1280 };
    video.height = { ideal: 720 };

    return global.navigator.mediaDevices.getUserMedia({ video: video, audio: false })
      .catch(function (error) {
        // Una camara que no admite esas restricciones no debe dejar sin servicio.
        if (error && (error.name === 'OverconstrainedError' || error.name === 'NotFoundError')) {
          return global.navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        throw error;
      });
  }

  /** El primer fotograma tarda: antes de el, videoWidth es 0 y no hay nada que leer. */
  function esperarImagen(video) {
    return new Promise(function (listo, falla) {
      var limite = Date.now() + MS_ESPERA_IMAGEN;
      (function revisar() {
        if (video.videoWidth > 0 && video.videoHeight > 0) return listo();
        if (Date.now() > limite) {
          return falla(new Error('La camara no entrego imagen. Cierra las aplicaciones que la usen y reintenta.'));
        }
        setTimeout(revisar, 100);
      })();
    });
  }

  /**
   * Decide si una decodificacion es una lectura nueva o el mismo producto que
   * sigue en el encuadre, y solo en el primer caso avisa a la aplicacion.
   *
   * Un codigo distinto cuenta siempre: cambiaste de producto.
   * El mismo codigo cuenta otra vez solo si estuvo ausente MS_AUSENTE, es decir
   * si lo apartaste y lo volviste a poner. Asi un producto olvidado delante de
   * la camara no se relee ni vuelve a pitar cada segundo y medio.
   */
  function entregarLectura(resultado, opciones) {
    var codigo = resultado.getText();
    var ahora = Date.now();

    if (codigo === ultimoCodigo) {
      var ausente = ahora - vistoPorUltimaVez;
      vistoPorUltimaVez = ahora;
      if (ausente < MS_AUSENTE) return; // Nunca salio del encuadre.
    } else {
      ultimoCodigo = codigo;
      vistoPorUltimaVez = ahora;
    }

    // Aqui NO se pita. El pitido lo da app.js segun el resultado: encontrado,
    // sin resultado o codigo invalido. Si pitara tambien aqui, cada lectura
    // sonaria dos veces, y los dos tonos superpuestos se oyen como un chirrido.
    programarPista(opciones.onPista);
    var formato = resultado.getBarcodeFormat
      ? String(global.ZXing.BarcodeFormat[resultado.getBarcodeFormat()] || '')
      : '';
    opciones.onLectura(codigo, formato);
  }

  /** Un intento por fotograma: completo primero, franja central despues. */
  function intentarLeer(opciones) {
    if (!activo || !videoActual) return;

    var ancho = videoActual.videoWidth;
    var alto = videoActual.videoHeight;

    if (ancho > 0 && alto > 0) {
      var escala = Math.min(1, ANCHO_MAXIMO / ancho);
      var w = Math.round(ancho * escala);
      var h = Math.round(alto * escala);

      if (lienzo.width !== w || lienzo.height !== h) {
        lienzo.width = w;
        lienzo.height = h;
      }
      var g = lienzo.getContext('2d', { willReadFrequently: true });
      g.drawImage(videoActual, 0, 0, w, h);

      // De lo barato a lo caro, y de lo frecuente a lo raro.
      var resultado = leerLienzo(lienzo) || leerBandaCentral(w, h) || leerGirado(w, h);
      if (resultado) entregarLectura(resultado, opciones);
    }

    temporizadorLectura = setTimeout(function () { intentarLeer(opciones); }, MS_ENTRE_INTENTOS);
  }

  /**
   * Arranca la lectura por camara.
   * opciones: { video, deviceId, onLectura(codigo, formato), onError(mensaje), onPista(mensaje) }
   */
  function iniciar(opciones) {
    var problema = diagnostico();
    if (problema) {
      opciones.onError(problema);
      return Promise.resolve(false);
    }
    if (activo) return Promise.resolve(true);

    videoActual = opciones.video;
    prepararLienzos();

    return abrirFlujo(opciones.deviceId)
      .then(function (entregado) {
        flujo = entregado;
        videoActual.srcObject = flujo;
        videoActual.setAttribute('playsinline', '');
        videoActual.muted = true;
        return videoActual.play();
      })
      .then(function () {
        return esperarImagen(videoActual);
      })
      .then(function () {
        lector = crearLector();
        activo = true;
        programarPista(opciones.onPista);
        intentarLeer(opciones);
        return true;
      })
      .catch(function (e) {
        detener();
        var mensaje = 'No se pudo abrir la camara: ' + (e && e.message ? e.message : e);
        if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
          mensaje = 'Permiso de camara denegado. Habilitalo en el candado de la barra de direcciones.';
        } else if (e && e.name === 'NotFoundError') {
          mensaje = 'No se encontro ninguna camara conectada.';
        } else if (e && e.name === 'NotReadableError') {
          mensaje = 'La camara esta en uso por otra aplicacion.';
        }
        opciones.onError(mensaje);
        return false;
      });
  }

  function detener() {
    cancelarPista();

    if (temporizadorLectura) {
      clearTimeout(temporizadorLectura);
      temporizadorLectura = null;
    }

    if (flujo) {
      flujo.getTracks().forEach(function (pista) {
        try { pista.stop(); } catch (e) { /* ya estaba detenida */ }
      });
      flujo = null;
    }

    if (videoActual) {
      try { videoActual.srcObject = null; } catch (e) { /* algunos navegadores se quejan */ }
      videoActual = null;
    }

    lector = null;
    activo = false;
    ultimoCodigo = '';
    vistoPorUltimaVez = 0;
  }

  function estaActivo() {
    return activo;
  }

  /**
   * Senal sonora: un tono limpio al encontrar, uno grave que cae al fallar.
   * Sin archivos de audio.
   *
   * Tres detalles que hacen la diferencia entre un pitido y un ruido raro:
   *
   *   1. Onda senoidal, no cuadrada. La cuadrada trae todos los armonicos
   *      impares y por un altavoz de portatil suena a zumbido metalico.
   *   2. Rampas de entrada y de salida. Arrancar y cortar la amplitud de golpe
   *      produce un chasquido audible al principio y al final del tono.
   *   3. Un solo pitido por lectura. Dos tonos iguales separados por unos pocos
   *      milisegundos se superponen y se oyen como un chirrido, no como dos
   *      pitidos: de ahi el intervalo minimo de abajo.
   */
  function pitar(exito) {
    try {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;

      var ahora = Date.now();
      if (ahora - ultimoPitido < MS_ENTRE_PITIDOS) return;
      ultimoPitido = ahora;

      if (!contextoAudio) contextoAudio = new AC();
      if (contextoAudio.state === 'suspended') contextoAudio.resume();

      var duracion = exito ? 0.085 : 0.2;
      var volumen = 0.05;

      var osc = contextoAudio.createOscillator();
      var gan = contextoAudio.createGain();
      osc.type = 'sine';

      // Un respiro antes de empezar: programar en currentTime exacto se corta.
      var t0 = contextoAudio.currentTime + 0.005;

      osc.frequency.setValueAtTime(exito ? 1000 : 320, t0);
      // El fallo cae de tono: se reconoce sin mirar la pantalla.
      if (!exito) osc.frequency.exponentialRampToValueAtTime(190, t0 + duracion);

      gan.gain.setValueAtTime(0.0001, t0);
      gan.gain.exponentialRampToValueAtTime(volumen, t0 + 0.012);
      gan.gain.exponentialRampToValueAtTime(0.0001, t0 + duracion);

      osc.connect(gan);
      gan.connect(contextoAudio.destination);
      osc.start(t0);
      osc.stop(t0 + duracion + 0.02);

      // Sin esto los nodos se acumulan: una caja lee miles de codigos al dia.
      osc.onended = function () {
        try { osc.disconnect(); gan.disconnect(); } catch (e) { /* ya desconectados */ }
      };
    } catch (e) { /* sin audio no pasa nada */ }
  }

  /**
   * Escucha el escaner USB en modo teclado.
   * El aparato teclea muy rapido y cierra con Enter: si entre el primer y el
   * ultimo caracter pasan menos de `msMaximos`, la lectura viene del aparato.
   * opciones: { onLectura(codigo, fuente) }
   */
  function escucharTeclado(opciones) {
    var buffer = '';
    var inicio = 0;
    var msMaximos = opciones.msMaximos || 120;

    function alTeclear(evento) {
      // Si el foco esta en un campo de texto, el campo maneja la entrada.
      var destino = evento.target;
      var etiqueta = destino && destino.tagName ? destino.tagName.toUpperCase() : '';
      if (etiqueta === 'INPUT' || etiqueta === 'TEXTAREA' || etiqueta === 'SELECT') return;

      if (evento.key === 'Enter') {
        if (buffer.length >= 4) {
          var rapido = (Date.now() - inicio) < msMaximos * buffer.length;
          opciones.onLectura(buffer, rapido ? 'escaner USB' : 'teclado');
        }
        buffer = '';
        return;
      }
      if (evento.key.length === 1) {
        if (!buffer) inicio = Date.now();
        buffer += evento.key;
      }
    }

    global.addEventListener('keydown', alTeclear);
    return function desconectar() {
      global.removeEventListener('keydown', alTeclear);
    };
  }

  global.Scanner = {
    libreriaDisponible: libreriaDisponible,
    camaraSoportada: camaraSoportada,
    contextoSeguro: contextoSeguro,
    diagnostico: diagnostico,
    listarCamaras: listarCamaras,
    iniciar: iniciar,
    detener: detener,
    estaActivo: estaActivo,
    pitar: pitar,
    escucharTeclado: escucharTeclado
  };
})(typeof window !== 'undefined' ? window : globalThis);
