# Lista do mantenedor para publicar

Para quem administra o repositório oficial. Nada aqui acontece sozinho.

## Antes de cada push

```bash
npm test
node ferramentas/verificar_seguranca.mjs
node ferramentas/verificar_publicacao.mjs
git status --ignored
```

Confira com os próprios olhos o que vai subir. `meus_dados/`, `dev/`, `build/` e `estudo_sinais_obd/` precisam aparecer como ignorados.

## Configurações do GitHub

**Conta**
- [ ] Autenticação em dois fatores ativa.

**Branch `main`**
- [ ] Bloquear push direto e push forçado, sem exceção para administradores.
- [ ] Exigir pull request e o teste `testes` aprovado.
- [ ] Não exigir aprovação de outra pessoa enquanto houver um único mantenedor: o GitHub não permite aprovar o próprio pull request.

**Colaboradores**
- [ ] Nenhuma outra pessoa com permissão de escrita.
- [ ] Desativar pull requests de fora, se a opção existir. Caso contrário, fechar com um link para o `CONTRIBUTING.md`, sem baixar nem executar o código.

**Actions**
- [ ] Exigir aprovação para a automação de qualquer pessoa de fora.
- [ ] Permissão padrão do token: somente leitura.
- [ ] Permitir só as ações usadas no projeto, e nenhuma ação criando pull requests.

**Segurança**
- [ ] Relato privado de vulnerabilidades ativo.
- [ ] Varredura de segredos com bloqueio no push ativa.

## Lançamento do APK

Para gerar localmente: `sh ferramentas/construir_apk.sh`. O script confere as permissões do APK e assina com a chave em `meus_dados/`. Guarde essa chave: sem ela, o Android só atualiza o app apagando os dados de quem usa. Para um lançamento oficial:

- [ ] Gerado pela automação do GitHub, a partir de um commit identificado, com atestado de origem.
- [ ] Confirmado sem as permissões `INTERNET` e `ACCESS_NETWORK_STATE`.
- [ ] Assinado com a chave do projeto, guardada fora do repositório, com a impressão digital publicada no README.
- [ ] Lançamento imutável, com o hash do arquivo nas notas.

## Antes de reabrir contribuições

- [ ] Rever [`docs/garantias.md`](garantias.md) e atualizar o `CONTRIBUTING.md`.
- [ ] Definir como revisar mudanças em `AGENTS.md`, `.github/`, `app/vendor/`, nas listas de comandos e no guarda.
- [ ] Combinar o ambiente isolado para testar código de outras pessoas. Executar `npm test` já roda o código delas.
