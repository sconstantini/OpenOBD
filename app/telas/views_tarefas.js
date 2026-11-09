// As quatro views da aba Tarefas, cada uma organizada por uma entidade: Trilha (Serviço), Visitas (Leitura),
// Grade (Check) e Peças (Componente). Devolvem HTML e não tocam no DOM, para poder testar no Node.
import { ACOES, RESULTADOS, ROTULO_ESTADO, ROTULO_TAREFA, ORDEM_ESTADO, ehTarefa, piorEstado, somarMeses } from '../dominio/manutencao.js';
import { diaLocal, textoLeitura, ultimaLeitura } from '../dominio/leituras.js';
import { esc } from './comum.js';

const NUM = new Intl.NumberFormat('pt-BR');
const DATA = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
const MES = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' });
const MES_CURTO = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' });
const MES_MS = 30.4375 * 864e5;
const GLIFO_ESTADO = { vencido: '×', atencao: '!', desconhecido: '?', proximo: '…', avaliar: '–', ok: '✓' };
const GLIFO_CHECK = { ok: '✓', atencao: '!', substituido: 'S', lubrificado: 'L' };

const ROTULO_TAREFAS = { vencido: 'Serviços vencidos', atencao: 'Serviços em atenção', desconhecido: 'Serviços desconhecidos', proximo: 'Serviços próximos' };
const SETA = '<svg class="seta" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3.5 4.5 4.5L6 12.5"/></svg>';
const nomeAcao = (s) => ACOES[s.acao].nome;
const kmRedondo = (km) => NUM.format(Math.round(km / 500) * 500);

export const tarefaHtml = (estado) => `<span class="tarefa">Tarefa <small>(${ROTULO_TAREFA[estado]})</small></span>`;
const marca = (e) => `<span class="tv-marca e-${e}">${GLIFO_ESTADO[e]} ${ROTULO_ESTADO[e]}</span>`;
const estadoHtml = (i) => (ehTarefa(i) ? tarefaHtml(i.estado) : marca(i.estado));

// ---- Horizonte: o que é estimado. Sem pelo menos uma semana entre duas leituras, não há ritmo e não se inventa data.

export function criarHorizonte(registros, hoje) {
  const l = registros.filter((r) => r.em != null && r.km != null).sort((a, b) => Date.parse(a.em) - Date.parse(b.em) || a.km - b.km);
  const t = (r) => Date.parse(r.em);
  const meses = l.length > 1 ? (t(l.at(-1)) - t(l[0])) / MES_MS : 0;
  const ritmo = meses >= 0.25 && l.at(-1).km > l[0].km ? (l.at(-1).km - l[0].km) / meses : null;
  const dataDoKm = (km) => {
    if (!l.length) return null;
    if (km <= l[0].km) return ritmo ? t(l[0]) - ((l[0].km - km) / ritmo) * MES_MS : t(l[0]);
    for (let i = 1; i < l.length; i++) {
      if (km <= l[i].km) return t(l[i - 1]) + ((km - l[i - 1].km) / (l[i].km - l[i - 1].km)) * (t(l[i]) - t(l[i - 1]));
    }
    if (km === l.at(-1).km) return t(l.at(-1));
    return ritmo ? t(l.at(-1)) + ((km - l.at(-1).km) / ritmo) * MES_MS : null;
  };
  const kmDaData = (d) => (ritmo ? l.at(-1).km + ((d - t(l.at(-1))) / MES_MS) * ritmo : null);
  return { ritmo, dataDoKm, kmDaData, hoje: hoje.getTime() };
}

const limites = (r) => ({
  km: r.tipo === 'intervalo' ? r.km ?? null : r.tipo === 'condicional' ? r.limite_km ?? null : null,
  meses: r.tipo === 'intervalo' ? r.meses ?? null : r.tipo === 'condicional' ? r.limite_meses ?? null : null,
});

// Quando vence o próximo passo (o que vier primeiro) e quando seriam os seguintes, até o fim do horizonte.
export function prazoDoItem(item, h, fim = h.hoje + 24 * MES_MS) {
  const vazio = { vence: null, seguintes: [] };
  if (!item.ultimo) return vazio;
  const { regra, ultimo } = item;
  const { km, meses } = limites(regra);
  const marcos = regra.tipo === 'marcos' && ultimo.km != null ? [...regra.km].sort((a, b) => a - b).filter((m) => m > ultimo.km) : [];
  const op = [];
  if (marcos.length) op.push(h.dataDoKm(marcos[0]));
  if (km != null && ultimo.km != null) op.push(h.dataDoKm(ultimo.km + km));
  if (meses != null && ultimo.em != null) op.push(somarMeses(ultimo.em, meses).getTime());
  const validos = op.filter((v) => v != null);
  if (!validos.length) return vazio;
  const cru = Math.min(...validos);
  const vence = item.estado === 'vencido' ? Math.min(cru, h.hoje) : Math.max(cru, h.hoje);
  const base = Math.max(vence, h.hoje);
  if (regra.tipo === 'marcos') return { vence, seguintes: marcos.slice(1).map((m) => h.dataDoKm(m)).filter((v) => v != null && v > base && v < fim) };
  const passos = [];
  if (km != null && h.ritmo) passos.push((km / h.ritmo) * MES_MS);
  if (meses != null) passos.push(meses * MES_MS);
  const seguintes = [];
  if (passos.length) for (let t = base + Math.min(...passos); t < fim; t += Math.min(...passos)) seguintes.push(t);
  return { vence, seguintes };
}

function quandoDoCheck(c, h) {
  if (c.em != null) return Date.parse(c.em);
  return (c.km != null ? h.dataDoKm(c.km) : null) ?? Date.parse(c.registrado_em);
}

const doComponente = (lista) => {
  const grupos = new Map();
  for (const i of lista) grupos.set(i.componente.id, [...(grupos.get(i.componente.id) ?? []), i]);
  return [...grupos.values()];
};

const pressionado = (ctx, id) => (ctx.modoVarios ? ` aria-pressed="${ctx.marcados.has(id)}"` : '');
const classeMarcado = (ctx, id) => (ctx.modoVarios && ctx.marcados.has(id) ? ' marcado' : '');
const conferirHtml = (s) => (s.conferir ? '<small class="tv-conferir">Conferir</small>' : '');

// As Leituras que aparecem como coluna: as que têm check, mais a atual. Leituras avulsas do hodômetro não poluem.
function leiturasVisiveis(ctx) {
  const usadas = new Set(ctx.checks.map((c) => c.leitura));
  const atual = ultimaLeitura(ctx.leituras);
  return ctx.leituras.filter((l) => usadas.has(l.id) || l.id === atual?.id);
}

// ---- Trilha

const TODOS_ABERTOS = { has: () => true };

// A régua é só visual e não muda prazo nenhum. Sem ritmo não há como situar a km no tempo, e ela conta meses.
export const ESCALAS = [{ km: 5000, meses: 3 }, { km: 10000, meses: 6 }, { km: 20000, meses: 12 }];
const rotuloEscala = (e, h) => (h.ritmo ? `${NUM.format(e.km / 1000)} mil km` : `${e.meses} meses`);

const doSistema = (lista) => {
  const grupos = new Map();
  for (const i of lista) grupos.set(i.sistema.id, [...(grupos.get(i.sistema.id) ?? []), i]);
  return [...grupos.values()];
};

// Sistema abre em Componentes, e Componente com mais de um Serviço abre nos seus Serviços.
function linhasDaTrilha(lista, abertos) {
  const linhas = [];
  for (const itens of doSistema(lista)) {
    const chave = `s:${itens[0].sistema.id}`;
    linhas.push({ tipo: 'grupo', nivel: 0, chave, nome: itens[0].sistema.nome, itens, aberto: abertos.has(chave) });
    if (!abertos.has(chave)) continue;
    for (const g of doComponente(itens)) {
      if (g.length === 1) { linhas.push({ tipo: 'servico', item: g[0], unico: true }); continue; }
      const chaveC = `c:${g[0].componente.id}`;
      linhas.push({ tipo: 'grupo', nivel: 1, chave: chaveC, nome: g[0].componente.nome, itens: g, aberto: abertos.has(chaveC) });
      if (abertos.has(chaveC)) g.forEach((item) => linhas.push({ tipo: 'servico', item }));
    }
  }
  return linhas;
}

// O que um grupo fechado resume: "3 Tarefas (1 Serviço vencido, 2 Serviços desconhecidos)".
function resumoTarefas(itens) {
  const tarefas = itens.filter(ehTarefa);
  const partes = Object.keys(ROTULO_TAREFA).map((e) => [e, tarefas.filter((i) => i.estado === e).length]).filter(([, n]) => n)
    .map(([e, n]) => `${n} ${n === 1 ? ROTULO_TAREFA[e] : ROTULO_TAREFAS[e]}`);
  return `<span class="tarefa">${tarefas.length} ${tarefas.length === 1 ? 'Tarefa' : 'Tarefas'} <small>(${partes.join(', ')})</small></span>`;
}

export function htmlTrilha(lista, ctx) {
  const h = criarHorizonte(ctx.leituras, ctx.hoje);
  const abertos = ctx.abertos ?? TODOS_ABERTOS;
  const RH = ctx.compacto ? 46 : 54, EIXO = ctx.compacto ? 44 : 50, PASSO = ctx.compacto ? 58 : 72;
  const nivel = ESCALAS[ctx.escala] ? ctx.escala : 0;
  const escala = ESCALAS[nivel];
  const PX = h.ritmo ? (PASSO * h.ritmo) / escala.km : PASSO / escala.meses;
  const passoMs = (PASSO / PX) * MES_MS;
  const prazos = new Map(lista.map((i) => [i.servico.id, prazoDoItem(i, h, h.hoje + 30 * passoMs)]));
  const tempos = ctx.checks.map((c) => quandoDoCheck(c, h));
  const T0 = Math.min(h.hoje - 3 * passoMs, ...tempos) - passoMs;
  const vences = [...prazos.values()].map((p) => p.vence).filter((v) => v != null);
  const FIM = Math.max(h.hoje + 14 * passoMs, ...vences.map((v) => v + 3 * passoMs));
  const x = (t) => ((t - T0) / MES_MS) * PX;
  const W = x(FIM);
  const linhas = linhasDaTrilha(lista, abertos);
  const altura = linhas.length * RH;
  const agora = x(h.hoje);
  const fios = [], nos = [], rot = [], eixo = [];
  const topoLeit = ctx.compacto ? 17 : 20;
  const marcarRegua = (t) => {
    eixo.push(`<i class="tv-tique" style="left:${x(t)}px"></i>`);
    fios.push(`<line x1="${x(t)}" x2="${x(t)}" y1="0" y2="${altura}" stroke="var(--linha)"/>`);
  };
  // Os meses ralam conforme a escala, para os rótulos não se encostarem.
  const passoMeses = [1, 3, 6, 12, 24, 48, 96].find((m) => m * PX >= 64) ?? 120;
  const anoInicial = new Date(T0).getFullYear();
  for (let m = 0; ; m += passoMeses) {
    const d = new Date(anoInicial, m, 1);
    const t = d.getTime();
    if (t >= FIM) break;
    if (x(t) < 24) continue;
    eixo.push(`<span class="tv-eixo" style="left:${x(t)}px;top:3px">${esc(MES_CURTO.format(d))}</span>`);
    if (!h.ritmo) marcarRegua(t);
  }
  // Rótulos de Leitura muito próximos ou colados no Agora ficam só com a linha pontilhada.
  let ultimoRotulo = -Infinity;
  const rotulosKm = [{ px: agora, folga: 68 }];
  const usadas = new Set(ctx.checks.map((c) => c.leitura));
  ctx.leituras.filter((l) => usadas.has(l.id)).map((l) => ({ l, t: l.em != null ? Date.parse(l.em) : h.dataDoKm(l.km) })).filter((e) => e.t != null).sort((a, b) => a.t - b.t).forEach(({ l, t }) => {
    const lx = x(t);
    fios.push(`<line x1="${lx}" x2="${lx}" y1="0" y2="${altura}" stroke="var(--linha-forte)" stroke-dasharray="2 4"/>`);
    if (l.km != null && lx - ultimoRotulo > 62 && agora - lx > 62) {
      eixo.push(`<span class="tv-eixo leit" style="left:${lx}px;top:${topoLeit}px">${NUM.format(l.km)}</span>`);
      ultimoRotulo = lx;
      rotulosKm.push({ px: lx, folga: 58 });
    }
  });
  if (h.ritmo) {
    let ultimaRegua = -Infinity;
    for (let km = escala.km; ; km += escala.km) {
      const t = h.dataDoKm(km);
      if (t == null || t >= FIM) break;
      if (t < T0) continue;
      marcarRegua(t);
      const px = x(t);
      if (px < 30 || px - ultimaRegua < 54 || rotulosKm.some((r) => Math.abs(r.px - px) < r.folga)) continue;
      eixo.push(`<span class="tv-eixo" style="left:${px}px;top:${topoLeit}px">~${NUM.format(km)}</span>`);
      ultimaRegua = px;
    }
  }
  const atual = ultimaLeitura(ctx.leituras);
  eixo.push(`<span class="tv-eixo tv-agora" style="left:${agora}px;top:${topoLeit}px">Agora${atual ? ` ${NUM.format(atual.km)}` : ''}</span>`);
  fios.push(`<line x1="${agora}" x2="${agora}" y1="0" y2="${altura}" stroke="var(--destaque)" stroke-width="2"/>`);

  const esq = [];
  linhas.forEach((linha, n) => {
    const y = n * RH + RH / 2;
    if (linha.tipo === 'grupo') {
      const ids = new Set(linha.itens.map((i) => i.servico.id));
      const pior = piorEstado(linha.itens.map((i) => i.estado));
      const tem = linha.itens.some(ehTarefa);
      esq.push(`<button type="button" class="tv-l tv-abre nivel-${linha.nivel}" data-abrir="${esc(linha.chave)}" aria-expanded="${linha.aberto}">${SETA}<span>${esc(linha.nome)}</span><small>${linha.itens.length}</small></button>`);
      if (linha.nivel === 0) fios.push(`<rect x="0" y="${y - RH / 2}" width="${W}" height="${RH}" fill="var(--linha)" opacity=".45"/>`);
      fios.push(`<line x1="0" x2="${W}" y1="${y - RH / 2}" y2="${y - RH / 2}" stroke="var(--linha)"/>`);
      if (linha.aberto) return;
      // Fechado, o grupo mostra os checks dos seus serviços, um por Leitura, e o pior estado deles.
      const dele = ctx.checks.filter((c) => ids.has(c.servico));
      const porLeitura = new Map();
      dele.forEach((c) => porLeitura.set(c.leitura, [...(porLeitura.get(c.leitura) ?? []), c]));
      const pontos = [...porLeitura.values()].map((cs) => ({ px: x(quandoDoCheck(cs[0], h)), n: cs.length }));
      if (pontos.length) fios.push(`<line x1="${Math.min(...pontos.map((p) => p.px))}" x2="${agora}" y1="${y}" y2="${y}" stroke="var(--linha-forte)" stroke-width="2"/>`);
      pontos.forEach((p) => nos.push(`<span class="tv-soma" style="left:${p.px}px;top:${y}px" aria-hidden="true">${p.n}</span>`));
      const vencimentos = linha.itens.map((i) => prazos.get(i.servico.id).vence).filter((v) => v != null);
      const proximaData = vencimentos.length ? Math.min(...vencimentos) : null;
      const noX = ['vencido', 'atencao', 'desconhecido'].includes(pior) || proximaData == null ? agora : x(proximaData);
      nos.push(`<button type="button" class="tv-no aberto e-${pior} ${pior}" style="left:${noX}px;top:${y}px" data-abrir="${esc(linha.chave)}" aria-label="Abrir ${esc(linha.nome)}: ${ROTULO_ESTADO[pior]}"><i>${GLIFO_ESTADO[pior]}</i></button>`);
      rot.push(`<span class="tv-rotulo" style="left:${noX + (ctx.compacto ? 18 : 22)}px;top:${y}px">${tem ? resumoTarefas(linha.itens) : proximaData != null ? `Próximo: ~${esc(MES.format(proximaData))}` : ROTULO_ESTADO[pior]}</span>`);
      return;
    }
    const it = linha.item;
    const s = it.servico;
    esq.push(linha.unico
      ? `<div class="tv-l tv-unico"><b>${esc(it.componente.nome)}</b><span>${nomeAcao(s)}${s.conferir ? ' · Conferir' : ''}</span></div>`
      : `<div class="tv-l tv-sl"><span>${nomeAcao(s)}${s.conferir ? ' · Conferir' : ''}</span></div>`);
    if (linha.unico) fios.push(`<line x1="0" x2="${W}" y1="${y - RH / 2}" y2="${y - RH / 2}" stroke="var(--linha)"/>`);
    const meus = ctx.checks.filter((c) => c.servico === s.id);
    const irmaos = ctx.checks.filter((c) => c.servico !== s.id && c.resultado === 'substituido' && it.componente.servicos.some((o) => o.id === c.servico));
    const pontos = [...meus, ...irmaos].map((c) => x(quandoDoCheck(c, h)));
    if (it.conhecido && pontos.length) fios.push(`<line x1="${Math.min(...pontos)}" x2="${agora}" y1="${y}" y2="${y}" stroke="var(--tinta)" stroke-width="2.5"/>`);
    const { vence, seguintes } = prazos.get(s.id);
    meus.forEach((c) => {
      nos.push(`<button type="button" class="tv-no feito${ctx.novo === c.id ? ' novo' : ''}" style="left:${x(quandoDoCheck(c, h))}px;top:${y}px" data-ver="${esc(c.id)}" aria-label="${esc(it.componente.nome)}, ${nomeAcao(s)}: ${esc(RESULTADOS[c.resultado])}, ${esc(textoLeitura(c))}"><i>${GLIFO_CHECK[c.resultado]}</i></button>`);
    });
    irmaos.forEach((c) => {
      if (meus.some((m) => m.leitura === c.leitura)) return;
      nos.push(`<button type="button" class="tv-no reinicio" style="left:${x(quandoDoCheck(c, h))}px;top:${y}px" data-ver="${esc(c.id)}" aria-label="Reiniciado pela troca em ${esc(textoLeitura(c))}"><i>S</i></button>`);
    });
    // O próximo nó: atrás da linha do agora é atraso; sem check, fica no agora e abre a linha.
    const noX = it.estado === 'atencao' || !it.conhecido || vence == null ? agora : x(vence);
    const pede = ehTarefa(it);
    if (it.estado === 'vencido') fios.push(`<line x1="${noX}" x2="${agora}" y1="${y}" y2="${y}" stroke="var(--vencido)" stroke-width="4"/>`);
    if (it.conhecido && vence != null) {
      fios.push(`<line x1="${agora}" x2="${W}" y1="${y}" y2="${y}" stroke="var(--linha-forte)" stroke-width="1.5" stroke-dasharray="3 5"/>`);
      seguintes.filter((t) => t < FIM).forEach((t) => nos.push(`<span class="tv-ponto" style="left:${x(t)}px;top:${y}px"></span>`));
    }
    nos.push(`<button type="button" class="tv-no aberto e-${it.estado} ${it.estado}${pede ? ' pulsa' : ''}${classeMarcado(ctx, s.id)}" style="left:${noX}px;top:${y}px" data-reg="${esc(s.id)}"${pressionado(ctx, s.id)} aria-label="Registrar check: ${esc(it.componente.nome)}, ${nomeAcao(s)}. ${ROTULO_ESTADO[it.estado]}"><i>${GLIFO_ESTADO[it.estado]}</i></button>`);
    const proximo = vence != null ? `Próximo: ~${esc(MES.format(vence))}` : it.alvo ? `Próximo em ${esc(it.alvo)}` : esc(it.texto);
    rot.push(`<span class="tv-rotulo" style="left:${noX + (ctx.compacto ? 18 : 22)}px;top:${y}px">${pede ? `${tarefaHtml(it.estado)}<br>${esc(it.texto)}` : proximo}</span>`);
  });
  return `<div class="tv-trilha" data-agora="${agora}" style="--rh:${RH}px;--eixo:${EIXO}px">
    <div class="tv-esq"><div class="tv-cab"><button type="button" data-abrir-tudo>Abrir ou fechar tudo</button><button type="button" data-escala="${(nivel + 1) % ESCALAS.length}" aria-label="Régua a cada ${rotuloEscala(escala, h)}. Tocar muda a escala.">Régua ${rotuloEscala(escala, h)}</button></div>${esq.join('')}</div>
    <div class="tv-area" style="width:${W}px"><div class="tv-faixa">${eixo.join('')}</div>
      <div class="tv-pista" style="height:${altura}px"><svg width="${W}" height="${altura}" aria-hidden="true">${fios.join('')}</svg>${nos.join('')}${rot.join('')}</div></div></div>`;
}

// ---- Visitas

export function htmlVisitas(lista, ctx) {
  const h = criarHorizonte(ctx.leituras, ctx.hoje);
  const porServico = new Map(lista.map((i) => [i.servico.id, i]));
  const conhecidos = ctx.checks.filter((c) => porServico.has(c.servico));
  const cartaoCheck = (c) => {
    const e = porServico.get(c.servico);
    return `<button type="button" class="tv-cartao feito${ctx.novo === c.id ? ' novo' : ''}" data-ver="${esc(c.id)}"><b>${GLIFO_CHECK[c.resultado]} ${esc(e.componente.nome)}</b><span>${nomeAcao(e.servico)}: ${esc(RESULTADOS[c.resultado])}</span></button>`;
  };
  const cartaoServ = (i) => `<button type="button" class="tv-cartao pede e-${i.estado}${classeMarcado(ctx, i.servico.id)}" data-reg="${esc(i.servico.id)}"${pressionado(ctx, i.servico.id)}>${tarefaHtml(i.estado)}<b>${esc(i.componente.nome)}</b><span>${nomeAcao(i.servico)} · ${esc(i.texto)}</span></button>`;
  const cartaoFuturo = (i) => `<button type="button" class="tv-cartao${classeMarcado(ctx, i.servico.id)}" data-reg="${esc(i.servico.id)}"${pressionado(ctx, i.servico.id)}><b>${esc(i.componente.nome)}</b><span>${nomeAcao(i.servico)} · ${estadoHtml(i)}</span></button>`;
  const colunas = [];
  const atual = ultimaLeitura(ctx.leituras);
  const ehHoje = atual && diaLocal(atual.em) === diaLocal(ctx.hoje);
  ctx.leituras.filter((l) => !(ehHoje && l.id === atual.id)).forEach((l) => {
    const dele = conhecidos.filter((c) => c.leitura === l.id);
    if (!dele.length) return;
    colunas.push(`<div class="tv-col"><div class="tv-col-cab"><b>${l.km != null ? `${NUM.format(l.km)} km` : 'Sem km'}</b><small>${l.em != null ? esc(DATA.format(new Date(l.em))) : 'Sem data'} · ${dele.length} ${dele.length === 1 ? 'check' : 'checks'}</small></div>${dele.map(cartaoCheck).join('')}</div>`);
  });
  const agoraPede = lista.filter((i) => ['vencido', 'atencao', 'desconhecido'].includes(i.estado)).sort((a, b) => ORDEM_ESTADO[a.estado] - ORDEM_ESTADO[b.estado]);
  const deHoje = ehHoje ? conhecidos.filter((c) => c.leitura === atual.id) : [];
  colunas.push(`<div class="tv-col tv-agora"><div class="tv-col-cab"><b>Agora${atual ? ` · ${NUM.format(atual.km)} km` : ''}</b><small>${agoraPede.length} a fazer</small></div>${agoraPede.map(cartaoServ).join('')}${deHoje.map(cartaoCheck).join('')}</div>`);
  // Prazos próximos entre si formam uma visita: dá para fazer tudo na mesma ida à oficina.
  const resto = lista.filter((i) => !agoraPede.includes(i));
  const futuros = resto.map((i) => ({ i, t: prazoDoItem(i, h).vence })).filter((f) => f.t != null).sort((a, b) => a.t - b.t);
  const grupos = [];
  futuros.forEach((f) => {
    const g = grupos.at(-1);
    if (g && f.t - g[0].t <= 3 * MES_MS) g.push(f); else grupos.push([f]);
  });
  grupos.forEach((g) => {
    const km = h.kmDaData(g[0].t);
    colunas.push(`<div class="tv-col futuro"><div class="tv-col-cab"><b>~${esc(MES.format(g[0].t))}</b><small>${km != null ? `~${kmRedondo(km)} km · ` : ''}${g.length === 1 ? '1 serviço' : `${g.length} serviços juntos`}</small></div>${g.map(({ i }) => cartaoFuturo(i)).join('')}</div>`);
  });
  const semData = resto.filter((i) => !futuros.some((f) => f.i === i));
  if (semData.length) colunas.push(`<div class="tv-col futuro"><div class="tv-col-cab"><b>Sem data prevista</b><small>${semData.length === 1 ? '1 serviço' : `${semData.length} serviços`}</small></div>${semData.map(cartaoFuturo).join('')}</div>`);
  return `<div class="tv-visitas">${colunas.join('')}</div>`;
}

// ---- Grade

export function htmlGrade(lista, ctx) {
  const h = criarHorizonte(ctx.leituras, ctx.hoje);
  const abertos = ctx.abertos ?? TODOS_ABERTOS;
  const ls = leiturasVisiveis(ctx);
  const atual = ultimaLeitura(ctx.leituras);
  const linhaServico = (i, n, tamanho) => {
    const casas = ls.map((l) => {
      const c = ctx.checks.find((k) => k.leitura === l.id && k.servico === i.servico.id);
      if (c) return `<td><button type="button" class="tv-casa feito${ctx.novo === c.id ? ' novo' : ''}" data-ver="${esc(c.id)}" aria-label="${esc(i.componente.nome)}, ${nomeAcao(i.servico)}: ${esc(RESULTADOS[c.resultado])}, ${esc(textoLeitura(l))}"><i>${GLIFO_CHECK[c.resultado]}</i></button></td>`;
      const irmao = ctx.checks.find((k) => k.leitura === l.id && k.resultado === 'substituido' && i.componente.servicos.some((o) => o.id === k.servico));
      if (irmao) return `<td><button type="button" class="tv-casa reinicio" data-ver="${esc(irmao.id)}" aria-label="Reiniciado pela troca em ${esc(textoLeitura(l))}"><i>S</i></button></td>`;
      return `<td><button type="button" class="tv-casa vazia" data-reg="${esc(i.servico.id)}" data-leitura="${esc(l.id)}" aria-label="Registrar ${esc(i.componente.nome)}, ${nomeAcao(i.servico)}, em ${esc(textoLeitura(l))}"><i></i></button></td>`;
    }).join('');
    const { vence } = prazoDoItem(i, h);
    const prox = `${estadoHtml(i)}<small>${ehTarefa(i) || vence == null ? esc(i.texto) : `Próximo: ~${esc(MES.format(vence))}`}</small>`;
    return `<tr>${n === 0 ? `<th scope="rowgroup" class="cc" rowspan="${tamanho}">${esc(i.componente.nome)}</th>` : ''}<th scope="row" class="cs">${nomeAcao(i.servico)}${conferirHtml(i.servico)}</th>${casas}<td class="prox"><button type="button" class="${classeMarcado(ctx, i.servico.id).trim()}" data-reg="${esc(i.servico.id)}"${pressionado(ctx, i.servico.id)}>${prox}</button></td></tr>`;
  };
  const linhas = doSistema(lista).map((itens) => {
    const chave = `s:${itens[0].sistema.id}`;
    const ids = new Set(itens.map((i) => i.servico.id));
    const somas = ls.map((l) => {
      const n = ctx.checks.filter((c) => c.leitura === l.id && ids.has(c.servico)).length;
      return `<td>${n ? `<span class="tv-soma parada">${n}</span>` : ''}</td>`;
    }).join('');
    const pior = piorEstado(itens.map((i) => i.estado));
    const cab = `<tr class="tv-gsis"><th scope="rowgroup" colspan="2" class="cc"><button type="button" class="tv-abre" data-abrir="${esc(chave)}" aria-expanded="${abertos.has(chave)}">${SETA}<span>${esc(itens[0].sistema.nome)}</span><small>${itens.length}</small></button></th>${somas}<td class="prox">${itens.some(ehTarefa) ? resumoTarefas(itens) : marca(pior)}</td></tr>`;
    if (!abertos.has(chave)) return cab;
    return cab + doComponente(itens).map((g) => g.map((i, n) => linhaServico(i, n, g.length)).join('')).join('');
  }).join('');
  const cabecalho = ls.map((l) => {
    const hoje = l.id === atual?.id ? ' class="hoje"' : '';
    return `<th scope="col"${hoje}><b>${l.km != null ? NUM.format(l.km) : 'Sem km'}</b>${l.em != null ? esc(DATA.format(new Date(l.em))) : 'Sem data'}</th>`;
  }).join('');
  return `<table class="tv-grade"><thead><tr><th class="cc topo-fixo"></th><th class="cs topo-fixo"></th>${cabecalho}<th class="prox" scope="col">Próximo</th></tr></thead><tbody>${linhas}</tbody></table>`;
}

// ---- Peças

export function htmlPecas(lista, ctx) {
  const anel = (i) => {
    const pct = Math.round((i.fracao ?? 0) * 100);
    const cheio = i.fracao == null ? '' : ` style="background:conic-gradient(currentColor ${Math.max(pct, 2)}%, var(--linha) 0)"`;
    return `<button type="button" class="tv-anel-btn${classeMarcado(ctx, i.servico.id)}" data-reg="${esc(i.servico.id)}"${pressionado(ctx, i.servico.id)} aria-label="${esc(i.componente.nome)}, ${nomeAcao(i.servico)}. ${ROTULO_ESTADO[i.estado]}. ${esc(i.texto)}">
      <span class="tv-anel e-${i.estado} ${i.fracao == null ? 'sem-prazo' : ''}"${cheio}><i>${GLIFO_ESTADO[i.estado]}</i></span>
      <span>${nomeAcao(i.servico)}${conferirHtml(i.servico)}<br>${estadoHtml(i)}<br>${esc(i.texto)}</span></button>`;
  };
  const sistemas = new Map();
  for (const i of lista) sistemas.set(i.sistema.id, [...(sistemas.get(i.sistema.id) ?? []), i]);
  return `<div class="tv-pecas">${[...sistemas.values()].map((doSis) => `<div class="tv-sist"><b>${esc(doSis[0].sistema.nome)}</b>${doComponente(doSis).map((g) => `<div class="tv-peca"><span>${esc(g[0].componente.nome)}</span><div class="tv-aneis">${g.map(anel).join('')}</div></div>`).join('')}</div>`).join('')}</div>`;
}

// ---- Legenda: cada desenho e a entidade que ele representa.

const amostraServico = (e, texto) => `<li><span class="tv-no aberto e-${e} ${e} amostra"><i>${GLIFO_ESTADO[e]}</i></span>${texto}</li>`;
const amostraCheck = (r, texto) => `<li><span class="tv-no feito amostra"><i>${GLIFO_CHECK[r]}</i></span>${texto}</li>`;
const GRUPO_SERVICO = `<div><b>Bola grande: Serviço</b><ul>
  ${amostraServico('ok', 'Em dia')}${amostraServico('proximo', 'Próximo')}${amostraServico('atencao', 'Atenção')}${amostraServico('vencido', 'Vencido')}${amostraServico('desconhecido', 'Desconhecido')}${amostraServico('avaliar', 'Avaliar')}</ul></div>`;
const GRUPO_CHECK = `<div><b>Bola pequena: Check</b><ul>
  ${amostraCheck('ok', 'Tudo certo')}${amostraCheck('atencao', 'Atenção')}${amostraCheck('substituido', 'Substituí')}${amostraCheck('lubrificado', 'Lubrifiquei')}
  <li><span class="tv-no reinicio amostra"><i>S</i></span>Reiniciado pela troca</li></ul></div>`;
const TAREFA = `<div><b>Tarefa:</b><span>Serviço vencido, em atenção, desconhecido ou próximo</span></div>`;

export function htmlLegenda(view) {
  if (view === 'trilha') {
    return `${GRUPO_SERVICO}${GRUPO_CHECK}<div><b>Linhas</b><ul>
      <li><i class="tv-amostra-linha cheia"></i>Contando</li>
      <li><i class="tv-amostra-linha atraso"></i>Atraso</li>
      <li><i class="tv-amostra-linha agora"></i>Agora</li>
      <li><i class="tv-amostra-linha leitura"></i>Leitura (data e km)</li>
      <li><span class="tv-ponto amostra"></span>Próximas vezes (~ é estimativa)</li>
      <li><span class="tv-soma parada">3</span>Checks somados</li></ul></div>${TAREFA}`;
  }
  if (view === 'visitas') {
    return `<div><b>Coluna: Leitura ou próxima ida à oficina</b></div>
      <div><b>Cartão</b><ul>
        <li><span class="tv-amostra-cartao feito"></span>Check feito</li>
        <li><span class="tv-amostra-cartao pede"></span>Tarefa</li>
        <li><span class="tv-amostra-cartao"></span>Serviço que vem depois</li></ul></div>${TAREFA}`;
  }
  if (view === 'grade') {
    return `<div><b>Linha: Serviço · Coluna: Leitura · Cruzamento: Check</b></div>${GRUPO_CHECK}
      <div><ul><li><span class="tv-casa vazia amostra"><i></i></span>Sem check: toque para registrar</li><li><span class="tv-soma parada">3</span>Checks somados</li></ul></div>${TAREFA}`;
  }
  return `<div><b>Anel: Serviço</b><ul>
      <li><span class="tv-anel e-ok amostra" style="background:conic-gradient(currentColor 70%, var(--linha) 0)"><i>✓</i></span>Parte colorida: prazo que resta</li>
      <li><span class="tv-anel e-desconhecido sem-prazo amostra"><i>?</i></span>Sem check ou sem prazo</li></ul></div>${GRUPO_SERVICO}${TAREFA}`;
}

export const VIEWS = {
  trilha: { nome: 'Trilha', html: htmlTrilha },
  visitas: { nome: 'Visitas', html: htmlVisitas },
  grade: { nome: 'Grade', html: htmlGrade },
  pecas: { nome: 'Peças', html: htmlPecas },
};
