# 0004: Tudo começa desconhecido, e tarefas são calculadas

**Estado:** aceita

## Contexto
A primeira versão guardava um intervalo e uma "última troca" em cada item. Um plano real não cabe nisso: um componente tem inspeção e troca, as regras mudam com o uso e há itens sem número fixo. Além disso, quem pega um carro usado não sabe quando cada item foi trocado, e estimar uma data faria o app parecer mais certo do que está.

## Decisão
Separar **plano**, **perfil** e **checks**. Todo serviço começa desconhecido. **Tarefas nunca são gravadas**: saem de uma função sobre esses dados, a km e a data. Uma troca sem histórico só deixa de ser desconhecida com um registro de troca ou comprovante.

## Consequências
Registrar um check fecha a tarefa e abre a próxima, sem risco de dessincronia, e o plano pode ser trocado sem perder o histórico. Em troca, o carro começa com muitas tarefas, por isso desconhecido usa cor neutra e há o progresso "Ponto de partida". O `id` de um serviço precisa ser estável.
