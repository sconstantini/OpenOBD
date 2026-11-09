#!/usr/bin/env node
// Guarda do projeto: reprova o que possa conectar a um servidor, baixar ou executar algo inesperado.
// Uso: node ferramentas/verificar_seguranca.mjs
// É uma barreira de texto: não prova que o código é seguro e não dispensa a revisão humana.
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arquivosPublicaveis } from './verificar_publicacao.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const EU = 'ferramentas/verificar_seguranca.mjs';

const EXTENSOES = new Set(['.js', '.mjs', '.json', '.md', '.html', '.css', '.yml']);
// Código Android só em android/, e um único script: o que gera o APK.
const EXTENSOES_ANDROID = new Set(['.java', '.xml']);
const SCRIPT_APK = 'ferramentas/construir_apk.sh';
const NOMES_SEM_EXTENSAO = new Set(['.gitignore', '.editorconfig', 'LICENSE']);
const ARQUIVOS_PROIBIDOS = new Set(['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'requirements.txt', 'pyproject.toml', 'setup.py', 'tasks.json', 'launch.json', 'devcontainer.json']);
const PASTAS_PROIBIDAS = new Set(['.vscode', '.idea', '.devcontainer', '.husky', 'node_modules', '.gitlab', '.circleci']);

const CODIGO = new Set(['.js', '.mjs', '.html', '.css', '.java', '.xml', '.sh']);
const HOSTS_CODIGO = new Set(['127.0.0.1', 'localhost']);
const HOSTS_XML = new Set(['schemas.android.com']);
const HOSTS_DOCUMENTOS = new Set([...HOSTS_CODIGO, 'keepachangelog.com']);

// Política de segurança do app. O espaço {HASH} recebe o hash do mapa de módulos, o único script embutido.
export const CSP = "default-src 'none'; script-src 'self' 'sha256-{HASH}'; style-src-elem 'self'; style-src-attr 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' blob:; base-uri 'none'; form-action 'none'; object-src 'none'";

const APIS_JS = [
  [/\beval\s*\(/, 'eval'],
  [/\bnew\s+Function\b/, 'new Function'],
  [/\bimport\s*\(/, 'import dinâmico'],
  [/\brequire\s*\(/, 'require'],
  [/\b(XMLHttpRequest|WebSocket|EventSource|RTCPeerConnection|importScripts|sendBeacon)\b/, 'acesso à rede'],
  [/\bnew\s+(Shared)?Worker\b|\bserviceWorker\b/, 'código em segundo plano'],
  [/\b(atob|btoa|fromCharCode)\b/, 'texto codificado'],
  [/\bdocument\.(write|cookie)\b/, 'document.write ou cookie'],
  [/\bwindow\.open\b|\blocation\.(href|assign|replace)\b/, 'navegação para fora do app'],
  [/javascript:/i, 'endereço javascript:'],
  [/node:(http|https|http2|net|tls|dgram|dns|vm|worker_threads)\b/, 'módulo de rede ou execução do Node'],
  [/node:child_process\b|\bchild_process\b/, 'execução de programas'],
];
const APIS_JAVA = [
  [/\bjava\.net\.(?!URI\b)|\bHttpsURLConnection\b|\bHttpURLConnection\b|\bokhttp3?\b|\bandroid\.net\.http\b/, 'acesso à rede'],
  [/(?<!Bluetooth)\bSocket\b|\bDatagram\w*\b/, 'socket de rede'],
  [/\bRuntime\.getRuntime\b|\bProcessBuilder\b/, 'execução de programas'],
  [/\b\w*ClassLoader\b|\bClass\.forName\b|\bSystem\.load(Library)?\b/, 'código carregado em execução'],
  [/\bsetAllow(File|Content|UniversalAccessFromFile|FileAccessFromFile)\w*\(\s*true/, 'WebView com acesso a arquivos'],
  [/\bsetBlockNetworkLoads\(\s*false/, 'WebView com acesso à rede'],
  [/\bsetWebContentsDebuggingEnabled\(\s*true/, 'depuração ligada em lançamentos'],
  [/\bloadDataWithBaseURL\b|\bloadData\b/, 'WebView com conteúdo de fora dos arquivos do app'],
];
const APIS_SH = [[/\b(curl|wget|sudo|ssh|scp|nc|gradle|gradlew|mvn|git|npm|npx|pip3?|apt|apt-get|eval|exec)\b/, 'download, instalação ou execução dinâmica']];
const PERMISSOES = new Set(['android.permission.BLUETOOTH', 'android.permission.BLUETOOTH_CONNECT']);

// Exceção pontual: a listagem do que o Git publica precisa chamar o próprio Git, e só ele.
const EXCECOES_JS = { 'ferramentas/verificar_publicacao.mjs': ['execução de programas'] };

const INVISIVEIS = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/;
const LONGO_CODIFICADO = /[A-Za-z0-9+/]{200,}={0,2}/;
const LIMITE_LINHA = 2000;

export function verificarTexto(rel, texto) {
  const p = [];
  const ext = extname(rel).toLowerCase();
  const eCodigo = CODIGO.has(ext);
  if (INVISIVEIS.test(texto)) p.push('caractere Unicode invisível');
  for (const m of texto.matchAll(/\b([a-z][a-z0-9+.-]*):\/\/([^\s/:"'`)>\]]*)/gi)) {
    if (!(ext === '.xml' ? HOSTS_XML : eCodigo ? HOSTS_CODIGO : HOSTS_DOCUMENTOS).has(m[2].toLowerCase()) && !m[2].includes('$') && m[2] !== '') p.push(`endereço externo: ${m[1]}://${m[2]}`);
  }
  if (!eCodigo) return p;
  if (/["'`]\/\/[a-z0-9-]+\.[a-z]/i.test(texto)) p.push('endereço externo sem protocolo');
  for (const m of texto.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g) ?? []) if (m !== '127.0.0.1') p.push(`endereço IP: ${m}`);
  if (LONGO_CODIFICADO.test(texto)) p.push('bloco longo de texto codificado');
  if (/data:[^"'`\s]*;base64/i.test(texto)) p.push('conteúdo embutido em base64');
  if (texto.split('\n').some((l) => l.length > LIMITE_LINHA)) p.push('linha longa demais, típica de código minificado');
  if (rel === EU) return p;
  if (ext === '.js' || ext === '.mjs') {
    for (const [re, nome] of APIS_JS) if (re.test(texto) && !EXCECOES_JS[rel]?.includes(nome)) p.push(`uso proibido: ${nome}`);
    for (const m of texto.matchAll(/\bfetch\s*\(\s*([^,)]*)/g)) {
      const alvo = m[1].trim();
      const relativo = /^['"`][^:'"`$/][^:'"`]*/.test(alvo) && !alvo.includes('://');
      if (!relativo) p.push(`fetch para um destino não fixo: ${alvo}`);
    }
  }
  if (ext === '.java') for (const [re, nome] of APIS_JAVA) if (re.test(texto)) p.push(`uso proibido: ${nome}`);
  if (ext === '.sh') for (const [re, nome] of APIS_SH) if (re.test(texto)) p.push(`uso proibido: ${nome}`);
  return p;
}

// O que o Android impõe ao app está aqui: sem rede, sem backup e sem portas de entrada além da tela inicial.
export function verificarManifesto(texto) {
  const p = [];
  for (const m of texto.matchAll(/<uses-permission[^>]*android:name="([^"]*)"/g)) if (!PERMISSOES.has(m[1])) p.push(`permissão não permitida: ${m[1]}`);
  if (/<(service|receiver|provider)\b/.test(texto)) p.push('componente além da tela inicial');
  if ((texto.match(/<activity\b/g) ?? []).length !== 1) p.push('o app deve ter uma única tela');
  if (!/android:allowBackup="false"/.test(texto)) p.push('falta allowBackup="false"');
  if (!/android:usesCleartextTraffic="false"/.test(texto)) p.push('falta usesCleartextTraffic="false"');
  if (!/android:dataExtractionRules=/.test(texto)) p.push('faltam as regras de extração de dados');
  if (!/android\.webkit\.WebView\.MetricsOptOut"\s+android:value="true"/.test(texto)) p.push('faltam as métricas da WebView desligadas');
  if (/android:debuggable="true"/.test(texto)) p.push('lançamento depurável');
  return p;
}

// O app só lê, e as duas pontas precisam dizer isso igual.
export function verificarListasDeComandos(js, java) {
  const lista = (texto, nome) => {
    const m = new RegExp(`${nome}[^\\n]*?(?:new Set\\(\\[|asList\\()([^\\]\\)]*)`).exec(texto);
    return m ? [...m[1].matchAll(/['"]([0-9A-Z]+)['"]/g)].map((x) => x[1]).sort().join() : null;
  };
  const p = [];
  for (const nome of ['AT_PERMITIDOS', 'MODOS_LEITURA']) {
    const a = lista(js, nome);
    if (!a || a !== lista(java, nome)) p.push(`${nome} difere entre protocolo.js e Comandos.java`);
  }
  if (/\b(04|14)\b/.test(lista(js, 'MODOS_LEITURA') ?? '')) p.push('modo que apaga dados do carro na lista de leitura');
  return p;
}

export function verificarPacote(texto) {
  const p = [];
  const pac = JSON.parse(texto);
  for (const k of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'bundledDependencies']) {
    if (pac[k] && Object.keys(pac[k]).length) p.push(`${k}: o projeto não aceita dependências`);
  }
  for (const k of Object.keys(pac.scripts ?? {})) if (k !== 'test') p.push(`script não permitido: ${k}`);
  return p;
}

export function verificarAutomacao(texto) {
  const p = [];
  if (/pull_request_target|workflow_run/.test(texto)) p.push('gatilho que dá acesso a código de fora');
  if (!/^permissions:\s*\n\s+contents:\s*read\s*$/m.test(texto)) p.push('precisa declarar permissions: contents: read');
  for (const m of texto.matchAll(/uses:\s*(\S+)/g)) if (!/@[0-9a-f]{40}$/.test(m[1])) p.push(`ação sem versão fixa por hash: ${m[1]}`);
  if (/\b(curl|wget|sudo|npm\s+(i|install|ci)|pip3?\s+install)\b/.test(texto)) p.push('a automação não pode baixar nem instalar nada');
  return p;
}

export function hashMapaDeModulos(html) {
  const m = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html);
  return m ? createHash('sha256').update(m[1], 'utf8').digest('base64') : null;
}

export function verificarPagina(html) {
  const p = [];
  const hash = hashMapaDeModulos(html);
  const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html);
  if (!hash) p.push('mapa de módulos não encontrado');
  if (!meta) p.push('falta a política de segurança (CSP)');
  else if (meta[1] !== CSP.replace('{HASH}', hash)) p.push('a política de segurança (CSP) foi alterada ou o hash do mapa de módulos não confere');
  if (meta && html.indexOf(meta[0]) > html.indexOf('<script')) p.push('a política de segurança precisa vir antes dos scripts');
  const scripts = html.match(/<script\b[^>]*>/g) ?? [];
  if (scripts.join() !== '<script type="importmap">,<script type="module" src="app.js">') p.push('script não previsto na página');
  if (/\son[a-z]+\s*=/i.test(html)) p.push('código embutido em atributo da página');
  return p;
}

function verificarVendor(raiz, arquivos) {
  const caminho = join(raiz, 'ferramentas/integridade.json');
  const vendor = arquivos.filter((a) => a.startsWith('app/vendor/'));
  if (!existsSync(caminho)) return vendor.length ? ['ferramentas/integridade.json: faltam os hashes das bibliotecas'] : [];
  const lista = JSON.parse(readFileSync(caminho, 'utf8')).arquivos;
  const p = [];
  for (const a of vendor) {
    if (!lista[a]) p.push(`${a}: biblioteca fora da lista de integridade`);
    else if (createHash('sha256').update(readFileSync(join(raiz, a))).digest('hex') !== lista[a]) p.push(`${a}: difere da versão registrada`);
  }
  for (const a of Object.keys(lista)) if (!vendor.includes(a)) p.push(`${a}: registrado, mas não encontrado`);
  return p;
}

export function verificarProjeto(raiz = RAIZ) {
  const problemas = [];
  const arquivos = arquivosPublicaveis(raiz);
  for (const rel of arquivos) {
    const nome = basename(rel);
    const nota = (m) => problemas.push(`${rel}: ${m}`);
    if (rel.split('/').some((s) => PASTAS_PROIBIDAS.has(s))) { nota('pasta não permitida, pode executar comandos ao abrir o projeto'); continue; }
    if (ARQUIVOS_PROIBIDOS.has(nome)) { nota('arquivo não permitido'); continue; }
    if (lstatSync(join(raiz, rel)).isSymbolicLink()) { nota('link simbólico não permitido'); continue; }
    const ext = extname(nome).toLowerCase();
    const permitido = EXTENSOES.has(ext) || NOMES_SEM_EXTENSAO.has(nome) || rel === SCRIPT_APK || (EXTENSOES_ANDROID.has(ext) && rel.startsWith('android/'));
    if (!permitido) { nota('tipo de arquivo não permitido'); continue; }
    if (rel.startsWith('app/vendor/')) continue;
    const texto = readFileSync(join(raiz, rel), 'utf8');
    for (const m of verificarTexto(rel, texto)) nota(m);
    if (rel === 'package.json') for (const m of verificarPacote(texto)) nota(m);
    if (/^\.github\/workflows\//.test(rel)) for (const m of verificarAutomacao(texto)) nota(m);
    if (rel === 'app/index.html') for (const m of verificarPagina(texto)) nota(m);
    if (extname(nome) === '.html' && rel !== 'app/index.html') nota('página não prevista');
    if (rel === 'android/AndroidManifest.xml') for (const m of verificarManifesto(texto)) nota(m);
  }
  const protocolo = 'app/obd/protocolo.js';
  const comandos = 'android/src/obd/auto/check/Comandos.java';
  if (arquivos.includes(comandos)) for (const m of verificarListasDeComandos(readFileSync(join(raiz, protocolo), 'utf8'), readFileSync(join(raiz, comandos), 'utf8'))) problemas.push(m);
  problemas.push(...verificarVendor(raiz, arquivos));
  return problemas;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problemas = verificarProjeto();
  if (problemas.length) { problemas.forEach((p) => console.error(`ERRO  ${p}`)); process.exit(1); }
  console.log('OK. Nenhuma conexão externa, download ou execução inesperada foi encontrada.');
}
