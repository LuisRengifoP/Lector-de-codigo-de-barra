/**
 * consultar.js — Consulta codigos desde la terminal, sin navegador.
 *
 *   node consultar.js 7702084137520
 *   node consultar.js 7702084137520 7702090022711
 *   node consultar.js --archivo codigos.txt
 *
 * Sirve para medir que porcentaje de tu surtido real encuentran las fuentes
 * antes de montar nada: pon tus codigos en un archivo, uno por linea.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const proveedores = require('./js/proveedores');

function cargarConfig() {
  let archivo = {};
  try {
    archivo = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
  } catch (e) { /* sin config.json se usan las variables de entorno */ }
  const gs1 = archivo.gs1 || {};
  return {
    gs1: {
      url: process.env.GS1_URL || gs1.url || '',
      clave: process.env.GS1_CLAVE || gs1.clave || '',
      esquema: process.env.GS1_ESQUEMA || gs1.esquema || 'apikey',
      cabecera: process.env.GS1_CABECERA || gs1.cabecera || ''
    }
  };
}

function leerArgumentos() {
  const args = process.argv.slice(2);
  const codigos = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--archivo' || args[i] === '-a') {
      const ruta = args[++i];
      if (!ruta) { console.error('Falta la ruta despues de --archivo'); process.exit(1); }
      const texto = fs.readFileSync(ruta, 'utf8');
      texto.split(/\r?\n/).forEach((linea) => {
        // Se admite un CSV: se toma la primera columna.
        const campo = linea.split(',')[0].replace(/[^0-9]/g, '');
        if (campo.length >= 8) codigos.push(campo);
      });
    } else {
      const limpio = args[i].replace(/[^0-9]/g, '');
      if (limpio.length >= 8) codigos.push(limpio);
    }
  }
  return codigos;
}

async function principal() {
  const codigos = leerArgumentos();
  if (!codigos.length) {
    console.log('Uso:');
    console.log('  node consultar.js <codigo> [<codigo>...]');
    console.log('  node consultar.js --archivo codigos.txt');
    process.exit(0);
  }

  const config = cargarConfig();
  console.log('Verified by GS1: ' + (config.gs1.clave ? 'configurado' : 'sin credenciales (se salta)'));
  console.log('Codigos a consultar: ' + codigos.length);
  console.log('');

  let encontrados = 0;
  const porFuente = {};

  for (const codigo of codigos) {
    const r = await proveedores.consultar(codigo, config);
    if (r.ok) {
      encontrados++;
      porFuente[r.producto.fuente] = (porFuente[r.producto.fuente] || 0) + 1;
      const marca = r.producto.marca ? '  [' + r.producto.marca + ']' : '';
      console.log('OK  ' + codigo + '  ' + r.producto.nombre + marca + '  (' + r.producto.fuente + ')');
    } else {
      console.log('--  ' + codigo + '  sin resultado  (' +
                  r.intentos.map((i) => i.fuente + '=' + i.estado).join(', ') + ')');
    }
    // Pausa corta: las fuentes abiertas limitan el ritmo de consultas.
    await new Promise((r2) => setTimeout(r2, 350));
  }

  const porcentaje = Math.round((encontrados / codigos.length) * 100);
  console.log('');
  console.log('Encontrados: ' + encontrados + ' de ' + codigos.length + ' (' + porcentaje + '%)');
  Object.keys(porFuente).forEach((f) => console.log('  ' + f + ': ' + porFuente[f]));
}

principal().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
