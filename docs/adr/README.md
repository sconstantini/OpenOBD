# Decisões de arquitetura

Cada ADR registra uma decisão difícil de reverter: o contexto, a escolha e o que ela custa. Um ADR não é reescrito depois de aceito. Se a decisão mudar, escreva outro e marque o anterior como substituído.

| Nº | Decisão | Estado |
|---|---|---|
| [0001](0001-somente-leitura.md) | O app só lê o carro | Aceita |
| [0002](0002-web-com-transportes.md) | Interface web, com a conexão atrás de transportes | Aceita |
| [0003](0003-dados-pessoais-fora-do-git.md) | Dados pessoais ficam fora do repositório | Aceita |
| [0004](0004-tarefas-calculadas.md) | Tudo começa desconhecido, e tarefas são calculadas | Aceita |
| [0005](0005-produto-e-o-apk.md) | O produto é o APK, e o navegador é só para desenvolver | Aceita |
| [0006](0006-sem-rede.md) | O app não usa rede, e o código de fora fica fechado por enquanto | Aceita |
| [0007](0007-leitura-como-entidade.md) | A data e a km ficam em uma Leitura, compartilhada entre os checks | Aceita |
| [0008](0008-versao-web-fora-do-repositorio.md) | A versão de navegador fica fora do repositório | Aceita |

Para uma nova decisão, copie a estrutura de um ADR existente e use o próximo número.
