# 0006: O app não usa rede, e o código de fora fica fechado por enquanto

**Estado:** aceita

## Contexto
Repositórios maliciosos têm usado links para servidores externos, downloads e comandos executados ao abrir o projeto. Este app guarda dados pessoais e se conecta a um carro, e não precisa de internet para nada.

## Decisão
Camadas independentes, porque nenhuma basta sozinha:

1. **Android:** o APK não terá a permissão `INTERNET`.
2. **Página:** uma CSP em `app/index.html` bloqueia conexões, scripts e `eval`, também no navegador e na WebView.
3. **Dados de entrada:** o app recusa `.glb` com conteúdo externo e valida os arquivos importados.
4. **Guarda:** `ferramentas/verificar_seguranca.mjs` reprova endereços externos, APIs de rede, dependências, arquivos executáveis e bibliotecas alteradas.
5. **Pessoas:** o projeto não aceita código de fora por enquanto. Só o mantenedor altera o repositório.

Requisitos do futuro APK:

- Permissões somente de Bluetooth, sem `INTERNET` nem `ACCESS_NETWORK_STATE`.
- `android:allowBackup="false"` e regras de extração de dados vazias, para nada ir ao backup na nuvem.
- WebView carregando só os arquivos do próprio app, sem acesso a arquivos do aparelho nem depuração em lançamentos, e com as métricas da WebView desativadas.
- A ponte nativa só aceita a mesma lista de comandos de leitura.
- Nenhum SDK de análise, anúncio ou atualização.
- Nenhuma atividade exportada além da tela inicial.

## Consequências
Não haverá atualização pela internet, sincronização nem backup na nuvem pelo app: a pessoa exporta e leva os próprios arquivos. Uma nova biblioteca exige hash registrado e uma decisão explícita. O guarda precisa ser revisado junto com o código, porque quem altera um pode alterar o outro. As garantias estão em [`docs/garantias.md`](../garantias.md).
