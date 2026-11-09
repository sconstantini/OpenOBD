// As views são testadas pelo HTML que geram; o layout só se confere abrindo o app.
import test from 'node:test';
import assert from 'node:assert/strict';
import { estadoServico, listarServicos } from '../app/dominio/manutencao.js';
import { checksComLeitura } from '../app/dominio/leituras.js';
import { VIEWS, criarHorizonte, htmlLegenda, prazoDoItem, tarefaHtml } from '../app/telas/views_tarefas.js';

const HOJE = new Date('2026-11-03T12:00:00-03:00');
const regra = { tipo: 'intervalo', km: 10000, meses: 6 };
const plano = { sistemas: [{ id: 's', nome: 'Motor <b>', componentes: [
  { id: 'f', nome: 'Filtro <img src=x>', servicos: [
    { id: 'f.i', acao: 'inspecionar', descricao: 'D', regras: { todos: regra } },
    { id: 'f.s', acao: 'substituir', descricao: 'D', conferir: true, regras: { todos: { tipo: 'intervalo', km: 40000, meses: 24 } } },
  ] },
  { id: 'o', nome: 'Óleo', servicos: [{ id: 'o.s', acao: 'substituir', descricao: 'D', regras: { todos: { tipo: 'intervalo', km: 5000 } } }] },
  { id: 'c', nome: 'Câmbio', servicos: [{ id: 'c.s', acao: 'substituir', descricao: 'D', regras: { todos: { tipo: 'condicional', texto: 'Se necessário' } } }] },
] }] };
const leituras = [
  { id: 'l1', em: '2026-02-12T10:00:00-03:00', km: 190000 },
  { id: 'l2', em: '2026-08-14T10:00:00-03:00', km: 200000 },
  { id: 'l3', em: '2026-11-03T09:00:00-03:00', km: 203500 },
  { id: 'avulsa', em: '2026-10-01T09:00:00-03:00', km: 202000 },
];
const checks = [
  { id: 'k1', servico: 'o.s', leitura: 'l1', resultado: 'substituido', registrado_em: HOJE.toISOString() },
  { id: 'k2', servico: 'f.i', leitura: 'l2', resultado: 'atencao', registrado_em: HOJE.toISOString() },
];
const montar = (ls, cs) => {
  const juntos = checksComLeitura(cs, ls);
  const km = ls.length ? 203500 : null;
  const itens = listarServicos(plano, { uso: 'normal', opcoes: {} }).map((e) => ({ ...e, ...estadoServico(e, juntos, km, HOJE) }));
  return { itens, ctx: { leituras: ls, checks: juntos, hoje: HOJE, compacto: false, modoVarios: false, marcados: new Set(), novo: null } };
};

test('toda tarefa traz o estado do serviço entre parênteses', () => {
  assert.equal(tarefaHtml('vencido'), '<span class="tarefa">Tarefa <small>(Serviço vencido)</small></span>');
  const { itens, ctx } = montar(leituras, checks);
  for (const v of Object.values(VIEWS)) {
    const html = v.html(itens, ctx);
    for (const m of html.matchAll(/>Tarefa /g)) assert.match(html.slice(m.index, m.index + 40), /\(Serviço /);
    assert.match(html, /Serviço vencido/, v.nome);
    assert.match(html, /Serviço desconhecido/, v.nome);
  }
});

test('nomes vindos de arquivo importado são escapados nas quatro views', () => {
  const { itens, ctx } = montar(leituras, checks);
  for (const v of Object.values(VIEWS)) assert.ok(!v.html(itens, ctx).includes('<img'), v.nome);
  assert.ok(!VIEWS.pecas.html(itens, ctx).includes('Motor <b>'));
});

test('as quatro views funcionam sem nenhuma Leitura ou check', () => {
  const { itens, ctx } = montar([], []);
  for (const v of Object.values(VIEWS)) assert.match(v.html(itens, ctx), /data-reg="f\.i"/, v.nome);
});

test('a leitura avulsa do hodômetro não vira coluna', () => {
  const { itens, ctx } = montar(leituras, checks);
  const grade = VIEWS.grade.html(itens, ctx);
  assert.match(grade, /190\.000/);
  assert.ok(!grade.includes('202.000'));
  assert.ok(!VIEWS.visitas.html(itens, ctx).includes('202.000 km'));
});

test('um check de serviço fora do plano não quebra as views', () => {
  const { itens, ctx } = montar(leituras, [...checks, { id: 'k9', servico: 'antigo', leitura: 'l1', resultado: 'ok', registrado_em: HOJE.toISOString() }]);
  for (const v of Object.values(VIEWS)) assert.ok(v.html(itens, ctx).length > 0);
});

test('a régua da Trilha marca a km pela escala e não muda os prazos', () => {
  const { itens, ctx } = montar(leituras, checks);
  const de5 = VIEWS.trilha.html(itens, { ...ctx, escala: 0 });
  const de20 = VIEWS.trilha.html(itens, { ...ctx, escala: 2 });
  assert.match(de5, /Régua 5 mil km/);
  assert.match(de5, /data-escala="1"/);
  assert.match(de5, />~210\.000</);
  assert.match(de20, /Régua 20 mil km/);
  assert.ok(!de20.includes('>~210.000<'));
  assert.match(de20, />~240\.000</);
  const proximos = (html) => [...html.matchAll(/Próximo: ~[^<]+/g)].map((m) => m[0]);
  assert.deepEqual(proximos(de5), proximos(de20));
});

test('sem ritmo conhecido, a régua conta meses e não inventa km', () => {
  const { itens, ctx } = montar([leituras[2]], []);
  const html = VIEWS.trilha.html(itens, { ...ctx, escala: 1 });
  assert.match(html, /Régua 6 meses/);
  assert.ok(!/>~\d/.test(html));
});

test('registrar vários marca o serviço escolhido', () => {
  const { itens, ctx } = montar(leituras, checks);
  const html = VIEWS.trilha.html(itens, { ...ctx, modoVarios: true, marcados: new Set(['f.s']) });
  assert.match(html, /marcado"[^>]*data-reg="f\.s"[^>]*aria-pressed="true"/);
});

test('o horizonte estima pelo ritmo das Leituras e não inventa sem ritmo', () => {
  const h = criarHorizonte(leituras, HOJE);
  assert.ok(h.ritmo > 1000 && h.ritmo < 2000);
  assert.equal(h.dataDoKm(190000), Date.parse(leituras[0].em));
  assert.ok(h.dataDoKm(210000) > HOJE.getTime());
  const sem = criarHorizonte([leituras[0]], HOJE);
  assert.equal(sem.ritmo, null);
  assert.equal(sem.dataDoKm(210000), null);
  assert.equal(sem.kmDaData(HOJE.getTime()), null);
});

test('o prazo vale o que vier primeiro; vencido fica atrás de hoje e em dia fica à frente', () => {
  const h = criarHorizonte(leituras, HOJE);
  const ultimo = { km: 200000, em: '2026-08-14T10:00:00-03:00' };
  const emDia = prazoDoItem({ estado: 'ok', regra, ultimo }, h);
  assert.equal(emDia.vence, Math.min(h.dataDoKm(210000), Date.parse('2027-02-14T13:00:00Z')));
  assert.ok(emDia.seguintes.length > 0 && emDia.seguintes[0] > emDia.vence);
  const atrasado = prazoDoItem({ estado: 'vencido', regra: { tipo: 'intervalo', km: 1000 }, ultimo }, h);
  assert.ok(atrasado.vence < HOJE.getTime());
  const marcos = prazoDoItem({ estado: 'ok', regra: { tipo: 'marcos', km: [240000, 210000, 100000] }, ultimo }, h);
  assert.equal(marcos.vence, h.dataDoKm(210000));
  assert.equal(marcos.seguintes.length, 1);
  assert.equal(prazoDoItem({ estado: 'avaliar', regra: { tipo: 'condicional', texto: 'x' }, ultimo }, h).vence, null);
  assert.equal(prazoDoItem({ estado: 'desconhecido', regra, ultimo: null }, h).vence, null);
});

test('a lane do sistema fechada resume as tarefas e esconde os serviços', () => {
  const { itens, ctx } = montar(leituras, checks);
  const html = VIEWS.trilha.html(itens, { ...ctx, abertos: new Set() });
  assert.ok(!html.includes('data-reg='));
  assert.match(html, /data-abrir="s:s"[^>]*aria-expanded="false"/);
  assert.match(html, /4 Tarefas <small>[(]1 Serviço vencido, 1 Serviço em atenção, 2 Serviços desconhecidos[)]/);
});

test('a lane abre em componentes, e o componente abre nos serviços', () => {
  const { itens, ctx } = montar(leituras, checks);
  const soSistema = VIEWS.trilha.html(itens, { ...ctx, abertos: new Set(['s:s']) });
  assert.match(soSistema, /data-abrir="c:f"[^>]*aria-expanded="false"/);
  assert.ok(!soSistema.includes('data-reg="f.i"'));
  assert.match(soSistema, /data-reg="o\.s"/);
  const tudo = VIEWS.trilha.html(itens, { ...ctx, abertos: new Set(['s:s', 'c:f']) });
  assert.match(tudo, /data-reg="f\.i"/);
});

test('a grade também fecha por sistema e soma os checks', () => {
  const { itens, ctx } = montar(leituras, checks);
  const html = VIEWS.grade.html(itens, { ...ctx, abertos: new Set() });
  assert.ok(!html.includes('data-reg='));
  assert.match(html, /tv-soma parada">1</);
});

test('a legenda explica o desenho de cada view', () => {
  assert.match(htmlLegenda('trilha'), /Bola pequena: Check[\s\S]*Tudo certo/);
  assert.match(htmlLegenda('trilha'), /Bola grande: Serviço[\s\S]*Desconhecido/);
  for (const v of Object.keys(VIEWS)) assert.match(htmlLegenda(v), /Tarefa/, v);
});

test('Visitas mostra a km estimada das próximas idas à oficina', () => {
  const { itens, ctx } = montar(leituras, [...checks, { id: 'k3', servico: 'f.s', leitura: 'l3', resultado: 'substituido', registrado_em: HOJE.toISOString() }]);
  assert.match(VIEWS.visitas.html(itens, ctx), /tv-col futuro[^]*~\d/);
});
