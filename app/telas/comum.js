// Pequenas peças das telas. Só as funções que tocam na página precisam dela: o resto roda no Node.
export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const NUM = new Intl.NumberFormat('pt-BR');
export const DATA_HORA = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
export const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
export const ehCompacto = () => innerWidth < 860 || innerHeight < 520;

export function mostrarAviso(html, erro = false) {
  const a = $('avisoImport');
  a.hidden = false;
  a.className = `aviso${erro ? ' erro' : ''}`;
  a.innerHTML = html;
}

// É o Android quem pergunta onde salvar: nenhum arquivo sai do app sem essa escolha.
export function salvarArquivo(nome, tipo, texto) {
  window.ObdNativo.salvar(nome, tipo, texto);
}
