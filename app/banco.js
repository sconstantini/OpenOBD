// Banco local do aparelho (IndexedDB): modelo 3D, coletas (sessoes) e as amostras de cada uma.
let aberto = null;
const LOJAS = ['arquivos', 'sessoes', 'amostras'];

export function abrirBanco() {
  aberto ??= new Promise((ok, falha) => {
    const r = indexedDB.open('obd-auto-check', 3);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('arquivos')) db.createObjectStore('arquivos');
      if (!db.objectStoreNames.contains('sessoes')) db.createObjectStore('sessoes', { keyPath: 'id', autoIncrement: true });
      // Até a versão 2 se chamava "leituras", o mesmo nome da Leitura de data e km, que é outra coisa.
      if (db.objectStoreNames.contains('leituras')) r.transaction.objectStore('leituras').name = 'amostras';
      else if (!db.objectStoreNames.contains('amostras')) db.createObjectStore('amostras', { autoIncrement: true }).createIndex('sessao', 'sessao');
    };
    r.onsuccess = () => {
      r.result.onversionchange = () => { r.result.close(); aberto = null; };
      ok(r.result);
    };
    r.onerror = () => { aberto = null; falha(r.error); };
    r.onblocked = () => { aberto = null; falha(new Error('feche as outras abas do app')); };
  });
  return aberto;
}

const concluir = (t) => new Promise((ok, falha) => { t.oncomplete = ok; t.onerror = () => falha(t.error); t.onabort = () => falha(t.error); });

export async function guardarModelo(buffer) {
  try {
    const db = await abrirBanco();
    const t = db.transaction('arquivos', 'readwrite');
    if (buffer) t.objectStore('arquivos').put(buffer, 'modelo'); else t.objectStore('arquivos').delete('modelo');
  } catch { /* modelo vale só nesta sessão */ }
}

export async function lerModelo() {
  try {
    const db = await abrirBanco();
    return await new Promise((ok) => {
      const r = db.transaction('arquivos').objectStore('arquivos').get('modelo');
      r.onsuccess = () => ok(r.result || null);
      r.onerror = () => ok(null);
    });
  } catch { return null; }
}

export async function esvaziar(lojas = LOJAS) {
  const db = await abrirBanco();
  const t = db.transaction(lojas, 'readwrite');
  lojas.forEach((l) => t.objectStore(l).clear());
  await concluir(t);
}
