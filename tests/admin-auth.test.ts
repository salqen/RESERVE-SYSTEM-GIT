import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bearerToken } from '../src/modules/admin/auth';

test('bearerToken – vytiahne token, toleruje medzery a veľkosť písmen', () => {
  assert.equal(bearerToken('Bearer abc123'), 'abc123');
  assert.equal(bearerToken('bearer   abc123  '), 'abc123');
  assert.equal(bearerToken('BEARER abc123'), 'abc123');
});

test('bearerToken – neplatné hlavičky vracajú null', () => {
  assert.equal(bearerToken(undefined), null);
  assert.equal(bearerToken(''), null);
  assert.equal(bearerToken('abc123'), null);       // chýba schéma
  assert.equal(bearerToken('Basic abc123'), null); // iná schéma
});
