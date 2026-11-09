// Catálogo de sinais do modo 01. Quem define o que será lido é o próprio carro, ao informar os PIDs que tem.

export const PERIODOS = { rapido: 0, medio: 2000, lento: 30000 };

const arred = (v, n = 1) => Number(v.toFixed(n));
const u16 = (b, i = 0) => (b[i] << 8) | b[i + 1];
const s16 = (b) => { const v = u16(b); return v & 0x8000 ? v - 0x10000 : v; };
const pct = (v) => arred((v * 100) / 255);
const ajuste = (v) => arred(((v - 128) * 100) / 128);
const temp = (b) => b[0] - 40;
const lambda = (b) => arred((u16(b) * 2) / 65536, 3);

const CONTINUOS = ['falha de ignição', 'sistema de combustível', 'componentes'];
const FAISCA = ['catalisador', 'catalisador aquecido', 'EVAP', 'ar secundário', 'A/C', 'sonda lambda', 'aquecedor da sonda', 'EGR'];
const DIESEL = ['catalisador NMHC', 'NOx/SCR', 'reservado', 'pressão de turbo', 'reservado', 'gases de escape', 'filtro de partículas', 'EGR/VVT'];

function monitores(b) {
  const prontos = [];
  const faltam = [];
  CONTINUOS.forEach((nome, i) => {
    if (b[0] & (1 << i)) (b[0] & (1 << (i + 4)) ? faltam : prontos).push(nome);
  });
  (b[0] & 0x08 ? DIESEL : FAISCA).forEach((nome, i) => {
    if (b[1] & (1 << i)) (b[2] & (1 << i) ? faltam : prontos).push(nome);
  });
  return `Prontos: ${prontos.join(', ') || 'nenhum'}. Incompletos: ${faltam.join(', ') || 'nenhum'}.`;
}

const SISTEMA_COMB = { 0: 'sem informação', 1: 'malha aberta (motor frio)', 2: 'malha fechada (usando a sonda)', 4: 'malha aberta (carga alta ou desaceleração)', 8: 'malha aberta (falha no sistema)', 16: 'malha fechada (com falha em sonda)' };
const NORMA_OBD = { 1: 'OBD-II (CARB)', 2: 'OBD (EPA)', 3: 'OBD e OBD-II', 4: 'OBD-I', 5: 'não é OBD', 6: 'EOBD (Europa)', 7: 'EOBD e OBD-II', 8: 'EOBD e OBD', 9: 'EOBD, OBD e OBD-II', 28: 'OBDBr-1 (Brasil)', 29: 'OBDBr-2 (Brasil)' };
const COMBUSTIVEL = { 1: 'gasolina', 2: 'metanol', 3: 'etanol', 4: 'diesel', 5: 'GLP', 6: 'GNV', 8: 'elétrico', 23: 'flex (gasolina)' };

function s(id, nome, unidade, nBytes, decode, grupo, ritmo, extra = null) {
  return { id, nome, unidade, nBytes, decode, grupo, ritmo, extra };
}

const lista = [
  s('01', 'Luz de injeção e monitores', '', 4, (b) => `MIL ${b[0] & 0x80 ? 'ACESA' : 'apagada'}, ${b[0] & 0x7f} DTC`, 'Diagnóstico', 'lento', (b) => monitores(b.slice(1))),
  s('41', 'Monitores neste ciclo', '', 4, (b) => monitores(b.slice(1)), 'Diagnóstico', 'lento'),
  s('1C', 'Norma OBD do veículo', '', 1, (b) => NORMA_OBD[b[0]] ?? `código ${b[0]}`, 'Diagnóstico', 'lento'),
  s('51', 'Tipo de combustível', '', 1, (b) => COMBUSTIVEL[b[0]] ?? `código ${b[0]}`, 'Diagnóstico', 'lento'),
  s('21', 'Distância com a luz acesa', 'km', 2, (b) => u16(b), 'Diagnóstico', 'lento'),
  s('4D', 'Tempo com a luz acesa', 'min', 2, (b) => u16(b), 'Diagnóstico', 'lento'),
  s('30', 'Aquecimentos desde a limpeza', '', 1, (b) => b[0], 'Diagnóstico', 'lento'),
  s('31', 'Distância desde a limpeza', 'km', 2, (b) => u16(b), 'Diagnóstico', 'lento'),
  s('4E', 'Tempo desde a limpeza', 'min', 2, (b) => u16(b), 'Diagnóstico', 'lento'),
  s('1F', 'Tempo desde a partida', 's', 2, (b) => u16(b), 'Diagnóstico', 'medio'),
  s('A6', 'Hodômetro', 'km', 4, (b) => arred((b[0] * 2 ** 24 + (b[1] << 16) + (b[2] << 8) + b[3]) / 10), 'Diagnóstico', 'lento'),
  s('0C', 'Rotação (RPM)', 'rpm', 2, (b) => Math.round(u16(b) / 4), 'Motor', 'rapido'),
  s('0D', 'Velocidade', 'km/h', 1, (b) => b[0], 'Motor', 'rapido'),
  s('04', 'Carga calculada', '%', 1, (b) => pct(b[0]), 'Motor', 'rapido'),
  s('43', 'Carga absoluta', '%', 2, (b) => arred((u16(b) * 100) / 255), 'Motor', 'rapido'),
  s('0E', 'Avanço de ignição', '°', 1, (b) => b[0] / 2 - 64, 'Motor', 'rapido'),
  s('05', 'Temperatura do motor', '°C', 1, temp, 'Motor', 'medio'),
  s('5C', 'Temperatura do óleo', '°C', 1, temp, 'Motor', 'medio'),
  s('5E', 'Consumo instantâneo', 'L/h', 2, (b) => arred(u16(b) / 20, 2), 'Motor', 'rapido'),
  s('10', 'Fluxo de ar (MAF)', 'g/s', 2, (b) => arred(u16(b) / 100, 2), 'Ar', 'rapido'),
  s('0B', 'Pressão no coletor (MAP)', 'kPa', 1, (b) => b[0], 'Ar', 'rapido'),
  s('33', 'Pressão barométrica', 'kPa', 1, (b) => b[0], 'Ar', 'lento'),
  s('0F', 'Temperatura do ar admitido', '°C', 1, temp, 'Ar', 'medio'),
  s('46', 'Temperatura ambiente', '°C', 1, temp, 'Ar', 'lento'),
  s('11', 'Posição da borboleta', '%', 1, (b) => pct(b[0]), 'Ar', 'rapido'),
  s('45', 'Borboleta relativa', '%', 1, (b) => pct(b[0]), 'Ar', 'rapido'),
  s('47', 'Borboleta absoluta B', '%', 1, (b) => pct(b[0]), 'Ar', 'rapido'),
  s('49', 'Pedal do acelerador D', '%', 1, (b) => pct(b[0]), 'Ar', 'rapido'),
  s('4A', 'Pedal do acelerador E', '%', 1, (b) => pct(b[0]), 'Ar', 'rapido'),
  s('4C', 'Borboleta comandada', '%', 1, (b) => pct(b[0]), 'Ar', 'rapido'),
  s('03', 'Sistema de combustível', '', 2, (b) => SISTEMA_COMB[b[0]] ?? `código ${b[0]}`, 'Mistura', 'medio'),
  s('06', 'Ajuste curto de combustível B1', '%', 1, (b) => ajuste(b[0]), 'Mistura', 'rapido'),
  s('07', 'Ajuste longo de combustível B1', '%', 1, (b) => ajuste(b[0]), 'Mistura', 'medio'),
  s('08', 'Ajuste curto de combustível B2', '%', 1, (b) => ajuste(b[0]), 'Mistura', 'rapido'),
  s('09', 'Ajuste longo de combustível B2', '%', 1, (b) => ajuste(b[0]), 'Mistura', 'medio'),
  s('44', 'Lambda comandado', 'λ', 2, lambda, 'Mistura', 'rapido'),
  s('2F', 'Nível de combustível', '%', 1, (b) => pct(b[0]), 'Mistura', 'medio'),
  s('0A', 'Pressão de combustível', 'kPa', 1, (b) => b[0] * 3, 'Mistura', 'medio'),
  s('52', 'Teor de etanol', '%', 1, (b) => pct(b[0]), 'Mistura', 'lento'),
  s('2E', 'Purga do cânister (EVAP)', '%', 1, (b) => pct(b[0]), 'Emissões', 'medio'),
  s('32', 'Pressão do sistema EVAP', 'Pa', 2, (b) => s16(b) / 4, 'Emissões', 'medio'),
  s('3C', 'Temperatura do catalisador B1S1', '°C', 2, (b) => arred(u16(b) / 10 - 40), 'Emissões', 'medio'),
  s('2C', 'EGR comandado', '%', 1, (b) => pct(b[0]), 'Emissões', 'medio'),
  s('2D', 'Erro do EGR', '%', 1, (b) => ajuste(b[0]), 'Emissões', 'medio'),
  s('42', 'Tensão da ECU', 'V', 2, (b) => arred(u16(b) / 1000, 2), 'Elétrica', 'medio'),
  s('13', 'Sondas instaladas', '', 1, (b) => {
    const nomes = [];
    for (let i = 0; i < 8; i++) if (b[0] & (1 << i)) nomes.push(`B${1 + Math.floor(i / 4)}S${(i % 4) + 1}`);
    return nomes.join(', ') || 'nenhuma';
  }, 'Sonda lambda', 'lento'),
];

const SONDAS = ['B1S1', 'B1S2', 'B1S3', 'B1S4', 'B2S1', 'B2S2', 'B2S3', 'B2S4'];
SONDAS.forEach((nome, i) => {
  const id = (0x14 + i).toString(16).toUpperCase().padStart(2, '0');
  // Byte FF é o fim da escala: a sonda ainda não tem leitura, e 1,275 V seria um valor falso.
  lista.push(s(id, `Sonda lambda ${nome}`, 'V', 2, (b) => (b[0] === 0xff ? null : arred(b[0] / 200, 3)), 'Sonda lambda', 'rapido', (b) => (b[1] === 0xff ? 'ajuste não usado' : `ajuste curto ${ajuste(b[1])} %`)));
  lista.push(s((0x24 + i).toString(16).toUpperCase(), `Sonda larga ${nome} (tensão)`, 'λ', 4, lambda, 'Sonda lambda', 'rapido', (b) => `${arred((u16(b, 2) * 8) / 65536, 3)} V`));
  lista.push(s((0x34 + i).toString(16).toUpperCase(), `Sonda larga ${nome} (corrente)`, 'λ', 4, lambda, 'Sonda lambda', 'rapido', (b) => `${arred(u16(b, 2) / 256 - 128, 2)} mA`));
});

// Sinais que valem a pena acompanhar ao longo dos meses, comparando o carro com ele mesmo.
export const PARA_ACOMPANHAR = ['RV', '05', '07', '06', '11', '34'];

export const SOBRE = {
  RV: 'Medida pelo adaptador no conector, sem passar pela ECU. A exatidão depende do adaptador.',
  '05': 'Temperatura do líquido de arrefecimento.',
  '06': 'Correção imediata da mistura. Positivo: a ECU está adicionando combustível. Só tem sentido em malha fechada.',
  '07': 'Correção aprendida ao longo do uso, candidata a indicador de tendência. Só tem sentido em malha fechada.',
  11: 'Em lenta com o motor quente, subir ao longo dos meses pode indicar carbonização: a ECU abre mais para manter a rotação.',
  34: 'Sonda antes do catalisador. λ = 1 é a mistura ideal, abaixo é rica e acima é pobre.',
  '0C': 'Base de tempo do motor e referência para os demais sinais.',
  '04': 'Ar admitido em relação ao máximo de referência, calculado pela ECU.',
  '0B': 'Pressão absoluta no coletor. Com o motor parado, iguala a pressão atmosférica.',
  10: 'Massa de ar medida na admissão.',
  '0E': 'Graus antes do ponto morto superior, no cilindro 1.',
  '0F': 'Ar na admissão, aquecido pelo cofre. Não serve como temperatura ambiente.',
  '0D': 'Velocidade informada pela ECU.',
  43: 'Ar admitido por ciclo, em relação ao que o motor admitiria com o ar a plena carga.',
  '5C': 'Temperatura do óleo do motor.',
  '5E': 'Combustível consumido por hora, calculado pela ECU.',
  33: 'Pressão atmosférica no local.',
  46: 'Temperatura do ar externo, informada pela ECU.',
  45: 'Abertura da borboleta em relação à posição de repouso aprendida.',
  47: 'Segundo sensor de posição da borboleta.',
  49: 'Posição do pedal, primeiro sensor.',
  '4A': 'Posição do pedal, segundo sensor.',
  '4C': 'Abertura que a ECU pediu para a borboleta.',
  '08': 'Correção imediata da mistura no banco 2.',
  '09': 'Correção aprendida da mistura no banco 2.',
  44: 'Mistura que a ECU está pedindo. λ = 1 é a mistura ideal.',
  '2F': 'Nível informado pelo sensor do tanque.',
  '0A': 'Pressão na linha de combustível.',
  52: 'Etanol no combustível, informado pela ECU.',
  '2E': 'Quanto a válvula do cânister está aberta para aproveitar os vapores do tanque.',
  32: 'Pressão dos vapores no sistema do cânister.',
  '3C': 'Temperatura do catalisador, medida ou estimada pela ECU.',
  '2C': 'Quanto de recirculação de gases a ECU pediu.',
  '2D': 'Diferença entre a recirculação pedida e a medida.',
  42: 'Tensão na alimentação da ECU.',
  21: 'Rodados desde que a luz de injeção acendeu.',
  '4D': 'Tempo de motor ligado desde que a luz acendeu.',
  30: 'Vezes que o motor aqueceu desde que os códigos foram limpos.',
  31: 'Rodados desde que os códigos foram limpos.',
  '4E': 'Tempo de motor ligado desde que os códigos foram limpos.',
  '1F': 'Segundos desde que o motor pegou.',
  A6: 'Quilometragem informada pela ECU.',
};
SONDAS.forEach((nome, i) => {
  const lugar = nome.endsWith('S1') ? 'antes do catalisador' : 'depois do catalisador';
  SOBRE[(0x14 + i).toString(16).toUpperCase()] ??= `Sonda ${lugar}. A tensão baixa indica mistura pobre, e a alta, rica.`;
  SOBRE[(0x24 + i).toString(16).toUpperCase()] ??= `Sonda ${lugar}. λ = 1 é a mistura ideal, abaixo é rica e acima é pobre.`;
  SOBRE[(0x34 + i).toString(16).toUpperCase()] ??= `Sonda ${lugar}. λ = 1 é a mistura ideal, abaixo é rica e acima é pobre.`;
});

export const ID_BATERIA = 'RV';
lista.push(s(ID_BATERIA, 'Bateria (no conector OBD)', 'V', 0, null, 'Elétrica', 'medio'));

export const CATALOGO = Object.fromEntries(lista.map((x) => [x.id, x]));
// IDs como 10 e 34 parecem números, e um objeto os poria na frente: a ordem do catálogo fica nesta lista.
export const ORDEM_SINAIS = lista.map((x) => x.id);

// Resposta curta nunca vira valor: um erro não pode aparecer como rotação zero ou −40 °C.
export function decodificar(id, dados) {
  const sinal = CATALOGO[id];
  if (!sinal?.decode) return { v: null, x: '', motivo: 'sem decodificação' };
  if (dados.length < sinal.nBytes) return { v: null, x: '', motivo: `esperava ${sinal.nBytes} bytes, vieram ${dados.length}` };
  const b = dados.slice(0, sinal.nBytes);
  return { v: sinal.decode(b), x: sinal.extra ? sinal.extra(b) : '', motivo: '' };
}
