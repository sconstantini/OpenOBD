#!/usr/bin/env node
// Procura dados pessoais nos arquivos que podem ir para o Git. Uso: node ferramentas/verificar_publicacao.mjs
// Não substitui a revisão humana: só reconhece formatos conhecidos.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PASTAS_FORA = new Set(['.git', '.claude', 'node_modules', '.venv', '__pycache__', 'estudo_sinais_obd', 'meus_dados', 'logs_obd', 'dev', 'build']);
const PROIBIDOS = new Set(['.glb', '.gltf', '.csv', '.jpg', '.jpeg', '.heic', '.apk', '.keystore', '.jks', '.senha']);
const TEXTO = new Set(['.js', '.mjs', '.py', '.json', '.md', '.html', '.css', '.yml', '.yaml', '.txt', '', '.java', '.xml', '.sh']);

// Endereços inventados, usados de propósito nos testes e na documentação.
const MAC_FICTICIOS = new Set(['00:11:22:33:44:55', 'AA:BB:CC:DD:EE:FF', '00:00:00:00:00:00', '01:23:45:67:89:AB']);
const VIN = /\b(?=[A-HJ-NPR-Z0-9]*\d)(?=[A-HJ-NPR-Z0-9]*[A-HJ-NPR-Z])[A-HJ-NPR-Z0-9]{17}\b/g;
const MAC = /\b(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}\b/g;

export function procurarEmTexto(texto) {
  const achados = [];
  // Só hexadecimal é resposta OBD, não chassi: um VIN real quase sempre tem letras além de A a F.
  for (const m of texto.match(VIN) ?? []) if (!/^[0-9A-F]+$/.test(m)) achados.push(`possível VIN: ${m}`);
  for (const m of texto.match(MAC) ?? []) if (!MAC_FICTICIOS.has(m.toUpperCase())) achados.push(`possível endereço Bluetooth: ${m}`);
  return achados;
}

function* arquivos(pasta) {
  for (const e of readdirSync(pasta, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!PASTAS_FORA.has(e.name)) yield* arquivos(join(pasta, e.name)); }
    else yield join(pasta, e.name);
  }
}

// Em um repositório, vale o que o Git versiona. Fora dele, tudo menos as pastas que o .gitignore exclui.
export function arquivosPublicaveis(raiz = RAIZ) {
  if (existsSync(join(raiz, '.git'))) return execFileSync('git', ['-C', raiz, 'ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  return [...arquivos(raiz)].map((c) => relative(raiz, c).split(sep).join('/'));
}

export function verificar(raiz = RAIZ) {
  const problemas = [];
  for (const rel of arquivosPublicaveis(raiz)) {
    const caminho = join(raiz, rel);
    const ext = extname(caminho).toLowerCase();
    if (rel.split('/').some((s) => PASTAS_FORA.has(s))) { problemas.push(`${rel}: pasta que não deve ser publicada`); continue; }
    if (rel.endsWith('.config.local.json') || PROIBIDOS.has(ext)) { problemas.push(`${rel}: tipo de arquivo que não deve ser publicado`); continue; }
    if (!TEXTO.has(ext) || rel.startsWith('app/vendor/')) continue;
    for (const a of procurarEmTexto(readFileSync(caminho, 'utf8'))) problemas.push(`${rel}: ${a}`);
  }
  return problemas;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problemas = verificar();
  if (problemas.length) { problemas.forEach((p) => console.error(`ERRO  ${p}`)); process.exit(1); }
  console.log('OK. Nenhum dado pessoal conhecido nos arquivos publicáveis.');
}
