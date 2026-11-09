// Leitura do cabeçalho de um .glb, antes de entregá-lo à cena. Sem DOM: também roda no Node.

// O formato glTF permite apontar texturas e dados para outros endereços. Um modelo baixado da internet
// poderia usar isso para avisar um servidor de que foi aberto. Aqui, tudo precisa estar dentro do arquivo.
export function referenciasExternas(buffer) {
  try {
    const v = new DataView(buffer);
    if (v.getUint32(0, true) !== 0x46546c67 || v.getUint32(16, true) !== 0x4e4f534a) return [];
    const g = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, v.getUint32(12, true))));
    const buffers = (g.buffers ?? []).map((b) => b.uri).filter((u) => u != null);
    const imagens = (g.images ?? []).map((i) => i.uri).filter((u) => u != null && !/^data:image\//i.test(u));
    return [...buffers, ...imagens];
  } catch {
    return [];
  }
}
