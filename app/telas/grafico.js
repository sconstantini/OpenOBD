// Gráficos dos sinais: uma coleta ao longo do tempo e um sinal ao longo das coletas. A escala se ajusta aos dados de cada um.
import { esc } from './comum.js';

const L = 640, A = 220, ESQ = 58, DIR = 16, TOPO = 12, BASE = 28;
const DATA = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: '2-digit' });
const HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const formato = (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const QUEBRA_MS = 90000;  // sem leitura por mais que isto, a linha para: a conexão caiu

// Marcas em números redondos, do menor ao maior valor. Uma variação mínima não pode virar uma montanha na tela.
export function escalaBonita(menor, maior, quantas = 4) {
  const minima = Math.abs(maior) * 0.02 || 1;
  if (maior - menor < minima) {
    const piso = menor >= 0;
    const meio = (menor + maior) / 2;
    menor = meio - minima / 2;
    maior = meio + minima / 2;
    if (piso && menor < 0) { maior -= menor; menor = 0; }
  }
  const bruto = (maior - menor) / (quantas - 1);
  const ordem = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].find((m) => bruto <= m * ordem * 1.000001) * ordem;
  const redondo = (v) => Number(v.toFixed(10));
  const de = redondo(Math.floor(menor / passo + 1e-9) * passo);
  const ate = redondo(Math.ceil(maior / passo - 1e-9) * passo);
  const marcas = [];
  for (let i = 0; de + i * passo <= ate + passo / 1000; i++) marcas.push(redondo(de + i * passo));
  return { de, ate, marcas };
}

export function htmlGrafico(serie, unidade = '') {
  if (!serie.length) return '';
  const { de, ate, marcas } = escalaBonita(Math.min(...serie.map((p) => p.min)), Math.max(...serie.map((p) => p.max)));
  const t0 = serie[0].inicio;
  const t1 = serie.at(-1).inicio;
  const x = (t) => (t1 === t0 ? (ESQ + L - DIR) / 2 : ESQ + ((t - t0) / (t1 - t0)) * (L - ESQ - DIR));
  const y = (v) => TOPO + ((ate - v) / (ate - de)) * (A - TOPO - BASE);
  const pontos = (f) => serie.map((p) => `${x(p.inicio).toFixed(1)},${y(f(p)).toFixed(1)}`);
  const grade = marcas.map((v) => `<line class="g-grade" x1="${ESQ}" x2="${L - DIR}" y1="${y(v)}" y2="${y(v)}"/><text class="g-txt" x="${ESQ - 8}" y="${y(v) + 4}" text-anchor="end">${esc(formato(v))}</text>`).join('');
  const faixa = serie.length > 1
    ? `<polygon class="g-faixa" points="${[...pontos((p) => p.max), ...pontos((p) => p.min).reverse()].join(' ')}"/>`
    : `<line class="g-haste" x1="${x(t0)}" x2="${x(t0)}" y1="${y(serie[0].max)}" y2="${y(serie[0].min)}"/>`;
  const datas = serie.length > 1
    ? `<text class="g-txt" x="${ESQ}" y="${A - 8}">${esc(DATA.format(t0))}</text><text class="g-txt" x="${L - DIR}" y="${A - 8}" text-anchor="end">${esc(DATA.format(t1))}</text>`
    : `<text class="g-txt" x="${x(t0)}" y="${A - 8}" text-anchor="middle">${esc(DATA.format(t0))}</text>`;
  const descricao = `Média de cada coleta${unidade ? `, em ${unidade}` : ''}, com a faixa do mínimo ao máximo.`;
  return `<svg class="grafico" viewBox="0 0 ${L} ${A}" role="img" aria-label="${esc(descricao)}">${grade}${faixa}
    ${serie.length > 1 ? `<polyline class="g-linha" points="${pontos((p) => p.media).join(' ')}"/>` : ''}
    ${serie.map((p) => `<circle class="g-ponto" cx="${x(p.inicio)}" cy="${y(p.media)}" r="4"><title>${esc(DATA.format(p.inicio))}: ${esc(formato(p.media))}${unidade ? ` ${esc(unidade)}` : ''}</title></circle>`).join('')}${datas}</svg>`;
}

// Um sinal dentro de uma coleta, em pontos { t, v }. Cabe em um cartão e é redesenhado a cada segundo.
export function htmlCurva(pontos, nome = '') {
  const LC = 320, AC = 128, EC = 42, DC = 8, TC = 8, BC = 18;
  if (!pontos.length) return '';
  const valores = pontos.map((p) => p.v);
  const menor = Math.min(...valores);
  const maior = Math.max(...valores);
  const { de, ate, marcas } = escalaBonita(menor, maior);
  const t0 = pontos[0].t;
  const t1 = pontos.at(-1).t;
  const x = (t) => (t1 === t0 ? LC - DC : EC + ((t - t0) / (t1 - t0)) * (LC - EC - DC));
  const y = (v) => TC + ((ate - v) / (ate - de)) * (AC - TC - BC);
  const grade = marcas.map((v) => `<line class="g-grade" x1="${EC}" x2="${LC - DC}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="g-txt-p" x="${EC - 5}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end">${esc(formato(v))}</text>`).join('');
  const caminho = pontos.map((p, i) => `${i && p.t - pontos[i - 1].t <= QUEBRA_MS ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join('');
  const ultimo = pontos.at(-1);
  const horas = t1 === t0 ? '' : `<text class="g-txt-p" x="${EC}" y="${AC - 4}">${esc(HORA.format(t0))}</text><text class="g-txt-p" x="${LC - DC}" y="${AC - 4}" text-anchor="end">${esc(HORA.format(t1))}</text>`;
  return `<svg class="curva" viewBox="0 0 ${LC} ${AC}" role="img" aria-label="${esc(`${nome}: de ${formato(menor)} a ${formato(maior)}`)}">${grade}<path class="g-linha" d="${caminho}"/><circle class="g-ponto" cx="${x(ultimo.t).toFixed(1)}" cy="${y(ultimo.v).toFixed(1)}" r="3"/>${horas}</svg>`;
}
