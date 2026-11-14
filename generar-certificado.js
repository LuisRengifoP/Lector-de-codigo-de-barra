/**
 * generar-certificado.js — Crea un certificado autofirmado para servir por HTTPS.
 *
 * Hace falta porque la camara (getUserMedia) solo funciona en contexto seguro.
 * http://localhost cuenta como seguro, pero http://192.168.x.x NO: al abrir el
 * sistema desde el telefono por la red local, el navegador bloquea la camara.
 * Con HTTPS si la permite.
 *
 *   node generar-certificado.js
 *
 * Escribe cert/clave.pem y cert/certificado.pem. server.js los usa solo.
 *
 * El certificado incluye como nombres validos localhost, 127.0.0.1 y cada IP
 * de la red local de esta maquina, para que el telefono no proteste por
 * nombre equivocado (solo por emisor desconocido, que es inevitable sin una
 * autoridad certificadora de verdad).
 *
 * Usa openssl, que ya viene con Git para Windows, macOS y Linux. No instala
 * dependencias de npm.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const RAIZ = __dirname;
const CARPETA = path.join(RAIZ, 'cert');
const CLAVE = path.join(CARPETA, 'clave.pem');
const CERTIFICADO = path.join(CARPETA, 'certificado.pem');
const DIAS = 825; // Tope que aceptan los navegadores modernos para un certificado.

/**
 * Busca openssl. En Windows casi nunca esta en el PATH de PowerShell, pero si
 * esta dentro de Git para Windows, que la mayoria ya tiene instalado.
 */
function buscarOpenssl() {
  const candidatos = ['openssl'];

  if (process.platform === 'win32') {
    const programas = [
      process.env['ProgramFiles'] || 'C:\Program Files',
      process.env['ProgramFiles(x86)'] || 'C:\Program Files (x86)',
      process.env['LOCALAPPDATA'] ? path.join(process.env['LOCALAPPDATA'], 'Programs') : null
    ].filter(Boolean);

    for (const base of programas) {
      candidatos.push(path.join(base, 'Git', 'usr', 'bin', 'openssl.exe'));
      candidatos.push(path.join(base, 'Git', 'mingw64', 'bin', 'openssl.exe'));
      candidatos.push(path.join(base, 'OpenSSL-Win64', 'bin', 'openssl.exe'));
    }
  } else {
    candidatos.push('/usr/bin/openssl', '/usr/local/bin/openssl', '/opt/homebrew/bin/openssl');
  }

  for (const candidato of candidatos) {
    const prueba = spawnSync(candidato, ['version'], { encoding: 'utf8' });
    if (!prueba.error && prueba.status === 0) {
      return { ruta: candidato, version: (prueba.stdout || '').trim() };
    }
  }
  return null;
}

/** Direcciones por las que este servidor puede ser alcanzado. */
function nombresAlternativos() {
  const nombres = ['DNS:localhost', 'IP:127.0.0.1', 'IP:::1'];
  const interfaces = os.networkInterfaces();

  for (const nombre of Object.keys(interfaces)) {
    for (const red of interfaces[nombre] || []) {
      if (red.internal) continue;
      // Las IPv6 de enlace local llevan sufijo de zona (%eth0) y openssl las rechaza.
      if (red.family === 'IPv6' && red.address.toLowerCase().startsWith('fe80')) continue;
      const entrada = 'IP:' + red.address;
      if (nombres.indexOf(entrada) === -1) nombres.push(entrada);
    }
  }
  return nombres;
}

function main() {
  const openssl = buscarOpenssl();
  if (!openssl) {
    console.error('No se encontro openssl.');
    console.error('');
    console.error('En Windows viene con Git para Windows: https://git-scm.com/download/win');
    console.error('Si ya lo tienes, abre Git Bash y ejecuta ahi este mismo comando.');
    console.error('En macOS y Linux: instala el paquete openssl.');
    console.error('');
    console.error('Sin certificado el sistema sigue funcionando por HTTP: el escaner USB');
    console.error('y la entrada manual no necesitan camara. Tambien sirve un tunel HTTPS');
    console.error('como cloudflared o ngrok.');
    process.exit(1);
  }

  if (fs.existsSync(CLAVE) && fs.existsSync(CERTIFICADO) && process.argv.indexOf('--forzar') === -1) {
    console.log('Ya existe un certificado en ' + CARPETA);
    console.log('Para rehacerlo (por ejemplo si cambio la IP de esta maquina):');
    console.log('  node generar-certificado.js --forzar');
    return;
  }

  fs.mkdirSync(CARPETA, { recursive: true });

  const nombres = nombresAlternativos();
  const argumentos = [
    'req', '-x509',
    '-newkey', 'rsa:2048',
    '-nodes',
    '-keyout', CLAVE,
    '-out', CERTIFICADO,
    '-days', String(DIAS),
    '-subj', '/CN=Lector de codigos de barras',
    '-addext', 'subjectAltName=' + nombres.join(','),
    '-addext', 'basicConstraints=critical,CA:TRUE',
    '-addext', 'keyUsage=critical,digitalSignature,keyEncipherment,keyCertSign'
  ];

  const resultado = spawnSync(openssl.ruta, argumentos, { encoding: 'utf8' });

  if (resultado.error || resultado.status !== 0) {
    console.error('openssl fallo al generar el certificado.');
    if (resultado.stderr) console.error(resultado.stderr.trim());
    process.exit(1);
  }

  // La clave privada no debe quedar legible para otros usuarios de la maquina.
  try { fs.chmodSync(CLAVE, 0o600); } catch (e) { /* Windows la ignora */ }

  console.log('Certificado creado con ' + openssl.version);
  console.log('  ' + CERTIFICADO);
  console.log('  ' + CLAVE + '   (privada: no la compartas)');
  console.log('');
  console.log('Valido ' + DIAS + ' dias para:');
  for (const nombre of nombres) console.log('  ' + nombre.replace(/^(DNS|IP):/, ''));
  console.log('');
  console.log('Ahora arranca el servidor: node server.js');
  console.log('El telefono avisara que el emisor es desconocido. Es esperado:');
  console.log('el certificado lo firmaste tu, no una autoridad. Acepta y continua.');
}

main();
