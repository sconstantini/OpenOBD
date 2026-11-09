# Documentação

| Quero | Leia |
|---|---|
| Usar ou experimentar o app | [`README.md`](../README.md) |
| Configurar o meu carro com um LLM | [Jornada](../app/guias/jornada.md) |
| Padronizar o meu plano de manutenção | [Guia para o LLM](../app/guias/manutencao.md) |
| Entender o formato do plano e as regras | [Plano de manutenção](plano-de-manutencao.md) |
| Entender como o código se organiza | [Arquitetura](arquitetura.md) |
| Saber por que algo é assim | [Decisões (ADR)](adr/README.md) |
| Saber se dá para contribuir | [`CONTRIBUTING.md`](../CONTRIBUTING.md) |
| Trabalhar com um agente de IA | [`AGENTS.md`](../AGENTS.md) |
| Saber o que o projeto garante e como conferir | [Garantias](garantias.md) |
| Relatar uma falha de segurança | [`SECURITY.md`](../SECURITY.md) |
| Publicar o repositório ou um APK | [Lista do mantenedor](publicacao.md) |
| Ver o que mudou | [`CHANGELOG.md`](../CHANGELOG.md) |

Regra da casa: quando o código e um documento discordam, o código vale e o documento é um bug. O formato tem uma única fonte de verdade, o validador em [`app/dominio/manutencao.js`](../app/dominio/manutencao.js), e os testes conferem os exemplos dos documentos contra ele.
