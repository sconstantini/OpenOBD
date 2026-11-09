# O que o projeto garante

O OBD Auto Check foi feito para funcionar **só no seu aparelho**: sem conta, sem servidor, sem anúncios e sem envio de dados. Esta página separa o que já é verificável do que ainda depende do APK, e diz também o que o projeto não consegue garantir.

Nenhuma certificação prova que um software é seguro. Por isso, não pedimos que você confie na nossa palavra: cada item abaixo diz como conferir.

## Compromissos

| Compromisso | Como é imposto | Situação |
|---|---|---|
| O app não acessa a internet | O APK não pede a permissão `INTERNET`, e o Android bloqueia a conexão. O guarda reprova o manifesto com outra permissão | Ativo. Ainda não testado em aparelho real |
| Mesmo assim, a página não sai do app | Política de segurança (CSP) em `app/index.html` | Ativo |
| Nenhum dado seu é enviado | Não há servidor, telemetria nem conta | Ativo |
| O app só lê o carro | Lista de comandos permitidos, sem modo 04, no app e no Android. O guarda reprova se as duas divergirem | Ativo |
| Nada é baixado ou instalado | Sem dependências, sem scripts de instalação e com as bibliotecas no repositório | Ativo |
| A biblioteca 3D é a oficial | Hashes do three.js em `ferramentas/integridade.json` | Ativo |
| Modelos 3D não acessam nada fora do arquivo | O app recusa `.glb` com conteúdo externo | Ativo |
| O VIN não é lido | O app não pede esse dado ao carro | Ativo |

## Onde ficam os seus dados

Tudo fica no armazenamento do app, no aparelho: plano, checks, quilometragem, coletas, modelo 3D e adaptador. O backup na nuvem do Android fica desligado. Um dado só sai dali quando **você** exporta, escolhendo onde salvar, ou copia um texto.

## Como conferir

Leia antes de executar qualquer coisa baixada da internet, inclusive este projeto. Os comandos abaixo só leem arquivos:

```bash
# Endereços citados no código do app: só deve aparecer texto de comentário ou nada
grep -rnE "[a-z]+://" app --include="*.js" --include="*.html" --include="*.css" --exclude-dir=vendor

# Política de segurança da página
grep -n "Content-Security-Policy" app/index.html

# Hashes das bibliotecas: compare com ferramentas/integridade.json e com o pacote three@0.170.0 do npm
sha256sum app/vendor/three/three.module.js
```

Depois de ler o código, o guarda automático confere o projeto inteiro:

```bash
node ferramentas/verificar_seguranca.mjs
node ferramentas/verificar_publicacao.mjs
```

As permissões do APK podem ser conferidas com as ferramentas do Android, sem executá-lo:

```bash
aapt2 dump permissions obd-auto-check.apk
```

## O que o projeto não garante

- **Cópias:** forks e APKs de terceiros podem ter sido alterados. Use só o repositório e os lançamentos oficiais.
- **O guarda automático:** é uma análise de texto. Barra o erro e o ataque descuidado, mas não um código bem disfarçado, e quem altera o projeto também pode alterar o guarda.
- **O adaptador Bluetooth:** adaptadores baratos costumam não ter proteção real. Outra pessoa por perto pode tentar se conectar a ele, e o app não controla isso. Retire o adaptador do carro quando não estiver usando.
- **O seu LLM:** os guias são copiados por você para um serviço que você escolhe. O que você enviar a ele, como fotos do manual, segue as regras desse serviço. Cubra dados pessoais antes de enviar.
- **O aparelho:** quem tiver acesso ao aparelho desbloqueado pode ver os dados. O app não tem senha própria.
- **Auditoria:** o projeto não passou por auditoria externa de segurança.
- **O carro:** o app não substitui o manual do veículo nem uma oficina.
