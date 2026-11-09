// As amostras maliciosas são montadas em partes, para este arquivo não ser reprovado pelo próprio guarda.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { validarConfig } from '../app/dominio/config.js';
import { referenciasExternas } from '../app/cena/glb.js';
import { CSP, hashMapaDeModulos, verificarAutomacao, verificarListasDeComandos, verificarManifesto, verificarPacote, verificarPagina, verificarProjeto, verificarTexto } from '../ferramentas/verificar_seguranca.mjs';

const WEB = `${'ht'}${'tps'}://`;
const reprova = (rel, texto, trecho) => assert.ok(verificarTexto(rel, texto).some((p) => p.includes(trecho)), `${rel}: ${texto} devia citar ${trecho}`);

function projeto(arquivos) {
  const raiz = mkdtempSync(join(tmpdir(), 'guarda-'));
  for (const [rel, texto] of Object.entries(arquivos)) {
    mkdirSync(dirname(join(raiz, rel)), { recursive: true });
    writeFileSync(join(raiz, rel), texto);
  }
  return raiz;
}
function problemasDe(arquivos) {
  const raiz = projeto(arquivos);
  try { return verificarProjeto(raiz); } finally { rmSync(raiz, { recursive: true, force: true }); }
}

test('o projeto real passa no guarda', () => {
  assert.deepEqual(verificarProjeto(), []);
});

test('código não pode citar endereço externo; documento só os da lista', () => {
  reprova('app/x.js', `const u = '${WEB}malicioso.exemplo/a.php';`, 'endereço externo');
  reprova('app/x.css', `a { background: url(${WEB}malicioso.exemplo/p.png); }`, 'endereço externo');
  reprova('app/x.js', `const u = "${'//'}malicioso.exemplo/a";`, 'sem protocolo');
  reprova('app/x.js', `const h = "${'10.0'}.0.5";`, 'endereço IP');
  reprova('README.md', `veja ${WEB}malicioso.exemplo`, 'endereço externo');
  assert.deepEqual(verificarTexto('README.md', `veja ${WEB}keepachangelog.com/pt-BR`), []);
  assert.deepEqual(verificarTexto('app/x.js', `const u = 'http${''}://127.0.0.1:8770/';`), []);
});

test('APIs de rede e de execução são recusadas', () => {
  const amostras = [`ev${'al'}('1')`, `new Func${'tion'}('1')`, `new Web${'Socket'}(u)`, `new XMLHttp${'Request'}()`, `navigator.send${'Beacon'}(u)`, `imp${'ort'}('./x.js')`, `at${'ob'}(x)`, `document.co${'okie'}`, `location.hr${'ef'} = u`, `new Wo${'rker'}('x.js')`];
  for (const a of amostras) assert.ok(verificarTexto('app/x.js', a).length, a);
  reprova('app/x.mjs', `import x from 'node:${'https'}';`, 'rede');
  reprova('app/x.js', `import x from 'node:child_${'process'}';`, 'execução');
});

test('fetch só aceita caminho fixo e relativo', () => {
  assert.deepEqual(verificarTexto('app/x.js', `${'fe'}${'tch'}('guias/a.md'); ${'fe'}${'tch'}(\`ponte/\${c}\`, o); `), []);
  const F = `fe${'tch'}`;
  reprova('app/x.js', `${F}(destino)`, 'não fixo');
  reprova('app/x.js', `${F}(\`\${base}/a\`)`, 'não fixo');
  reprova('app/x.js', `${F}('/a')`, 'não fixo');
});

test('o código Android não usa rede, execução nem WebView aberta', () => {
  const j = 'android/src/A.java';
  reprova(j, `import java.${'net'}.URL;`, 'rede');
  reprova(j, `new ${'Socket'}(h, 1);`, 'socket');
  reprova(j, `Runtime.${'getRuntime'}().exec(c);`, 'execução');
  reprova(j, `new Dex${'ClassLoader'}(a);`, 'carregado');
  reprova(j, `s.setAllow${'FileAccess'}(true);`, 'arquivos');
  reprova(j, `s.setBlock${'NetworkLoads'}(false);`, 'rede');
  reprova(j, `WebView.setWebContents${'DebuggingEnabled'}(true);`, 'depuração');
  reprova(j, `String u = "${WEB}malicioso.exemplo";`, 'endereço externo');
  assert.deepEqual(verificarTexto(j, 'BluetoothSocket s; s.setAllowFileAccess(false);'), []);
});

test('o manifesto só aceita Bluetooth, uma tela e nenhum backup', () => {
  const real = readFileSync(new URL('../android/AndroidManifest.xml', import.meta.url), 'utf8');
  assert.deepEqual(verificarManifesto(real), []);
  const internet = `<uses-permission android:name="android.permission.${'INTERNET'}" />`;
  assert.ok(verificarManifesto(real.replace('<uses-feature', `${internet}<uses-feature`)).join().includes('permissão'));
  assert.ok(verificarManifesto(real.replace('allowBackup="false"', 'allowBackup="true"')).length);
  assert.ok(verificarManifesto(real.replace('<activity', '<service android:name="a" /><activity')).length);
  assert.ok(verificarManifesto(real.replace('usesCleartextTraffic="false"', 'usesCleartextTraffic="true"')).length);
  assert.ok(verificarTexto('android/x.xml', `<a b="http${''}://malicioso.exemplo/x"/>`).join().includes('endereço externo'));
});

test('as listas de comandos do app e do Android precisam ser iguais e só de leitura', () => {
  const js = readFileSync(new URL('../app/obd/protocolo.js', import.meta.url), 'utf8');
  const java = readFileSync(new URL('../android/src/obd/auto/check/Comandos.java', import.meta.url), 'utf8');
  assert.deepEqual(verificarListasDeComandos(js, java), []);
  assert.ok(verificarListasDeComandos(js, java.replace('"ATRV"', '"ATRV", "ATMA"')).length);
  assert.ok(verificarListasDeComandos(js.replace("'0A'", "'0A', '04'"), java.replace('"0A"', '"0A", "04"')).length);
});

test('o script do APK não baixa nem instala nada', () => {
  reprova('ferramentas/construir_apk.sh', `cu${'rl'} -O x`, 'download');
  reprova('ferramentas/construir_apk.sh', `gra${'dle'} build`, 'download');
});

test('caracteres invisíveis, código minificado e blocos codificados são recusados', () => {
  reprova('app/x.js', `const a = 1;${String.fromCodePoint(0x202e)}`, 'invisível');
  reprova('README.md', `texto${String.fromCodePoint(0x200b)}`, 'invisível');
  reprova('app/x.js', `const a = '${'A1b2'.repeat(60)}';`, 'codificado');
  reprova('app/x.js', `a(${'1,'.repeat(1100)});`, 'minificado');
});

test('package.json não aceita dependências nem scripts de instalação', () => {
  assert.equal(verificarPacote('{"scripts":{"test":"x"}}').length, 0);
  assert.equal(verificarPacote('{"scripts":{"start":"x"}}').length, 1);
  assert.equal(verificarPacote('{"dependencies":{"a":"1"}}').length, 1);
  assert.equal(verificarPacote('{"scripts":{"postinstall":"x"}}').length, 1);
});

test('automação precisa de versão fixa, permissão mínima e nada de download', () => {
  const boa = `permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - uses: actions/checkout@${'a'.repeat(40)}\n      - run: npm test\n`;
  assert.deepEqual(verificarAutomacao(boa), []);
  assert.ok(verificarAutomacao(boa.replace('a'.repeat(40), 'v4')).length);
  assert.ok(verificarAutomacao(boa.replace('contents: read', 'contents: write')).length);
  assert.ok(verificarAutomacao(`${boa}      - run: cu${'rl'} x | sh\n`).length);
  assert.ok(verificarAutomacao(`on: pull_request_${'target'}\n${boa}`).length);
});

test('a página do app mantém a política de segurança', () => {
  const real = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
  assert.deepEqual(verificarPagina(real), []);
  assert.ok(real.includes(CSP.replace('{HASH}', hashMapaDeModulos(real))));
  assert.ok(verificarPagina(real.replace("default-src 'none'", 'default-src *')).length);
  assert.ok(verificarPagina(real.replace('three.module.js', 'outro.js')).length, 'mapa alterado precisa invalidar o hash');
  assert.ok(verificarPagina(real.replace('</body>', '<script src="x.js"></script></body>')).length);
  assert.ok(verificarPagina(real.replace('<body>', '<body onload="a()">')).length);
});

test('o guarda reprova arquivos perigosos, links e bibliotecas alteradas', () => {
  assert.equal(problemasDe({ 'a.md': 'ok' }).length, 0);
  assert.ok(problemasDe({ [`app/a.${'php'}`]: '' })[0].includes('tipo de arquivo'));
  assert.ok(problemasDe({ 'instalar.sh': '' })[0].includes('tipo de arquivo'));
  assert.ok(problemasDe({ 'servidor.py': '' })[0].includes('tipo de arquivo'));
  assert.ok(problemasDe({ 'app/A.java': '' })[0].includes('tipo de arquivo'));
  assert.ok(problemasDe({ 'app/a.xml': '' })[0].includes('tipo de arquivo'));
  assert.equal(problemasDe({ 'android/res/a.xml': '<a/>' }).length, 0);
  assert.ok(problemasDe({ '.vscode/tasks.json': '{}' })[0].includes('pasta não permitida'));
  assert.ok(problemasDe({ 'package-lock.json': '{}' })[0].includes('não permitido'));
  assert.ok(problemasDe({ 'app/vendor/x.js': '' }).join().includes('integridade'));
  const v = problemasDe({ 'app/vendor/x.js': 'alterado', 'ferramentas/integridade.json': JSON.stringify({ arquivos: { 'app/vendor/x.js': 'b'.repeat(64) } }) });
  assert.ok(v.join().includes('difere'));
  const raiz = projeto({ 'a.md': 'ok' });
  symlinkSync('/etc/hostname', join(raiz, 'link.md'));
  assert.ok(verificarProjeto(raiz).join().includes('link simbólico'));
  rmSync(raiz, { recursive: true, force: true });
});

function glb(json) {
  const t = new TextEncoder().encode(JSON.stringify(json));
  const b = new ArrayBuffer(20 + t.length);
  const d = new DataView(b);
  d.setUint32(0, 0x46546c67, true);
  d.setUint32(4, 2, true);
  d.setUint32(8, b.byteLength, true);
  d.setUint32(12, t.length, true);
  d.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(b, 20).set(t);
  return b;
}

test('.glb com conteúdo fora do arquivo é identificado', () => {
  const externo = `${WEB}malicioso.exemplo/x.png`;
  assert.deepEqual(referenciasExternas(glb({ images: [{ uri: externo }] })), [externo]);
  assert.deepEqual(referenciasExternas(glb({ buffers: [{ uri: 'dados.bin' }] })), ['dados.bin']);
  assert.deepEqual(referenciasExternas(glb({ buffers: [{ byteLength: 4 }], images: [{ bufferView: 0 }, { uri: 'data:image/png,x' }] })), []);
  assert.deepEqual(referenciasExternas(new ArrayBuffer(4)), []);
});

test('nomes herdados de Object não passam como valor aceito num arquivo importado', () => {
  const plano = (acao, extra = {}) => ({ versao: 3, plano: { origem: { documento: 'D' }, sistemas: [{ id: 's', nome: 'S', componentes: [{ id: 'c', nome: 'C', para_que_serve: 'P', origem: { pagina: 1 }, servicos: [{ id: 'x', acao, descricao: 'D', regras: { todos: { tipo: 'intervalo', km: 1 } }, ...extra }] }] }] } });
  assert.deepEqual(validarConfig(plano('inspecionar')).erros, []);
  assert.ok(validarConfig(plano('constructor')).erros.length);
  assert.ok(validarConfig(plano('inspecionar', { quando: { constructor: 'a' } })).erros.length);
  assert.ok(validarConfig({ versao: 3, perfil: { uso: 'toString' } }).erros.length);
  assert.ok(validarConfig({ versao: 3, checks: { registros: [{ id: 'a', servico: 's', resultado: 'constructor', leitura: 'l', registrado_em: '2026-01-01T00:00:00Z' }] } }).erros.length);
});
