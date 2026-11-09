// Folha de check: registrar, corrigir ou excluir um check, e corrigir uma Leitura.
import { ACOES, FONTES, RESULTADOS, ROTULO_ESTADO, criarCheck, ehTarefa, resultadoPadrao } from '../dominio/manutencao.js';
import { corrigirLeitura, diaLocal, garantirLeitura, ordenarRegistros, textoLeitura } from '../dominio/leituras.js';
import { cfg, kmAtual, salvar, todosItens } from '../estado.js';
import { $, esc } from './comum.js';
import { tarefaHtml } from './views_tarefas.js';
import { aoRegistrar, renderManutencao } from './manutencao.js';
import { renderInicio } from './inicio.js';
import { renderConfig } from './configuracoes.js';

let folha = null;
let excluindoCheck = null;
let ultimoLote = null;
let temporizadorRecado = null;

const hojeNoCampo = () => diaLocal(new Date());

// O que o plano diz da peça: fica aqui porque é onde a pessoa está olhando para ela.
function htmlSobre({ componente: c, servico: s }) {
  const origem = [c.origem.fonte ?? cfg.plano.origem.documento, c.origem.pagina != null ? `pág. ${c.origem.pagina}` : '', c.origem.item != null ? `item ${c.origem.item}` : ''].filter(Boolean).join(', ');
  return `<dl class="folha-sobre">
    <dt>Para que serve</dt><dd>${esc(c.para_que_serve)}</dd>
    ${c.especificacao ? `<dt>Especificação</dt><dd>${esc(c.especificacao)}</dd>` : ''}
    <dt>Origem</dt><dd>${esc(origem)}</dd>
    ${s.conferir && s.nota ? `<dt>A conferir</dt><dd>${esc(s.nota)}</dd>` : ''}
  </dl>`;
}

export function abrirFolha(entradas, check = null, leituraEscolhida = null) {
  const ids = new Set(entradas.map((e) => e.servico.id));
  const usadas = new Set(cfg.checks.registros.filter((c) => ids.has(c.servico) && c.id !== check?.id).map((c) => c.leitura));
  const ordem = ordenarRegistros(cfg.leituras.registros).reverse();
  const deHoje = ordem.find((l) => diaLocal(l.em) === hojeNoCampo());
  const padrao = check?.leitura ?? leituraEscolhida ?? deHoje?.id ?? null;
  folha = {
    entradas, check,
    resultado: check?.resultado ?? (entradas.length === 1 && ACOES[entradas[0].servico.acao].resultados.length === 1 ? ACOES[entradas[0].servico.acao].resultados[0] : null),
    fonte: check?.fonte ?? 'eu_mesmo',
    leitura: padrao != null && usadas.has(padrao) ? null : padrao,
  };
  excluindoCheck = null;
  const unico = entradas.length === 1 ? entradas[0] : null;
  const dica = unico && !check && !unico.conhecido && unico.servico.acao !== 'inspecionar' ? 'Se foi feito antes, use a data e a km do comprovante.' : '';
  const opcoes = ordem.filter((l, n) => n < 8 || l.id === folha.leitura);
  $('folha').innerHTML = `<form method="dialog" id="formCheck" novalidate>
    <div>
      <h2 id="folhaTitulo">${esc(unico ? unico.componente.nome : `Registrar ${entradas.length} serviços`)}</h2>
      ${unico ? `<p class="folha-sub">${esc(ACOES[unico.servico.acao].nome)} · ${!check && ehTarefa(unico) ? tarefaHtml(unico.estado) : esc(ROTULO_ESTADO[unico.estado])}${unico.servico.conferir ? `<span class="selo-conferir" title="${esc(unico.servico.nota ?? 'Conferir no documento')}">Conferir</span>` : ''}<br>${esc(unico.servico.descricao)}</p>${htmlSobre(unico)}` : `<div class="folha-lista">${entradas.map((e) => `${esc(e.componente.nome)}: ${esc(RESULTADOS[resultadoPadrao(e.servico.acao)])}`).join('<br>')}</div>`}
    </div>
    ${dica ? `<p class="folha-dica">${dica}</p>` : ''}
    <fieldset class="grupo"><legend>Leitura: data e km</legend>
      <div class="opcoes menor chips-leitura">
        <button type="button" data-leitura="" aria-pressed="${folha.leitura == null}">Nova</button>
        ${opcoes.map((l) => `<button type="button" data-leitura="${esc(l.id)}" aria-pressed="${folha.leitura === l.id}" ${usadas.has(l.id) ? 'disabled title="Este Serviço já tem check nesta Leitura"' : ''}>${esc(textoLeitura(l))}</button>`).join('')}
      </div>
    </fieldset>
    <div class="folha-campos" id="camposLeitura" ${folha.leitura == null ? '' : 'hidden'}>
      <label class="folha-campo"><span class="rotulo">Data<button class="limpar" type="button" data-limpar="checkDia">Sem data</button></span>
        <input id="checkDia" type="date" max="${hojeNoCampo()}" value="${hojeNoCampo()}"></label>
      <label class="folha-campo"><span class="rotulo">Km<button class="limpar" type="button" data-limpar="checkKm">Sem km</button></span>
        <input id="checkKm" type="number" inputmode="numeric" min="0" autocomplete="off" value="${kmAtual() ?? ''}"></label>
    </div>
    ${unico ? `<fieldset class="grupo"><legend>Resultado</legend><div class="opcoes">${ACOES[unico.servico.acao].resultados.map((r) => `<button type="button" data-resultado="${r}" aria-pressed="${folha.resultado === r}">${esc(RESULTADOS[r])}</button>`).join('')}</div></fieldset>` : ''}
    <fieldset class="grupo"><legend>Origem</legend><div class="opcoes menor">${Object.entries(FONTES).map(([k, t]) => `<button type="button" data-fonte="${k}" aria-pressed="${folha.fonte === k}">${esc(t)}</button>`).join('')}</div></fieldset>
    <label class="folha-campo">Observação (opcional)<input id="checkNota" type="text" autocomplete="off" value="${esc(check?.nota ?? '')}"></label>
    <p class="erro-km" id="erroCheck" role="alert"></p>
    <div class="folha-acoes">
      ${check ? '<button class="btn folha-excluir" type="button" id="btnExcluirNaFolha">Excluir check</button>' : ''}
      <button class="btn" type="button" id="btnCancelarCheck">Cancelar</button>
      <button class="btn btn-forte" type="submit">${check ? 'Salvar' : 'Registrar'}</button>
    </div>
  </form>`;
  $('folha').showModal();
}

function salvarFolha() {
  const erro = $('erroCheck');
  const unico = folha.entradas.length === 1;
  if (unico && !folha.resultado) { erro.textContent = 'Escolha o resultado.'; return; }
  let registros = cfg.leituras.registros;
  let leitura = folha.leitura;
  let criada = null;
  if (leitura == null) {
    const campoKm = $('checkKm').value.trim();
    const r = garantirLeitura(registros, { dia: $('checkDia').value || null, km: campoKm === '' ? null : Number(campoKm) });
    if (r.erro) { erro.textContent = r.erro; return; }
    registros = r.registros;
    leitura = r.id;
    if (r.nova) criada = r.id;
  }
  const repetido = folha.entradas.some((e) => cfg.checks.registros.some((c) => c.servico === e.servico.id && c.leitura === leitura && c.id !== folha.check?.id));
  if (repetido) { erro.textContent = 'Este Serviço já tem check nesta Leitura.'; return; }
  const nota = $('checkNota').value;
  cfg.leituras.registros = registros;
  if (folha.check) {
    const editado = { ...folha.check, leitura, fonte: folha.fonte, resultado: folha.resultado };
    if (nota.trim()) editado.nota = nota.trim(); else delete editado.nota;
    cfg.checks.registros = cfg.checks.registros.map((c) => (c.id === editado.id ? editado : c));
    ultimoLote = null;
  } else {
    const primeiro = unico && !folha.entradas[0].conhecido;
    const novos = folha.entradas.map((e) => criarCheck({ leitura, fonte: folha.fonte, nota, servico: e.servico.id, resultado: unico ? folha.resultado : resultadoPadrao(e.servico.acao) }));
    cfg.checks.registros = [...cfg.checks.registros, ...novos];
    ultimoLote = { ids: new Set(novos.map((c) => c.id)), leitura: criada };
    aoRegistrar(novos[0].id);
    mostrarRecado(novos.length > 1 ? `${novos.length} checks registrados` : primeiro ? 'Primeiro check registrado: a linha abriu' : 'Check registrado');
  }
  $('folha').close();
  salvar();
  renderInicio();
  renderManutencao();
}

export function abrirFolhaLeitura(leitura) {
  $('folha').innerHTML = `<form method="dialog" id="formLeitura" data-id="${esc(leitura.id)}" novalidate>
    <div><h2 id="folhaTitulo">Corrigir Leitura</h2><p class="folha-sub">Todos os checks ligados a esta Leitura acompanham a correção.</p></div>
    <div class="folha-campos">
      <label class="folha-campo"><span class="rotulo">Data<button class="limpar" type="button" data-limpar="leituraDia">Sem data</button></span>
        <input id="leituraDia" type="date" max="${hojeNoCampo()}" value="${diaLocal(leitura.em) ?? ''}"></label>
      <label class="folha-campo"><span class="rotulo">Km<button class="limpar" type="button" data-limpar="leituraKm">Sem km</button></span>
        <input id="leituraKm" type="number" inputmode="numeric" min="0" autocomplete="off" value="${leitura.km ?? ''}"></label>
    </div>
    <p class="erro-km" id="erroLeitura" role="alert"></p>
    <div class="folha-acoes">
      <button class="btn" type="button" id="btnCancelarCheck">Cancelar</button>
      <button class="btn btn-forte" type="submit">Salvar</button>
    </div>
  </form>`;
  $('folha').showModal();
}

function salvarLeituraCorrigida(id) {
  const campoKm = $('leituraKm').value.trim();
  const r = corrigirLeitura(cfg.leituras.registros, id, { dia: $('leituraDia').value || null, km: campoKm === '' ? null : Number(campoKm) });
  if (r.erro) { $('erroLeitura').textContent = r.erro; return; }
  cfg.leituras.registros = r.registros;
  $('folha').close();
  salvar();
  renderInicio();
  renderManutencao();
  renderConfig();
}

function mostrarRecado(texto) {
  const r = $('recado');
  r.innerHTML = `<span>${esc(texto)}</span><button type="button" id="btnDesfazer">Desfazer</button>`;
  r.hidden = false;
  clearTimeout(temporizadorRecado);
  temporizadorRecado = setTimeout(() => { r.hidden = true; ultimoLote = null; }, 8000);
}

function desfazerLote() {
  if (!ultimoLote) return;
  cfg.checks.registros = cfg.checks.registros.filter((c) => !ultimoLote.ids.has(c.id));
  if (ultimoLote.leitura) cfg.leituras.registros = cfg.leituras.registros.filter((r) => r.id !== ultimoLote.leitura);
  ultimoLote = null;
  $('recado').hidden = true;
  salvar();
  renderInicio();
  renderManutencao();
}

export function ligarFolha() {
  $('folha').addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.leitura !== undefined) {
      folha.leitura = t.dataset.leitura || null;
      $('camposLeitura').hidden = folha.leitura != null;
      $('folha').querySelectorAll('[data-leitura]').forEach((b) => b.setAttribute('aria-pressed', b === t));
    }
    if (t.id === 'btnExcluirNaFolha') {
      if (excluindoCheck === folha.check.id) {
        cfg.checks.registros = cfg.checks.registros.filter((c) => c.id !== folha.check.id);
        excluindoCheck = null;
        $('folha').close();
        salvar();
        renderInicio();
        renderManutencao();
        renderConfig();
      } else {
        excluindoCheck = folha.check.id;
        t.textContent = 'Confirmar exclusão';
        t.classList.add('confirma');
      }
      return;
    }
    if (t.dataset.resultado) folha.resultado = t.dataset.resultado;
    if (t.dataset.fonte) folha.fonte = t.dataset.fonte;
    if (t.dataset.resultado || t.dataset.fonte) {
      $('folha').querySelectorAll(t.dataset.resultado ? '[data-resultado]' : '[data-fonte]').forEach((b) => b.setAttribute('aria-pressed', b === t));
    }
    if (t.dataset.limpar) $(t.dataset.limpar).value = '';
    if (t.id === 'btnCancelarCheck') $('folha').close();
  });
  $('folha').addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target.id === 'formLeitura') salvarLeituraCorrigida(e.target.dataset.id); else salvarFolha();
  });
  $('recado').addEventListener('click', (e) => { if (e.target.closest('#btnDesfazer')) desfazerLote(); });
}
