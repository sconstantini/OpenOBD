// Rodar com: node --test "tests/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import { comandoPermitido, lerModo01, lerMascaras, lerQuadros, statusResposta } from '../app/obd/protocolo.js';
import { decodificar } from '../app/obd/sinais.js';
import { Monitor } from '../app/obd/monitor.js';
import { TransporteSimulado } from '../app/obd/transportes.js';
import { dataHoraLocal, linhaCsv } from '../app/obd/coletas.js';

test('resposta real do carro vira 851 rpm', () => {
  const [r] = lerModo01('84F111410C0D4C2C', 0x0c, false);
  assert.equal(decodificar('0C', r.dados).v, 851);
});

test('dois módulos com quebra de linha no meio do quadro, como no adaptador real', () => {
  const r = lerModo01('84F11141210000E884F119\n41210000F0', 0x21, false);
  assert.deepEqual(r.map((x) => x.ecu), ['11', '19']);
});

test('checksum errado não vira valor', () => {
  assert.equal(lerModo01('84F111410C0D4C2D', 0x0c, false).length, 0);
  assert.equal(lerQuadros('84F111410C0D4C2D', false).truncado, true);
});

test('resposta curta nunca vira valor falso', () => {
  assert.equal(decodificar('0C', [0x0d]).v, null);
  assert.equal(decodificar('05', []).v, null);
});

test('máscara descobre os PIDs por módulo', () => {
  const m = lerMascaras('7E8064100BE3FA813', 0, true);
  assert.ok(m['7E8'].includes(0x0c));
});

test('estados da resposta vistos no carro', () => {
  assert.equal(statusResposta('NO DATA'), 'sem_dado');
  assert.equal(statusResposta('UNABLE TO CONNECT'), 'sem_conexao');
  assert.equal(statusResposta('ELM327 v1.5'), 'reiniciou');
  assert.equal(statusResposta('(sem resposta)'), 'sem_resposta');
});

test('trava de segurança: só comandos de leitura', () => {
  for (const c of ['010C', 'ATRV', '03', '0902']) assert.ok(comandoPermitido(c), c);
  for (const c of ['04', '14', 'ATMA', 'ATWS', '2E0100', '010', 'xx']) assert.ok(!comandoPermitido(c), c);
});

// Relógio de mentira, que anda a cada consulta: o teste não espera os 10 s reais entre as sondagens.
function montar(estadoFixo) {
  let agora = 1e6;
  const relogio = () => { agora += 1; return agora; };
  const transporte = new TransporteSimulado({ latencia: 0, estadoFixo, relogio });
  const amostras = [];
  const eventos = [];
  const m = new Monitor({
    transporte, endereco: 'simulador', relogio,
    aoAmostra: (a) => amostras.push(a), aoEvento: (e) => eventos.push(e),
    dormir: (ms) => { agora += ms; return new Promise((ok) => { setImmediate(ok); }); },
  });
  return { m, transporte, amostras, eventos };
}
const ate = async (cond) => { for (let i = 0; i < 3000 && !cond(); i++) await new Promise((ok) => { setTimeout(ok, 2); }); assert.ok(cond(), 'condição não atingida'); };

test('estados do veículo acompanham o carro, nos dois sentidos', async () => {
  const { m, transporte, amostras, eventos } = montar('desligado');
  m.iniciar();
  await ate(() => m.veiculo === 'desligado' && m.adaptador === 'conectado');
  assert.ok(amostras.some((a) => a.pid === 'RV' && a.st === 'ok'), 'a tensão continua sendo lida com o carro desligado');
  transporte.estadoFixo = 'chave';
  await ate(() => m.veiculo === 'chave' && amostras.some((a) => a.pid === '0C' && a.v === 0));
  transporte.estadoFixo = 'motor';
  await ate(() => m.veiculo === 'motor');
  assert.ok(amostras.some((a) => a.pid === '0C' && a.v > 0));
  assert.ok(amostras.some((a) => a.pid === '21' && a.ecu === '19'), 'lê também o segundo módulo');
  transporte.estadoFixo = 'desligado';
  await ate(() => m.veiculo === 'desligado');
  assert.ok(eventos.includes('Motor ligado'));
  await m.parar();
  assert.equal(m.adaptador, 'desconectado');
  assert.equal(m.veiculo, 'desconhecido');
});

test('conexão perdida entra em reconexão sem encerrar o monitor', async () => {
  const { m, transporte, eventos } = montar('motor');
  m.iniciar();
  await ate(() => m.veiculo === 'motor');
  transporte.aberto = false;
  await ate(() => eventos.includes('Reconectando') && m.veiculo === 'motor');
  await m.parar();
});

test('adaptador mudo é tratado como perdido', async () => {
  const { m, transporte, eventos } = montar('motor');
  m.iniciar();
  await ate(() => m.veiculo === 'motor');
  transporte.comando = async () => '(sem resposta)';
  await ate(() => eventos.includes('Reconectando'));
  assert.equal(m.veiculo, 'desconhecido');
  await m.parar();
});

test('CSV leva data e hora locais, fuso e vírgula decimal', () => {
  assert.equal(dataHoraLocal(Date.UTC(2026, 10, 2, 11, 30, 5, 250), -180), '2026-11-02T08:30:05.250-03:00');
  const l = linhaCsv({ em: Date.UTC(2026, 10, 2, 11, 30, 5, 250), pid: '11', ecu: '11', principal: true, st: 'ok', v: 13.3, x: '', b: '22', lat: 190 }, -180);
  assert.equal(l, '2026-11-02T08:30:05.250-03:00;-180;11;Posição da borboleta;11;1;ok;13,3;;%;22;190');
});
