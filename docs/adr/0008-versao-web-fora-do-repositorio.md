# 0008: A versão de navegador fica fora do repositório

**Estado:** aceita. Complementa a [0005](0005-produto-e-o-apk.md).

## Contexto
O servidor local e a ponte Bluetooth para PC existiam só para desenvolver, mas iam para o repositório junto com o produto. Isso sugeria uma versão web, mantinha Python no projeto público, abria um socket em uma ferramenta publicada e levava para o APK um transporte que não servia lá.

## Decisão
- O repositório público traz só o produto: `app/` (a interface carregada dentro do APK), `android/` (a casca nativa), `ferramentas/`, `tests/` e `docs/`.
- O servidor de desenvolvimento fica em `dev/`, fora do Git. Ele faz o papel do Android definindo `window.ObdNativo`, e o app só conhece esse contrato.
- `meus_dados/` saiu de `app/`, para um arquivo pessoal nunca entrar no APK por engano. O script do APK também confere isso.
- O guarda aceita `.java` e `.xml` só em `android/`, e um único script de shell, com regras próprias: permissões só de Bluetooth, nenhum acesso à rede, nenhuma execução de programas e as listas de comandos iguais às do app. Arquivos `.py` deixam de ser aceitos.

## Consequências
Sem o `dev/`, quem clona o repositório testa pelo APK e por `node --test "tests/*.test.mjs"`. O app não tem mais carga automática de plano ou modelo: tudo entra por **Importar**, inclusive para o mantenedor, que assim passa pela mesma jornada de quem usa. O código continua abrindo em um navegador se alguém servir a pasta, mas sem Bluetooth e sem exportar, e isso não é suportado.
