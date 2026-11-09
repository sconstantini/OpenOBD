// A conexão com o carro: monitor, gravação e os últimos valores. Quem desenha decide o que fazer com os avisos.
import { Monitor } from './monitor.js';
import { TransporteAndroid } from './transportes.js';
import { Gravador } from './coletas.js';
import { regimeAtual } from './historico.js';
import { ID_BATERIA } from './sinais.js';
import { cfg, gravarPref, lerPref } from '../estado.js';

const PREF_ADAPTADOR = 'adaptador';
const PREF_SEM_AUTO = 'sem-auto';
const TAMANHO_RASTRO = 600;
const ESPERA_REINICIO = 2000;

export const conexao = {
  monitor: null,
  gravador: null,
  transporte: null,
  reiniciando: false,
  achados: [],
  ultimos: new Map(),
  rastros: new Map(),
  aoMudar: () => {},
  aoConectar: () => {},
  aoAviso: () => {},
};

export function adaptadorSalvo() {
  try { return JSON.parse(lerPref(PREF_ADAPTADOR)); } catch { return null; }
}
export function guardarAdaptador(d) {
  gravarPref(PREF_ADAPTADOR, d ? JSON.stringify(d) : null);
}
export const desligarAutoConexao = () => gravarPref(PREF_SEM_AUTO, '1');

let bloqueioTela = null;
async function manterTelaLigada(sim) {
  try {
    if (sim) bloqueioTela ??= await navigator.wakeLock.request('screen');
    else { await bloqueioTela?.release(); bloqueioTela = null; }
  } catch { bloqueioTela = null; }
}
export const renovarTelaLigada = () => { if (conexao.monitor) manterTelaLigada(true); };

function aoAmostra(a) {
  const { monitor, gravador, ultimos, rastros } = conexao;
  gravador.amostra(a, regimeAtual(monitor.veiculo, ultimos.get('0D')?.v));
  if (a.principal && a.st === 'ok') {
    ultimos.set(a.pid, a);
    if (typeof a.v === 'number') {
      const r = rastros.get(a.pid) ?? [];
      r.push({ t: a.em, v: a.v });
      if (r.length > TAMANHO_RASTRO) r.shift();
      rastros.set(a.pid, r);
    }
  } else if (a.principal && (a.st === 'sem_dado' || a.st === 'sem_conexao') && a.pid !== ID_BATERIA) ultimos.delete(a.pid);
}

export async function iniciarMonitor(transporte, { endereco, nome }) {
  await pararMonitor();
  gravarPref(PREF_SEM_AUTO, null);
  conexao.ultimos.clear();
  conexao.rastros.clear();
  conexao.gravador = new Gravador();
  try {
    const v = cfg.veiculo;
    await conexao.gravador.abrir({ adaptador: nome, transporte: transporte.tipo, simulado: transporte.tipo === 'simulador', veiculo: `${v.marca} ${v.modelo} ${v.ano}` });
  } catch {
    conexao.aoAviso('<b>As coletas não serão salvas.</b> Não foi possível abrir o banco deste aparelho.');
  }
  conexao.monitor = new Monitor({
    transporte,
    endereco,
    aoMudar: () => conexao.aoMudar(),
    aoAmostra,
    aoEvento: (texto) => conexao.gravador.evento(texto),
  });
  conexao.monitor.iniciar();
  manterTelaLigada(true);
  conexao.aoConectar();
}

export async function pararMonitor() {
  if (!conexao.monitor) return;
  await conexao.monitor.parar();
  await conexao.gravador.fechar();
  conexao.monitor = null;
  conexao.gravador = null;
  conexao.ultimos.clear();
  conexao.rastros.clear();
  manterTelaLigada(false);
  conexao.aoMudar();
}

function alvoDaConexao() {
  const { monitor, transporte, gravador } = conexao;
  if (monitor) return { transporte: monitor.transporte, endereco: monitor.endereco, nome: gravador?.sessao?.adaptador ?? monitor.endereco };
  const salvo = adaptadorSalvo();
  return transporte && salvo ? { transporte, ...salvo } : null;
}
export const podeReiniciar = () => alvoDaConexao() !== null;

// O mesmo que desconectar e conectar de novo à mão. A conexão pode estar presa esperando o adaptador, então é interrompida antes.
export async function reiniciarConexao() {
  const alvo = alvoDaConexao();
  if (!alvo || conexao.reiniciando) return;
  conexao.reiniciando = true;
  conexao.aoMudar();
  try {
    alvo.transporte.interromper?.();
    await pararMonitor();
    await new Promise((ok) => { setTimeout(ok, ESPERA_REINICIO); });
    await iniciarMonitor(alvo.transporte, alvo);
  } finally {
    conexao.reiniciando = false;
    conexao.aoMudar();
  }
}

export async function prepararTransporte() {
  if (TransporteAndroid.disponivel()) conexao.transporte = new TransporteAndroid();
  const salvo = adaptadorSalvo();
  if (conexao.transporte && salvo && lerPref(PREF_SEM_AUTO) !== '1') await iniciarMonitor(conexao.transporte, salvo);
}
