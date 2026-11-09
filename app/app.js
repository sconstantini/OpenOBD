// Ponto de partida: carrega a configuração, liga as telas e a conexão com o carro.
import { iniciarCena } from './cena/cena.js';
import { conexao, prepararTransporte, renovarTelaLigada } from './obd/conexao.js';
import { cfg, definirCfg, lerSalvo } from './estado.js';
import { $, ehCompacto, mostrarAviso } from './telas/comum.js';
import { atualizarChamadas, ligarInicio, renderIndicadores, renderStatus } from './telas/inicio.js';
import { iniciarManutencao, ligarManutencao, renderManutencao } from './telas/manutencao.js';
import { ligarFolha } from './telas/folha_check.js';
import { atualizarConexaoNaTela, ligarConfiguracoes, renderConfig, restaurarModelo } from './telas/configuracoes.js';
import { atualizarDados, iniciarDados, ligarDados } from './telas/dados.js';
import { irPara, renderTudo, telaInicial } from './telas/navegacao.js';

function ligarGerais() {
  document.querySelector('.doca').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tela]');
    if (b) irPara(b.dataset.tela);
  });
  let compacto = ehCompacto();
  addEventListener('resize', () => {
    atualizarChamadas();
    if (compacto !== ehCompacto()) {
      compacto = ehCompacto();
      renderManutencao();
    }
  });
  setInterval(() => {
    if (!conexao.monitor) return;
    renderIndicadores();
    atualizarDados();
    atualizarConexaoNaTela();
  }, 1000);
  // A tela pode apagar e devolver o bloqueio; a última amostra não pode se perder ao sair.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') renovarTelaLigada();
    else conexao.gravador?.descarregar();
  });
  addEventListener('pagehide', () => conexao.gravador?.descarregar());
}

async function iniciar() {
  const exemplo = await (await fetch('exemplo/carro-generico.config.json')).json();
  definirCfg(lerSalvo() ?? exemplo);
  cfg.plano ??= exemplo.plano;
  cfg.perfil ??= exemplo.perfil;
  cfg.checks ??= { registros: [] };
  cfg.leituras ??= { registros: [] };
  conexao.aoMudar = () => { renderStatus(); renderIndicadores(); atualizarDados(); };
  conexao.aoConectar = () => { renderConfig(); atualizarDados(); };
  conexao.aoAviso = (html) => mostrarAviso(html, true);
  iniciarManutencao();
  iniciarDados();
  iniciarCena($('canvas3d'), atualizarChamadas);
  ligarGerais();
  ligarInicio();
  ligarManutencao();
  ligarFolha();
  ligarConfiguracoes();
  ligarDados();
  renderTudo();
  await restaurarModelo();
  await prepararTransporte();
  renderTudo();
  irPara(telaInicial());
}
iniciar();
