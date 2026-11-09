// Tela inicial: indicadores ao vivo, km e o resumo do que vence, com as chamadas sobre o carro.
import { projetar } from '../cena/cena.js';
import { ESTADOS_ADAPTADOR, ESTADOS_VEICULO } from '../obd/monitor.js';
import { ID_BATERIA } from '../obd/sinais.js';
import { conexao, podeReiniciar, reiniciarConexao } from '../obd/conexao.js';
import { ORDEM_ESTADO, ROTULO_ESTADO } from '../dominio/manutencao.js';
import { adicionarLeitura, ultimaLeitura } from '../dominio/leituras.js';
import { cfg, kmAtual, salvar, textoKm, todosItens } from '../estado.js';
import { $, esc, plural } from './comum.js';
import { renderManutencao } from './manutencao.js';
import { renderConfig } from './configuracoes.js';
import { telaAtual } from './navegacao.js';

const ICONES = {
  motor: '<path d="M4 10h2l1.5-2h5L14 10h2l2 2h2v5h-2l-1.5 2H8l-2-2H4v-2H2v-3h2Z"/>',
  bateria: '<path d="M3 8h18v11H3ZM7 8V5.5h2.5V8M14.5 8V5.5H17V8M6.5 13.5h3M14.5 13.5h3M16 12v3"/>',
  temp: '<path d="M12 3a2 2 0 0 1 2 2v8.3a4 4 0 1 1-4 0V5a2 2 0 0 1 2-2ZM12 9v7"/>',
  chave: '<path d="M14.5 6.5a4 4 0 0 1 5-1.2l-2.8 2.8 1.2 1.2 2.8-2.8a4 4 0 0 1-5.3 5L8 18a2 2 0 0 1-2.8-2.8l6.5-6.4a4 4 0 0 1 2.8-2.3Z"/>',
  bt: '<path d="m7 7.5 10 9-5 4.5V3l5 4.5-10 9"/>',
};

let pedidoDispensado = false;
let pedidoAberto = false;

function diasDesde(iso) {
  const dia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((dia(new Date()) - dia(new Date(iso))) / 86400000);
}
function tempoDesde(iso) {
  const n = diasDesde(iso);
  return n <= 0 ? 'hoje' : n === 1 ? 'ontem' : `há ${n} dias`;
}

// Um componente vale pelo pior dos seus serviços.
function porComponente(itens) {
  const mapa = new Map();
  for (const i of itens) {
    const atual = mapa.get(i.componente.id);
    if (!atual || ORDEM_ESTADO[i.estado] < ORDEM_ESTADO[atual.estado] || (i.estado === atual.estado && (i.fracao ?? 1) < (atual.fracao ?? 1))) mapa.set(i.componente.id, i);
  }
  return [...mapa.values()];
}

export function renderTopo() {
  $('nomeCarro').textContent = `${cfg.veiculo.marca} ${cfg.veiculo.modelo}`;
  $('anoCarro').textContent = cfg.veiculo.ano;
  renderStatus();
}

export function renderStatus() {
  const adaptador = conexao.monitor?.adaptador ?? 'desconectado';
  const veiculo = conexao.monitor?.veiculo ?? 'desconhecido';
  const a = $('topoAdaptador');
  const v = $('topoVeiculo');
  a.textContent = ESTADOS_ADAPTADOR[adaptador];
  a.dataset.estado = adaptador === 'conectado' ? 'ok' : adaptador === 'desconectado' ? '' : 'atencao';
  v.textContent = ESTADOS_VEICULO[veiculo];
  v.dataset.estado = veiculo === 'motor' || veiculo === 'chave' ? 'ok' : '';
  $('seloSimulador').hidden = conexao.monitor?.transporte.tipo !== 'simulador';
  const reiniciar = $('btnReiniciarConexao');
  reiniciar.hidden = !['inicio', 'dados'].includes(telaAtual) || !podeReiniciar();
  reiniciar.disabled = conexao.reiniciando;
  reiniciar.textContent = conexao.reiniciando ? 'Reconectando' : 'Reconectar';
}

const numeroBr = (v, n) => v.toLocaleString('pt-BR', { minimumFractionDigits: n, maximumFractionDigits: n });

function indicadoresAoVivo() {
  const dtc = conexao.ultimos.get('01');
  const luz = dtc && /ACESA/.test(dtc.v);
  const codigos = dtc ? Number(/(\d+) DTC/.exec(dtc.v)?.[1] ?? 0) : 0;
  const injecao = !dtc ? ['neutro', 'Sem dado'] : luz ? ['vencido', `Luz acesa, ${codigos} ${codigos === 1 ? 'código' : 'códigos'}`] : codigos ? ['atencao', `${codigos} ${codigos === 1 ? 'código' : 'códigos'}`] : ['ok', 'Luz apagada'];
  const rv = conexao.ultimos.get(ID_BATERIA)?.v;
  const faixaBateria = conexao.monitor?.veiculo === 'motor' ? rv >= 13.5 && rv <= 14.8 : rv >= 12.2;
  const bateria = rv == null ? ['neutro', 'Sem dado'] : [faixaBateria ? 'ok' : 'atencao', `${numeroBr(rv, 1)} V`];
  const t = conexao.ultimos.get('05')?.v;
  const motor = t == null ? ['neutro', 'Sem dado'] : [t > 105 ? 'vencido' : 'ok', `${t} °C`];
  const c = conexao.monitor?.adaptador === 'conectado';
  return { injecao, bateria, motor, adaptador: [c ? 'ok' : 'neutro', c ? 'Conectado' : 'Desligado'] };
}

export function renderIndicadores() {
  const estado = revisaoAtual();
  const v = indicadoresAoVivo();
  const ind = [
    ['motor', v.injecao[0], 'Injeção', v.injecao[1]],
    ['bateria', v.bateria[0], 'Bateria', v.bateria[1]],
    ['temp', v.motor[0], 'Motor', v.motor[1]],
    ['chave', estado.estado, 'Revisão', estado.texto],
    ['bt', v.adaptador[0], 'Adaptador', v.adaptador[1]],
  ];
  $('indicadores').innerHTML = ind.map(([ic, e, t, x]) => `<li class="${e}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[ic]}</svg><b>${t}</b><small>${esc(x)}</small></li>`).join('');
}

function revisaoAtual() {
  const itens = todosItens();
  const pend = itens.filter((i) => ['vencido', 'atencao', 'proximo'].includes(i.estado));
  const venc = itens.some((i) => i.estado === 'vencido');
  const desconhecidos = itens.filter((i) => !i.conhecido).length;
  if (pend.length) return { estado: venc ? 'vencido' : 'atencao', texto: plural(pend.length, 'item', 'itens') };
  return desconhecidos ? { estado: 'neutro', texto: `${desconhecidos} a conhecer` } : { estado: 'ok', texto: 'Em dia' };
}

export function renderInicio() {
  const itens = todosItens();
  const venc = itens.filter((i) => i.estado === 'vencido').length;
  renderIndicadores();
  const ultima = ultimaLeitura(cfg.leituras.registros);
  const semLeituraHoje = !ultima || diasDesde(ultima.em) > 0;
  $('pedidoKm').hidden = !(pedidoAberto || (semLeituraHoje && !pedidoDispensado));
  const prox = itens.filter((i) => i.fracao != null).sort((a, b) => a.fracao - b.fracao)[0];
  $('resumo').innerHTML = `
    <div><dt>Quilometragem</dt><dd><button class="km-btn" id="btnKm" type="button">${kmAtual() == null ? 'Informar' : textoKm()}</button>${ultima ? `<small>${tempoDesde(ultima.em)}</small>` : ''}</dd></div>
    <div><dt>Próxima manutenção</dt><dd>${esc(prox ? prox.componente.nome : 'Sem dados')}</dd></div>
    <div><dt>Itens vencidos</dt><dd>${venc}</dd></div>`;
}

export function registrarKm(texto, erroEl) {
  const r = texto.trim() === '' ? { erro: 'Informe a quilometragem em número.' } : adicionarLeitura(cfg.leituras.registros, Number(texto));
  if (r.erro) { erroEl.textContent = r.erro; return false; }
  cfg.leituras.registros = r.registros;
  erroEl.textContent = '';
  pedidoAberto = false;
  salvar();
  renderInicio();
  renderManutencao();
  renderConfig();
  return true;
}

export function atualizarChamadas() {
  const alvo = $('chamadas');
  let lista = [];
  if (telaAtual === 'inicio') {
    lista = porComponente(todosItens())
      .filter((i) => i.componente.ancora && ['vencido', 'atencao', 'proximo'].includes(i.estado))
      .sort((a, b) => ORDEM_ESTADO[a.estado] - ORDEM_ESTADO[b.estado] || (a.fracao ?? 1) - (b.fracao ?? 1))
      .slice(0, innerHeight < 520 ? 1 : 2);
  }
  const altura = innerHeight;
  const chave = lista.map((i) => `${i.componente.id}:${i.estado}:${i.texto}`).join();
  if (alvo.dataset.chave !== chave) {
    alvo.dataset.chave = chave;
    alvo.innerHTML = lista.map((i) => `<div class="chamada" data-id="${esc(i.componente.id)}"><i></i><div><b>${esc(i.componente.nome)}</b><span class="${i.estado}">${ROTULO_ESTADO[i.estado]}</span><br><span>${esc(i.texto)}</span></div></div>`).join('');
  }
  lista.forEach((it, n) => {
    const el = alvo.children[n];
    const p = projetar(it.componente.ancora);
    const topo = altura * (0.25 + (n % 2) * 0.08);
    const y = Math.min(topo, p.y - 30);
    el.style.left = `${p.x}px`;
    el.style.top = `${y}px`;
    const linha = el.firstChild;
    linha.style.top = '0';
    linha.style.height = `${p.y - y}px`;
  });
}

export function ligarInicio() {
  $('btnReiniciarConexao').onclick = () => reiniciarConexao();
  $('pedidoKm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (registrarKm($('kmPedido').value, $('erroPedido'))) $('kmPedido').value = '';
  });
  $('btnDispensarKm').onclick = () => { pedidoDispensado = true; pedidoAberto = false; $('erroPedido').textContent = ''; renderInicio(); };
  $('resumo').addEventListener('click', (e) => {
    if (!e.target.closest('#btnKm')) return;
    pedidoAberto = true;
    renderInicio();
    $('kmPedido').focus();
  });
}
