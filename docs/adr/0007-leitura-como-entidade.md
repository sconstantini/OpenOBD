# 0007: A data e a km ficam em uma Leitura

**Estado:** aceita

## Contexto
Cada check guardava a própria data e km, e o histórico de quilometragem ficava à parte. Numa ida à oficina com várias manutenções, o mesmo par se repetia em cada check, e nada impedia um check de contradizer o outro. Corrigir uma km digitada errado exigia editar check por check.

## Decisão
O par vira a entidade **Leitura**, em `leituras.registros`, que também substitui `quilometragem.registros`. O check guarda só o `id` dela. Mesma data e mesma km são a mesma Leitura, e a km nunca diminui com o tempo. Pode faltar a data ou a km, para aceitar comprovantes antigos, mas uma Leitura incompleta não define a km atual.

## Consequências
O formato passa para a versão 3, e as versões anteriores são migradas ao abrir. Uma correção vale para todos os checks da Leitura, e as views podem alinhar no tempo o que aconteceu no mesmo dia. Em troca, registrar um check pede escolher ou criar uma Leitura, e uma Leitura com checks não pode ser excluída.
