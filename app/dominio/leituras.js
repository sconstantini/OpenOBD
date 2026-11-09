// Leituras: cada par de data e km do carro. A mais recente completa é a quilometragem atual,
// e os checks apontam para elas. Sem DOM: também roda no Node (ferramentas/validar.mjs).
import { isoLocal, paraCampoData } from './manutencao.js';

const NUM = new Intl.NumberFormat('pt-BR');
const DATA = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
const ehObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const ehNum = (v) => typeof v === 'number' && Number.isFinite(v);
const ehTxt = (v) => typeof v === 'string' && v.trim() !== '';
const ehData = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const completa = (l) => l?.em != null && l?.km != null;

export const diaLocal = (em) => (em == null ? null : paraCampoData(em).slice(0, 10));
export const chaveLeitura = (em, km) => `${diaLocal(em) ?? '-'}|${km ?? '-'}`;
export const textoLeitura = (l) => [l.km != null ? `${NUM.format(l.km)} km` : 'Sem km', l.em != null ? DATA.format(new Date(l.em)) : 'Sem data'].join(' · ');

// Só as completas têm lugar certo no tempo. Quem só tem km entra junto da primeira leitura com km igual ou maior.
export function ordenarRegistros(registros) {
  const datadas = registros.filter(completa).sort((a, b) => Date.parse(a.em) - Date.parse(b.em) || a.km - b.km);
  const tempo = (l) => {
    if (l?.em != null) return Date.parse(l.em);
    const depois = datadas.find((d) => d.km >= l?.km);
    return depois ? Date.parse(depois.em) : Infinity;
  };
  return [...registros].sort((a, b) => tempo(a) - tempo(b) || (a?.km ?? 0) - (b?.km ?? 0));
}

export const ultimaLeitura = (registros) => registros.filter(completa).sort((a, b) => Date.parse(a.em) - Date.parse(b.em) || a.km - b.km).at(-1) ?? null;

export function novoIdLeitura(agora = new Date()) {
  return `l_${agora.getTime().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// A km nunca volta atrás no tempo. Devolve o motivo, ou null quando a leitura cabe no histórico.
export function conflitoKm(registros, em, km, ignorar = null) {
  if (em == null || km == null) return null;
  const t = Date.parse(em);
  for (const r of ordenarRegistros(registros).filter((l) => completa(l) && l.id !== ignorar)) {
    const quando = Date.parse(r.em);
    if (quando <= t && km < r.km) return `Em ${DATA.format(new Date(r.em))} o carro já marcava ${NUM.format(r.km)} km.`;
    if (quando > t && km > r.km) return `Em ${DATA.format(new Date(r.em))} o carro marcava só ${NUM.format(r.km)} km.`;
  }
  return null;
}

// O dia vem de um campo de data, sem hora. Hoje vale o agora; dias com outra leitura ficam em ordem de km.
function momentoNoDia(registros, dia, km, agora, ignorar) {
  const doDia = registros.filter((l) => completa(l) && diaLocal(l.em) === dia && l.id !== ignorar);
  const antes = doDia.filter((l) => l.km <= km).map((l) => Date.parse(l.em));
  const depois = doDia.filter((l) => l.km > km).map((l) => Date.parse(l.em));
  if (antes.length) return new Date(Math.max(...antes) + 60000);
  if (depois.length) return new Date(Math.min(...depois) - 60000);
  return dia === diaLocal(agora) ? agora : new Date(`${dia}T12:00:00`);
}

function checarCampos(dia, km, agora) {
  if (dia == null && km == null) return 'Informe a data, a km ou ambas.';
  if (km != null && (!ehNum(km) || km < 0)) return 'Informe a km em número.';
  if (dia != null && dia > diaLocal(agora)) return 'A data está no futuro.';
  return null;
}

// Mesma data e mesma km são a mesma Leitura: devolve a que já existe, em vez de repetir.
export function garantirLeitura(registros, { dia = null, km = null }, agora = new Date()) {
  const erro = checarCampos(dia, km, agora);
  if (erro) return { erro };
  const igual = registros.find((l) => diaLocal(l.em) === dia && (l.km ?? null) === km);
  if (igual) return { registros, id: igual.id, nova: false };
  const em = dia == null ? null : isoLocal(km == null ? new Date(`${dia}T12:00:00`) : momentoNoDia(registros, dia, km, agora, null));
  const conflito = conflitoKm(registros, em, km);
  if (conflito) return { erro: conflito };
  const leitura = { id: novoIdLeitura(agora), em, km };
  return { registros: [...registros, leitura], id: leitura.id, nova: true };
}

// A leitura pedida na tela inicial: é sempre de agora e não pode ser menor que a última.
export function adicionarLeitura(registros, km, agora = new Date()) {
  if (!ehNum(km) || km < 0) return { erro: 'Informe a quilometragem em número.' };
  const ultima = ultimaLeitura(registros);
  if (ultima && km < ultima.km) return { erro: `O valor é menor que a última leitura, de ${NUM.format(ultima.km)} km.` };
  return garantirLeitura(registros, { dia: diaLocal(agora), km: Math.round(km) }, agora);
}

// Corrigir uma Leitura corrige todos os checks ligados a ela, porque eles só guardam o id.
export function corrigirLeitura(registros, id, { dia = null, km = null }, agora = new Date()) {
  const erro = checarCampos(dia, km, agora);
  if (erro) return { erro };
  const atual = registros.find((l) => l.id === id);
  if (registros.some((l) => l.id !== id && diaLocal(l.em) === dia && (l.km ?? null) === km)) return { erro: 'Já existe uma Leitura com essa data e essa km.' };
  let em = null;
  if (dia != null) em = isoLocal(km == null ? new Date(`${dia}T12:00:00`) : momentoNoDia(registros, dia, km, agora, id));
  if (dia != null && diaLocal(atual.em) === dia && conflitoKm(registros, atual.em, km, id) == null) em = atual.em;
  const conflito = conflitoKm(registros, em, km, id);
  if (conflito) return { erro: conflito };
  return { registros: registros.map((l) => (l.id === id ? { ...l, em, km } : l)) };
}

// Os checks só guardam o id da Leitura; o estado do serviço precisa da data e da km dela.
export function checksComLeitura(checks, registros) {
  const porId = new Map(registros.map((l) => [l.id, l]));
  return checks.map((c) => ({ ...c, em: porId.get(c.leitura)?.em ?? null, km: porId.get(c.leitura)?.km ?? null }));
}

export function validarLeituras(q, erros) {
  if (!ehObj(q) || !Array.isArray(q.registros)) return erros.push('leituras.registros: informe uma lista, mesmo que vazia');
  const ids = new Set(), pares = new Set();
  q.registros.forEach((r, i) => {
    const c = `leituras.registros[${i}]`;
    if (!ehObj(r)) return erros.push(`${c}: precisa ser um objeto`);
    if (!ehTxt(r.id)) erros.push(`${c}.id: informe um texto`);
    else if (ids.has(r.id)) erros.push(`${c}.id: "${r.id}" está repetido`);
    else ids.add(r.id);
    if (r.em == null && r.km == null) return erros.push(`${c}: informe a data, a km ou ambas`);
    if (r.em != null && !ehData(r.em)) return erros.push(`${c}.em: use data e hora no formato ISO 8601`);
    if (r.km != null && (!ehNum(r.km) || r.km < 0)) return erros.push(`${c}.km: informe um número maior ou igual a 0`);
    const par = chaveLeitura(r.em, r.km);
    if (pares.has(par)) erros.push(`${c}: já existe uma Leitura com essa data e essa km`);
    pares.add(par);
  });
  if (erros.length) return;
  let anterior = null;
  ordenarRegistros(q.registros).filter(completa).forEach((r) => {
    if (anterior && r.km < anterior.km) erros.push(`leituras.registros: ${r.km} km em ${diaLocal(r.em)} é menor que a leitura anterior, de ${anterior.km} km`);
    anterior = r;
  });
}

// Em importações, o que já está no aparelho prevalece. Os ids do arquivo são traduzidos pelo par de data e km.
export function mesclarHistorico(aparelho, arquivo) {
  const leituras = [...aparelho.leituras];
  const traducao = new Map();
  for (const l of arquivo.leituras) {
    const igual = leituras.find((a) => chaveLeitura(a.em, a.km) === chaveLeitura(l.em, l.km));
    if (igual) { traducao.set(l.id, igual.id); continue; }
    const id = leituras.some((a) => a.id === l.id) ? novoIdLeitura() : l.id;
    traducao.set(l.id, id);
    leituras.push({ ...l, id });
  }
  const checks = [...aparelho.checks];
  for (const c of arquivo.checks) {
    const leitura = traducao.get(c.leitura) ?? c.leitura;
    if (checks.some((a) => a.id === c.id || (a.servico === c.servico && a.leitura === leitura))) continue;
    checks.push({ ...c, leitura });
  }
  return { leituras: ordenarRegistros(leituras), checks };
}

// Da versão 2, em que cada check guardava a própria data e km. Nada se perde: quando a data de um
// check contradiz a km do histórico, a Leitura fica só com a km, e a data original vai para a nota.
export function migrarParaLeituras(quilometragem, checks) {
  const registros = [];
  let n = 0;
  const achar = (em, km) => registros.find((l) => chaveLeitura(l.em, l.km) === chaveLeitura(em, km));
  const incluir = (em, km) => {
    const leitura = { id: `l_v2_${++n}`, em, km };
    registros.push(leitura);
    return leitura;
  };
  for (const r of ordenarRegistros(quilometragem ?? [])) if (!achar(r.em, r.km)) incluir(r.em, r.km);
  const convertidos = (checks ?? []).map(({ em: emOriginal, km: kmOriginal, ...resto }) => {
    const em = emOriginal ?? null, km = kmOriginal ?? null;
    const contradiz = conflitoKm(registros, em, km) != null && !achar(em, km);
    const leitura = contradiz ? (achar(null, km) ?? incluir(null, km)) : (achar(em, km) ?? incluir(em, km));
    const nota = contradiz ? [resto.nota, `Data original: ${diaLocal(em)}`].filter(Boolean).join(' · ') : resto.nota;
    return { ...resto, ...(nota ? { nota } : {}), leitura: leitura.id };
  });
  // Dois checks do mesmo serviço na mesma data e km viram um só: o último anotado.
  const unicos = new Map(convertidos.map((c) => [`${c.servico}|${c.leitura}`, c]));
  return { registros, checks: [...unicos.values()] };
}
