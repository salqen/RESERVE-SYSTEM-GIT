import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bearerToken, safeEqual, requireAdmin } from '../src/modules/admin/auth';
import { config } from '../src/config';

// --------------------------------------------------------------- pomocníci

function fakeRes() {
  const res: any = {
    statusCode: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) { res.headers[k.toLowerCase()] = v; },
    status(code: number) { res.statusCode = code; return res; },
    json(payload: unknown) { res.body = payload; return res; },
  };
  return res;
}

function fakeReq(authorization?: string) {
  return {
    header: (name: string) =>
      name.toLowerCase() === 'authorization' ? authorization : undefined,
  } as any;
}

/** Spustí middleware a povie, či pustil ďalej. */
function run(authorization?: string) {
  const res = fakeRes();
  let passed = false;
  requireAdmin(fakeReq(authorization), res, () => { passed = true; });
  return { passed, res };
}

// ------------------------------------------------------------------- testy

test('bearerToken – vytiahne token, toleruje medzery a veľkosť písmen', () => {
  assert.equal(bearerToken('Bearer abc123'), 'abc123');
  assert.equal(bearerToken('bearer   abc123  '), 'abc123');
  assert.equal(bearerToken('BEARER abc123'), 'abc123');
});

test('bearerToken – neplatné hlavičky vracajú null', () => {
  assert.equal(bearerToken(undefined), null);
  assert.equal(bearerToken(''), null);
  assert.equal(bearerToken('abc123'), null);          // chýba schéma
  assert.equal(bearerToken('Basic abc123'), null);    // iná schéma
});

test('safeEqual – zhoda len pri identickom reťazci', () => {
  assert.equal(safeEqual('tajne', 'tajne'), true);
  assert.equal(safeEqual('tajne', 'tajnE'), false);
  assert.equal(safeEqual('tajne', 'tajne-dlhsie'), false); // rôzna dĺžka nesmie hodiť výnimku
  assert.equal(safeEqual('', ''), true);
});

test('requireAdmin – bez ADMIN_TOKEN je admin API zavreté (fail-closed)', () => {
  const original = config.adminToken;
  config.adminToken = '';
  try {
    const { passed, res } = run('Bearer čokoľvek');
    assert.equal(passed, false, 'nesmie pustiť ďalej');
    assert.equal(res.statusCode, 503);
  } finally {
    config.adminToken = original;
  }
});

test('requireAdmin – odmietne chýbajúci aj nesprávny token', () => {
  const original = config.adminToken;
  config.adminToken = 'spravny-token';
  try {
    for (const header of [undefined, '', 'Bearer zly-token', 'Basic spravny-token']) {
      const { passed, res } = run(header);
      assert.equal(passed, false, `nesmie pustiť: ${String(header)}`);
      assert.equal(res.statusCode, 401);
      assert.equal(res.headers['www-authenticate'], 'Bearer');
    }
  } finally {
    config.adminToken = original;
  }
});

test('requireAdmin – pustí ďalej pri správnom tokene', () => {
  const original = config.adminToken;
  config.adminToken = 'spravny-token';
  try {
    const { passed, res } = run('Bearer spravny-token');
    assert.equal(passed, true);
    assert.equal(res.statusCode, 0, 'nesmie nastaviť chybový stav');
  } finally {
    config.adminToken = original;
  }
});
