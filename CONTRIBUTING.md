# Como contribuir

**O projeto não aceita pull requests de fora por enquanto.** Pull requests recebidos serão fechados sem que o código seja baixado ou executado. É uma decisão de segurança ([ADR 0006](docs/adr/0006-sem-rede.md)): enquanto houver um único mantenedor, cada código de fora é um risco para quem instala o app.

## O que você pode fazer

- **Relatar um problema ou sugerir uma ideia:** abra uma issue, sem anexar código para executar e sem dados pessoais.
- **Relatar uma falha de segurança:** siga o [`SECURITY.md`](SECURITY.md).
- **Adaptar para o seu carro:** configure o app com o seu próprio plano e modelo, como descrito no [`README.md`](README.md). Isso não exige alterar o código.

## Para o mantenedor

```bash
npm test
sh ferramentas/construir_apk.sh
```

Não há dependências para instalar. Os testes precisam de Node 22 ou mais novo, e o APK, de JDK e Android SDK. Se usar um agente de IA, aponte para o [`AGENTS.md`](AGENTS.md). Para publicar, siga a [lista do mantenedor](docs/publicacao.md).

Toda mudança precisa de:

- testes para a lógica nova;
- o teste feito na vida real, descrito: simulador, carro, tablet ou nenhum;
- documentação e `CHANGELOG.md` atualizados, quando algo visível mudar;
- nenhum dado pessoal, comando que grave no carro ou intervalo sem fonte oficial.
