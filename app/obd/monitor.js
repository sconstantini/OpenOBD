// Monitor: mantém a conexão, descobre o estado do veículo e lê os sinais em ciclo.
import { ID_BATERIA, CATALOGO, PERIODOS, decodificar } from './sinais.js';
import { comandoPermitido, ehMascara, lerMascaras, lerModo01, lerTensao, limparLinhas, statusResposta } from './protocolo.js';

export const ESTADOS_VEICULO = { desconhecido: 'Veículo sem leitura', desligado: 'Veículo desligado', chave: 'Chave ligada', motor: 'Motor ligado' };
export const ESTADOS_ADAPTADOR = { desconectado: 'Adaptador desconectado', conectando: 'Conectando', conectado: 'Adaptador conectado', reconectando: 'Reconectando' };

const MAX_SEM_RESPOSTA = 8;     // seguidas: o adaptador foi perdido
const REBAIXA_APOS = 5;         // falhas seguidas do mesmo sinal: passa a ler devagar
const ECU_MUDA_APOS = 5;        // respostas seguidas sem a ECU: veículo desligado
const INTERVALO_SONDA = 10000;  // com o veículo desligado, pergunta devagar para não ocupar o barramento
const ESPERA_RECONEXAO = 5000;

export class Monitor {
  constructor({ transporte, endereco, aoMudar = () => {}, aoAmostra = () => {}, aoEvento = () => {}, relogio = () => Date.now(), dormir = null }) {
    Object.assign(this, { transporte, endereco, aoMudar, aoAmostra, aoEvento, relogio });
    this.dormirBase = dormir ?? ((ms) => new Promise((ok) => { setTimeout(ok, ms); }));
    this.adaptador = 'desconectado';
    this.veiculo = 'desconhecido';
    this.protocolo = '';
    this.erro = '';
    this.ehCan = false;
    this.suporte = {};
    this.principal = null;
    this.proxima = new Map();
    this.falhas = new Map();
    this.semResposta = 0;
    this.semEcu = 0;
    this.parado = false;
    this.laco = null;
  }

  iniciar() {
    this.parado = false;
    this.laco = this.rodar();
    return this.laco;
  }

  async parar() {
    this.parado = true;
    await this.laco;
  }

  async dormir(ms) {
    const fim = this.relogio() + ms;
    while (!this.parado && this.relogio() < fim) await this.dormirBase(Math.min(200, Math.max(1, fim - this.relogio())));
  }

  definir(mudanca) {
    const antes = { adaptador: this.adaptador, veiculo: this.veiculo };
    Object.assign(this, mudanca);
    if (antes.veiculo !== this.veiculo) this.aoEvento(ESTADOS_VEICULO[this.veiculo]);
    if (antes.adaptador !== this.adaptador) this.aoEvento(ESTADOS_ADAPTADOR[this.adaptador]);
    this.aoMudar(this);
  }

  async rodar() {
    let primeira = true;
    while (!this.parado) {
      try {
        this.definir({ adaptador: primeira ? 'conectando' : 'reconectando', veiculo: 'desconhecido' });
        await this.transporte.abrir(this.endereco);
        await this.inicializar();
        this.definir({ adaptador: 'conectado', erro: '' });
        primeira = false;
        await this.acompanhar();
      } catch (e) {
        if (this.parado) break;
        primeira = false;
        this.definir({ erro: e.message || String(e), adaptador: 'reconectando', veiculo: 'desconhecido' });
        await this.fecharTransporte();
        await this.dormir(ESPERA_RECONEXAO);
      }
    }
    await this.fecharTransporte();
    this.definir({ adaptador: 'desconectado', veiculo: 'desconhecido' });
  }

  async fecharTransporte() {
    try { await this.transporte.fechar(); } catch { /* conexão já caiu */ }
  }

  async cmd(c, timeoutMs = 2000) {
    if (!comandoPermitido(c)) throw new Error(`comando bloqueado: ${c}`);
    return limparLinhas(await this.transporte.comando(c, timeoutMs), c).join('\n');
  }

  async configurar() {
    for (const c of ['ATE0', 'ATL0', 'ATS0', 'ATH1', 'ATAT1']) await this.cmd(c);
  }

  async inicializar() {
    await this.cmd('ATZ', 5000);
    await this.dormir(500);
    await this.configurar();
    await this.cmd('ATSP0');
    if (statusResposta(await this.cmd('ATI')) === 'sem_resposta') throw new Error('o adaptador não respondeu');
    this.semResposta = 0;
  }

  async acompanhar() {
    let lendo = false;
    while (!this.parado) {
      if (lendo) lendo = await this.lerProximo();
      else lendo = await this.sondar();
    }
  }

  // Sem resposta da ECU o adaptador ainda informa a tensão, medida no próprio conector.
  async sondar() {
    await this.lerSinal(ID_BATERIA);
    await this.descobrir();
    if (this.parado) return false;
    const pids = [...new Set(Object.values(this.suporte).flat())].sort((a, b) => a - b);
    if (!pids.length) {
      this.definir({ veiculo: 'desligado' });
      await this.dormir(INTERVALO_SONDA);
      return false;
    }
    const agora = this.relogio();
    this.proxima = new Map([...pids.map((p) => [p.toString(16).toUpperCase().padStart(2, '0'), agora]), [ID_BATERIA, agora]]);
    this.falhas.clear();
    this.semEcu = 0;
    this.protocolo = await this.cmd('ATDP');
    this.definir({ veiculo: 'chave' });
    return true;
  }

  async descobrir() {
    const suporte = {};
    for (let base = 0; base <= 0xe0; base += 0x20) {
      const masc = await this.pedirMascara(base);
      for (const [ecu, pids] of Object.entries(masc)) {
        suporte[ecu] ??= new Set();
        pids.forEach((p) => suporte[ecu].add(p));
      }
      if (!Object.values(masc).some((p) => p.includes(base + 0x20))) break;
    }
    this.suporte = Object.fromEntries(Object.entries(suporte).map(([e, p]) => [e, [...p].filter((x) => !ehMascara(x)).sort((a, b) => a - b)]));
    this.principal = Object.keys(this.suporte).sort((a, b) => this.suporte[b].length - this.suporte[a].length)[0] ?? null;
  }

  // Uma resposta perdida aqui esconderia sinais a sessão inteira, então tenta de novo.
  async pedirMascara(base) {
    let st = 'ok';
    const hex = base.toString(16).toUpperCase().padStart(2, '0');
    for (let i = 0; i < 3; i++) {
      const r = await this.cmd(`01${hex}`, base === 0 ? 15000 : 4000);
      st = statusResposta(r);
      this.contarAdaptador(st);
      if (st === 'reiniciou') { await this.configurar(); continue; }
      // ECU em silêncio é o normal com o veículo desligado, e não vale insistir.
      if (st === 'sem_dado' || (base === 0 && st === 'sem_conexao')) return {};
      if (base === 0 && st === 'ok') {
        const dpn = (await this.cmd('ATDPN')).toUpperCase().trim();
        this.ehCan = '6789ABC'.includes(dpn.slice(-1)) && dpn !== '';
      }
      const masc = lerMascaras(r, base, this.ehCan);
      if (Object.keys(masc).length) return masc;
    }
    if (base) this.aoEvento(`A lista de sinais pode estar incompleta: o grupo ${hex} falhou (${st})`);
    return {};
  }

  contarAdaptador(st) {
    this.semResposta = st === 'sem_resposta' ? this.semResposta + 1 : 0;
    if (this.semResposta >= MAX_SEM_RESPOSTA) throw new Error('o adaptador parou de responder');
  }

  periodo(id) {
    if ((this.falhas.get(id) ?? 0) >= REBAIXA_APOS) return PERIODOS.lento;
    return PERIODOS[CATALOGO[id]?.ritmo] ?? PERIODOS.lento;
  }

  // Lê o sinal mais atrasado. Devolve false se a ECU sumiu e é preciso voltar a sondar.
  async lerProximo() {
    let id = null;
    let menor = Infinity;
    for (const [k, t] of this.proxima) if (t < menor) { menor = t; id = k; }
    if (id === null) return false;
    const agora = this.relogio();
    if (menor > agora) { await this.dormir(Math.min(50, menor - agora)); return true; }
    this.proxima.set(id, agora + this.periodo(id));
    await this.lerSinal(id);
    if (this.semEcu >= ECU_MUDA_APOS) {
      this.definir({ veiculo: 'desligado' });
      return false;
    }
    return true;
  }

  async lerSinal(id) {
    const t0 = this.relogio();
    const r = await this.cmd(id === ID_BATERIA ? 'ATRV' : `01${id}`);
    const lat = this.relogio() - t0;
    const em = this.relogio();
    const st = statusResposta(r);
    this.contarAdaptador(st);
    if (st === 'reiniciou') {
      this.aoEvento('O adaptador reiniciou, possivelmente por queda de tensão');
      this.aoAmostra({ em, pid: id, ecu: '', principal: true, st, v: null, x: '', b: '', lat });
      await this.configurar();
      return;
    }
    const amostras = id === ID_BATERIA ? this.amostrasBateria(r, st) : this.amostrasPid(id, r, st);
    const falhou = amostras.every((a) => a.st !== 'ok');
    this.falhas.set(id, falhou ? (this.falhas.get(id) ?? 0) + 1 : 0);
    if (id !== ID_BATERIA) {
      if (st === 'sem_dado' || st === 'sem_conexao') this.semEcu += 1;
      else if (!falhou) this.semEcu = 0;
    }
    for (const a of amostras) {
      Object.assign(a, { em, pid: id, lat });
      if (a.pid === '0C' && a.st === 'ok' && a.principal && this.veiculo !== 'desconhecido') {
        this.definir({ veiculo: a.v > 0 ? 'motor' : 'chave' });
      }
      this.aoAmostra(a);
    }
  }

  amostrasBateria(r, st) {
    const v = st === 'ok' ? lerTensao(r) : null;
    if (v === null) return [{ ecu: '', principal: true, st: st === 'ok' ? 'quebrado' : st, v: null, x: '', b: '' }];
    return [{ ecu: 'ELM', principal: true, st: 'ok', v, x: '', b: '' }];
  }

  amostrasPid(id, r, st) {
    if (st !== 'ok' && st !== 'quebrado') return [{ ecu: '', principal: true, st, v: null, x: '', b: '' }];
    const pid = parseInt(id, 16);
    const respostas = lerModo01(r, pid, this.ehCan);
    if (!respostas.length) return [{ ecu: '', principal: true, st: 'quebrado', v: null, x: '', b: '' }];
    const preferida = this.suporte[this.principal]?.includes(pid) ? this.principal : Object.keys(this.suporte).sort().find((e) => this.suporte[e].includes(pid));
    const prim = respostas.some((x) => x.ecu === preferida) ? preferida : respostas[0].ecu;
    return respostas.map(({ ecu, dados }) => {
      const { v, x, motivo } = decodificar(id, dados);
      return { ecu, principal: ecu === prim, st: motivo ? 'quebrado' : 'ok', v, x, b: dados.map((d) => d.toString(16).toUpperCase().padStart(2, '0')).join(' ') };
    });
  }
}
