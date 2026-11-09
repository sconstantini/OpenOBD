#!/usr/bin/env node
// Confere um modelo 3D no formato pedido pelo app. Uso: node ferramentas/validar_glb.mjs arquivo.glb
import { readFileSync } from 'node:fs';
import { validarMetaModelo } from '../app/dominio/config.js';

const LIMITE_MB = 50;
const PROIBIDAS = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_meshopt_compression', 'KHR_texture_basisu'];
const erros = [];
const avisos = [];

const identidade = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function multiplicar(a, b) {
  const m = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let l = 0; l < 4; l++) for (let k = 0; k < 4; k++) m[c * 4 + l] += a[k * 4 + l] * b[c * 4 + k];
  return m;
}
function matrizDoNo(n) {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale || [1, 1, 1];
  const [tx, ty, tz] = n.translation || [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

function lerGlb(caminho) {
  const b = readFileSync(caminho);
  const mb = b.length / 1048576;
  if (mb > LIMITE_MB) erros.push(`arquivo com ${mb.toFixed(1)} MB; o limite é ${LIMITE_MB} MB`);
  else if (mb > 5) avisos.push(`arquivo com ${mb.toFixed(1)} MB; o ideal é ficar abaixo de 5 MB`);
  if (b.length < 20 || b.toString('latin1', 0, 4) !== 'glTF') throw new Error('não é um arquivo .glb');
  if (b.readUInt32LE(4) !== 2) throw new Error('precisa ser glTF versão 2');
  if (b.readUInt32LE(8) !== b.length) throw new Error('arquivo incompleto: o tamanho não confere');
  const tam = b.readUInt32LE(12);
  if (b.toString('latin1', 16, 20) !== 'JSON') throw new Error('o bloco JSON não foi encontrado');
  return { json: JSON.parse(b.toString('utf8', 20, 20 + tam)), mb };
}

function conferir(g) {
  for (const e of validarMetaModelo(g.asset?.extras?.obd_auto_check)) erros.push(`dados do veículo: ${e}`);
  const usadas = new Set([...(g.extensionsUsed || []), ...(g.extensionsRequired || [])]);
  for (const e of PROIBIDAS) if (usadas.has(e)) erros.push(`extensão não aceita: ${e}`);
  for (const buf of g.buffers || []) if (buf.uri) erros.push('há buffer em arquivo externo ou embutido por URI; exporte tudo no .glb');
  for (const img of g.images || []) if (img.uri && !img.uri.startsWith('data:')) erros.push(`há textura em arquivo externo: ${img.uri}`);
  if (g.cameras?.length) avisos.push('há câmeras no arquivo; o app vai ignorá-las');
  if (g.animations?.length) avisos.push('há animações no arquivo; o app não as reproduz');

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let triangulos = 0;
  const visitar = (i, pai) => {
    const no = g.nodes[i];
    const m = multiplicar(pai, matrizDoNo(no));
    for (const p of no.mesh != null ? g.meshes[no.mesh].primitives : []) {
      const a = g.accessors[p.attributes.POSITION];
      const cont = p.indices != null ? g.accessors[p.indices].count : a.count;
      if ((p.mode ?? 4) === 4) triangulos += cont / 3;
      if (!a.min || !a.max) { erros.push('POSITION sem min e max: não foi possível medir o modelo'); continue; }
      for (let c = 0; c < 8; c++) {
        const v = [c & 1 ? a.max[0] : a.min[0], c & 2 ? a.max[1] : a.min[1], c & 4 ? a.max[2] : a.min[2]];
        for (let e = 0; e < 3; e++) {
          const w = m[e] * v[0] + m[e + 4] * v[1] + m[e + 8] * v[2] + m[e + 12];
          min[e] = Math.min(min[e], w);
          max[e] = Math.max(max[e], w);
        }
      }
    }
    for (const f of no.children || []) visitar(f, m);
  };
  const cena = g.scenes?.[g.scene ?? 0];
  if (!cena) { erros.push('o arquivo não tem cena'); return null; }
  for (const n of cena.nodes || []) visitar(n, identidade());
  if (!triangulos) { erros.push('o arquivo não tem geometria'); return null; }
  if (triangulos > 100000) avisos.push(`${Math.round(triangulos)} triângulos; o ideal é ficar abaixo de 100 mil`);

  const [x, y, z] = [0, 1, 2].map((e) => max[e] - min[e]);
  if (z <= x) erros.push('o eixo Z precisa ser o comprimento do carro: a frente deve apontar para +Z');
  if (y >= z) erros.push('o eixo Y precisa ser a altura do carro: o teto deve apontar para +Y');
  if (z < 2 || z > 8) avisos.push(`comprimento de ${z.toFixed(2)} m: confira se a unidade está em metros`);
  if (Math.abs(min[1]) > 0.05) avisos.push(`a parte mais baixa está em Y = ${min[1].toFixed(2)}; as rodas deveriam tocar Y = 0`);
  return { x, y, z, triangulos: Math.round(triangulos) };
}

const caminho = process.argv[2];
if (!caminho) { console.error('Uso: node ferramentas/validar_glb.mjs arquivo.glb'); process.exit(2); }
try {
  const { json, mb } = lerGlb(caminho);
  const medida = conferir(json);
  if (medida) console.log(`Medidas: ${medida.x.toFixed(2)} m de largura, ${medida.y.toFixed(2)} m de altura, ${medida.z.toFixed(2)} m de comprimento. ${medida.triangulos} triângulos, ${mb.toFixed(1)} MB.`);
} catch (e) {
  erros.push(e.message);
}
avisos.forEach((a) => console.log(`AVISO  ${a}`));
erros.forEach((e) => console.error(`ERRO  ${e}`));
if (erros.length) process.exit(1);
console.log('OK. Confira no app se a frente do carro ficou para o lado certo: este teste não consegue distinguir frente e traseira.');
