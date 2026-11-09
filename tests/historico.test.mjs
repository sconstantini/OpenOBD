// O histórico compara o carro com ele mesmo: nada de valor padrão, simulador ou erro na média.
import test from 'node:test';
import assert from 'node:assert/strict';
import { acumular, coletasDaJanela, coletasDoHistorico, medidas, reduzirPontos, regimeAtual, serieDoSinal, sinaisComDado, sinaisDaColeta } from '../app/obd/historico.js';
import { CATALOGO, SOBRE, decodificar } from '../app/obd/sinais.js';
import { escalaBonita, htmlCurva, htmlGrafico } from '../app/telas/grafico.js';

const amostra = (pid, v, extra = {}) => ({ pid, v, principal: true, st: 'ok', ...extra });

test('o regime separa motor parado, lenta e andando', () => {
  assert.equal(regimeAtual('motor', 0), 'lenta');
  assert.equal(regimeAtual('motor', undefined), 'lenta');
  assert.equal(regimeAtual('motor', 40), 'andando');
  assert.equal(regimeAtual('chave', 0), 'desligado');
  assert.equal(regimeAtual('desconhecido', 0), null);
});

test('só entram números válidos do módulo principal', () => {
  const r = {};
  acumular(r, amostra('0C', 800), 'lenta');
  acumular(r, amostra('0C', 700), 'lenta');
  acumular(r, amostra('0C', 3000), 'andando');
  acumular(r, amostra('0C', 1, { st: 'sem_dado' }), 'lenta');
  acumular(r, amostra('0C', 1, { principal: false }), 'lenta');
  acumular(r, amostra('01', 'MIL apagada'), 'lenta');
  acumular(r, amostra('15', null), 'lenta');
  acumular(r, amostra('05', 90), null);
  assert.deepEqual(r, { '0C': { lenta: { n: 2, soma: 1500, min: 700, max: 800 }, andando: { n: 1, soma: 3000, min: 3000, max: 3000 } } });
});

test('a série sai em ordem de data, e o simulador só aparece sem coleta real', () => {
  const real = (id, inicio, soma) => ({ id, inicio, resumo: { '05': { lenta: { n: 2, soma, min: 1, max: 9 } } } });
  const sim = { id: 9, inicio: 5, simulado: true, resumo: { '05': { lenta: { n: 1, soma: 1, min: 1, max: 1 } } } };
  assert.deepEqual(coletasDoHistorico([sim]), [sim]);
  assert.deepEqual(coletasDoHistorico([sim, { id: 3, inicio: 1 }]).map((c) => c.id), [9, 3], 'coleta antiga sem resumo não esconde o simulador');
  const coletas = coletasDoHistorico([real(2, 200, 40), sim, real(1, 100, 20)]);
  assert.deepEqual(serieDoSinal(coletas, '05', 'ligado').map((p) => [p.id, p.media]), [[1, 10], [2, 20]]);
  assert.deepEqual([...sinaisComDado(coletas, 'ligado')], ['05']);
});

test('o filtro junta lenta e andando, e só "tudo" inclui o motor parado', () => {
  const s = { id: 1, inicio: 1, resumo: { '0C': { lenta: { n: 1, soma: 800, min: 800, max: 800 }, andando: { n: 1, soma: 3000, min: 3000, max: 3000 }, desligado: { n: 2, soma: 0, min: 0, max: 0 } }, '0B': { desligado: { n: 1, soma: 91, min: 91, max: 91 } } } };
  assert.deepEqual(serieDoSinal([s], '0C', 'ligado')[0], { id: 1, inicio: 1, media: 1900, min: 800, max: 3000, n: 2 });
  assert.deepEqual(serieDoSinal([s], '0C', 'tudo')[0], { id: 1, inicio: 1, media: 950, min: 0, max: 3000, n: 4 });
  assert.deepEqual(serieDoSinal([s], '0B', 'ligado'), []);
  assert.deepEqual([...sinaisComDado([s], 'ligado')], ['0C']);
  assert.deepEqual([...sinaisComDado([s], 'tudo')], ['0C', '0B']);
});

test('a janela de tempo filtra as coletas pela data', () => {
  const dia = 86400000;
  const agora = 1000 * dia;
  const c = [{ id: 1, inicio: agora - 5 * dia }, { id: 2, inicio: agora - 90 * dia }, { id: 3, inicio: agora - 400 * dia }];
  assert.deepEqual(coletasDaJanela(c, 'dias', agora).map((x) => x.id), [1]);
  assert.deepEqual(coletasDaJanela(c, 'meses', agora).map((x) => x.id), [1, 2]);
  assert.equal(coletasDaJanela(c, 'sempre', agora).length, 3);
});

test('a coleta separa números de textos e ignora eventos, erros e outros módulos', () => {
  const sinais = sinaisDaColeta([
    amostra('0C', 800, { em: 1 }),
    amostra('0C', 900, { em: 2 }),
    amostra('0C', 5, { em: 3, principal: false }),
    amostra('0C', 5, { em: 4, st: 'sem_dado' }),
    amostra('1C', 'OBD-II', { em: 5 }),
    amostra('15', null, { em: 6 }),
    amostra('EVENTO', 'Motor ligado', { em: 7, v: 'texto' }),
  ]);
  assert.deepEqual([...sinais.keys()], ['0C', '1C']);
  assert.deepEqual(sinais.get('0C').pontos, [{ t: 1, v: 800 }, { t: 2, v: 900 }]);
  assert.equal(sinais.get('1C').texto, 'OBD-II');
  assert.deepEqual(medidas(sinais.get('0C').pontos), { min: 800, max: 900, media: 850 });
});

test('reduzir os pontos não perde os picos nem a ordem no tempo', () => {
  const pontos = Array.from({ length: 5000 }, (_, i) => ({ t: i, v: i === 2345 ? 9000 : i === 77 ? -50 : 800 }));
  const r = reduzirPontos(pontos, 160);
  assert.ok(r.length <= 160);
  assert.ok(r.some((p) => p.v === 9000));
  assert.ok(r.some((p) => p.v === -50));
  assert.ok(r.every((p, i) => !i || p.t >= r[i - 1].t));
  const poucos = pontos.slice(0, 10);
  assert.equal(reduzirPontos(poucos, 160), poucos);
});

test('a escala usa números redondos, cobre os dados e não exagera variações mínimas', () => {
  const rpm = escalaBonita(783, 1212);
  assert.ok(rpm.de <= 783 && rpm.ate >= 1212);
  assert.ok(rpm.marcas.every((m) => m % 50 === 0), rpm.marcas.join());
  const bateria = escalaBonita(12.6, 12.61);
  assert.ok(bateria.ate - bateria.de >= 0.25, 'um centésimo de volt não ocupa o gráfico inteiro');
  const zero = escalaBonita(0, 0);
  assert.equal(zero.de, 0);
  assert.ok(zero.ate > 0);
  const negativo = escalaBonita(-12.5, 7.8);
  assert.ok(negativo.de <= -12.5 && negativo.ate >= 7.8);
  for (const e of [rpm, bateria, zero, negativo]) {
    assert.ok(e.marcas.length >= 2 && e.marcas.length <= 7, e.marcas.join());
    assert.ok(e.marcas.every(Number.isFinite));
  }
});

test('todo sinal numérico do catálogo tem um significado', () => {
  const faltam = Object.values(CATALOGO).filter((s) => s.unidade && !SOBRE[s.id]).map((s) => s.id);
  assert.deepEqual(faltam, []);
});

test('o byte FF da sonda é sem leitura, não 1,275 V', () => {
  const d = decodificar('15', [0xff, 0xff]);
  assert.equal(d.v, null);
  assert.equal(d.motivo, '');
  assert.equal(decodificar('15', [100, 0xff]).v, 0.5);
});

test('o gráfico funciona com uma coleta, com valor constante e sem dados', () => {
  assert.equal(htmlGrafico([]), '');
  const um = htmlGrafico([{ inicio: 1e12, media: 5, min: 5, max: 5, n: 1 }], 'V');
  assert.match(um, /role="img"/);
  assert.ok(!um.includes('NaN'));
  const dois = htmlGrafico([{ inicio: 1e12, media: 5, min: 4, max: 6, n: 1 }, { inicio: 2e12, media: 7, min: 6, max: 8, n: 1 }]);
  assert.match(dois, /polyline/);
  assert.ok(!dois.includes('NaN'));
  assert.equal(htmlCurva([]), '');
  for (const p of [[{ t: 1, v: 5 }], [{ t: 1, v: 0 }, { t: 2, v: 0 }], [{ t: 1, v: 1 }, { t: 2, v: 3 }]]) assert.ok(!htmlCurva(p, 'Sinal').includes('NaN'));
  const quebra = htmlCurva([{ t: 0, v: 1 }, { t: 1000, v: 2 }, { t: 500000, v: 3 }], 'Sinal');
  assert.equal(quebra.match(/M[\d.]/g).length, 2, 'um buraco na coleta interrompe a linha');
});
