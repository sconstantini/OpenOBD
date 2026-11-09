Crie um modelo 3D em arquivo .glb do veículo abaixo, para eu usar no app OBD Auto Check.

Veículo: {{VEICULO}}

Antes de começar, pergunte só o que faltar e mudar o formato do carro: cor, número de portas e versão.

## Como fazer
1. Procure as dimensões reais do veículo: comprimento, largura, altura e entre-eixos. Use fotos de frente, de lado e de trás como referência. Cite as fontes.
2. Se eu pedir um modelo pronto, mostre a licença e o autor antes de usar. Não baixe nem converta um modelo cuja licença não permita esse uso.
3. Se for gerar por código, use Blender em Python ou outra ferramenta capaz de exportar glTF 2.0. Construa carroceria, vidros, rodas, faróis, lanternas, grade e retrovisores como peças separadas.
4. Prefira formas limpas e proporções corretas a detalhes malfeitos. Não modele o interior nem o motor.
5. Renderize o modelo de frente, de lado e em três quartos. Compare com as referências e corrija as diferenças antes de entregar.

## Formato obrigatório
- Um único arquivo binário .glb, glTF 2.0, com tudo embutido e sem arquivos externos.
- Frente do carro virada para +Z, teto para +Y, unidade em metros e rodas apoiadas em Y = 0.
- Tamanho de até 50 MB. Para rodar bem no tablet, procure ficar abaixo de 5 MB e de 100 mil triângulos.
- Marca, modelo e ano gravados no próprio arquivo, em `asset.extras`, exatamente assim:
  `"asset": { "version": "2.0", "extras": { "obd_auto_check": { "marca": "...", "modelo": "...", "ano": 2020 } } }`
  O app lê esses dados e não aceita o arquivo sem eles. Se tiver o repositório, grave com
  `node ferramentas/etiquetar_glb.mjs arquivo.glb --marca "..." --modelo "..." --ano 2020`.
- Materiais PBR metallic-roughness. Vidros escuros e, se houver textura, em PNG ou JPEG.
- Sem compressão Draco ou Meshopt, sem texturas KTX2, sem câmeras, luzes e animações.

## Verificação
- Se você tiver acesso ao repositório do app, rode `node ferramentas/validar_glb.mjs arquivo.glb` e corrija todos os erros.
- Se não tiver, confira cada item do formato obrigatório no arquivo final, não só no script que o gerou.

## Entrega
Entregue o arquivo .glb, as imagens renderizadas, as dimensões obtidas, as fontes e as limitações do modelo. Diga claramente que se trata de uma aproximação, se for o caso. Não publique o arquivo sem verificar a licença.
