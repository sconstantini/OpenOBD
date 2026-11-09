// Rodar com: node --test "tests/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validarConfig, migrarConfig } from '../app/dominio/config.js';
import { criarCheck, estadoServico, listarServicos, listarTarefas, perfilParaPlano, piorEstado } from '../app/dominio/manutencao.js';

const exemplo = JSON.parse(readFileSync(new URL('../app/exemplo/carro-generico.config.json', import.meta.url)));
const check = (servico, resultado, km, em, extra = {}) => ({ id: `${servico}${km}${em}`, servico, resultado, km, em, registrado_em: '2026-11-02T10:00:00-03:00', ...extra });
const servicos = (perfil = { uso: 'normal', opcoes: {} }) => listarServicos(exemplo.plano, perfil);
const achar = (id, perfil) => servicos(perfil).find((e) => e.servico.id === id);
const HOJE = new Date('2026-11-02T12:00:00-03:00');

test('o exemplo público é válido e está marcado como exemplo', () => {
  assert.deepEqual(validarConfig(exemplo).erros, []);
  assert.equal(exemplo.plano.exemplo, true);
});

test('tudo começa desconhecido e vira tarefa', () => {
  const itens = servicos().map((e) => ({ ...e, ...estadoServico(e, [], 1000, HOJE) }));
  assert.ok(itens.every((i) => i.estado === 'desconhecido' && !i.conhecido));
  assert.equal(listarTarefas(itens).length, itens.length);
});

test('inspeção resolve o desconhecido e inicia a contagem', () => {
  const e = achar('correia.inspecionar');
  const r = estadoServico(e, [check('correia.inspecionar', 'ok', 50000, '2026-10-01T10:00:00-03:00')], 52000, HOJE);
  assert.equal(r.estado, 'ok');
  assert.equal(r.conhecido, true);
  assert.match(r.texto, /8\.000 km/);
});

test('inspecionar não zera a troca; substituir zera as duas', () => {
  const insp = achar('fluido_freio.inspecionar');
  const troca = achar('fluido_freio.substituir');
  const soInspecao = [check('fluido_freio.inspecionar', 'ok', 50000, '2026-10-01T10:00:00-03:00')];
  assert.equal(estadoServico(troca, soInspecao, 50000, HOJE).estado, 'desconhecido');
  const trocou = [check('fluido_freio.substituir', 'substituido', 50000, '2026-10-01T10:00:00-03:00')];
  assert.equal(estadoServico(troca, trocou, 50000, HOJE).conhecido, true);
  assert.equal(estadoServico(insp, trocou, 50000, HOJE).conhecido, true);
});

test('"Substituí" registrado numa inspeção também inicia a contagem da troca', () => {
  const troca = achar('fluido_freio.substituir');
  const r = estadoServico(troca, [check('fluido_freio.inspecionar', 'substituido', 50000, '2026-10-01T10:00:00-03:00')], 51000, HOJE);
  assert.equal(r.estado, 'ok');
});

test('vence pelo que chegar primeiro: km ou tempo', () => {
  const e = achar('oleo_motor.substituir');
  const c = [check('oleo_motor.substituir', 'substituido', 10000, '2026-01-01T10:00:00-03:00')];
  assert.equal(estadoServico(e, c, 21000, new Date('2026-02-01T10:00:00-03:00')).estado, 'vencido');
  assert.equal(estadoServico(e, c, 11000, new Date('2027-02-01T10:00:00-03:00')).estado, 'vencido');
  assert.equal(estadoServico(e, c, 11000, new Date('2026-02-01T10:00:00-03:00')).estado, 'ok');
  assert.equal(estadoServico(e, c, 19000, new Date('2026-02-01T10:00:00-03:00')).estado, 'proximo');
});

test('o uso severo muda a regra', () => {
  const c = [check('oleo_motor.substituir', 'substituido', 10000, '2026-10-01T10:00:00-03:00')];
  assert.equal(estadoServico(achar('oleo_motor.substituir'), c, 16000, HOJE).estado, 'ok');
  assert.equal(estadoServico(achar('oleo_motor.substituir', { uso: 'severo', opcoes: {} }), c, 16000, HOJE).estado, 'vencido');
});

test('a opção do perfil filtra serviços; opção não informada não esconde', () => {
  const ids = (perfil) => servicos(perfil).map((e) => e.servico.id);
  assert.ok(ids({ uso: 'normal', opcoes: {} }).includes('oleo_cambio.manual'));
  assert.ok(ids({ uso: 'normal', opcoes: {} }).includes('oleo_cambio.automatica'));
  assert.ok(!ids({ uso: 'normal', opcoes: { transmissao: 'manual' } }).includes('oleo_cambio.automatica'));
});

test('condicional sem limite: troca sem histórico fica aberta; depois, vira avaliar', () => {
  const e = achar('oleo_cambio.manual', { uso: 'severo', opcoes: { transmissao: 'manual' } });
  assert.equal(estadoServico(e, [], 50000, HOJE).estado, 'desconhecido');
  const r = estadoServico(e, [check('oleo_cambio.manual', 'substituido', 50000, '2026-10-01T10:00:00-03:00')], 90000, HOJE);
  assert.equal(r.estado, 'avaliar');
  assert.equal(r.fracao, null);
  assert.equal(listarTarefas([{ ...e, ...r }]).length, 0);
});

test('condicional com limite conta até o limite', () => {
  const entrada = { componente: { servicos: [{ id: 'f' }] }, servico: { id: 'f', acao: 'substituir' }, regra: { tipo: 'condicional', texto: 'Com maior frequência', limite_km: 20000, limite_meses: 12 } };
  const c = [check('f', 'substituido', 10000, '2026-10-01T10:00:00-03:00')];
  assert.equal(estadoServico(entrada, c, 12000, HOJE).estado, 'ok');
  assert.equal(estadoServico(entrada, c, 31000, HOJE).estado, 'vencido');
});

test('marcos usam o próximo marco depois do último check e terminam sem prazo', () => {
  const e = achar('oleo_cambio.manual');
  const em = '2026-10-01T10:00:00-03:00';
  const r = estadoServico(e, [check('oleo_cambio.manual', 'substituido', 41000, em)], 70000, HOJE);
  assert.equal(r.estado, 'ok');
  assert.match(r.alvo, /80\.000/);
  assert.equal(estadoServico(e, [check('oleo_cambio.manual', 'substituido', 120000, em)], 130000, HOJE).texto, 'Sem próxima troca no plano');
});

test('atenção na inspeção vira tarefa, e um check posterior a encerra', () => {
  const e = achar('correia.inspecionar');
  const a = check('correia.inspecionar', 'atencao', 50000, '2026-10-01T10:00:00-03:00');
  assert.equal(estadoServico(e, [a], 51000, HOJE).estado, 'atencao');
  const ok = check('correia.inspecionar', 'ok', 51000, '2026-10-20T10:00:00-03:00');
  assert.equal(estadoServico(e, [a, ok], 51000, HOJE).estado, 'ok');
});

test('check só com km ou só com data funciona, e a km decide a ordem', () => {
  const e = achar('oleo_motor.substituir');
  const reg = '2026-11-02T10:00:00-03:00';
  assert.equal(estadoServico(e, [check('oleo_motor.substituir', 'substituido', 95000, null)], 96000, HOJE).conhecido, true);
  assert.equal(estadoServico(e, [check('oleo_motor.substituir', 'substituido', null, '2026-10-01T10:00:00-03:00')], 96000, HOJE).estado, 'ok');
  const novo = check('oleo_motor.substituir', 'substituido', 100000, '2026-10-01T10:00:00-03:00');
  const antigoRegistradoDepois = check('oleo_motor.substituir', 'substituido', 90000, null, { registrado_em: reg });
  assert.equal(estadoServico(e, [novo, antigoRegistradoDepois], 101000, HOJE).ultimo.km, 100000);
});

test('sem km atual, prazo só por km pede a leitura em vez de dar falso vencido', () => {
  const entrada = { componente: { servicos: [{ id: 'x' }] }, servico: { id: 'x', acao: 'substituir' }, regra: { tipo: 'intervalo', km: 1000 } };
  const r = estadoServico(entrada, [check('x', 'substituido', 500, '2026-10-01T10:00:00-03:00')], null, HOJE);
  assert.equal(r.estado, 'desconhecido');
  assert.equal(r.conhecido, true);
  assert.match(r.texto, /quilometragem/);
});

test('tarefas: mais grave primeiro, sem itens em dia ou a avaliar', () => {
  const t = listarTarefas([{ estado: 'ok' }, { estado: 'avaliar' }, { estado: 'desconhecido' }, { estado: 'vencido', fracao: 0 }, { estado: 'proximo', fracao: 0.1 }]);
  assert.deepEqual(t.map((x) => x.estado), ['vencido', 'desconhecido', 'proximo']);
  assert.equal(piorEstado(['ok', 'proximo', 'desconhecido']), 'desconhecido');
});

test('novo check aponta para a Leitura e guarda o registro separado', () => {
  const agora = new Date('2026-11-02T12:00:00Z');
  const c = criarCheck({ servico: 's', leitura: 'l1', resultado: 'ok', nota: '  oi ' }, agora);
  assert.equal(c.leitura, 'l1');
  assert.equal(c.em, undefined);
  assert.match(c.registrado_em, /[+-]\d{2}:\d{2}$/);
  assert.equal(c.nota, 'oi');
  const leituras = { registros: [{ id: 'l1', em: '2026-11-02T09:00:00-03:00', km: 10 }] };
  assert.deepEqual(validarConfig({ versao: 3, leituras, checks: { registros: [c] } }).erros, []);
});

test('o validador explica os erros de plano e de check', () => {
  const base = { versao: 3, plano: { origem: { documento: 'D' }, sistemas: [{ id: 's', nome: 'S', componentes: [{ id: 'c', nome: 'C', para_que_serve: 'P', origem: { pagina: 1 }, servicos: [
    { id: 'x', acao: 'trocar', descricao: 'D', quando: { cambio: 'manual' }, regras: { todos: { tipo: 'nada' } } },
  ] }] }] } };
  const { erros } = validarConfig(base);
  assert.ok(erros.some((e) => /acao/.test(e)));
  assert.ok(erros.some((e) => /quando\.cambio/.test(e)));
  assert.ok(erros.some((e) => /tipo/.test(e)));
  const r = { id: 'a', servico: 's', resultado: 'ok', registrado_em: '2026-01-01T00:00:00Z' };
  assert.match(validarConfig({ versao: 3, checks: { registros: [r] } }).erros[0], /leitura/);
  assert.match(validarConfig({ versao: 3, checks: { registros: [{ ...r, leitura: 'x' }] } }).erros[0], /não existe/);
  const leituras = { registros: [{ id: 'l', em: '2026-01-01T00:00:00Z', km: 1 }] };
  assert.match(validarConfig({ versao: 3, leituras, checks: { registros: [{ ...r, leitura: 'l', km: 1 }] } }).erros[0], /ficam na Leitura/);
  assert.match(validarConfig({ versao: 3, leituras, checks: { registros: [{ ...r, leitura: 'l' }, { ...r, id: 'b', leitura: 'l' }] } }).erros[0], /já tem check/);
});

test('migração da versão 1 mantém km e descarta a tabela antiga', () => {
  const v1 = { versao: 1, quilometragem: { registros: [{ em: '2026-01-01T00:00:00Z', km: 5 }] }, manutencao: { sistemas: [] } };
  const v3 = migrarConfig(v1);
  assert.equal(v3.versao, 3);
  assert.equal(v3.manutencao, undefined);
  assert.equal(v3.leituras.registros[0].km, 5);
  assert.match(validarConfig(v1).erros.join(), /formato antigo/);
});

test('o perfil perde só as opções que o plano novo não tem', () => {
  const plano = { opcoes: { transmissao: { valores: { manual: 'Manual' } } } };
  const perfil = { uso: 'severo', opcoes: { transmissao: 'manual', freio: 'tambor' } };
  assert.deepEqual(perfilParaPlano(perfil, plano), { uso: 'severo', opcoes: { transmissao: 'manual' } });
  assert.deepEqual(perfilParaPlano(perfil, { opcoes: {} }), { uso: 'severo', opcoes: {} });
  assert.deepEqual(perfil.opcoes, { transmissao: 'manual', freio: 'tambor' });
});
