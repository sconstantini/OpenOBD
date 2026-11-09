// Sinais gravados: o resumo de cada coleta e os pontos de uma coleta inteira.
// O regime fica guardado: com o motor parado vários sinais são valores padrão da ECU, e o filtro evita que falseiem a média.

export const FILTROS_MOTOR = { ligado: 'Motor ligado', tudo: 'Tudo' };
const REGIMES_DO_FILTRO = { ligado: ['lenta', 'andando'], tudo: ['lenta', 'andando', 'desligado'] };

export const JANELAS = { sempre: 'Sempre', meses: '6 meses', dias: '30 dias' };
const DIAS_DA_JANELA = { meses: 183, dias: 30 };

const PONTOS_POR_GRAFICO = 160;

export function regimeAtual(veiculo, velocidade) {
  if (veiculo === 'motor') return velocidade > 0 ? 'andando' : 'lenta';
  return veiculo === 'chave' || veiculo === 'desligado' ? 'desligado' : null;
}

export function acumular(resumo, a, regime) {
  if (!regime || !a.principal || a.st !== 'ok' || typeof a.v !== 'number') return resumo;
  const r = ((resumo[a.pid] ??= {})[regime] ??= { n: 0, soma: 0, min: a.v, max: a.v });
  r.n += 1;
  r.soma += a.v;
  r.min = Math.min(r.min, a.v);
  r.max = Math.max(r.max, a.v);
  return resumo;
}

// Uma tentativa de conexão que não leu nada não é uma coleta para olhar.
export const temSinais = (s) => Object.keys(s.resumo ?? {}).length > 0;

// O simulador não entra no histórico de um carro real. Só aparece enquanto não há coleta real.
export const coletasDoHistorico = (sessoes) => {
  const reais = sessoes.filter((s) => !s.simulado && temSinais(s));
  return reais.length ? reais : sessoes;
};

export function coletasDaJanela(sessoes, janela, agora = Date.now()) {
  const dias = DIAS_DA_JANELA[janela];
  return dias ? sessoes.filter((s) => s.inicio >= agora - dias * 86400000) : sessoes;
}

function somarRegimes(porRegime, filtro) {
  const partes = REGIMES_DO_FILTRO[filtro].map((r) => porRegime?.[r]).filter(Boolean);
  if (!partes.length) return null;
  return {
    n: partes.reduce((a, r) => a + r.n, 0),
    soma: partes.reduce((a, r) => a + r.soma, 0),
    min: Math.min(...partes.map((r) => r.min)),
    max: Math.max(...partes.map((r) => r.max)),
  };
}

export function serieDoSinal(sessoes, pid, filtro) {
  return sessoes.flatMap((s) => {
    const r = somarRegimes(s.resumo?.[pid], filtro);
    return r ? [{ id: s.id, inicio: s.inicio, media: r.soma / r.n, min: r.min, max: r.max, n: r.n }] : [];
  }).sort((a, b) => a.inicio - b.inicio);
}

export const sinaisComDado = (sessoes, filtro) => new Set(sessoes.flatMap((s) => Object.keys(s.resumo ?? {}).filter((p) => somarRegimes(s.resumo[p], filtro))));

// Os pontos de cada sinal em uma coleta. Sinais em texto, como a norma OBD, guardam só o último valor.
export function sinaisDaColeta(amostras) {
  const sinais = new Map();
  for (const a of amostras) {
    if (!a.principal || a.st !== 'ok' || a.v == null || a.pid === 'EVENTO') continue;
    const s = sinais.get(a.pid) ?? { pontos: [], texto: null };
    if (typeof a.v === 'number') s.pontos.push({ t: a.em, v: a.v });
    else s.texto = a.v;
    sinais.set(a.pid, s);
  }
  return sinais;
}

export function medidas(pontos) {
  const valores = pontos.map((p) => p.v);
  return { min: Math.min(...valores), max: Math.max(...valores), media: valores.reduce((a, v) => a + v, 0) / valores.length };
}

// Uma coleta longa tem mais pontos do que o gráfico tem largura. Cada trecho guarda o menor e o maior, para os picos não sumirem.
export function reduzirPontos(pontos, alvo = PONTOS_POR_GRAFICO) {
  if (pontos.length <= alvo) return pontos;
  const trechos = Math.floor(alvo / 2);
  const saida = [];
  for (let i = 0; i < trechos; i++) {
    const trecho = pontos.slice(Math.floor((i * pontos.length) / trechos), Math.floor(((i + 1) * pontos.length) / trechos));
    const menor = trecho.reduce((a, p) => (p.v < a.v ? p : a));
    const maior = trecho.reduce((a, p) => (p.v > a.v ? p : a));
    if (menor === maior) saida.push(menor);
    else saida.push(...(menor.t <= maior.t ? [menor, maior] : [maior, menor]));
  }
  return saida;
}
