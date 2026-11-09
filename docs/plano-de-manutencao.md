# Plano de manutenção

Como o app representa o plano de um veículo e como decide o que fazer. Para gerar um plano com um LLM, use o [guia](../app/guias/manutencao.md).

## Princípio

**Tudo começa por não saber.** Quem compra um carro usado raramente sabe quando cada item foi trocado. Por isso, nenhum serviço nasce "em dia": cada um começa desconhecido, gera uma tarefa e só passa a ter contagem depois de um check.

## Árvore

`Sistema → Componente → Serviço`

- **Sistema:** agrupamento para navegar, como Motor ou Freios. Na aba Tarefas, é a lane que abre nos Componentes e Serviços.
- **Componente:** a peça ou o fluido, sempre descrito do mesmo jeito.
- **Serviço:** uma ação com regra. É contra ele que os checks são registrados.

## Entidades ao longo do tempo

```
Componente 1─N Serviço 1─N Check N─1 Leitura
```

- **Serviço** é o que o plano manda fazer. Ele não tem data e vale para sempre. Seu **estado** é calculado e nunca é gravado.
- **Check** é o que aconteceu: uma vez, num Serviço, numa Leitura. Sempre fica no passado.
- **Leitura** é um par de data e km. Vários checks do mesmo dia apontam para a mesma Leitura, e a mais recente completa é a km atual do carro.
- **Tarefa** não é entidade: é um Serviço cujo estado é vencido, atenção, desconhecido ou próximo. Na tela, aparece com o estado ao lado: "Tarefa (Serviço vencido)".

Regras da Leitura:

- Mesma data e mesma km são a mesma Leitura: ela é reaproveitada, nunca repetida.
- A km nunca diminui com o passar do tempo.
- Corrigir uma Leitura corrige todos os checks ligados a ela.
- Uma Leitura com checks não pode ser excluída, e um Serviço tem no máximo um check por Leitura.
- Para um comprovante antigo, pode faltar a data ou a km. Uma Leitura incompleta não define a km atual.

Um componente representa uma coisa que se troca de uma vez: "Substituí" zera todos os serviços dele. Se o documento junta peças trocadas em momentos diferentes, separe em componentes.

## Exemplo completo

```json
{
  "versao": 3,
  "plano": {
    "exemplo": true,
    "origem": { "documento": "Plano fictício do Carro Genérico", "mercado": "Exemplo" },
    "opcoes": {
      "transmissao": { "nome": "Câmbio", "valores": { "manual": "Manual", "automatica": "Automático" } }
    },
    "sistemas": [
      {
        "id": "motor",
        "nome": "Motor",
        "componentes": [
          {
            "id": "oleo_motor",
            "nome": "Óleo do motor",
            "para_que_serve": "Lubrifica e ajuda a resfriar as peças internas do motor.",
            "especificacao": null,
            "origem": { "pagina": 1, "item": 1 },
            "ancora": [0, 0.1, 0.72],
            "servicos": [
              {
                "id": "oleo_motor.substituir",
                "acao": "substituir",
                "descricao": "Substituir o óleo",
                "conferir": true,
                "nota": "Exemplo de item a conferir no documento.",
                "regras": {
                  "normal": { "tipo": "intervalo", "km": 10000, "meses": 12 },
                  "severo": { "tipo": "intervalo", "km": 5000, "meses": 6 }
                }
              }
            ]
          }
        ]
      }
    ]
  },
  "perfil": { "uso": "severo", "motivo_uso": "Estrada de terra", "opcoes": { "transmissao": "manual" } },
  "leituras": {
    "registros": [
      { "id": "l_exemplo", "em": "2026-03-10T09:40:00-03:00", "km": 42000 }
    ]
  },
  "checks": {
    "registros": [
      {
        "id": "c_exemplo",
        "servico": "oleo_motor.substituir",
        "leitura": "l_exemplo",
        "resultado": "substituido",
        "fonte": "nota_fiscal",
        "nota": "Texto opcional",
        "registrado_em": "2026-11-02T09:41:12-03:00"
      }
    ]
  }
}
```

## Campos

**Plano**

| Campo | Obrigatório | Significado |
|---|---|---|
| `origem.documento` | Sim | De onde veio o plano |
| `exemplo` | Não | `true` em planos fictícios |
| `opcoes` | Não | O que varia entre carros: nome e valores |
| `sistemas[].id`, `nome`, `componentes` | Sim | Um nível da árvore |

**Componente**

| Campo | Obrigatório | Significado |
|---|---|---|
| `id`, `nome` | Sim | Identificação |
| `para_que_serve` | Sim | Uma frase para quem não é mecânico |
| `especificacao` | Não | Dado técnico com fonte, ou `null` |
| `origem` | Sim | `pagina` e `item`, ou `fonte` |
| `ancora` | Não | Posição aproximada no carro: `[x, y, z]`, de -1 a 1 |
| `servicos` | Sim | Ao menos um |

**Serviço**

| Campo | Obrigatório | Significado |
|---|---|---|
| `id` | Sim | Único e estável: os checks apontam para ele |
| `acao` | Sim | `inspecionar`, `lubrificar` ou `substituir` |
| `descricao` | Sim | O que fazer, nas palavras do documento |
| `regras` | Sim | `todos`, ou `normal` e `severo` |
| `quando` | Não | Só vale para certas opções do perfil |
| `conferir`, `nota` | Não | Marca dúvida ou interpretação, e explica |

**Regras**

| `tipo` | Campos | Uso |
|---|---|---|
| `intervalo` | `km`, `meses` (ao menos um) | Recorrente, o que vencer primeiro |
| `marcos` | `km` (lista) | Só nessas quilometragens |
| `condicional` | `texto`, `limite_km`, `limite_meses` (opcionais) | Sem número fixo no documento |

**Leitura**

| Campo | Obrigatório | Significado |
|---|---|---|
| `id` | Sim | Único: os checks apontam para ele |
| `em`, `km` | Ao menos um | Data e hora ISO 8601, e km do hodômetro |

**Check**

| Campo | Obrigatório | Significado |
|---|---|---|
| `id`, `servico`, `resultado` | Sim | `ok`, `atencao`, `substituido` ou `lubrificado` |
| `leitura` | Sim | `id` da Leitura em que aconteceu |
| `fonte` | Não | `eu_mesmo`, `oficina` ou `nota_fiscal` |
| `nota` | Não | Observação |
| `registrado_em` | Sim | Quando foi anotado: automático |

## Como o estado é calculado

| Situação | Estado | Tarefa |
|---|---|---|
| Sem check que conte | `desconhecido` | Descobrir o estado |
| Último check da inspeção deu "atenção" | `atencao` | Reavaliar ou trocar |
| Passou da km ou da data | `vencido` | Fazer agora |
| Faltam até 15% do intervalo | `proximo` | Programar |
| Dentro do intervalo | `ok` | Nenhuma |
| Condicional sem limite, já com check | `avaliar` | Nenhuma: decide-se na inspeção |

Regras de contagem:

- **O que conta:** uma troca conta só com resultado `substituido`, em qualquer serviço do componente. Uma inspeção conta com o próprio check ou com uma troca do componente.
- **Inspecionar não zera a troca.** Sem histórico, a troca fica aberta até haver troca ou comprovante, porque um fluido de idade desconhecida não pode parecer em dia.
- **O que vencer primeiro:** com km e meses, vale o pior dos dois.
- **Último check:** com km nos dois, ganha a maior km. Sem ela, ganha a data de `em`, ou a de `registrado_em`.
- **Km atual:** é a da Leitura completa mais recente. Registrar um check numa Leitura nova também atualiza a km do carro.
- **Perfil:** uma opção ainda não informada não esconde serviços. Um serviço sem regra para o uso escolhido não aparece.

## Versões do formato

A versão fica em `versao`, na raiz. Na versão 3, data e km saíram do check e foram para a Leitura. Arquivos e dados salvos nas versões 1 e 2 são migrados ao abrir. Se a data de um check antigo contradizer a km do histórico, a Leitura fica só com a km e a data original vai para a nota do check. Ao quebrar o formato, aumente `VERSAO` em `app/config.js` e migre o que estiver salvo em `migrarConfig`. O `id` de um serviço não muda entre versões do plano: se mudar, os checks antigos deixam de contar.
