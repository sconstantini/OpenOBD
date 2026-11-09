Padronize o Plano de Manutenção do veículo abaixo em um arquivo JSON, para eu usar no app OBD Auto Check.

Veículo: {{VEICULO}}

Antes de começar, peça o que faltar:
- fotos ou PDF de **todas** as páginas do plano, incluindo legendas, notas de rodapé, o que define os prazos em meses e o que define uso severo;
- motor, câmbio e demais opções que mudam o plano;
- se o meu uso é normal ou severo, conforme a definição do próprio documento.

## De onde tirar os dados, nesta ordem
1. O documento que eu enviar.
2. Publicação oficial da fabricante para este modelo, ano e mercado.
3. Manual de serviço oficial.

Fóruns, blogs e lojas servem só para achar um documento oficial. Nunca use um deles como fonte de um intervalo. Nunca invente um intervalo nem copie de outro modelo ou mercado.

## Como trabalhar
1. **Transcreva primeiro.** Monte uma tabela com cada linha do documento: item, componente, serviço, marcas por revisão e página. Se o documento cobrir vários modelos, mantenha só as linhas do meu.
2. **Agrupe.** Sistema → Componente → Serviço. O documento pode não trazer sistemas: nesse caso, proponha e me mostre.
3. **Separe componentes** quando uma linha reunir peças trocadas em momentos diferentes, como pastilhas e tambores.
4. **Converta cada serviço** para os tipos de regra abaixo.
5. **Marque o que não for certo.** Texto ilegível, marca duvidosa ou qualquer interpretação sua recebe `"conferir": true` e uma `nota` dizendo o que conferir.
6. **Me entregue** o arquivo, a tabela transcrita para eu comparar com o documento e a lista do que ficou para conferir.

## Regras
A contagem sempre parte do último check registrado no app, não do km zero do carro. Por isso, transcreva o espaço entre as manutenções, não os marcos da tabela.

| O documento diz | Use |
|---|---|
| Serviço em toda revisão de 10.000 km ou 6 meses | `{ "tipo": "intervalo", "km": 10000, "meses": 6 }` |
| 110.000 km ou 72 meses | `{ "tipo": "intervalo", "km": 110000, "meses": 72 }` |
| Marcas em 10, 40, 70 e 100 mil km | `{ "tipo": "intervalo", "km": 30000 }` |
| Só em certos marcos, sem repetição regular | `{ "tipo": "marcos", "km": [10000] }` |
| "Se necessário", sem número | `{ "tipo": "condicional", "texto": "Copie a frase do documento" }` |
| "Com maior frequência" que outro valor | `{ "tipo": "condicional", "texto": "Com maior frequência", "limite_km": 20000 }`, com `conferir: true` |

- Regra igual em qualquer uso: `"regras": { "todos": { ... } }`. Regra diferente: `"regras": { "normal": { ... }, "severo": { ... } }`.
- Se o documento mostra inspeção e troca alternadas, como inspeção em 10 e troca em 20 mil km, a inspeção vale a cada 10 mil km: toda troca também conta como inspeção.
- Se os meses vierem de uma regra geral, como "cada revisão vale 6 meses", calcule e marque `conferir: true` quando a conta for sua.
- Se a tabela não falar de meses para um serviço, omita `meses`.

## Formato obrigatório
```json
{
  "versao": 3,
  "plano": {
    "origem": { "documento": "Nome do documento", "mercado": "País" },
    "opcoes": {
      "transmissao": { "nome": "Câmbio", "valores": { "manual": "Manual", "automatica": "Automático" } }
    },
    "sistemas": [
      {
        "id": "transmissao",
        "nome": "Transmissão",
        "componentes": [
          {
            "id": "oleo_cambio",
            "nome": "Óleo do câmbio",
            "para_que_serve": "Lubrifica as engrenagens do câmbio.",
            "especificacao": null,
            "origem": { "pagina": 12, "item": 20 },
            "ancora": [0, -0.4, 0.15],
            "servicos": [
              {
                "id": "oleo_cambio.inspecionar",
                "acao": "inspecionar",
                "descricao": "Verificar o nível",
                "quando": { "transmissao": "manual" },
                "regras": { "todos": { "tipo": "intervalo", "km": 10000, "meses": 6 } }
              },
              {
                "id": "oleo_cambio.substituir",
                "acao": "substituir",
                "descricao": "Substituir o óleo",
                "quando": { "transmissao": "manual" },
                "conferir": true,
                "nota": "Conferir na página 12 se a marca é em 40 ou em 50 mil km.",
                "regras": {
                  "normal": { "tipo": "intervalo", "km": 40000 },
                  "severo": { "tipo": "condicional", "texto": "Inspecionar a cada revisão e substituir se necessário" }
                }
              }
            ]
          }
        ]
      }
    ]
  },
  "perfil": {
    "uso": "severo",
    "motivo_uso": "Motivo em poucas palavras",
    "opcoes": { "transmissao": "manual" }
  }
}
```

- `id`: único, em minúsculas e sem espaços. O `id` do serviço é `componente.acao`, e os checks ficam ligados a ele: não mude depois.
- `acao`: `inspecionar`, `lubrificar` ou `substituir`.
- `para_que_serve`: uma frase simples, para quem não é mecânico.
- `especificacao`: só com fonte, como o óleo indicado. Sem fonte, `null`.
- `origem`: `pagina` e `item` do documento, ou `fonte` quando vier de outro documento oficial.
- `quando`: só quando o serviço depende de uma opção declarada em `opcoes`.
- `ancora` é opcional e indica onde a peça fica: `[x, y, z]`, de -1 a 1. `x` é o lado, `y` a altura e `z` vai da traseira (-1) à frente (+1). É aproximada.
- Não inclua histórico. O que já foi feito é registrado no app, como check, a partir de comprovantes. Tudo começa como desconhecido.
- Não inclua VIN, placa nem nome do proprietário.

## Verificação
Se você tiver acesso ao repositório do app, rode `node ferramentas/validar.mjs arquivo.json` e corrija todos os erros. Se não tiver, confira o formato item por item.
