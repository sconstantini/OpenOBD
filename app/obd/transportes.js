// Conexão com o adaptador. O monitor só conhece esta interface:
//   listar() -> [{ nome, endereco }]
//   abrir(endereco)
//   comando(texto, timeoutMs) -> texto respondido pelo ELM327; '(sem resposta)' se não vier o prompt
//   fechar()
//   interromper(), opcional: solta o que estiver preso na conexão

// Android: o APK expõe window.ObdNativo sobre o Bluetooth do aparelho. A resposta volta depois, por
// window.obdNativoResposta, porque uma chamada direta travaria a tela a cada pergunta ao carro.
export class TransporteAndroid {
  tipo = 'android';
  rotulo = 'Bluetooth deste aparelho';

  static disponivel() { return typeof window !== 'undefined' && Boolean(window.ObdNativo); }

  constructor() {
    this.pendentes = new Map();
    this.n = 0;
    window.obdNativoResposta = (id, ok, valor) => {
      const p = this.pendentes.get(id);
      this.pendentes.delete(id);
      if (ok) p?.ok(valor); else p?.falha(new Error(valor));
    };
  }

  pedir(metodo, ...args) {
    return new Promise((ok, falha) => {
      const id = ++this.n;
      this.pendentes.set(id, { ok, falha });
      window.ObdNativo.pedir(id, metodo, JSON.stringify(args));
    });
  }

  async listar() { return JSON.parse(await this.pedir('listar')); }
  abrir(endereco) { return this.pedir('abrir', endereco); }
  comando(texto, timeoutMs) { return this.pedir('comando', texto, timeoutMs); }
  fechar() { return this.pedir('fechar'); }
  // Fora da fila de pedidos: é o que solta um pedido preso esperando o adaptador.
  interromper() { window.ObdNativo.interromper(); }
}

// Simulador: responde como um carro KWP com dois módulos, para testar o app sem carro.
const PIDS_MOTOR = [0x01, 0x03, 0x04, 0x05, 0x06, 0x07, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x13, 0x15, 0x1c, 0x21, 0x34];
const LINHA_DO_TEMPO = [['desligado', 12000], ['chave', 10000], ['motor', 60000], ['chave', 6000]];

function quadro(ecu, dados) {
  const b = [0x80 | dados.length, 0xf1, ecu, ...dados];
  b.push(b.reduce((a, x) => a + x, 0) & 0xff);
  return b.map((x) => x.toString(16).toUpperCase().padStart(2, '0')).join('');
}

function mascara(pids, base) {
  let m = 0;
  for (const p of pids) if (p > base && p <= base + 32) m += 2 ** (32 - (p - base));
  return [(m / 2 ** 24) & 255, (m / 2 ** 16) & 255, (m / 2 ** 8) & 255, m & 255];
}

export class TransporteSimulado {
  tipo = 'simulador';
  rotulo = 'Simulador';

  constructor({ relogio = () => Date.now(), latencia = 40, estadoFixo = null } = {}) {
    Object.assign(this, { relogio, latencia, estadoFixo, t0: relogio(), aberto: false });
  }

  async listar() { return [{ nome: 'Simulador', endereco: 'simulador' }]; }

  async abrir() { this.aberto = true; this.t0 = this.relogio(); }

  async fechar() { this.aberto = false; }

  estado() {
    if (this.estadoFixo) return this.estadoFixo;
    const total = LINHA_DO_TEMPO.reduce((a, [, d]) => a + d, 0);
    let t = (this.relogio() - this.t0) % total;
    for (const [nome, d] of LINHA_DO_TEMPO) {
      if (t < d) return nome;
      t -= d;
    }
    return 'desligado';
  }

  valor(pid, estado, t) {
    const motor = estado === 'motor';
    const onda = Math.sin(t / 1400);
    const rpm = motor ? 780 + onda * 25 : 0;
    const tabela = {
      0x01: [0x00, 0x07, 0x65, 0x21], 0x03: [motor ? 2 : 0, 0], 0x04: [motor ? 60 : 0], 0x05: [Math.min(128, 90 + t / 3000)],
      0x06: [motor ? 132 + onda * 4 : 128], 0x07: [128], 0x0b: [motor ? 28 : 91], 0x0c: [Math.floor((rpm * 4) / 256), Math.floor(rpm * 4) & 255],
      0x0d: [0], 0x0e: [motor ? 150 : 128], 0x0f: [70], 0x10: [0, motor ? 240 : 0], 0x11: [motor ? 34 : 41], 0x13: [0x03],
      0x15: [motor ? 130 : 0, 0xff], 0x1c: [29], 0x21: [0, 0], 0x34: [128, 0, 128, 0],
    };
    return tabela[pid].map((v) => Math.round(v) & 255);
  }

  async comando(texto) {
    await new Promise((ok) => { setTimeout(ok, this.latencia); });
    if (!this.aberto) throw new Error('simulador fechado');
    const c = texto.toUpperCase();
    const estado = this.estado();
    if (c === 'ATZ' || c === 'ATI') return 'ELM327 v1.5 (simulado)\r\r>';
    if (c === 'ATRV') return `${estado === 'motor' ? '14.5' : '12.6'}V\r\r>`;
    if (c === 'ATDP') return 'AUTO, ISO 14230-4 (KWP FAST)\r\r>';
    if (c === 'ATDPN') return 'A5\r\r>';
    if (c.startsWith('AT')) return 'OK\r\r>';
    if (estado === 'desligado') return 'NO DATA\r\r>';
    const pid = parseInt(c.slice(2), 16);
    if (pid % 0x20 === 0) {
      if (pid > 0x20) return 'NO DATA\r\r>';
      const motor = quadro(0x11, [0x41, pid, ...mascara(PIDS_MOTOR, pid)]);
      return `${motor}\r${pid === 0 ? `${quadro(0x19, [0x41, 0, ...mascara([0x01, 0x20], 0)])}\r` : quadro(0x19, [0x41, 0x20, ...mascara([0x21], 0x20)])}\r>`;
    }
    if (!PIDS_MOTOR.includes(pid)) return 'NO DATA\r\r>';
    const dados = quadro(0x11, [0x41, pid, ...this.valor(pid, estado, this.relogio() - this.t0)]);
    return `${dados}\r${pid === 0x21 ? `${quadro(0x19, [0x41, 0x21, 0, 0])}\r` : ''}\r>`;
  }
}
