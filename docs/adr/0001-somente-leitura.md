# 0001: O app só lê o carro

**Estado:** aceita

## Contexto
Adaptadores ELM327 aceitam comandos que alteram o carro, como o modo 04, que apaga códigos de falha e dados de diagnóstico. Um erro aqui pode esconder um defeito ou atrapalhar uma oficina.

## Decisão
O app e a ponte nativa do Android usam uma lista de comandos permitidos. Tudo que não estiver nela é recusado, inclusive o modo 04.

## Consequências
Apagar códigos de falha fica fora do escopo. Qualquer novo comando exige mudar a lista e os testes.
