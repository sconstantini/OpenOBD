// Mantém a documentação presa ao código: exemplos válidos, links que existem e nada pessoal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validarConfig } from '../app/dominio/config.js';
import { procurarEmTexto, verificar } from '../ferramentas/verificar_publicacao.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const adr = readdirSync(join(RAIZ, 'docs/adr')).map((a) => `docs/adr/${a}`);
const DOCS = ['README.md', 'AGENTS.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md', 'docs/README.md', 'docs/arquitetura.md', 'docs/plano-de-manutencao.md', 'docs/garantias.md', 'docs/publicacao.md', 'app/guias/manutencao.md', 'app/guias/jornada.md', ...adr];
const ler = (r) => readFileSync(join(RAIZ, r), 'utf8');

test('os exemplos completos dos documentos passam no validador', () => {
  for (const doc of ['app/guias/manutencao.md', 'app/guias/jornada.md', 'docs/plano-de-manutencao.md']) {
    const blocos = [...ler(doc).matchAll(/```json\n([\s\S]*?)```/g)].map((m) => JSON.parse(m[1]));
    assert.ok(blocos.length > 0, `${doc} sem exemplo`);
    for (const b of blocos) assert.deepEqual(validarConfig(b).erros, [], doc);
  }
});

test('as regras da tabela do guia passam no validador', () => {
  const plano = (regra) => ({ versao: 3, plano: { origem: { documento: 'D' }, sistemas: [{ id: 's', nome: 'S', componentes: [{ id: 'c', nome: 'C', para_que_serve: 'P', origem: { pagina: 1 }, servicos: [{ id: 'x', acao: 'inspecionar', descricao: 'D', regras: { todos: regra } }] }] }] } });
  const regras = [...ler('app/guias/manutencao.md').matchAll(/`(\{ "tipo".*?\})`/g)].map((m) => JSON.parse(m[1]));
  assert.ok(regras.length >= 5);
  for (const r of regras) assert.deepEqual(validarConfig(plano(r)).erros, []);
});

test('os links relativos dos documentos existem', () => {
  for (const doc of DOCS) {
    for (const [, alvo] of ler(doc).matchAll(/\]\((?!https?:|#)([^)#\s]+)/g)) {
      assert.ok(existsSync(join(RAIZ, dirname(doc), alvo)), `${doc} aponta para ${alvo}`);
    }
  }
});

test('a jornada do LLM só cita arquivos que existem e telas que o app tem', () => {
  const jornada = ler('app/guias/jornada.md');
  for (const [, caminho] of jornada.matchAll(/`((?:app|ferramentas)\/[^`\s]+\.\w+)`/g)) assert.ok(existsSync(join(RAIZ, caminho)), caminho);
  for (const [, caminho] of jornada.matchAll(/(?:node|sh) (ferramentas\/[^\s`]+)/g)) assert.ok(existsSync(join(RAIZ, caminho)), caminho);
  const pagina = ler('app/index.html');
  for (const tela of ['Início', 'Manutenção', 'Dados OBD', 'Configurações']) assert.ok(pagina.includes(`<span>${tela}</span>`), tela);
  for (const aba of ['Veículo', 'Manutenção', 'Adaptador', 'Dados']) assert.ok(new RegExp(`data-aba="[a-z]+"[^>]*>${aba}<`).test(pagina), aba);
  const telaConfig = ler('app/telas/configuracoes.js');
  for (const b of ['Exportar histórico', 'Zerar histórico', 'Apagar tudo', 'Buscar adaptadores', 'Usar simulador', 'Escolher arquivo .glb']) assert.ok(telaConfig.includes(b), b);
});

test('os arquivos publicáveis não têm dados pessoais conhecidos', () => {
  assert.deepEqual(verificar(), []);
});

test('a checagem reconhece VIN e endereço Bluetooth', () => {
  // Montados aqui para o próprio teste não ser apontado pela checagem.
  assert.equal(procurarEmTexto(`chassi ${'1HGCM8263'}${'3A004352'}`).length, 1);
  assert.equal(procurarEmTexto(`mac ${'12:34:56'}:${'78:9A:BC'}`).length, 1);
  assert.equal(procurarEmTexto('mac 00:11:22:33:44:55, palavra ABCDEFGHJKLMNPRST').length, 0);
  assert.equal(procurarEmTexto('resposta 7E8064100BE3FA813').length, 0);
});
