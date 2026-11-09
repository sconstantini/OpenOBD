// Rodar com: node --test "tests/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import { validarConfig, validarMetaModelo } from '../app/dominio/config.js';

test('campo antigo de quilometragem é recusado com explicação', () => {
  const { erros } = validarConfig({ versao: 3, veiculo: { marca: 'A', modelo: 'B', ano: 2020, quilometragem_atual: 1 } });
  assert.match(erros[0], /leituras\.registros/);
  assert.match(validarConfig({ versao: 3, quilometragem: { registros: [] } }).erros[0], /formato antigo/);
});

test('metadados do modelo exigem marca, modelo e ano', () => {
  assert.deepEqual(validarMetaModelo({ marca: 'A', modelo: 'B', ano: 2011 }), []);
  assert.equal(validarMetaModelo(undefined).length, 1);
  assert.equal(validarMetaModelo({ marca: '', modelo: 'B', ano: 1 }).length, 2);
});
