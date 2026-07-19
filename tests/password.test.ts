import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, validatePassword, MIN_PASSWORD_LENGTH } from '../src/modules/admin/password';

test('hashPassword – rovnaké heslo dá zakaždým iný hash (náhodná soľ)', async () => {
  const a = await hashPassword('spravne-heslo-123');
  const b = await hashPassword('spravne-heslo-123');
  assert.notEqual(a, b);
  assert.match(a, /^scrypt\$\d+\$\d+\$\d+\$/);
});

test('hashPassword – hash neobsahuje pôvodné heslo', async () => {
  const hash = await hashPassword('tajne-heslo-abcdef');
  assert.equal(hash.includes('tajne-heslo-abcdef'), false);
});

test('verifyPassword – prijme správne, odmietne nesprávne heslo', async () => {
  const hash = await hashPassword('spravne-heslo-123');
  assert.equal(await verifyPassword('spravne-heslo-123', hash), true);
  assert.equal(await verifyPassword('spravne-heslo-124', hash), false);
  assert.equal(await verifyPassword('', hash), false);
  assert.equal(await verifyPassword('Spravne-heslo-123', hash), false); // citlivé na veľkosť
});

test('verifyPassword – poškodený alebo cudzí hash vráti false, nehádže výnimku', async () => {
  for (const stored of ['', 'nezmysel', 'scrypt$', 'bcrypt$2a$10$abc', 'scrypt$x$y$z$$']) {
    assert.equal(await verifyPassword('hocijake-heslo', stored), false);
  }
});

test('validatePassword – vynucuje minimálnu dĺžku a odmieta krajné medzery', () => {
  assert.equal(validatePassword('a'.repeat(MIN_PASSWORD_LENGTH)), null);
  assert.notEqual(validatePassword('a'.repeat(MIN_PASSWORD_LENGTH - 1)), null);
  assert.notEqual(validatePassword(' ' + 'a'.repeat(MIN_PASSWORD_LENGTH)), null);
  assert.notEqual(validatePassword('a'.repeat(MIN_PASSWORD_LENGTH) + ' '), null);
});
