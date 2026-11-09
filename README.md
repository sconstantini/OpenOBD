# OpenOBD

App de manutenção do carro para tablet e celular Android, em modo paisagem, para ficar em um aparelho no carro. Ele lê os dados do veículo com um adaptador OBD-II Bluetooth barato (ELM327), grava as coletas no próprio aparelho e acompanha o que precisa ser trocado e quando.

**Funciona só no seu aparelho:** sem conta, sem servidor, sem anúncios e sem envio de dados. Veja [o que isso garante e como conferir](docs/garantias.md).

> **Estado atual:** protótipo, ainda não testado de ponta a ponta em tablet e em carro. Ainda não há APK de lançamento: por enquanto, ele é gerado a partir deste repositório.

## Como começar: entregue este link ao seu LLM

Você não precisa ler o código nem montar nada na mão. Copie a mensagem abaixo e cole no LLM que você usa (Claude, ChatGPT, Gemini ou outro):

```text
Leia o repositório github.com/sconstantini/OpenOBD e me ajude a configurar
o app para o meu carro, seguindo o guia app/guias/jornada.md, um passo de cada vez.
```

O LLM conduz a configuração inteira, pedindo o que precisa de você:

| Passo | O que você entrega | O que o LLM faz |
|---|---|---|
| Plano de manutenção | Fotos ou PDF das páginas do plano no manual, com dados pessoais cobertos | Transcreve para o formato do app e marca o que ficou para conferir |
| Modelo 3D do carro (opcional) | Um arquivo `.glb` do seu carro, ou nada | Confere orientação, tamanho e licença, e etiqueta marca, modelo e ano. Sem modelo, o app usa um carro genérico |
| Adaptador OBD | Um ELM327 Bluetooth encaixado no carro | Explica o pareamento e a escolha do adaptador no app |
| Instalação | Um tablet ou celular Android | Gera o APK e instala, se tiver acesso ao seu PC, ou explica como fazer |
| Ponto de partida | A km atual e os comprovantes do que já foi feito | Registra os checks com data e km |

O LLM não precisa da internet depois de ler o repositório, e o app nunca usa. Não envie VIN, placa nem nome: o app não precisa disso.

Se o seu LLM tiver acesso a um terminal no seu PC, como o Claude Code, ele também pode gerar e instalar o APK por você. As regras que ele segue estão em [`AGENTS.md`](AGENTS.md).

## Gerar o APK na mão

Precisa de JDK e Android SDK. O script não usa Gradle e não baixa nada:

```bash
sh ferramentas/construir_apk.sh
adb install build/obd-auto-check.apk
```

## O que o app faz

- **Estados:** mostra se o adaptador está conectado e se o veículo está desligado, com a chave ligada ou com o motor ligado.
- **Dados OBD:** pergunta ao carro quais PIDs ele tem e lê só esses. Mostra os sinais agora e o histórico de cada um, coleta a coleta, para comparar o carro com ele mesmo. Exporta em CSV.
- **Quilometragem:** guarda um histórico de leituras de data e km informadas por você.
- **Manutenção:** organiza o plano em Sistema → Componente → Serviço. Tudo começa como desconhecido e vira tarefa, e cada check aponta para uma leitura. O app calcula o que vence por km ou tempo, o que vier primeiro.
- **Seus dados:** exporta o histórico, zera ou apaga tudo em **Configurações → Dados**.
- **Somente leitura:** o app e o Android bloqueiam qualquer comando que não seja de leitura, inclusive limpar códigos (modo 04).

## Como configurar

Os dados ficam em um arquivo JSON, que pode ser parcial. Só as seções presentes são alteradas. Veja o exemplo em [`app/exemplo/carro-generico.config.json`](app/exemplo/carro-generico.config.json).

O fluxo com LLM:

1. Em **Configurações**, copie as instruções do que você quer gerar. Elas também estão em [`app/guias/`](app/guias/).
2. Cole no seu LLM, junto com as fotos ou o PDF do plano do manual, e confira a transcrição que ele trouxer.
3. Valide o resultado no PC.
4. Leve o arquivo ao aparelho, por cabo, nuvem ou mensagem, e use **Importar arquivo** ou **Escolher arquivo .glb**.

```bash
node ferramentas/validar.mjs arquivo.json
node ferramentas/validar_glb.mjs modelo.glb
node ferramentas/etiquetar_glb.mjs modelo.glb --marca "Marca" --modelo "Modelo" --ano 2020
```

O modelo 3D precisa ser um `.glb` com a frente virada para +Z, o teto para +Y, e marca, modelo e ano em `asset.extras.obd_auto_check`.

## Estrutura

| Caminho | O que é |
|---|---|
| `app/` | A interface carregada dentro do APK: `dominio/`, `telas/`, `obd/`, `cena/`, `guias/` |
| `android/` | A casca nativa: tela, Bluetooth, importar e exportar |
| `ferramentas/` | Validadores, guardas e geração do APK |
| `tests/` | Testes |
| `docs/` | Arquitetura, formato do plano, garantias e decisões |

## O que tem dentro: bibliotecas e versões

O app não baixa nada, não tem gerenciador de pacotes e não tem `node_modules`. Tudo o que roda está neste repositório e pode ser conferido.

**Dentro do app (vai no APK)**

| Biblioteca | Versão | Para quê | Licença | Onde |
|---|---|---|---|---|
| three.js (github.com/mrdoob/three.js) | 0.170.0 (npm `three@0.170.0`) | Cena 3D do carro | MIT | `app/vendor/three/` |

Só estes arquivos do three.js entram: `three.module.js`, `OrbitControls.js`, `GLTFLoader.js`, `RoomEnvironment.js` e `BufferGeometryUtils.js`. O hash SHA-256 de cada um está em [`ferramentas/integridade.json`](ferramentas/integridade.json). O guarda `ferramentas/verificar_seguranca.mjs` recalcula os hashes e reprova se um arquivo mudar, e também reprova bibliotecas novas que não estejam nessa lista.

A parte Android (`android/`) usa só o próprio Android: Bluetooth, WebView e arquivos. Nenhuma biblioteca de terceiros.

**Ferramentas, só no seu PC (não vão no APK)**

| Ferramenta | Versão | Para quê |
|---|---|---|
| Node.js | 22 ou mais novo | Testes, validadores e guardas. Nenhum pacote npm |
| JDK | 11 ou mais novo | Compilar a parte Android |
| Android SDK | build-tools e uma plataforma; o APK pede Android 7.0 (API 24) ou mais novo e mira a API 34 | Gerar e assinar o APK, e o `adb` para instalar |

**Integração contínua (GitHub Actions)**

| Ação | Versão | Para quê |
|---|---|---|
| `actions/checkout` | v4.4.0, fixada por hash | Baixar o código para testar |
| `actions/setup-node` | v4.4.0, fixada por hash | Instalar o Node 22 para os testes |

As ações são fixadas pelo hash do commit, não pela etiqueta, para não mudarem de conteúdo sem aviso. Veja [`.github/workflows/testes.yml`](.github/workflows/testes.yml).

## Documentação

Comece pelo [índice](docs/README.md). O projeto **não aceita pull requests de fora por enquanto**, mas issues são bem-vindas: veja [`CONTRIBUTING.md`](CONTRIBUTING.md). Agentes de IA têm as regras em [`AGENTS.md`](AGENTS.md).

## Testes

```bash
npm test
```

## Privacidade

Coletas, quilometragem, adaptador e modelo 3D ficam no aparelho. O `.gitignore` já exclui `meus_dados/`, `*.glb`, `*.csv`, `*.apk` e `*.config.local.json`. Checks, plano e perfil também ficam no aparelho. Nada sai dele sem você exportar ou copiar. Antes de publicar um fork, rode `node ferramentas/verificar_publicacao.mjs` e `node ferramentas/verificar_seguranca.mjs` e confira se nada seu entrou: VIN, endereço do adaptador, coletas, fotos e modelos sem licença.

## Aviso

Este projeto não substitui o manual do veículo nem uma oficina. Os intervalos do exemplo são fictícios. Configure o app com o plano oficial do seu carro e não opere o app enquanto dirige.

## Licença

[MIT](LICENSE). O three.js está em `app/vendor/three/`, com a própria licença, também MIT.

