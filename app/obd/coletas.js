// Coletas: cada amostra vai para o banco do aparelho com a data e a hora do próprio aparelho.
import { abrirBanco, esvaziar } from '../banco.js';
import { CATALOGO } from './sinais.js';
import { acumular } from './historico.js';

const INTERVALO_GRAVACAO = 2000;
const COLUNAS = ['data_hora', 'fuso_min', 'pid', 'nome', 'ecu', 'principal', 'status', 'valor', 'extra', 'unidade', 'bytes', 'latencia_ms'];

const tx = (req) => new Promise((ok, falha) => { req.onsuccess = () => ok(req.result); req.onerror = () => falha(req.error); });
const fim = (t) => new Promise((ok, falha) => { t.oncomplete = ok; t.onerror = () => falha(t.error); t.onabort = () => falha(t.error); });

export class Gravador {
  constructor() {
    this.fila = [];
    this.sessao = null;
    this.gravando = Promise.resolve();
    this.erro = '';
  }

  async abrir(meta) {
    const db = await abrirBanco();
    const inicio = Date.now();
    this.sessao = { inicio, fim: inicio, fuso: -new Date(inicio).getTimezoneOffset(), n: 0, resumo: {}, ...meta };
    const t = db.transaction('sessoes', 'readwrite');
    this.sessao.id = await tx(t.objectStore('sessoes').add(this.sessao));
    this.timer = setInterval(() => this.descarregar(), INTERVALO_GRAVACAO);
    return this.sessao;
  }

  amostra(a, regime = null) {
    if (!this.sessao) return;
    this.fila.push({ ...a, sessao: this.sessao.id });
    acumular(this.sessao.resumo, a, regime);
  }

  evento(texto) {
    this.amostra({ em: Date.now(), pid: 'EVENTO', ecu: '', principal: true, st: 'ok', v: null, x: texto, b: '', lat: 0 });
  }

  // Em lote e em sequência: uma falha de gravação não pode travar a leitura do carro.
  descarregar() {
    this.gravando = this.gravando.then(async () => {
      if (!this.sessao || !this.fila.length) return;
      const lote = this.fila;
      this.fila = [];
      try {
        const db = await abrirBanco();
        const t = db.transaction(['amostras', 'sessoes'], 'readwrite');
        const l = t.objectStore('amostras');
        lote.forEach((x) => l.add(x));
        this.sessao.n += lote.length;
        this.sessao.fim = lote.at(-1).em;
        t.objectStore('sessoes').put({ ...this.sessao });
        await fim(t);
        this.erro = '';
      } catch (e) {
        this.fila = lote.concat(this.fila);
        this.erro = e.message || String(e);
      }
    });
    return this.gravando;
  }

  async fechar() {
    clearInterval(this.timer);
    await this.descarregar();
    this.sessao = null;
  }
}

export async function listarSessoes() {
  const db = await abrirBanco();
  const lista = await tx(db.transaction('sessoes').objectStore('sessoes').getAll());
  return lista.sort((a, b) => b.inicio - a.inicio);
}

export async function excluirSessao(id) {
  const db = await abrirBanco();
  const t = db.transaction(['sessoes', 'amostras'], 'readwrite');
  t.objectStore('sessoes').delete(id);
  const r = t.objectStore('amostras').index('sessao').openKeyCursor(IDBKeyRange.only(id));
  r.onsuccess = () => {
    if (!r.result) return;
    t.objectStore('amostras').delete(r.result.primaryKey);
    r.result.continue();
  };
  await fim(t);
}

// Data e hora locais do aparelho, com o fuso de quando a leitura foi feita.
export function dataHoraLocal(ms, fusoMin) {
  const d = new Date(ms + fusoMin * 60000).toISOString().slice(0, -1);
  const sinal = fusoMin < 0 ? '-' : '+';
  const abs = Math.abs(fusoMin);
  return `${d}${sinal}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

const celula = (v) => {
  if (v == null) return '';
  const t = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  return /[;"\n]/.test(t) ? `"${t.replaceAll('"', '""')}"` : t;
};

export function linhaCsv(a, fuso) {
  const s = CATALOGO[a.pid];
  return [dataHoraLocal(a.em, fuso), fuso, a.pid, a.pid === 'EVENTO' ? 'Evento' : s?.nome ?? a.pid, a.ecu, a.principal ? 1 : 0, a.st, a.v, a.x, s?.unidade ?? '', a.b, a.lat].map(celula).join(';');
}

export async function amostrasDaSessao(id) {
  const db = await abrirBanco();
  return tx(db.transaction('amostras').objectStore('amostras').index('sessao').getAll(IDBKeyRange.only(id)));
}

export async function csvDaSessao(sessao) {
  const linhas = await amostrasDaSessao(sessao.id);
  return [COLUNAS.join(';'), ...linhas.map((a) => linhaCsv(a, sessao.fuso))].join('\n');
}

// Todas as coletas em um arquivo só, com a coleta de cada linha na primeira coluna.
export async function csvDeTodas(sessoes) {
  const partes = [`coleta;simulado;${COLUNAS.join(';')}`];
  for (const s of [...sessoes].sort((a, b) => a.inicio - b.inicio)) {
    for (const a of await amostrasDaSessao(s.id)) partes.push(`${s.id};${s.simulado ? 1 : 0};${linhaCsv(a, s.fuso)}`);
  }
  return partes.join('\n');
}

export const apagarColetas = () => esvaziar(['sessoes', 'amostras']);

export async function espacoUsado() {
  try { return await navigator.storage.estimate(); } catch { return null; }
}
