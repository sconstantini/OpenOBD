# 0002: Interface web, com a conexão atrás de transportes

**Estado:** aceita

## Contexto
O alvo é Android, mas é mais rápido desenvolver e testar a interface no PC. Navegadores não acessam Bluetooth clássico, que é o que os adaptadores baratos usam.

## Decisão
A interface é uma página web sem build, com dependências locais. A conexão fica atrás de uma interface de transporte, com implementações para simulador e APK. A ponte no PC saiu do repositório no [ADR 0008](0008-versao-web-fora-do-repositorio.md).

## Consequências
A lógica pode ser testada sem carro e sem aparelho, e cada pessoa pode inspecionar o app sem instalar ferramentas. Em troca, a leitura real no tablet só existe depois do APK, e a coleta com a tela apagada exigirá código nativo.
