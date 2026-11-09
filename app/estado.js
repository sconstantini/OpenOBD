// A configuração salva no aparelho e o que se calcula dela. Preferências de tela ficam à parte.
import { validarConfig, migrarConfig } from './dominio/config.js';
import { estadoServico, listarServicos } from './dominio/manutencao.js';
import { checksComLeitura, ultimaLeitura } from './dominio/leituras.js';

const PREFIXO = 'obd-auto-check.';
const CHAVE = `${PREFIXO}config`;
const NUM = new Intl.NumberFormat('pt-BR');

export let cfg = null;
export function definirCfg(c) { cfg = c; }

export function salvar() {
  try { localStorage.setItem(CHAVE, JSON.stringify(cfg)); } catch { /* app segue sem persistir */ }
}

export function lerSalvo() {
  try {
    const lido = JSON.parse(localStorage.getItem(CHAVE));
    if (!lido) return null;
    const c = migrarConfig(lido);
    // Versões anteriores guardavam um único valor, sem data. Ele não vira histórico: o app pede a leitura.
    if (c.veiculo) delete c.veiculo.quilometragem_atual;
    c.leituras ??= { registros: [] };
    if (validarConfig(c).erros.length) {
      // O app recomeça do exemplo, mas o histórico não pode se perder: a cópia fica guardada ao lado.
      localStorage.setItem(`${CHAVE}.recusada`, JSON.stringify(lido));
      return null;
    }
    if (c.versao !== lido.versao) localStorage.setItem(CHAVE, JSON.stringify(c));
    return c;
  } catch { return null; }
}

export function lerPref(nome) {
  try { return localStorage.getItem(PREFIXO + nome); } catch { return null; }
}
export function gravarPref(nome, valor) {
  try {
    if (valor == null) localStorage.removeItem(PREFIXO + nome); else localStorage.setItem(PREFIXO + nome, valor);
  } catch { /* vale só nesta sessão */ }
}
export function apagarPreferencias() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(PREFIXO)).forEach((k) => localStorage.removeItem(k));
  } catch { /* nada a apagar */ }
}

export const kmAtual = () => ultimaLeitura(cfg.leituras.registros)?.km ?? null;
export const checksJuntos = () => checksComLeitura(cfg.checks.registros, cfg.leituras.registros);
export const textoKm = () => (kmAtual() == null ? 'Sem leitura' : `${NUM.format(kmAtual())} km`);

export function todosItens() {
  const km = kmAtual();
  const checks = checksJuntos();
  return listarServicos(cfg.plano, cfg.perfil).map((e) => ({ ...e, ...estadoServico(e, checks, km) }));
}
