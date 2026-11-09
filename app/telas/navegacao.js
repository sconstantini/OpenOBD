// Qual tela está aberta, o enquadramento do carro em cada uma e o redesenho geral.
import { definirVista, intensidadeSombra } from '../cena/cena.js';
import { cfg } from '../estado.js';
import { $ } from './comum.js';
import { atualizarChamadas, renderInicio, renderStatus, renderTopo } from './inicio.js';
import { renderManutencao } from './manutencao.js';
import { renderConfig, selecionarAba } from './configuracoes.js';
import { renderDados } from './dados.js';

const TELAS = ['inicio', 'manutencao', 'dados', 'config'];
// Nestas telas o conteúdo pede a largura toda: o carro fica pequeno, no alto.
const LARGAS = new Set(['manutencao', 'dados']);

export let telaAtual = 'inicio';
let carroPequeno = false;
let posicionarView = true;

export const pedirPosicao = () => { posicionarView = true; };
export const abrirAba = (aba) => { selecionarAba(aba); };

export function ajustarCarro() {
  const pequeno = LARGAS.has(telaAtual);
  document.body.classList.toggle('carro-pequeno', pequeno);
  if (pequeno !== carroPequeno) {
    carroPequeno = pequeno;
    if (pequeno) definirVista({ livre: 1, pequeno: true, voltarAoHero: true });
  }
  if (telaAtual !== 'manutencao' || !posicionarView) return;
  posicionarView = false;
  const arvore = $('arvore');
  arvore.scrollTop = 0;
  const trilha = arvore.querySelector('.tv-trilha');
  const agora = arvore.querySelector('.tv-col.tv-agora');
  // O histórico aparece primeiro, desde que o Agora e um pedaço do futuro continuem na tela.
  if (trilha) arvore.scrollLeft = Math.max(0, Number(trilha.dataset.agora) - (arvore.clientWidth - trilha.querySelector('.tv-esq').offsetWidth) * 0.6);
  else if (agora) arvore.scrollLeft = Math.max(0, agora.offsetLeft - 16);
  else arvore.scrollLeft = 0;
}

export function renderTudo() {
  document.documentElement.dataset.theme = cfg.aparencia.tema;
  intensidadeSombra(cfg.aparencia.tema === 'noite' ? 0.85 : 0.55);
  renderTopo();
  renderInicio();
  renderManutencao();
  renderConfig();
  renderDados();
}

export function irPara(tela) {
  telaAtual = tela;
  TELAS.forEach((t) => { $(`tela-${t}`).hidden = t !== tela; });
  document.querySelectorAll('.doca button').forEach((b) => {
    if (b.dataset.tela === tela) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  renderStatus();
  // O palco muda de tamanho antes de a câmera calcular o novo enquadramento.
  if (!LARGAS.has(tela)) carroPequeno = false;
  posicionarView = tela === 'manutencao';
  ajustarCarro();
  if (tela === 'inicio') definirVista({ livre: 1, sobeY: 0.06, voltarAoHero: true });
  if (tela === 'config') definirVista({ livre: 0.44 });
  if (tela === 'dados') renderDados();
  try { history.replaceState(null, '', `#${tela}`); } catch { /* sem hash */ }
  atualizarChamadas();
}

export function telaInicial() {
  const h = location.hash.slice(1);
  return TELAS.includes(h) ? h : 'inicio';
}
