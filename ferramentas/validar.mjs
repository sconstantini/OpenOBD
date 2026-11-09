#!/usr/bin/env node
// Valida um arquivo de configuração no PC, antes de levá-lo ao tablet. Uso: node ferramentas/validar.mjs arquivo.json
import { readFileSync } from 'node:fs';
import { validarConfig } from '../app/dominio/config.js';

const caminho = process.argv[2];
if (!caminho) { console.error('Uso: node ferramentas/validar.mjs arquivo.json'); process.exit(2); }
let dado;
try { dado = JSON.parse(readFileSync(caminho, 'utf8')); } catch (e) { console.error(`Não foi possível ler: ${e.message}`); process.exit(1); }
const { erros, secoes } = validarConfig(dado);
if (erros.length) { erros.forEach((e) => console.error(`ERRO  ${e}`)); process.exit(1); }
console.log(`OK. Seções: ${secoes.join(', ')}`);
