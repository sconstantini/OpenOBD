#!/usr/bin/env node
// Grava marca, modelo e ano dentro de um .glb, sem mexer na geometria.
// Uso: node ferramentas/etiquetar_glb.mjs arquivo.glb --marca "Marca" --modelo "Modelo" --ano 2020
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { validarMetaModelo } from '../app/dominio/config.js';

const { values: op, positionals } = parseArgs({
  allowPositionals: true,
  options: { marca: { type: 'string' }, modelo: { type: 'string' }, ano: { type: 'string' } },
});
const caminho = positionals[0];
const meta = { marca: op.marca, modelo: op.modelo, ano: Number(op.ano) };
const erros = validarMetaModelo(meta);
if (!caminho || erros.length) {
  erros.forEach((e) => console.error(`ERRO  ${e}`));
  console.error('Uso: node ferramentas/etiquetar_glb.mjs arquivo.glb --marca "Marca" --modelo "Modelo" --ano 2020');
  process.exit(2);
}

const b = readFileSync(caminho);
if (b.length < 20 || b.toString('latin1', 0, 4) !== 'glTF' || b.readUInt32LE(4) !== 2 || b.toString('latin1', 16, 20) !== 'JSON') {
  console.error('ERRO  não é um arquivo .glb de glTF 2');
  process.exit(1);
}
const tam = b.readUInt32LE(12);
const json = JSON.parse(b.toString('utf8', 20, 20 + tam));
json.asset.extras = { ...json.asset.extras, obd_auto_check: meta };

let texto = Buffer.from(JSON.stringify(json), 'utf8');
texto = Buffer.concat([texto, Buffer.alloc((4 - (texto.length % 4)) % 4, 0x20)]);
const resto = b.subarray(20 + tam);
const cabecalho = Buffer.alloc(20);
cabecalho.write('glTF', 0, 'latin1');
cabecalho.writeUInt32LE(2, 4);
cabecalho.writeUInt32LE(20 + texto.length + resto.length, 8);
cabecalho.writeUInt32LE(texto.length, 12);
cabecalho.write('JSON', 16, 'latin1');

const temp = `${caminho}.tmp`;
writeFileSync(temp, Buffer.concat([cabecalho, texto, resto]));
renameSync(temp, caminho);
console.log(`OK. ${meta.marca} ${meta.modelo} ${meta.ano} gravado em ${caminho}`);
