import { describe, expect, it } from 'vitest';
import { buildHealth, onRequest } from './health';

describe('health function', () => {
  it('buildHealth は ok ペイロードを返す', () => {
    expect(buildHealth()).toEqual({ status: 'ok', service: 'yuruwollet' });
  });

  it('onRequest は JSON の Response を返す', async () => {
    const res = onRequest();
    expect(res.headers.get('content-type')).toContain('application/json');
    await expect(res.json()).resolves.toEqual({ status: 'ok', service: 'yuruwollet' });
  });
});
