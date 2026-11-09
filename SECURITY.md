# Segurança

O app funciona só no aparelho e se conecta ao carro de uma pessoa. As garantias e os limites estão em [`docs/garantias.md`](docs/garantias.md). Tratamos estes casos como vulnerabilidade:

- qualquer forma de o app conectar a um servidor externo;
- qualquer forma de enviar ao carro um comando fora da lista de leitura;
- acesso à ponte nativa do Android (`window.ObdNativo`) por conteúdo de fora do APK;
- dados do usuário saindo do aparelho sem uma ação dele;
- arquivo importado que execute código na interface.

## Como relatar

Use o relato privado do GitHub, em **Security → Report a vulnerability**. Não abra issue pública e não inclua VIN, placa, endereço do adaptador ou coletas reais.

## Limites

O projeto é um protótipo, sem garantia de prazo de resposta e sem auditoria externa. O app não substitui o manual do veículo nem uma oficina, e não deve ser operado enquanto se dirige.
