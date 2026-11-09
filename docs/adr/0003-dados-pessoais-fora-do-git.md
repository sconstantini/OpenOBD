# 0003: Dados pessoais ficam fora do repositório

**Estado:** aceita

## Contexto
O repositório é público, mas cada pessoa o usa com o próprio carro. VIN, endereço do adaptador, coletas e quilometragem são pessoais. Manuais e modelos 3D podem ter direitos de terceiros.

## Decisão
O repositório só traz o "Carro Genérico", com dados fictícios. Dados reais ficam no aparelho ou em `meus_dados/`, que o Git ignora. O app não lê o VIN. A configuração é feita por arquivos, em geral gerados com um LLM a partir dos documentos da própria pessoa.

## Consequências
Quem clona o projeto precisa configurá-lo. Em troca, ele serve para qualquer carro e não redistribui dados de ninguém. `ferramentas/verificar_publicacao.mjs` procura vazamentos conhecidos, sem dispensar a revisão humana.
