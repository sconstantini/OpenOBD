// Tela Manutenção: as quatro views da aba Tarefas.
import { listarTarefas } from '../dominio/manutencao.js';
import { ordenarRegistros } from '../dominio/leituras.js';
import { cfg, checksJuntos, lerPref, gravarPref, textoKm, todosItens } from '../estado.js';
import { $, ehCompacto, plural } from './comum.js';
import { VIEWS, htmlLegenda } from './views_tarefas.js';
import { abrirFolha } from './folha_check.js';
import { atualizarChamadas } from './inicio.js';
import { ajustarCarro, pedirPosicao } from './navegacao.js';

const PREF_VIEW = 'view-tarefas';
const PREF_LEGENDA = 'legenda';
const PREF_ESCALA = 'escala-trilha';

const abertos = new Set();
const marcados = new Set();
let viewTarefas = 'trilha';
let escalaTrilha = 0;
let checkNovo = null;
let legendaAberta = null;
let modoVarios = false;

// A legenda começa aberta no tablet e fechada no celular, onde a altura é pouca.
const legendaVisivel = () => legendaAberta ?? !ehCompacto();

export function aoRegistrar(id) {
  checkNovo = id;
  modoVarios = false;
  marcados.clear();
}

function htmlViewTarefas(itens) {
  const ctx = { leituras: ordenarRegistros(cfg.leituras.registros), checks: checksJuntos(), hoje: new Date(), compacto: ehCompacto(), modoVarios, marcados, novo: checkNovo, abertos, escala: escalaTrilha };
  checkNovo = null;
  return VIEWS[viewTarefas].html(itens, ctx);
}

export function renderManutencao() {
  const itens = todosItens();
  const tarefas = listarTarefas(itens);
  const conhecidos = itens.filter((i) => i.conhecido).length;
  const conta = (e) => itens.filter((i) => i.estado === e).length;
  $('manutResumo').textContent = `${plural(conta('vencido'), 'vencido', 'vencidos')} · ${plural(conta('atencao') + conta('proximo'), 'pede atenção', 'pedem atenção')} · ${conta('ok')} em dia · ${textoKm()}`;
  const fracao = itens.length ? (conhecidos / itens.length) * 100 : 0;
  $('manutProgresso').innerHTML = conhecidos < itens.length ? `<div class="progresso"><span>Ponto de partida</span><span class="barra"><i style="width:${fracao}%"></i></span><b>${conhecidos} de ${itens.length}</b></div>` : '';
  $('manutTopo').innerHTML = `
    <div class="manut-acoes">
      <h2 class="manut-titulo">Tarefas ${tarefas.length} <small>(Serviços que pedem ação)</small></h2>
      <div class="seg" role="group" aria-label="View">${Object.entries(VIEWS).map(([k, v]) => `<button type="button" data-view="${k}" aria-pressed="${k === viewTarefas}">${v.nome}</button>`).join('')}</div>
      <button class="link-acao" type="button" id="btnLegenda" aria-expanded="${legendaVisivel()}">Legenda</button>
      <button class="link-acao" type="button" id="btnVarios" aria-pressed="${modoVarios}">${modoVarios ? 'Cancelar seleção' : 'Registrar vários'}</button>
    </div>`;
  const legenda = $('manutLegenda');
  legenda.hidden = !legendaVisivel();
  legenda.innerHTML = legenda.hidden ? '' : htmlLegenda(viewTarefas);
  $('arvore').innerHTML = htmlViewTarefas(itens);
  const barra = $('barraVarios');
  barra.hidden = !modoVarios;
  barra.innerHTML = modoVarios ? `<span>${plural(marcados.size, 'selecionado', 'selecionados')}</span><button class="btn btn-forte" type="button" id="btnRegistrarVarios" ${marcados.size ? '' : 'disabled'}>Registrar</button>` : '';
  atualizarChamadas();
}

export function iniciarManutencao() {
  if (VIEWS[lerPref(PREF_VIEW)]) viewTarefas = lerPref(PREF_VIEW);
  escalaTrilha = Number(lerPref(PREF_ESCALA)) || 0;
  const legenda = lerPref(PREF_LEGENDA);
  if (legenda != null) legendaAberta = legenda === '1';
  const itens = todosItens();
  const urgente = itens.find((i) => ['vencido', 'atencao'].includes(i.estado));
  abertos.add(`s:${(urgente ?? itens[0])?.sistema.id}`);
}

export function ligarManutencao() {
  $('manutTopo').addEventListener('click', (e) => {
    const view = e.target.closest('[data-view]');
    if (view) {
      viewTarefas = view.dataset.view;
      gravarPref(PREF_VIEW, viewTarefas);
      pedirPosicao();
      renderManutencao();
      ajustarCarro();
    }
    if (e.target.closest('#btnLegenda')) {
      legendaAberta = !legendaVisivel();
      gravarPref(PREF_LEGENDA, legendaAberta ? '1' : '0');
      renderManutencao();
    }
    if (e.target.closest('#btnVarios')) {
      modoVarios = !modoVarios;
      marcados.clear();
      renderManutencao();
    }
  });
  $('barraVarios').addEventListener('click', (e) => {
    if (!e.target.closest('#btnRegistrarVarios')) return;
    abrirFolha(todosItens().filter((i) => marcados.has(i.servico.id)));
  });
  $('arvore').addEventListener('click', (e) => {
    const regua = e.target.closest('[data-escala]');
    if (regua) {
      escalaTrilha = Number(regua.dataset.escala);
      gravarPref(PREF_ESCALA, String(escalaTrilha));
      pedirPosicao();
      renderManutencao();
      ajustarCarro();
      return;
    }
    if (e.target.closest('[data-abrir-tudo]')) {
      const chaves = cfg.plano.sistemas.flatMap((s) => [`s:${s.id}`, ...s.componentes.map((c) => `c:${c.id}`)]);
      if (chaves.every((k) => abertos.has(k))) abertos.clear(); else chaves.forEach((k) => abertos.add(k));
      renderManutencao();
      return;
    }
    const grupo = e.target.closest('[data-abrir]');
    const reg = e.target.closest('[data-reg]');
    const ver = e.target.closest('[data-ver]');
    if (ver) {
      if (modoVarios) return;
      const check = cfg.checks.registros.find((c) => c.id === ver.dataset.ver);
      abrirFolha(todosItens().filter((i) => i.servico.id === check.servico), check);
      return;
    }
    if (reg) {
      const id = reg.dataset.reg;
      if (!modoVarios) {
        abrirFolha(todosItens().filter((i) => i.servico.id === id), null, reg.dataset.leitura ?? null);
        return;
      }
      if (reg.dataset.leitura) return;
      if (marcados.has(id)) marcados.delete(id); else marcados.add(id);
    } else if (grupo) {
      const k = grupo.dataset.abrir;
      if (abertos.has(k)) abertos.delete(k); else abertos.add(k);
    } else return;
    renderManutencao();
  });
}
