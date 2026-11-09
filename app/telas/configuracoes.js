// Configurações: veículo, plano e perfil, adaptador, aparência e dados do aparelho.
import { carregarGLB, definirRotacao, usarGenerico } from '../cena/cena.js';
import { esvaziar, guardarModelo, lerModelo } from '../banco.js';
import { apagarColetas, csvDeTodas, listarSessoes } from '../obd/coletas.js';
import { ESTADOS_ADAPTADOR, ESTADOS_VEICULO } from '../obd/monitor.js';
import { TransporteSimulado } from '../obd/transportes.js';
import { conexao, adaptadorSalvo, guardarAdaptador, iniciarMonitor, pararMonitor, desligarAutoConexao } from '../obd/conexao.js';
import { validarConfig, migrarConfig, VERSAO, TEMAS } from '../dominio/config.js';
import { USOS, listarServicos, perfilParaPlano, validarPerfil } from '../dominio/manutencao.js';
import { diaLocal, mesclarHistorico, ordenarRegistros } from '../dominio/leituras.js';
import { apagarPreferencias, cfg, kmAtual, salvar, textoKm } from '../estado.js';
import { $, DATA_HORA, NUM, esc, mostrarAviso, plural, salvarArquivo } from './comum.js';
import { renderInicio, renderTopo, registrarKm } from './inicio.js';
import { renderManutencao } from './manutencao.js';
import { abrirFolhaLeitura } from './folha_check.js';
import { renderTudo } from './navegacao.js';

let abaAtual = 'veiculo';
let pendente = null;
let excluindo = null;
let confirmando = null;

export function selecionarAba(aba) {
  abaAtual = aba;
  renderConfig();
}

export function renderConfig() {
  document.querySelectorAll('.painel-config .abas button').forEach((b) => b.setAttribute('aria-selected', b.dataset.aba === abaAtual));
  const v = cfg.veiculo;
  const m3d = v.modelo_3d;
  const abas = {
    veiculo: () => `
      <div class="bloco"><div class="campos">
        <label class="campo">Marca<input data-campo="marca" value="${esc(v.marca)}" ${m3d ? 'disabled' : ''}></label>
        <label class="campo">Modelo<input data-campo="modelo" value="${esc(v.modelo)}" ${m3d ? 'disabled' : ''}></label>
        <label class="campo">Ano<input data-campo="ano" type="number" inputmode="numeric" value="${v.ano}" ${m3d ? 'disabled' : ''}></label>
      </div>${m3d ? '<ul class="regras"><li>Marca, modelo e ano vêm do arquivo do modelo 3D</li></ul>' : ''}</div>
      <div class="bloco"><h2>Quilometragem</h2>
        <p>${kmAtual() == null ? 'Nenhuma leitura registrada. Os prazos por km dependem dela.' : `Atual: <b>${textoKm()}</b>. Cada leitura fica salva com data e hora.`}</p>
        <form class="form-km" id="formKm">
          <div class="linha-km"><input id="kmConfig" type="number" inputmode="numeric" min="0" autocomplete="off" aria-label="Nova leitura em km"><span>km</span></div>
          <button class="btn btn-forte" type="submit">Registrar</button>
        </form>
        <p class="erro-km" id="erroConfig" role="alert"></p>
        ${renderLeituras()}
      </div>
      <div class="bloco"><h2>Modelo 3D</h2>
        <p>${m3d ? `Em uso: <code>${esc(m3d.arquivo)}</code>` : 'Em uso: carro genérico do app'}</p>
        <ul class="regras"><li>Arquivo <code>.glb</code>, de até 50 MB, com marca, modelo e ano gravados nele</li><li>Frente do carro virada para +Z, teto para +Y</li><li>O app centraliza e ajusta o tamanho sozinho</li></ul>
        <div class="acoes">
          <button class="btn" id="btnModelo">Escolher arquivo .glb</button>
          ${m3d ? '<button class="btn" id="btnGirar">Girar 90°</button><button class="btn" id="btnGenerico">Usar carro genérico</button>' : ''}
        </div>
      </div>
      <div class="bloco"><h2>Não tem um modelo?</h2>
        <p>Copie as instruções e cole no seu LLM. Elas já levam o veículo acima e o formato que este app aceita.</p>
        <div class="acoes"><button class="btn" id="btnCopiarGuia">Copiar instruções para o LLM</button></div>
        <textarea id="textoGuia" class="guia-texto" readonly hidden aria-label="Instruções para o LLM"></textarea>
      </div>`,
    manutencao: () => {
      const p = cfg.plano;
      const servicos = p.sistemas.flatMap((s) => s.componentes.flatMap((c) => c.servicos));
      const aConferir = listarServicos(p, cfg.perfil).filter((e) => e.servico.conferir);
      return `<div class="bloco"><h2>Plano de manutenção</h2>
        <p>${esc(p.origem.documento)}: ${plural(p.sistemas.length, 'sistema', 'sistemas')} e ${plural(servicos.length, 'serviço', 'serviços')}.${p.exemplo ? ' <b>É um exemplo, com intervalos fictícios.</b>' : ''} Para trocar o plano, gere um arquivo com o seu LLM e use <b>Importar arquivo</b>. Os checks continuam guardados.</p>
        <div class="acoes"><button class="btn" id="btnCopiarManut">Copiar instruções para o LLM</button></div>
        <textarea id="textoManut" class="guia-texto" readonly hidden aria-label="Instruções para o LLM"></textarea>
      </div>
      <div class="bloco"><h2>Perfil deste carro</h2>
        <p>Define quais serviços e regras do plano valem para você.</p>
        <div class="perfil-campos">
          <fieldset class="grupo"><legend>Tipo de uso</legend><div class="opcoes">${Object.entries(USOS).map(([k, t]) => `<button type="button" data-uso="${k}" aria-pressed="${cfg.perfil.uso === k}">${esc(t)}</button>`).join('')}</div></fieldset>
          <label class="campo">Motivo do uso<input data-motivo value="${esc(cfg.perfil.motivo_uso ?? '')}" autocomplete="off"></label>
          ${Object.entries(p.opcoes ?? {}).map(([k, o]) => `<label class="campo">${esc(o.nome)}
            <select class="seletor" data-opcao="${esc(k)}">
              <option value="">Não informado</option>
              ${Object.entries(o.valores).map(([v, t]) => `<option value="${esc(v)}"${cfg.perfil.opcoes?.[k] === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}
            </select></label>`).join('')}
        </div>
      </div>
      ${aConferir.length ? `<div class="bloco"><h2>A conferir no documento</h2>
        <ul class="regras">${aConferir.map((e) => `<li>${esc(e.componente.nome)}: ${esc(e.servico.nota ?? e.servico.descricao)}</li>`).join('')}</ul>
      </div>` : ''}`;
    },
    adaptador: () => {
      const ativo = conexao.monitor && conexao.monitor.adaptador !== 'desconectado';
      const salvo = adaptadorSalvo();
      return `<div class="bloco"><h2>Adaptador Bluetooth</h2>
        <p>${conexao.transporte ? `Conexão: ${esc(conexao.transporte.rotulo)}.` : 'Sem acesso ao Bluetooth.'} Ao conectar, a coleta começa sozinha.</p>
        <div id="estadoConexao">${htmlConexao()}</div>
        <div class="acoes">
          ${ativo ? '<button class="btn btn-forte" id="btnDesconectar">Desconectar</button>' : `
            ${salvo && conexao.transporte ? `<button class="btn btn-forte" id="btnReconectar">Conectar a ${esc(salvo.nome)}</button>` : ''}
            ${conexao.transporte ? '<button class="btn" id="btnBuscar">Buscar adaptadores</button>' : ''}
            <button class="btn" id="btnSimular">Usar simulador</button>`}
        </div>
        ${!ativo && conexao.transporte ? `<div class="lista-bt" id="listaBt">${htmlAchados()}</div>` : ''}
      </div>`;
    },
    aparencia: () => `<div class="bloco"><h2>Tema</h2><div class="temas">
      ${TEMAS.map((t) => `<button class="tema tema-${t}" data-tema="${t}" aria-pressed="${cfg.aparencia.tema === t}"><i></i>${{ claro: 'Claro', nevoa: 'Névoa', noite: 'Noite' }[t]}</button>`).join('')}
    </div></div>`,
    dados: () => `<div class="bloco"><h2>Exportar</h2>
        <p>Os arquivos ficam com você. Eles trazem km e histórico do carro: não publique.</p>
        <div class="acoes">
          <button class="btn" id="btnExportarHistorico">Exportar histórico</button>
          <button class="btn" id="btnExportarColetas">Exportar coletas (CSV)</button>
          <button class="btn" id="btnExportarConfig">Exportar configuração</button>
        </div>
        <ul class="regras"><li>Histórico: Leituras e checks. Volta com <b>Importar arquivo</b> e se junta ao que já estiver no aparelho</li><li>Coletas: serve para analisar em planilha, mas não volta para o app</li><li>Configuração: tudo, menos o modelo 3D e as coletas</li></ul>
      </div>
      <div class="bloco"><h2>Começar de novo</h2>
        <p>Não dá para desfazer. Exporte antes o que quiser guardar.</p>
        <div class="acoes">
          <button class="btn${confirmando === 'historico' ? ' confirma' : ''}" id="btnZerarHistorico">${confirmando === 'historico' ? 'Confirmar: zerar histórico' : 'Zerar histórico'}</button>
          <button class="btn${confirmando === 'tudo' ? ' confirma' : ''}" id="btnApagarTudo">${confirmando === 'tudo' ? 'Confirmar: apagar tudo' : 'Apagar tudo'}</button>
        </div>
        <ul class="regras"><li>Zerar histórico: apaga Leituras, checks e coletas. Plano, perfil, veículo e modelo 3D continuam</li><li>Apagar tudo: o app volta a ser como no primeiro uso</li></ul>
      </div>
      <div class="bloco"><h2>Configurar com um LLM</h2>
        <p>Copie a jornada e cole no seu LLM. Ele conduz o passo a passo do que precisa ser definido neste app.</p>
        <div class="acoes"><button class="btn" id="btnCopiarJornada">Copiar jornada para o LLM</button></div>
        <textarea id="textoJornada" class="guia-texto" readonly hidden aria-label="Jornada para o LLM"></textarea>
      </div>`,
  };
  $('abaConteudo').innerHTML = abas[abaAtual]();
}

function renderLeituras() {
  const lista = ordenarRegistros(cfg.leituras.registros);
  if (!lista.length) return '';
  const completas = lista.filter((r) => r.em != null && r.km != null);
  return `<ul class="leituras">${lista.map((r) => {
    const anterior = completas[completas.indexOf(r) - 1];
    const ligados = cfg.checks.registros.filter((c) => c.leitura === r.id).length;
    return `<li><span><b>${r.km != null ? `${NUM.format(r.km)} km` : 'Sem km'}</b><small>${r.em != null ? DATA_HORA.format(new Date(r.em)) : 'Sem data'}</small></span>
      <span class="dif">${ligados ? plural(ligados, 'check', 'checks') : anterior ? `+${NUM.format(r.km - anterior.km)} km` : ''}</span>
      <button class="link-perigo" type="button" data-corrigir-leitura="${esc(r.id)}">Corrigir</button>
      ${ligados ? '' : `<button class="link-perigo${excluindo === r.id ? ' confirma' : ''}" type="button" data-excluir="${esc(r.id)}">${excluindo === r.id ? 'Confirmar' : 'Excluir'}</button>`}</li>`;
  }).reverse().join('')}</ul>`;
}

function htmlConexao() {
  const { monitor } = conexao;
  if (!monitor) return '';
  return `<p class="estado-linha">${esc(ESTADOS_ADAPTADOR[monitor.adaptador])} · ${esc(ESTADOS_VEICULO[monitor.veiculo])}${monitor.protocolo ? ` · ${esc(monitor.protocolo)}` : ''}${monitor.erro ? `<small>${esc(monitor.erro)}</small>` : ''}</p>`;
}

function htmlAchados() {
  return conexao.achados.map((d) => `<button data-endereco="${esc(d.endereco)}" data-nome="${esc(d.nome)}"><span>${esc(d.nome)}</span><small>${esc(d.endereco)}</small></button>`).join('');
}

const NOME_SECAO = { veiculo: 'Veículo', leituras: 'Leituras (junta com o histórico atual)', adaptador: 'Adaptador', plano: 'Plano de manutenção', perfil: 'Perfil do carro', checks: 'Checks (junta com os atuais)', aparencia: 'Aparência' };

const historicoMesclado = (dado) => mesclarHistorico(
  { leituras: cfg.leituras.registros, checks: cfg.checks.registros },
  { leituras: dado.leituras?.registros ?? [], checks: dado.checks?.registros ?? [] },
);

async function lerArquivoConfig(arquivo) {
  if (arquivo.size > 5 * 1024 * 1024) {
    mostrarAviso('<b>Nada foi alterado.</b> O arquivo passa de 5 MB.', true);
    return;
  }
  let dado;
  try { dado = JSON.parse(await arquivo.text()); } catch {
    mostrarAviso(`<b>Não foi possível ler ${esc(arquivo.name)}.</b> O arquivo não é um JSON válido.`, true);
    return;
  }
  dado = migrarConfig(dado);
  const { erros, secoes } = validarConfig(dado);
  if (erros.length) {
    mostrarAviso(`<b>Nada foi alterado.</b> Corrija estes pontos, ou peça ao seu LLM:<ul>${erros.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`, true);
    return;
  }
  if (dado.leituras || dado.checks) {
    const m = historicoMesclado(dado);
    const conflitos = validarConfig({ versao: VERSAO, leituras: { registros: m.leituras }, checks: { registros: m.checks } }).erros;
    if (conflitos.length) {
      mostrarAviso(`<b>Nada foi alterado.</b> As Leituras do arquivo não combinam com as salvas aqui:<ul>${conflitos.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`, true);
      return;
    }
  }
  if (dado.perfil && !dado.plano) {
    const erros = [];
    validarPerfil(dado.perfil, erros, cfg.plano);
    if (erros.length) {
      mostrarAviso(`<b>Nada foi alterado.</b> O perfil do arquivo não combina com o plano salvo aqui:<ul>${erros.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`, true);
      return;
    }
  }
  pendente = dado;
  mostrarAviso(`<b>Arquivo válido.</b> Vai substituir: ${secoes.map((s) => NOME_SECAO[s]).join(', ')}.
    <div class="acoes"><button class="btn btn-forte" id="btnAplicar">Aplicar</button><button class="btn" id="btnCancelar">Cancelar</button></div>`);
}

function aplicarPendente() {
  const modeloAntes = cfg.veiculo.modelo_3d;
  const marcaAntes = { marca: cfg.veiculo.marca, modelo: cfg.veiculo.modelo, ano: cfg.veiculo.ano };
  let alerta = null;
  for (const s of Object.keys(pendente)) {
    if (s === 'versao' || s === 'leituras' || s === 'checks') continue;
    cfg[s] = pendente[s];
  }
  cfg.perfil = perfilParaPlano(cfg.perfil, cfg.plano);
  if (pendente.leituras || pendente.checks) {
    const m = historicoMesclado(pendente);
    cfg.leituras.registros = m.leituras;
    cfg.checks.registros = m.checks;
  }
  if (pendente.veiculo) {
    const novo = pendente.veiculo.modelo_3d;
    if (!novo) {
      if (modeloAntes) { usarGenerico(); guardarModelo(null); }
    } else if (modeloAntes && novo.arquivo === modeloAntes.arquivo) {
      Object.assign(cfg.veiculo, marcaAntes);
      definirRotacao(novo.rotacao_y || 0);
    } else {
      alerta = `Carregue o arquivo <code>${esc(novo.arquivo)}</code> em Veículo. O modelo atual continua em uso.`;
      if (modeloAntes) Object.assign(cfg.veiculo, marcaAntes, { modelo_3d: modeloAntes });
      else cfg.veiculo.modelo_3d = null;
    }
  }
  pendente = null;
  $('avisoImport').hidden = true;
  salvar();
  renderTudo();
  if (alerta) mostrarAviso(alerta);
}

function aplicarMeta(meta, arquivo, rotacao) {
  Object.assign(cfg.veiculo, { marca: meta.marca, modelo: meta.modelo, ano: meta.ano, modelo_3d: { arquivo, rotacao_y: rotacao } });
  salvar();
}

async function escolherModelo(arquivo) {
  if (arquivo.size > 50 * 1024 * 1024) {
    mostrarAviso('<b>Modelo não carregado.</b> O arquivo passa de 50 MB.', true);
    return;
  }
  try {
    const buffer = await arquivo.arrayBuffer();
    const meta = await carregarGLB(buffer.slice(0), 0);
    aplicarMeta(meta, arquivo.name, 0);
    await guardarModelo(buffer);
    $('avisoImport').hidden = true;
    renderTudo();
  } catch (e) {
    if (e.erros) mostrarAviso(`<b>Modelo não carregado.</b> ${esc(e.erros.join('; '))}. Use <code>ferramentas/etiquetar_glb.mjs</code> ou peça ao seu LLM.`, true);
    else mostrarAviso(`<b>Modelo não carregado.</b> ${esc(arquivo.name)} não é um .glb válido.`, true);
  }
}

async function copiarGuia(botao, arquivo, areaId) {
  const v = cfg.veiculo;
  const veiculo = `${v.marca} ${v.modelo} ${v.ano}`;
  let texto;
  try {
    const r = await fetch(`guias/${arquivo}`);
    if (!r.ok) throw new Error();
    texto = (await r.text()).replaceAll('{{VEICULO}}', veiculo);
  } catch {
    mostrarAviso(`<b>Não foi possível abrir as instruções.</b> Elas estão em <code>app/guias/${esc(arquivo)}</code>, no repositório.`, true);
    return;
  }
  try {
    await navigator.clipboard.writeText(texto);
    botao.textContent = 'Instruções copiadas';
  } catch {
    const area = $(areaId);
    area.value = texto;
    area.hidden = false;
    area.focus();
    area.select();
    botao.textContent = 'Selecione e copie o texto abaixo';
  }
}

function baixarHistorico() {
  const { leituras, checks } = cfg;
  const dia = diaLocal(new Date()).replaceAll('-', '');
  salvarArquivo(`historico_${dia}.config.local.json`, 'application/json', JSON.stringify({ versao: VERSAO, leituras, checks }, null, 2));
}

async function baixarColetas(botao) {
  botao.textContent = 'Exportando';
  await conexao.gravador?.descarregar();
  const lista = await listarSessoes();
  if (lista.length) salvarArquivo(`coletas_${diaLocal(new Date()).replaceAll('-', '')}.csv`, 'text/csv', `\ufeff${await csvDeTodas(lista)}`);
  else mostrarAviso('Nenhuma coleta para exportar.');
  botao.textContent = 'Exportar coletas (CSV)';
}

// Sem o monitor gravando: uma amostra atrasada não pode reabrir o que acabou de ser apagado.
async function zerarHistorico() {
  await pararMonitor();
  cfg.leituras.registros = [];
  cfg.checks.registros = [];
  await apagarColetas();
  salvar();
  renderTudo();
}

async function apagarTudo() {
  await pararMonitor();
  apagarPreferencias();
  await esvaziar();
  location.reload();
}

// Modelo já importado neste aparelho. Sem ele, fica o carro genérico.
export async function restaurarModelo() {
  const m = cfg.veiculo.modelo_3d;
  const salvo = await lerModelo();
  if (salvo) {
    try {
      const rot = m?.rotacao_y || 0;
      aplicarMeta(await carregarGLB(salvo.slice(0), rot), m?.arquivo || 'veiculo.glb', rot);
      return;
    } catch { guardarModelo(null); }
  }
  cfg.veiculo.modelo_3d = null;
}

export function atualizarConexaoNaTela() {
  const a = $('estadoConexao');
  if (a) a.innerHTML = htmlConexao();
}

export function ligarConfiguracoes() {
  document.querySelector('.painel-config .abas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-aba]');
    if (b) { abaAtual = b.dataset.aba; confirmando = null; renderConfig(); }
  });
  $('abaConteudo').addEventListener('submit', (e) => {
    if (e.target.id !== 'formKm') return;
    e.preventDefault();
    registrarKm($('kmConfig').value, $('erroConfig'));
  });
  $('btnImportar').onclick = () => $('arqConfig').click();
  $('arqConfig').onchange = (e) => { if (e.target.files[0]) lerArquivoConfig(e.target.files[0]); e.target.value = ''; };
  $('arqModelo').onchange = (e) => { if (e.target.files[0]) escolherModelo(e.target.files[0]); e.target.value = ''; };
  $('avisoImport').addEventListener('click', (e) => {
    if (e.target.id === 'btnAplicar') aplicarPendente();
    if (e.target.id === 'btnCancelar') { pendente = null; $('avisoImport').hidden = true; }
  });
  $('abaConteudo').addEventListener('change', (e) => {
    if (e.target.dataset.opcao) {
      cfg.perfil.opcoes ??= {};
      if (e.target.value) cfg.perfil.opcoes[e.target.dataset.opcao] = e.target.value; else delete cfg.perfil.opcoes[e.target.dataset.opcao];
    }
    if (e.target.hasAttribute('data-motivo')) cfg.perfil.motivo_uso = e.target.value;
    if (e.target.dataset.opcao || e.target.hasAttribute('data-motivo')) {
      salvar();
      renderInicio();
      renderManutencao();
      renderConfig();
      return;
    }
    const c = e.target.dataset.campo;
    if (!c) return;
    const anterior = cfg.veiculo[c];
    cfg.veiculo[c] = e.target.type === 'number' ? Number(e.target.value) : e.target.value;
    const { erros } = validarConfig({ versao: VERSAO, veiculo: cfg.veiculo });
    if (erros.length) {
      cfg.veiculo[c] = anterior;
      e.target.value = anterior;
      mostrarAviso(`<b>Valor não aceito.</b> ${esc(erros[0])}`, true);
      return;
    }
    $('avisoImport').hidden = true;
    salvar();
    renderTopo();
    renderInicio();
    renderManutencao();
  });
  $('abaConteudo').addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.excluir) {
      if (excluindo === t.dataset.excluir) {
        cfg.leituras.registros = cfg.leituras.registros.filter((r) => r.id !== excluindo);
        excluindo = null;
        salvar();
        renderInicio();
        renderManutencao();
      } else excluindo = t.dataset.excluir;
      renderConfig();
      return;
    }
    if (t.dataset.corrigirLeitura) {
      abrirFolhaLeitura(cfg.leituras.registros.find((r) => r.id === t.dataset.corrigirLeitura));
      return;
    }
    if (t.id === 'btnModelo') $('arqModelo').click();
    if (t.id === 'btnGirar') {
      const m = cfg.veiculo.modelo_3d;
      m.rotacao_y = ((m.rotacao_y || 0) + 90) % 360;
      definirRotacao(m.rotacao_y);
      salvar();
    }
    if (t.id === 'btnGenerico') {
      cfg.veiculo.modelo_3d = null;
      usarGenerico();
      guardarModelo(null);
      salvar();
      renderConfig();
    }
    if (t.id === 'btnCopiarGuia') copiarGuia(t, 'modelo-3d.md', 'textoGuia');
    if (t.id === 'btnCopiarManut') copiarGuia(t, 'manutencao.md', 'textoManut');
    if (t.id === 'btnCopiarJornada') copiarGuia(t, 'jornada.md', 'textoJornada');
    if (t.id === 'btnExportarHistorico') baixarHistorico();
    if (t.id === 'btnExportarConfig') salvarArquivo('obd-auto-check.config.local.json', 'application/json', JSON.stringify(cfg, null, 2));
    if (t.id === 'btnExportarColetas') await baixarColetas(t);
    if (t.id === 'btnZerarHistorico' || t.id === 'btnApagarTudo') {
      const alvo = t.id === 'btnZerarHistorico' ? 'historico' : 'tudo';
      if (confirmando === alvo) {
        confirmando = null;
        if (alvo === 'historico') await zerarHistorico(); else await apagarTudo();
      } else {
        confirmando = alvo;
        renderConfig();
      }
    }
    if (t.id === 'btnBuscar') {
      t.textContent = 'Buscando';
      try {
        conexao.achados = await conexao.transporte.listar();
        $('listaBt').innerHTML = conexao.achados.length ? htmlAchados() : '<p class="estado-linha">Nenhum adaptador encontrado. Pareie o adaptador no Bluetooth do aparelho e busque de novo.</p>';
      } catch (err) {
        mostrarAviso(`<b>Busca falhou.</b> ${esc(err.message)}`, true);
      }
      t.textContent = 'Buscar adaptadores';
    }
    if (t.dataset.endereco) {
      const d = { endereco: t.dataset.endereco, nome: t.dataset.nome };
      guardarAdaptador(d);
      await iniciarMonitor(conexao.transporte, d);
    }
    if (t.id === 'btnReconectar') {
      await iniciarMonitor(conexao.transporte, adaptadorSalvo());
    }
    if (t.id === 'btnSimular') await iniciarMonitor(new TransporteSimulado(), { endereco: 'simulador', nome: 'Simulador' });
    if (t.id === 'btnDesconectar') {
      t.disabled = true;
      await pararMonitor();
      desligarAutoConexao();
      renderConfig();
    }
    if (t.dataset.uso) {
      cfg.perfil.uso = t.dataset.uso;
      salvar();
      renderInicio();
      renderManutencao();
      renderConfig();
    }
    if (t.dataset.tema) { cfg.aparencia.tema = t.dataset.tema; salvar(); renderTudo(); }
  });
}
