// Interpretação das respostas do ELM327. Sem DOM nem Bluetooth: roda também no Node.

export const SEM_RESPOSTA = '(sem resposta)';
const MASCARAS = new Set([0x00, 0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0, 0xe0]);
const HEX = /^[0-9A-F]+$/;

// O app só lê. Limpar códigos (modo 04) e qualquer escrita ficam bloqueados aqui.
const AT_PERMITIDOS = new Set(['ATZ', 'ATE0', 'ATL0', 'ATS0', 'ATH1', 'ATAT1', 'ATSP0', 'ATI', 'ATRV', 'ATDP', 'ATDPN']);
const MODOS_LEITURA = new Set(['01', '02', '03', '06', '07', '09', '0A']);

export function comandoPermitido(c) {
  const s = c.toUpperCase().replaceAll(' ', '');
  if (s.startsWith('AT')) return AT_PERMITIDOS.has(s);
  return HEX.test(s) && s.length % 2 === 0 && MODOS_LEITURA.has(s.slice(0, 2));
}

export function limparLinhas(resp, cmd = '') {
  const alvo = cmd.toUpperCase().replaceAll(' ', '');
  return resp.replaceAll('\0', '').replaceAll('>', '').replaceAll('\r', '\n').split('\n')
    .map((l) => l.trim())
    .filter((l) => {
      const up = l.toUpperCase();
      return l && !up.startsWith('SEARCHING') && !up.startsWith('BUS INIT') && !(alvo && up.replaceAll(' ', '') === alvo);
    });
}

function hexParaBytes(s) {
  const t = s.replaceAll(' ', '');
  if (t.length % 2 || (t && !/^[0-9A-Fa-f]+$/.test(t))) return null;
  const b = [];
  for (let i = 0; i < t.length; i += 2) b.push(parseInt(t.slice(i, i + 2), 16));
  return b;
}

// KWP não depende das quebras de linha: há adaptador que quebra a cada 11 bytes e emenda quadros,
// como em "84F11141210000E884F119" seguido de "41210000F0".
function fluxoKwp(resp) {
  const linhas = limparLinhas(resp).map((l) => l.replaceAll(' ', '').toUpperCase()).filter((l) => HEX.test(l));
  const b = linhas.length ? hexParaBytes(linhas.join('')) : null;
  return b && b.length && (b[0] & 0xc0) === 0x80 ? b : null;
}

function lerKwp(b) {
  const msgs = [];
  let i = 0;
  while (i < b.length) {
    let n = b[i] & 0x3f;
    let ini = i + 3;
    if (!n && ini < b.length) { n = b[ini]; ini += 1; }
    const fim = ini + n;
    const soma = b.slice(i, fim).reduce((a, x) => a + x, 0) & 0xff;
    if ((b[i] & 0xc0) !== 0x80 || fim >= b.length || soma !== b[fim]) return { msgs, truncado: true };
    msgs.push({ ecu: b[i + 2].toString(16).toUpperCase().padStart(2, '0'), payload: b.slice(ini, fim) });
    i = fim + 1;
  }
  return { msgs, truncado: false };
}

export function lerQuadros(resp, ehCan) {
  if (!ehCan) {
    const fluxo = fluxoKwp(resp);
    if (fluxo) return lerKwp(fluxo);
  }
  const msgs = [];
  let truncado = false;
  const abertos = new Map();
  let semCab = [];
  let semCabTotal = null;
  for (const linha of limparLinhas(resp)) {
    const s = linha.replaceAll(' ', '').toUpperCase();
    if (s.includes(':')) {
      const b = hexParaBytes(s.split(':')[1]);
      if (b) semCab = semCab.concat(b); else truncado = true;
      continue;
    }
    if (s.length <= 3 && /^0[0-9A-F]+$/.test(s)) { semCabTotal = parseInt(s, 16); continue; }
    if (!HEX.test(s)) continue;
    if (['41', '42', '43', '46', '47', '49', '4A'].includes(s.slice(0, 2))) {
      const b = hexParaBytes(s);
      if (b?.length) msgs.push({ ecu: '?', payload: b }); else truncado = true;
      continue;
    }
    if (ehCan) {
      const longo = s.startsWith('18DA') && s.length >= 10;
      const ecu = longo ? s.slice(0, 8) : s.slice(0, 3);
      const corpo = hexParaBytes(longo ? s.slice(8) : s.slice(3));
      if (!corpo?.length) { truncado = true; continue; }
      const tipo = corpo[0] >> 4;
      if (tipo === 0) {
        const n = corpo[0] & 0xf;
        if (corpo.length - 1 < n) truncado = true; else msgs.push({ ecu, payload: corpo.slice(1, 1 + n) });
      } else if (tipo === 1 && corpo.length >= 2) {
        abertos.set(ecu, { total: ((corpo[0] & 0xf) << 8) | corpo[1], seq: 1, buf: corpo.slice(2) });
      } else if (tipo === 2 && abertos.has(ecu)) {
        const a = abertos.get(ecu);
        if ((corpo[0] & 0xf) !== (a.seq & 0xf)) { truncado = true; abertos.delete(ecu); continue; }
        a.buf = a.buf.concat(corpo.slice(1));
        a.seq += 1;
        if (a.buf.length >= a.total) { msgs.push({ ecu, payload: a.buf.slice(0, a.total) }); abertos.delete(ecu); }
      }
    } else {
      const b = hexParaBytes(s);
      if (!b || b.length < 5) { truncado = true; continue; }
      const ini = b[0] & 0x80 && !(b[0] & 0x3f) ? 4 : 3;
      msgs.push({ ecu: b[2].toString(16).toUpperCase().padStart(2, '0'), payload: b.slice(ini, -1) });
    }
  }
  if (semCab.length) {
    if (semCabTotal !== null) {
      truncado = truncado || semCab.length < semCabTotal;
      semCab = semCab.slice(0, semCabTotal);
    }
    msgs.push({ ecu: '?', payload: semCab });
  }
  return { msgs, truncado: truncado || abertos.size > 0 };
}

export function lerModo01(resp, pid, ehCan) {
  return lerQuadros(resp, ehCan).msgs
    .filter((m) => m.payload.length >= 2 && m.payload[0] === 0x41 && m.payload[1] === pid)
    .map((m) => ({ ecu: m.ecu, dados: m.payload.slice(2) }));
}

export function lerMascaras(resp, base, ehCan) {
  const out = {};
  for (const { ecu, dados: b } of lerModo01(resp, base, ehCan)) {
    if (b.length < 4) continue;
    const mask = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
    out[ecu] = [];
    for (let i = 0; i < 32; i++) if (mask & (1 << (31 - i))) out[ecu].push(base + i + 1);
  }
  return out;
}

export const ehMascara = (pid) => MASCARAS.has(pid);

const ERROS_ELM = [
  ['NO DATA', 'sem_dado'], ['UNABLE TO CONNECT', 'sem_conexao'], ['BUFFER FULL', 'erro_adaptador'],
  ['CAN ERROR', 'erro_barramento'], ['BUS ERROR', 'erro_barramento'], ['BUS BUSY', 'erro_barramento'],
  ['FB ERROR', 'erro_barramento'], ['DATA ERROR', 'quebrado'], ['RX ERROR', 'quebrado'], ['<', 'quebrado'],
  ['STOPPED', 'interrompido'], ['ACT ALERT', 'reiniciou'], ['LP ALERT', 'reiniciou'], ['LV RESET', 'reiniciou'],
  ['ELM327', 'reiniciou'], ['ERROR', 'erro_adaptador'], ['?', 'erro_adaptador'],
];

export function statusResposta(resp) {
  const up = resp.toUpperCase();
  if (up.includes(SEM_RESPOSTA.toUpperCase())) return 'sem_resposta';
  for (const [texto, st] of ERROS_ELM) if (up.includes(texto)) return st;
  return 'ok';
}

export function lerTensao(resp) {
  const m = /(\d+(?:\.\d+)?)\s*V/.exec(resp);
  return m ? Number(m[1]) : null;
}
