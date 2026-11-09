// Tela Dados OBD: os sinais de uma coleta, o histórico de cada um ao longo das coletas e as coletas gravadas.
import { CATALOGO, ORDEM_SINAIS, PARA_ACOMPANHAR, SOBRE } from '../obd/sinais.js';
import { conexao } from '../obd/conexao.js';
import { ESTADOS_ADAPTADOR, ESTADOS_VEICULO } from '../obd/monitor.js';
import { amostrasDaSessao, csvDaSessao, espacoUsado, excluirSessao, listarSessoes } from '../obd/coletas.js';
import { FILTROS_MOTOR, JANELAS, coletasDaJanela, coletasDoHistorico, medidas, reduzirPontos, serieDoSinal, sinaisComDado, sinaisDaColeta, temSinais } from '../obd/historico.js';
import { gravarPref, lerPref } from '../estado.js';
import { $, DATA_HORA, NUM, esc, plural, salvarArquivo } from './comum.js';
import { htmlCurva, htmlGrafico } from './grafico.js';
import { abrirAba, irPara, telaAtual } from './navegacao.js';

const PREF_VISTA = 'vista-dados';
const VISTAS = { sinais: 'Sinais', historico: 'Histórico', coletas: 'Coletas' };
const GRUPOS = ['Motor', 'Elétrica', 'Ar', 'Mistura', 'Sonda lambda', 'Emissões', 'Diagnóstico'];
const ORDEM = [...ORDEM_SINAIS].sort((a, b) => GRUPOS.indexOf(CATALOGO[a].grupo) - GRUPOS.indexOf(CATALOGO[b].grupo));

let vista = 'sinais';
let sinal = null;
let filtroMotor = 'ligado';
let janela = 'sempre';
let excluindoSessao = null;
let chaveAgora = null;
let coletaVista = null;     // null é a coleta em andamento
let grupoVisto = '';
let sessaoListada = null;
let aberta = null;          // a coleta passada já lida do banco

const numero = (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const conectado = () => conexao.monitor && conexao.monitor.adaptador !== 'desconectado';
const comUnidade = (texto, id) => `${texto}${CATALOGO[id].unidade ? ` ${CATALOGO[id].unidade}` : ''}`;
// Em médias, casas além da precisão do sinal só atrapalham a leitura: 765 rpm, 61,2 °C, 0,45 V.
const resumido = (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2 });
const textoFaixa = (pontos) => {
  if (!pontos.length) return '';
  const m = medidas(pontos);
  return `Mín. ${resumido(m.min)} · Média ${resumido(m.media)} · Máx. ${resumido(m.max)}`;
};

function valorDe(id) {
  const a = conexao.ultimos.get(id);
  if (a.v == null) return 'Sem leitura do sensor';
  return typeof a.v === 'number' ? comUnidade(numero(a.v), id) : String(a.v);
}

function htmlVazio(titulo, texto) {
  return `<div class="dados-vazio"><b>${esc(titulo)}</b><p>${esc(texto)}</p><button class="btn" type="button" data-ir-adaptador>Ir para o adaptador</button></div>`;
}

const htmlCartao = (id) => `<button type="button" class="cartao-sinal" data-sinal="${id}">
    <span class="cs-topo"><span>${esc(CATALOGO[id].nome)}</span><b data-valor="${id}"></b></span>
    <span class="cs-curva" data-curva="${id}"></span>
    <small data-faixa="${id}"></small>
    ${SOBRE[id] ? `<small class="cs-sobre">${esc(SOBRE[id])}</small>` : ''}
  </button>`;

const htmlLinhaTexto = (id) => `<div class="sinal-texto"><span>${esc(CATALOGO[id].nome)}</span><b data-valor="${id}"></b></div>`;

// Números viram gráfico; textos, como a norma OBD, ficam em linhas no fim do grupo.
function htmlGrupos(ids, ehTexto) {
  const grupos = new Map();
  ids.forEach((id) => grupos.set(CATALOGO[id].grupo, [...(grupos.get(CATALOGO[id].grupo) ?? []), id]));
  return [...grupos].map(([grupo, lista]) => {
    const graficos = lista.filter((id) => !ehTexto(id));
    const textos = lista.filter(ehTexto);
    return `<section class="sinais"><h3>${esc(grupo)}</h3>
      ${graficos.length ? `<div class="sinais-grade">${graficos.map(htmlCartao).join('')}</div>` : ''}
      ${textos.length ? `<div class="sinais-textos">${textos.map(htmlLinhaTexto).join('')}</div>` : ''}</section>`;
  }).join('');
}

const doGrupo = (id) => !grupoVisto || CATALOGO[id].grupo === grupoVisto;
const ordenados = (ids) => [...ids].filter((id) => CATALOGO[id] && doGrupo(id)).sort((a, b) => ORDEM.indexOf(a) - ORDEM.indexOf(b));

// A lista muda pouco e os valores mudam sempre: trocar só os valores mantém a rolagem e o toque em andamento.
// Só o que está na tela é redesenhado, porque são muitos gráficos a cada segundo.
function atualizarAgora() {
  const alvo = $('sinaisCorpo');
  if (!alvo || coletaVista !== null) return;
  if (!conectado()) {
    if (chaveAgora !== '') alvo.innerHTML = htmlVazio('Nenhum adaptador conectado', 'Ao conectar, os sinais que o carro informa aparecem aqui, e a coleta começa sozinha.');
    chaveAgora = '';
    return;
  }
  const ids = ordenados(conexao.ultimos.keys());
  const chave = `${grupoVisto}|${ids.join()}`;
  if (chave !== chaveAgora) {
    const vazio = conexao.ultimos.size ? 'Nenhum sinal deste grupo nesta coleta.' : 'Aguardando os sinais do carro.';
    alvo.innerHTML = ids.length ? `<p class="dados-nota" id="notaAgora"></p>${htmlGrupos(ids, (id) => typeof conexao.ultimos.get(id).v === 'string')}` : `<p class="dados-nota">${vazio}</p>`;
    chaveAgora = chave;
  }
  const nota = $('notaAgora');
  if (nota) nota.textContent = conexao.monitor.veiculo === 'motor' ? '' : 'Motor parado: vários valores são padrões da ECU, não medições. A tensão da bateria continua valendo.';
  const janelaVisivel = $('dadosCorpo').getBoundingClientRect();
  ids.forEach((id) => {
    const valor = alvo.querySelector(`[data-valor="${id}"]`);
    if (!valor) return;
    valor.textContent = valorDe(id);
    const curva = alvo.querySelector(`[data-curva="${id}"]`);
    if (!curva) return;
    const caixa = curva.getBoundingClientRect();
    if (caixa.bottom < janelaVisivel.top || caixa.top > janelaVisivel.bottom) return;
    const pontos = conexao.rastros.get(id) ?? [];
    curva.innerHTML = htmlCurva(reduzirPontos(pontos), CATALOGO[id].nome);
    alvo.querySelector(`[data-faixa="${id}"]`).textContent = textoFaixa(pontos);
  });
}

async function desenharColetaPassada(sessao) {
  const alvo = $('sinaisCorpo');
  if (aberta?.id !== sessao.id) {
    alvo.innerHTML = '<p class="dados-nota">Abrindo a coleta.</p>';
    aberta = { id: sessao.id, sinais: sinaisDaColeta(await amostrasDaSessao(sessao.id)) };
    if (coletaVista !== sessao.id || vista !== 'sinais') return;
  }
  const { sinais } = aberta;
  const ids = ordenados(sinais.keys());
  alvo.innerHTML = ids.length ? `<p class="dados-nota">Coleta de ${esc(duracao(sessao.fim - sessao.inicio))}. O número em destaque é a média. Trechos com o motor parado podem trazer valores padrão da ECU.</p>${htmlGrupos(ids, (id) => !sinais.get(id).pontos.length)}` : '<p class="dados-nota">Nenhum sinal deste grupo nesta coleta.</p>';
  ids.forEach((id) => {
    const { pontos, texto } = sinais.get(id);
    alvo.querySelector(`[data-valor="${id}"]`).textContent = pontos.length ? comUnidade(resumido(medidas(pontos).media), id) : texto;
    if (!pontos.length) return;
    alvo.querySelector(`[data-curva="${id}"]`).innerHTML = htmlCurva(reduzirPontos(pontos), CATALOGO[id].nome);
    alvo.querySelector(`[data-faixa="${id}"]`).textContent = textoFaixa(pontos);
  });
}

async function renderSinais(lista) {
  const atual = conexao.gravador?.sessao?.id;
  const passadas = lista.filter((s) => s.id !== atual && temSinais(s));
  const sessao = passadas.find((s) => s.id === coletaVista);
  if (!sessao) coletaVista = null;
  const opcao = (valor, texto, marcada) => `<option value="${esc(valor)}"${marcada ? ' selected' : ''}>${esc(texto)}</option>`;
  $('dadosCorpo').innerHTML = `<div class="dados-faixa">
      <label class="dados-escolha">Coleta <select id="escolhaColeta">${opcao('', conectado() ? 'Agora, coletando' : 'Agora', !sessao)}${passadas.map((s) => opcao(s.id, `${DATA_HORA.format(new Date(s.inicio))} · ${duracao(s.fim - s.inicio)}${s.simulado ? ' · Simulador' : ''}`, s === sessao)).join('')}</select></label>
      <label class="dados-escolha">Grupo <select id="escolhaGrupo">${opcao('', 'Todos', !grupoVisto)}${GRUPOS.map((g) => opcao(g, g, g === grupoVisto)).join('')}</select></label>
    </div><div id="sinaisCorpo"></div>`;
  chaveAgora = null;
  if (sessao) await desenharColetaPassada(sessao);
  else atualizarAgora();
}

const htmlSeg = (rotulo, opcoes, atual, chave) => `<div class="seg" role="group" aria-label="${esc(rotulo)}">${Object.entries(opcoes).map(([k, t]) => `<button type="button" data-${chave}="${k}" aria-pressed="${k === atual}">${esc(t)}</button>`).join('')}</div>`;

function htmlHistorico(sessoes) {
  const todas = coletasDoHistorico(sessoes);
  if (!todas.length) return htmlVazio('Nenhuma coleta ainda', 'Cada coleta acrescenta um ponto ao histórico de cada sinal, para comparar o carro com ele mesmo.');
  const coletas = coletasDaJanela(todas, janela);
  const soSimulador = todas.every((s) => s.simulado);
  const comDado = sinaisComDado(coletas, filtroMotor);
  const peso = (id) => (PARA_ACOMPANHAR.includes(id) ? PARA_ACOMPANHAR.indexOf(id) : 100 + ORDEM.indexOf(id));
  const ids = [...comDado].filter((id) => CATALOGO[id]).sort((a, b) => peso(a) - peso(b));
  if (!comDado.has(sinal)) sinal = ids[0] ?? null;
  const filtros = `<div class="dados-faixa">${htmlSeg('Motor', FILTROS_MOTOR, filtroMotor, 'motor')}${htmlSeg('Período', JANELAS, janela, 'janela')}${soSimulador ? '<span class="selo-demo">Só dados do simulador</span>' : ''}</div>`;
  if (!ids.length) return `${filtros}<p class="dados-nota">Nenhum sinal gravado com estes filtros.</p>`;
  const c = CATALOGO[sinal];
  const serie = serieDoSinal(coletas, sinal, filtroMotor);
  return `${filtros}
    <div class="dados-duas">
      <ul class="dados-lista">${ids.map((id) => `<li><button type="button" data-sinal="${id}" aria-pressed="${id === sinal}">${esc(CATALOGO[id].nome)}${PARA_ACOMPANHAR.includes(id) ? '<small>Para acompanhar</small>' : ''}</button></li>`).join('')}</ul>
      <div class="dados-detalhe">
        <h3>${esc(c.nome)}${c.unidade ? ` <small>(${esc(c.unidade)})</small>` : ''}</h3>
        ${SOBRE[sinal] ? `<p>${esc(SOBRE[sinal])}</p>` : ''}
        ${htmlGrafico(serie, c.unidade)}
        <p class="dados-nota">Cada ponto é uma coleta. Linha: média. Faixa: do mínimo ao máximo. Para comparar meses, repita nas mesmas condições, como motor quente em lenta. O app compara o carro com ele mesmo e não usa faixas genéricas.</p>
        <table class="dados-tabela"><thead><tr><th scope="col">Coleta</th><th scope="col">Média</th><th scope="col">Mín.</th><th scope="col">Máx.</th><th scope="col">Amostras</th></tr></thead>
          <tbody>${[...serie].reverse().map((p) => `<tr><td><button type="button" class="dados-abrir" data-ver-coleta="${p.id}">${esc(DATA_HORA.format(new Date(p.inicio)))}</button></td><td>${numero(p.media)}</td><td>${numero(p.min)}</td><td>${numero(p.max)}</td><td>${NUM.format(p.n)}</td></tr>`).join('')}</tbody></table>
      </div>
    </div>`;
}

function duracao(ms) {
  const min = Math.round(ms / 60000);
  if (min < 1) return 'menos de 1 min';
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

async function htmlColetas(lista) {
  const espaco = await espacoUsado();
  const atual = conexao.gravador?.sessao?.id;
  if (!lista.length) return htmlVazio('Nenhuma coleta ainda', 'As coletas ficam neste aparelho, com a data e a hora dele. Nenhuma sai daqui sem você exportar.');
  const uso = espaco?.usage != null ? `<p class="dados-nota">Espaço usado pelo app: ${NUM.format(Math.round(espaco.usage / 1048576))} MB</p>` : '';
  return `${uso}<ul class="sessoes">${lista.map((x) => `<li>
      <span class="info"><b>${DATA_HORA.format(new Date(x.inicio))}</b>
        <small>${duracao(x.fim - x.inicio)} · ${plural(x.n, 'registro', 'registros')}${x.simulado ? ' · Simulador' : ''}${x.id === atual ? ' · Gravando' : ''}</small></span>
      ${temSinais(x) ? `<button class="link-perigo" type="button" data-ver-coleta="${x.id}">Ver</button>` : ''}
      <button class="link-perigo" type="button" data-csv="${x.id}">Exportar CSV</button>
      ${x.id === atual ? '' : `<button class="link-perigo${excluindoSessao === x.id ? ' confirma' : ''}" type="button" data-excluir-sessao="${x.id}">${excluindoSessao === x.id ? 'Confirmar' : 'Excluir'}</button>`}
    </li>`).join('')}</ul>`;
}

async function exportarSessao(id, botao) {
  const s = (await listarSessoes()).find((x) => x.id === id);
  if (!s) return;
  botao.textContent = 'Exportando';
  await conexao.gravador?.descarregar();
  const csv = await csvDaSessao(s);
  const d = new Date(s.inicio + s.fuso * 60000).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '_');
  salvarArquivo(`${s.simulado ? 'SIMULADO_' : ''}coleta_${d}.csv`, 'text/csv', `\ufeff${csv}`);
  botao.textContent = 'Exportar CSV';
}

export async function renderDados() {
  const { monitor } = conexao;
  $('dadosResumo').textContent = monitor ? `${ESTADOS_ADAPTADOR[monitor.adaptador]} · ${ESTADOS_VEICULO[monitor.veiculo]}` : 'Sem conexão';
  $('dadosTopo').innerHTML = `<div class="manut-acoes"><div class="seg" role="group" aria-label="Vista">${Object.entries(VISTAS).map(([k, t]) => `<button type="button" data-vista="${k}" aria-pressed="${k === vista}">${t}</button>`).join('')}</div></div>`;
  sessaoListada = conexao.gravador?.sessao?.id ?? null;
  await conexao.gravador?.descarregar();
  let lista;
  try { lista = await listarSessoes(); } catch {
    $('dadosCorpo').innerHTML = '<p class="dados-nota">Não foi possível abrir as coletas neste aparelho.</p>';
    return;
  }
  if (vista === 'sinais') { await renderSinais(lista); return; }
  const html = vista === 'historico' ? htmlHistorico(lista) : await htmlColetas(lista);
  if (telaAtual === 'dados') $('dadosCorpo').innerHTML = html;
}

// A cada segundo, só o que está vivo: o histórico muda quando uma coleta muda, não a cada amostra.
export function atualizarDados() {
  if (telaAtual !== 'dados') return;
  if ((conexao.gravador?.sessao?.id ?? null) !== sessaoListada) { renderDados(); return; }
  const { monitor } = conexao;
  $('dadosResumo').textContent = monitor ? `${ESTADOS_ADAPTADOR[monitor.adaptador]} · ${ESTADOS_VEICULO[monitor.veiculo]}` : 'Sem conexão';
  if (vista === 'sinais') atualizarAgora();
}

function abrirColeta(id) {
  coletaVista = id;
  vista = 'sinais';
  gravarPref(PREF_VISTA, vista);
  $('dadosCorpo').scrollTop = 0;
  renderDados();
}

export function iniciarDados() {
  if (VISTAS[lerPref(PREF_VISTA)]) vista = lerPref(PREF_VISTA);
}

export function ligarDados() {
  $('dadosTopo').addEventListener('click', (e) => {
    const b = e.target.closest('[data-vista]');
    if (!b) return;
    vista = b.dataset.vista;
    excluindoSessao = null;
    gravarPref(PREF_VISTA, vista);
    renderDados();
  });
  $('dadosCorpo').addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.hasAttribute('data-ir-adaptador')) { abrirAba('adaptador'); irPara('config'); return; }
    if (t.dataset.sinal) {
      sinal = t.dataset.sinal;
      vista = 'historico';
      gravarPref(PREF_VISTA, vista);
      renderDados();
    }
    if (t.dataset.motor) { filtroMotor = t.dataset.motor; renderDados(); }
    if (t.dataset.janela) { janela = t.dataset.janela; renderDados(); }
    if (t.dataset.verColeta) abrirColeta(Number(t.dataset.verColeta));
    if (t.dataset.csv) await exportarSessao(Number(t.dataset.csv), t);
    if (t.dataset.excluirSessao) {
      const id = Number(t.dataset.excluirSessao);
      if (excluindoSessao === id) { excluindoSessao = null; await excluirSessao(id); } else excluindoSessao = id;
      renderDados();
    }
  });
  $('dadosCorpo').addEventListener('change', (e) => {
    if (e.target.id === 'escolhaColeta') abrirColeta(e.target.value ? Number(e.target.value) : null);
    if (e.target.id === 'escolhaGrupo') { grupoVisto = e.target.value; renderDados(); }
  });
}
