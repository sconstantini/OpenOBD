// Plano de manutenção, checks e tarefas. Sem DOM: também roda no Node (ferramentas/validar.mjs).
// O formato e as regras estão descritos em docs/plano-de-manutencao.md.

export const ACOES = {
  inspecionar: { nome: 'Inspecionar', resultados: ['ok', 'atencao', 'substituido'] },
  lubrificar: { nome: 'Lubrificar', resultados: ['lubrificado'] },
  substituir: { nome: 'Substituir', resultados: ['substituido'] },
};
export const RESULTADOS = { ok: 'Tudo certo', atencao: 'Atenção', substituido: 'Substituí', lubrificado: 'Lubrifiquei' };
export const FONTES = { eu_mesmo: 'Eu mesmo', oficina: 'Oficina', nota_fiscal: 'Nota fiscal' };
export const USOS = { normal: 'Uso normal', severo: 'Uso severo' };
export const ROTULO_ESTADO = { vencido: 'Vencido', atencao: 'Atenção', desconhecido: 'Desconhecido', proximo: 'Próximo', avaliar: 'Avaliar', ok: 'Em dia' };
export const ROTULO_TAREFA = { vencido: 'Serviço vencido', atencao: 'Serviço em atenção', desconhecido: 'Serviço desconhecido', proximo: 'Serviço próximo' };
export const ORDEM_ESTADO = { vencido: 0, atencao: 1, desconhecido: 2, proximo: 3, avaliar: 4, ok: 5 };

const ehObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const ehNum = (v) => typeof v === 'number' && Number.isFinite(v);
const ehPos = (v) => ehNum(v) && v > 0;
const ehTxt = (v) => typeof v === 'string' && v.trim() !== '';
const ehDataHora = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
// Só chaves próprias: "constructor" não pode passar como valor aceito num arquivo importado.
const tem = (o, k) => typeof k === 'string' && Object.hasOwn(o ?? {}, k);

// ---- Validação

function validarRegra(r, c, erros) {
  if (!ehObj(r)) return erros.push(`${c}: precisa ser um objeto`);
  if (r.tipo === 'intervalo') {
    if (r.km == null && r.meses == null) erros.push(`${c}: informe km, meses ou ambos`);
    if (r.km != null && !ehPos(r.km)) erros.push(`${c}.km: informe um número maior que 0`);
    if (r.meses != null && !ehPos(r.meses)) erros.push(`${c}.meses: informe um número maior que 0`);
  } else if (r.tipo === 'marcos') {
    if (!Array.isArray(r.km) || r.km.length === 0 || !r.km.every(ehPos)) erros.push(`${c}.km: informe uma lista de quilometragens`);
  } else if (r.tipo === 'condicional') {
    if (!ehTxt(r.texto)) erros.push(`${c}.texto: copie a orientação do documento`);
    if (r.limite_km != null && !ehPos(r.limite_km)) erros.push(`${c}.limite_km: informe um número maior que 0`);
    if (r.limite_meses != null && !ehPos(r.limite_meses)) erros.push(`${c}.limite_meses: informe um número maior que 0`);
  } else erros.push(`${c}.tipo: use intervalo, marcos ou condicional`);
}

function validarServico(s, c, opcoes, ids, erros) {
  if (!ehObj(s)) return erros.push(`${c}: precisa ser um objeto`);
  if (!ehTxt(s.id)) erros.push(`${c}.id: informe um texto`);
  else if (ids.has(s.id)) erros.push(`${c}.id: "${s.id}" está repetido`);
  else ids.add(s.id);
  if (!tem(ACOES, s.acao)) erros.push(`${c}.acao: use ${Object.keys(ACOES).join(', ')}`);
  if (!ehTxt(s.descricao)) erros.push(`${c}.descricao: informe um texto`);
  if (s.conferir != null && typeof s.conferir !== 'boolean') erros.push(`${c}.conferir: use true ou false`);
  if (s.nota != null && !ehTxt(s.nota)) erros.push(`${c}.nota: informe um texto ou omita`);
  if (s.quando != null) {
    if (!ehObj(s.quando)) erros.push(`${c}.quando: precisa ser um objeto`);
    else for (const [k, v] of Object.entries(s.quando)) {
      if (!tem(opcoes, k)) erros.push(`${c}.quando.${k}: declare essa opção em plano.opcoes`);
      else if (!tem(opcoes[k].valores, v)) erros.push(`${c}.quando.${k}: "${v}" não está em plano.opcoes.${k}.valores`);
    }
  }
  const chaves = ehObj(s.regras) ? Object.keys(s.regras) : [];
  if (chaves.length === 0) return erros.push(`${c}.regras: informe todos, ou normal e severo`);
  for (const k of chaves) {
    if (k !== 'todos' && !tem(USOS, k)) erros.push(`${c}.regras.${k}: use todos, normal ou severo`);
    else validarRegra(s.regras[k], `${c}.regras.${k}`, erros);
  }
}

function validarComponente(comp, c, opcoes, ids, idsServicos, erros) {
  if (!ehObj(comp)) return erros.push(`${c}: precisa ser um objeto`);
  if (!ehTxt(comp.id)) erros.push(`${c}.id: informe um texto`);
  else if (ids.has(comp.id)) erros.push(`${c}.id: "${comp.id}" está repetido`);
  else ids.add(comp.id);
  if (!ehTxt(comp.nome)) erros.push(`${c}.nome: informe um texto`);
  if (!ehTxt(comp.para_que_serve)) erros.push(`${c}.para_que_serve: explique em uma frase`);
  if (comp.especificacao != null && !ehTxt(comp.especificacao)) erros.push(`${c}.especificacao: informe um texto ou null`);
  if (!ehObj(comp.origem) || (comp.origem.pagina == null && !ehTxt(comp.origem.fonte))) erros.push(`${c}.origem: informe a página ou a fonte`);
  if (comp.ancora != null && !(Array.isArray(comp.ancora) && comp.ancora.length === 3 && comp.ancora.every((n) => ehNum(n) && n >= -1 && n <= 1))) {
    erros.push(`${c}.ancora: use [x, y, z], com valores de -1 a 1`);
  }
  if (!Array.isArray(comp.servicos) || comp.servicos.length === 0) return erros.push(`${c}.servicos: informe ao menos um serviço`);
  comp.servicos.forEach((s, i) => validarServico(s, `${c}.servicos[${i}]`, opcoes, idsServicos, erros));
}

export function validarPlano(p, erros) {
  if (!ehObj(p)) return erros.push('plano: precisa ser um objeto');
  if (!ehObj(p.origem) || !ehTxt(p.origem.documento)) erros.push('plano.origem.documento: informe de qual documento veio o plano');
  if (p.exemplo != null && typeof p.exemplo !== 'boolean') erros.push('plano.exemplo: use true ou false');
  const opcoes = p.opcoes ?? {};
  if (!ehObj(opcoes)) return erros.push('plano.opcoes: precisa ser um objeto');
  for (const [k, o] of Object.entries(opcoes)) {
    if (!ehObj(o) || !ehTxt(o.nome) || !ehObj(o.valores) || Object.keys(o.valores).length === 0) erros.push(`plano.opcoes.${k}: informe nome e valores`);
  }
  if (!Array.isArray(p.sistemas) || p.sistemas.length === 0) return erros.push('plano.sistemas: informe ao menos um sistema');
  const idsSis = new Set(), idsComp = new Set(), idsServ = new Set();
  p.sistemas.forEach((s, i) => {
    const c = `plano.sistemas[${i}]`;
    if (!ehObj(s)) return erros.push(`${c}: precisa ser um objeto`);
    if (!ehTxt(s.id)) erros.push(`${c}.id: informe um texto`);
    else if (idsSis.has(s.id)) erros.push(`${c}.id: "${s.id}" está repetido`);
    else idsSis.add(s.id);
    if (!ehTxt(s.nome)) erros.push(`${c}.nome: informe um texto`);
    if (!Array.isArray(s.componentes) || s.componentes.length === 0) return erros.push(`${c}.componentes: informe ao menos um componente`);
    s.componentes.forEach((comp, j) => validarComponente(comp, `${c}.componentes[${j}]`, opcoes, idsComp, idsServ, erros));
  });
}

export function validarPerfil(p, erros, plano = null) {
  if (!ehObj(p)) return erros.push('perfil: precisa ser um objeto');
  if (!tem(USOS, p.uso)) erros.push(`perfil.uso: use ${Object.keys(USOS).join(' ou ')}`);
  if (p.motivo_uso != null && typeof p.motivo_uso !== 'string') erros.push('perfil.motivo_uso: informe um texto ou omita');
  if (p.opcoes != null && !ehObj(p.opcoes)) return erros.push('perfil.opcoes: precisa ser um objeto');
  if (plano?.opcoes) {
    for (const [k, v] of Object.entries(p.opcoes ?? {})) {
      if (!tem(plano.opcoes, k) || !tem(plano.opcoes[k].valores, v)) erros.push(`perfil.opcoes.${k}: "${v}" não está previsto no plano`);
    }
  }
}

// Um plano novo pode não ter as opções do plano anterior. Elas saem do perfil, senão a configuração salva fica inválida.
export function perfilParaPlano(perfil, plano) {
  const opcoes = Object.entries(perfil.opcoes ?? {}).filter(([k, v]) => tem(plano.opcoes ?? {}, k) && tem(plano.opcoes[k].valores, v));
  return { ...perfil, opcoes: Object.fromEntries(opcoes) };
}

export function validarChecks(ch, erros, leituras = []) {
  if (!ehObj(ch) || !Array.isArray(ch.registros)) return erros.push('checks.registros: informe uma lista, mesmo que vazia');
  const ids = new Set(), pares = new Set();
  const idsLeitura = new Set(leituras.map((l) => l?.id));
  ch.registros.forEach((r, i) => {
    const c = `checks.registros[${i}]`;
    if (!ehObj(r)) return erros.push(`${c}: precisa ser um objeto`);
    if (!ehTxt(r.id)) erros.push(`${c}.id: informe um texto`);
    else if (ids.has(r.id)) erros.push(`${c}.id: "${r.id}" está repetido`);
    else ids.add(r.id);
    if (!ehTxt(r.servico)) erros.push(`${c}.servico: informe o id do serviço`);
    if (!tem(RESULTADOS, r.resultado)) erros.push(`${c}.resultado: use ${Object.keys(RESULTADOS).join(', ')}`);
    if (r.em !== undefined || r.km !== undefined) erros.push(`${c}: a data e a km ficam na Leitura; use o campo leitura`);
    if (!ehTxt(r.leitura)) erros.push(`${c}.leitura: informe o id da Leitura`);
    else if (!idsLeitura.has(r.leitura)) erros.push(`${c}.leitura: "${r.leitura}" não existe em leituras.registros`);
    const par = `${r.servico}|${r.leitura}`;
    if (pares.has(par)) erros.push(`${c}: este serviço já tem check nessa Leitura`);
    pares.add(par);
    if (r.fonte != null && !tem(FONTES, r.fonte)) erros.push(`${c}.fonte: use ${Object.keys(FONTES).join(', ')}`);
    if (!ehDataHora(r.registrado_em)) erros.push(`${c}.registrado_em: use data e hora no formato ISO 8601`);
  });
}

// ---- Do plano aos serviços deste carro

export const regraDoServico = (servico, uso) => servico.regras[uso] ?? servico.regras.todos ?? null;

// Opção ainda não escolhida no perfil não esconde o serviço: é melhor mostrar a mais do que omitir.
function seAplica(servico, perfil) {
  return Object.entries(servico.quando ?? {}).every(([k, v]) => perfil.opcoes?.[k] == null || perfil.opcoes[k] === v);
}

export function listarServicos(plano, perfil) {
  return plano.sistemas.flatMap((sistema) => sistema.componentes.flatMap((componente) => componente.servicos
    .filter((servico) => seAplica(servico, perfil) && regraDoServico(servico, perfil.uso))
    .map((servico) => ({ sistema, componente, servico, regra: regraDoServico(servico, perfil.uso) }))));
}

// ---- Dos checks ao estado

const NUM = new Intl.NumberFormat('pt-BR');
const MES = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' });

export function somarMeses(iso, meses) {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d;
}

// A km só cresce, então decide quando os dois checks têm km. Sem ela, vale a data, ou a data do registro.
function maisRecente(a, b) {
  if (a.km != null && b.km != null && a.km !== b.km) return a.km > b.km ? a : b;
  return Date.parse(a.em ?? a.registrado_em) >= Date.parse(b.em ?? b.registrado_em) ? a : b;
}

// Trocar a peça também conta como inspeção dela, mas inspecionar não zera a contagem da troca.
function checksQueContam({ componente, servico }, checks) {
  const ids = new Set(componente.servicos.map((s) => s.id));
  const doComponente = checks.filter((c) => ids.has(c.servico));
  if (servico.acao === 'substituir') return doComponente.filter((c) => c.resultado === 'substituido');
  return doComponente.filter((c) => c.servico === servico.id || c.resultado === 'substituido');
}

function parteKm(alvo, base, km) {
  const resta = alvo - km;
  return { fracao: resta / (alvo - base), texto: resta > 0 ? `faltam ${NUM.format(resta)} km` : `vencido há ${NUM.format(-resta)} km`, alvo: `${NUM.format(alvo)} km` };
}

function parteMeses(base, meses, hoje) {
  const limite = somarMeses(base, meses);
  const resta = limite - hoje;
  return { fracao: resta / (limite - new Date(base)), texto: resta > 0 ? `até ${MES.format(limite)}` : `venceu em ${MES.format(limite)}`, alvo: MES.format(limite) };
}

function prazos(regra, ultimo, km, hoje) {
  const limiteKm = regra.tipo === 'condicional' ? regra.limite_km : regra.tipo === 'intervalo' ? regra.km : null;
  const limiteMeses = regra.tipo === 'condicional' ? regra.limite_meses : regra.tipo === 'intervalo' ? regra.meses : null;
  const partes = [];
  if (limiteKm != null && ultimo.km != null && km != null) partes.push(parteKm(ultimo.km + limiteKm, ultimo.km, km));
  if (regra.tipo === 'marcos' && ultimo.km != null && km != null) {
    const alvo = [...regra.km].sort((a, b) => a - b).find((m) => m > ultimo.km);
    if (alvo != null) partes.push(parteKm(alvo, ultimo.km, km));
  }
  if (limiteMeses != null && ultimo.em != null) partes.push(parteMeses(ultimo.em, limiteMeses, hoje));
  return partes;
}

function semPrazo(regra, ultimo, km) {
  if (regra.tipo === 'condicional' && regra.limite_km == null && regra.limite_meses == null) return { estado: 'avaliar', texto: regra.texto };
  if (regra.tipo === 'marcos' && ultimo.km != null && km != null) return { estado: 'ok', texto: 'Sem próxima troca no plano' };
  if (km == null) return { estado: 'desconhecido', texto: 'Informe a quilometragem atual' };
  return { estado: 'desconhecido', texto: ultimo.km == null ? 'O último check não tem km' : 'O último check não tem data' };
}

export function estadoServico(entrada, checks, km, hoje = new Date()) {
  const { servico, regra } = entrada;
  const contam = checksQueContam(entrada, checks);
  if (contam.length === 0) {
    return { estado: 'desconhecido', conhecido: false, fracao: null, ultimo: null, alvo: null, texto: servico.acao === 'substituir' ? 'Última troca desconhecida' : 'Faça um check para começar' };
  }
  const ultimo = contam.reduce(maisRecente);
  const partes = prazos(regra, ultimo, km, hoje);
  const atencao = servico.acao === 'inspecionar' && ultimo.resultado === 'atencao';
  if (partes.length === 0) {
    const s = semPrazo(regra, ultimo, km);
    return atencao ? { estado: 'atencao', conhecido: true, fracao: null, ultimo, alvo: null, texto: 'Reavaliar ou trocar' } : { ...s, conhecido: true, fracao: null, ultimo, alvo: null };
  }
  const pior = partes.reduce((a, b) => (b.fracao < a.fracao ? b : a));
  const base = pior.fracao <= 0 ? 'vencido' : pior.fracao <= 0.15 ? 'proximo' : 'ok';
  return {
    estado: atencao && base !== 'vencido' ? 'atencao' : base,
    conhecido: true,
    fracao: Math.max(0, Math.min(1, pior.fracao)),
    ultimo,
    alvo: partes.map((p) => p.alvo).join(' ou '),
    texto: atencao && base !== 'vencido' ? 'Reavaliar ou trocar' : pior.texto,
  };
}

export const piorEstado = (estados) => estados.reduce((a, b) => (ORDEM_ESTADO[b] < ORDEM_ESTADO[a] ? b : a), 'ok');

// ---- Tarefas: nunca são guardadas. Saem do plano, do perfil, dos checks e da km.

export const ehTarefa = (i) => i.estado !== 'ok' && i.estado !== 'avaliar';

export function listarTarefas(itens) {
  return itens.filter(ehTarefa).sort((a, b) => ORDEM_ESTADO[a.estado] - ORDEM_ESTADO[b.estado] || (a.fracao ?? 1) - (b.fracao ?? 1));
}

// ---- Registro de checks

const dois = (n) => String(n).padStart(2, '0');

// Data e hora locais do aparelho, com o fuso: 2026-11-02T09:40:00-03:00
export function isoLocal(d) {
  const fuso = -d.getTimezoneOffset();
  const abs = Math.abs(fuso);
  return `${paraCampoData(d)}:${dois(d.getSeconds())}${fuso < 0 ? '-' : '+'}${dois(Math.floor(abs / 60))}:${dois(abs % 60)}`;
}

// Valor para um <input type="datetime-local">, na hora local.
export function paraCampoData(valor) {
  const d = new Date(valor);
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}T${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

export function resultadoPadrao(acao) {
  return { inspecionar: 'ok', lubrificar: 'lubrificado', substituir: 'substituido' }[acao];
}

export function criarCheck({ servico, leitura, resultado, fonte = 'eu_mesmo', nota = '' }, agora = new Date()) {
  const check = { id: `c_${agora.getTime().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, servico, leitura, resultado, fonte, registrado_em: isoLocal(agora) };
  if (nota.trim()) check.nota = nota.trim();
  return check;
}
