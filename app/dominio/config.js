// Formato da configuração. Sem DOM: também roda no Node (ferramentas/validar.mjs).
import { validarChecks, validarPerfil, validarPlano } from './manutencao.js';
import { migrarParaLeituras, validarLeituras } from './leituras.js';

export const VERSAO = 3;
export const TEMAS = ['claro', 'nevoa', 'noite'];
const SECOES = ['veiculo', 'leituras', 'adaptador', 'plano', 'perfil', 'checks', 'aparencia'];
const TIPOS_BT = ['bluetooth_classico', 'ble'];

const ehObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const ehNum = (v) => typeof v === 'number' && Number.isFinite(v);
const ehTxt = (v) => typeof v === 'string' && v.trim() !== '';

function validarVeiculo(v, erros) {
  if (!ehObj(v)) return erros.push('veiculo: precisa ser um objeto');
  if (!ehTxt(v.marca)) erros.push('veiculo.marca: informe um texto');
  if (!ehTxt(v.modelo)) erros.push('veiculo.modelo: informe um texto');
  if (!Number.isInteger(v.ano) || v.ano < 1996 || v.ano > 2100) erros.push('veiculo.ano: informe um ano inteiro, de 1996 em diante');
  if (v.quilometragem_atual !== undefined) erros.push('veiculo.quilometragem_atual: não é mais aceito; use leituras.registros');
  if (v.modelo_3d != null) {
    if (!ehObj(v.modelo_3d)) erros.push('veiculo.modelo_3d: precisa ser um objeto ou null');
    else {
      if (!ehTxt(v.modelo_3d.arquivo) || !v.modelo_3d.arquivo.toLowerCase().endsWith('.glb')) erros.push('veiculo.modelo_3d.arquivo: informe o nome de um arquivo .glb');
      if (v.modelo_3d.rotacao_y != null && !ehNum(v.modelo_3d.rotacao_y)) erros.push('veiculo.modelo_3d.rotacao_y: informe graus em número');
    }
  }
}

function validarAdaptador(a, erros) {
  if (!ehObj(a)) return erros.push('adaptador: precisa ser um objeto');
  if (!TIPOS_BT.includes(a.tipo)) erros.push(`adaptador.tipo: use ${TIPOS_BT.join(' ou ')}`);
  if (a.nome_esperado != null && !ehTxt(a.nome_esperado)) erros.push('adaptador.nome_esperado: informe um texto ou null');
}

// Aceita arquivo parcial: só as seções presentes são validadas e depois substituídas.
export function validarConfig(cfg) {
  const erros = [];
  if (!ehObj(cfg)) return { erros: ['o arquivo precisa conter um objeto JSON'], secoes: [] };
  if (cfg.versao !== VERSAO) erros.push(`versao: este app aceita a versão ${VERSAO}`);
  if (cfg.manutencao !== undefined) erros.push('manutencao: formato antigo; use plano, perfil e checks (veja app/guias/manutencao.md)');
  if (cfg.quilometragem !== undefined) erros.push('quilometragem: formato antigo; use leituras (veja docs/plano-de-manutencao.md)');
  for (const k of Object.keys(cfg)) if (k !== 'versao' && k !== 'manutencao' && k !== 'quilometragem' && !SECOES.includes(k)) erros.push(`${k}: campo desconhecido`);
  const secoes = SECOES.filter((s) => cfg[s] !== undefined);
  if (secoes.length === 0) erros.push(`informe ao menos uma seção: ${SECOES.join(', ')}`);
  if (cfg.veiculo !== undefined) validarVeiculo(cfg.veiculo, erros);
  if (cfg.leituras !== undefined) validarLeituras(cfg.leituras, erros);
  if (cfg.adaptador !== undefined) validarAdaptador(cfg.adaptador, erros);
  if (cfg.plano !== undefined) validarPlano(cfg.plano, erros);
  if (cfg.perfil !== undefined) validarPerfil(cfg.perfil, erros, cfg.plano);
  if (cfg.checks !== undefined) validarChecks(cfg.checks, erros, cfg.leituras?.registros ?? []);
  if (cfg.aparencia !== undefined && !(ehObj(cfg.aparencia) && TEMAS.includes(cfg.aparencia.tema))) {
    erros.push(`aparencia.tema: use ${TEMAS.join(', ')}`);
  }
  return { erros, secoes };
}

// A versão 1 guardava a tabela antiga de manutenção, só com dados de exemplo: ela sai, e o restante continua valendo.
// A versão 2 guardava data e km em cada check: agora eles apontam para uma Leitura.
export function migrarConfig(c) {
  if (c?.versao !== 1 && c?.versao !== 2) return c;
  const { manutencao, quilometragem, ...resto } = c;
  const saida = { ...resto, versao: VERSAO };
  if (quilometragem === undefined && c.checks === undefined) return saida;
  const { registros, checks } = migrarParaLeituras(quilometragem?.registros, c.checks?.registros);
  saida.leituras = { registros };
  if (c.checks !== undefined) saida.checks = { ...c.checks, registros: checks };
  return saida;
}

// Dados do veículo gravados dentro do .glb, em asset.extras.obd_auto_check.
export function validarMetaModelo(m) {
  const erros = [];
  if (!ehObj(m)) return ['faltam marca, modelo e ano dentro do arquivo (asset.extras.obd_auto_check)'];
  if (!ehTxt(m.marca)) erros.push('marca: informe um texto');
  if (!ehTxt(m.modelo)) erros.push('modelo: informe um texto');
  if (!Number.isInteger(m.ano) || m.ano < 1996 || m.ano > 2100) erros.push('ano: informe um ano inteiro, de 1996 em diante');
  return erros;
}
