# 0005: O produto é o APK, e o navegador é só para desenvolver

**Estado:** aceita. Complementa a [0002](0002-web-com-transportes.md).

## Contexto
O app precisa de um aparelho perto do carro, ao alcance do Bluetooth do adaptador. Uma versão pública para navegador não alcançaria o adaptador nesse uso e ampliaria o que precisa ser mantido e protegido.

## Decisão
O único jeito oficial de usar o app é o APK, em tablet ou celular Android que fique no carro. A pasta `app/` vai para o repositório porque é a interface carregada dentro do APK. O servidor de desenvolvimento fica fora do repositório ([ADR 0008](0008-versao-web-fora-do-repositorio.md)). O simulador continua no APK, para experimentar o app sem carro, e suas coletas ficam marcadas e fora do histórico real. Não haverá versão hospedada.

## Consequências
O projeto só pode ser considerado pronto para uso depois de testado em APK e em um aparelho real. Em troca, a proteção mais forte contra acesso à rede passa a vir do próprio Android ([ADR 0006](0006-sem-rede.md)).
