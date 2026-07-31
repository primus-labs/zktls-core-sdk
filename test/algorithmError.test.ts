import { PrimusCoreTLS } from '../src/index';

describe('algorithm failure error-code resolution', () => {
  const resolve = (details: unknown) =>
    (new PrimusCoreTLS() as any)._resolveAlgorithmError(details).code;

  it('falls back to the online native error when top-level code is 0', () => {
    expect(resolve({
      errlog: { code: '0' },
      online: { errlog: { code: '10003' } },
    })).toBe('10003');
  });

  it('falls back to the offline native error when top-level code is 0', () => {
    expect(resolve({
      errlog: { code: 0 },
      offline: { errlog: { code: '10004' } },
    })).toBe('10004');
  });

  it('prefers the offline stage when both stages failed', () => {
    expect(resolve({
      errlog: { code: '0' },
      offline: { errlog: { code: '10003' } },
      online: { errlog: { code: '10004' } },
    })).toBe('10003');
  });

  it("matches native's 50003 exception when both stages failed", () => {
    expect(resolve({
      errlog: { code: '0' },
      offline: { errlog: { code: '50003' } },
      online: { errlog: { code: '10004' } },
    })).toBe('10004');
  });

  it('keeps a meaningful top-level code', () => {
    expect(resolve({
      errlog: { code: '30001' },
      online: { errlog: { code: '10003' } },
    })).toBe('30001');
  });
});
