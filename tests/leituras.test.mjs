// Rodar com: node --test "tests/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import { validarConfig, migrarConfig } from '../app/dominio/config.js';
import { adicionarLeitura, checksComLeitura, conflitoKm, corrigirLeitura, garantirLeitura, mesclarHistorico, ordenarRegistros, ultimaLeitura } from '../app/dominio/leituras.js';

const AGORA = new Date(2026, 10, 3, 15, 0);
const L = (id, dia, km) => ({ id, em: new Date(`${dia}T10:00:00`).toISOString(), km });
const base = [L('a', '2026-02-12', 190000), L('b', '2026-08-14', 200000)];

test('a Leitura completa mais recente é a km atual; incompleta não conta', () => {
  assert.equal(ultimaLeitura([...base, { id: 'c', em: null, km: 999999 }, { id: 'd', em: AGORA.toISOString(), km: null }]).km, 200000);
  assert.equal(ultimaLeitura([]), null);
});

test('mesma data e km reaproveitam a Leitura', () => {
  const r = garantirLeitura(base, { dia: '2026-08-14', km: 200000 }, AGORA);
  assert.equal(r.id, 'b');
  assert.equal(r.nova, false);
  assert.equal(r.registros.length, 2);
});

test('a km nunca volta atrás no tempo', () => {
  assert.match(garantirLeitura(base, { dia: '2026-10-20', km: 198000 }, AGORA).erro, /já marcava 200\.000 km/);
  assert.match(garantirLeitura(base, { dia: '2026-05-01', km: 205000 }, AGORA).erro, /marcava só 200\.000 km/);
  assert.equal(garantirLeitura(base, { dia: '2026-05-01', km: 195000 }, AGORA).nova, true);
  assert.equal(conflitoKm(base, null, 1), null);
});

test('data futura e campos vazios são recusados; pode faltar um dos lados', () => {
  assert.match(garantirLeitura(base, { dia: '2026-11-04', km: 201000 }, AGORA).erro, /futuro/);
  assert.match(garantirLeitura(base, {}, AGORA).erro, /data, a km/);
  const soKm = garantirLeitura(base, { km: 150000 }, AGORA);
  assert.equal(soKm.nova, true);
  assert.equal(soKm.registros.at(-1).em, null);
  assert.equal(garantirLeitura(base, { dia: '2024-01-01' }, AGORA).registros.at(-1).km, null);
});

test('duas km no mesmo dia ficam em ordem, em qualquer sequência', () => {
  const maior = garantirLeitura(base, { dia: '2026-08-14', km: 200100 }, AGORA);
  assert.equal(maior.nova, true);
  const menor = garantirLeitura(maior.registros, { dia: '2026-08-14', km: 199900 }, AGORA);
  assert.equal(menor.nova, true);
  assert.deepEqual(ordenarRegistros(menor.registros).map((l) => l.km), [190000, 199900, 200000, 200100]);
  assert.deepEqual(validarConfig({ versao: 3, leituras: { registros: menor.registros } }).erros, []);
});

test('a leitura pedida no início não pode ser menor que a última', () => {
  assert.ok(adicionarLeitura(base, 199999, AGORA).erro);
  assert.ok(adicionarLeitura(base, Number.NaN, AGORA).erro);
  const r = adicionarLeitura(base, 200000, AGORA);
  assert.equal(r.registros.length, 3);
  assert.equal(adicionarLeitura(r.registros, 200000, AGORA).registros.length, 3);
});

test('corrigir a Leitura corrige os checks ligados e respeita a ordem', () => {
  const r = corrigirLeitura(base, 'b', { dia: '2026-08-14', km: 201000 }, AGORA);
  const [c] = checksComLeitura([{ id: 'c', leitura: 'b' }], r.registros);
  assert.equal(c.km, 201000);
  assert.equal(c.em, base[1].em);
  assert.match(corrigirLeitura(base, 'b', { dia: '2026-08-14', km: 100 }, AGORA).erro, /já marcava/);
  assert.match(corrigirLeitura(base, 'b', { dia: '2026-02-12', km: 190000 }, AGORA).erro, /Já existe/);
});

test('o validador recusa par repetido e km que volta atrás', () => {
  const v = (registros) => validarConfig({ versao: 3, leituras: { registros } }).erros;
  assert.deepEqual(v(base), []);
  assert.match(v([...base, { ...base[1], id: 'c' }])[0], /já existe/);
  assert.match(v([L('a', '2026-01-01', 500), L('b', '2026-03-01', 100)])[0], /menor/);
  assert.match(v([{ id: 'a', em: null, km: null }])[0], /data, a km/);
  assert.match(v([{ ...base[0], id: 'x' }, { ...base[1], id: 'x' }])[0], /repetido/);
});

test('importar não desfaz o aparelho e traduz os ids do arquivo', () => {
  const aparelho = { leituras: base, checks: [{ id: 'k1', servico: 's', leitura: 'b', resultado: 'ok', nota: 'daqui' }] };
  const arquivo = {
    leituras: [{ ...L('zz', '2026-08-14', 200000) }, L('a', '2026-05-01', 195000)],
    checks: [
      { id: 'k1', servico: 's', leitura: 'zz', resultado: 'atencao' },
      { id: 'k2', servico: 's', leitura: 'zz', resultado: 'atencao' },
      { id: 'k3', servico: 't', leitura: 'zz', resultado: 'ok' },
      { id: 'k4', servico: 't', leitura: 'a', resultado: 'ok' },
    ],
  };
  const m = mesclarHistorico(aparelho, arquivo);
  m.checks.forEach((c) => { c.registrado_em = AGORA.toISOString(); });
  assert.equal(m.leituras.length, 3);
  assert.equal(m.checks.find((c) => c.id === 'k1').nota, 'daqui');
  assert.equal(m.checks.find((c) => c.id === 'k2'), undefined);
  assert.equal(m.checks.find((c) => c.id === 'k3').leitura, 'b');
  assert.notEqual(m.checks.find((c) => c.id === 'k4').leitura, 'a');
  assert.deepEqual(validarConfig({ versao: 3, leituras: { registros: m.leituras }, checks: { registros: m.checks } }).erros, []);
});

test('a versão 2 vira Leituras sem perder nada', () => {
  const em = new Date('2026-08-14T10:00:00').toISOString();
  const c = (id, servico, extra) => ({ id, servico, resultado: 'ok', registrado_em: em, ...extra });
  const v2 = {
    versao: 2,
    quilometragem: { registros: [{ em, km: 200000 }, { em, km: 200000 }] },
    checks: { registros: [
      c('1', 'a', { em, km: 200000 }),
      c('2', 'b', { em, km: 200000 }),
      c('3', 'c', { em: null, km: 150000 }),
      c('4', 'd', { em: new Date('2026-09-01T10:00:00').toISOString(), km: null }),
      c('5', 'e', { em: new Date('2026-10-01T10:00:00').toISOString(), km: 100, nota: 'oi' }),
    ] },
  };
  const v3 = migrarConfig(v2);
  assert.deepEqual(validarConfig(v3).erros, []);
  const [um, dois, tres, , cinco] = v3.checks.registros;
  assert.equal(um.leitura, dois.leitura);
  assert.equal(um.km, undefined);
  const leitura = (x) => v3.leituras.registros.find((l) => l.id === x.leitura);
  assert.equal(leitura(tres).em, null);
  assert.equal(leitura(cinco).em, null);
  assert.equal(leitura(cinco).km, 100);
  assert.match(cinco.nota, /^oi · Data original: 2026-10-01/);
  assert.equal(migrarConfig({ versao: 2, plano: 'x' }).leituras, undefined);
  assert.equal(migrarConfig(v3), v3);
});
