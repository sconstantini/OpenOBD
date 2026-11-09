# Mudanças

Formato inspirado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). O projeto ainda não tem versões publicadas.

## [Não publicado]

### Adicionado
- Projeto passa a se chamar OpenOBD. O README começa pela mensagem para colar no LLM e lista as bibliotecas e ferramentas, com versões.
- Plano de manutenção em Sistema → Componente → Serviço, com regras por intervalo, marcos e condicionais, e variações por uso e por opção do carro.
- Perfil do carro, checks com km e/ou data editáveis, registro de vários serviços de uma vez e opção de desfazer.
- Tarefas calculadas, abas "Tarefas" e "Plano de manutenções" e progresso do ponto de partida.
- Monitor de sinais, estados do adaptador e do veículo, coletas locais com exportação em CSV e ponte Bluetooth para Linux.
- Documentação para pessoas e agentes de IA, integração contínua e checagem de dados pessoais.
- Política de segurança (CSP) na página, que bloqueia conexões externas, scripts de fora e `eval`.
- Licença MIT.
- Aba Tarefas em tela inteira, com o carro pequeno no alto e quatro views: Trilha, Visitas, Grade e Peças. As tarefas mostram o estado do serviço, como "Tarefa (Serviço vencido)".
- Lanes por sistema na Trilha e na Grade, que abrem nos componentes e serviços, e legenda em cada view.
- Régua da Trilha em km, com escala de 5, 10 ou 20 mil km. Sem ritmo conhecido, ela conta 3, 6 ou 12 meses.
- Guarda `ferramentas/verificar_seguranca.mjs`, com hashes das bibliotecas, e a página de garantias.
- APK: casca Android em `android/`, gerada por `ferramentas/construir_apk.sh`, sem Gradle e sem download. Permissões só de Bluetooth.
- Tela **Dados OBD**: gráficos grandes dos sinais, com escala que se ajusta e uma explicação curta; a coleta em andamento ou qualquer coleta passada; histórico por coleta, com filtros de motor e período; e as coletas gravadas.
- Botão **Reconectar** no Início e em Dados OBD: desconecta, espera e conecta de novo sem passar pelas Configurações.
- **Configurações → Dados:** exportar histórico, coletas e configuração, zerar o histórico e apagar tudo.
- Jornada de configuração para o LLM de cada pessoa, em `app/guias/jornada.md`, com a instalação por cabo ou Wi-Fi.

### Corrigido
- A view Visitas quebrava ao mostrar a km estimada das próximas idas à oficina.
- O byte FF das sondas deixa de aparecer como 1,275 V: é sem leitura.
- Importar um plano sem as opções do perfil atual fazia o app descartar a configuração ao reabrir, com checks e leituras. Agora só essas opções saem do perfil, e uma configuração recusada fica guardada em cópia.

### Segurança
- Modelos `.glb` que apontam para conteúdo fora do arquivo agora são recusados.
- A validação de arquivos importados não aceita mais nomes herdados de objetos, como `constructor`.
- A ponte de desenvolvimento recusa outras origens e corpos grandes, e envia cabeçalhos de proteção.
- A automação do GitHub usa versões fixadas por hash, com permissão só de leitura.

### Removido
- Aba "Plano de manutenções". O que só existia lá, como para que serve a peça, a especificação, a origem e a nota do que conferir, agora aparece na folha do check.
- Versão de navegador e Python do repositório público ([ADR 0008](docs/adr/0008-versao-web-fora-do-repositorio.md)). Carga automática de plano e modelo locais.

### Alterado
- Código reorganizado por responsabilidade: `app/dominio/`, `app/telas/`, `app/obd/` e `app/cena/`. Dados pessoais saíram de `app/` para `meus_dados/`.
- Guarda: aceita código Android só em `android/`, com regras próprias de permissões, rede, execução e comandos.
- As amostras lidas do carro mudam de nome no banco, de `leituras` para `amostras`, para não se confundir com a Leitura de data e km.
- A configuração passou para a versão 3. Data e km saíram dos checks e foram para a entidade Leitura, que também substitui `quilometragem`. Dados e arquivos antigos são migrados ao abrir.
- O produto passa a ser só o APK, e o navegador fica apenas para desenvolvimento.
- O projeto não aceita pull requests de fora por enquanto.
- A configuração passou para a versão 2. A seção `manutencao`, com `ultima_troca`, deu lugar a `plano`, `perfil` e `checks`. Configurações salvas no aparelho são migradas, sem levar a tabela antiga.
