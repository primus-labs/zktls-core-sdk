import { getAttestation } from '../src/primus_zk';

describe('primus_zk stream callback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as any)._onStream = undefined;
  });

  it('reports the original stream buffer through onStream', async () => {
    const onStream = jest.fn();
    const buf = new Uint8Array([1, 2, 3, 4]);

    await expect(
      getAttestation(
        {
          requestid: 'request-1',
          stream: true,
        },
        {
          onStream,
        }
      )
    ).rejects.toBeTruthy();

    (globalThis as any)._onStream(buf);

    expect(onStream).toHaveBeenCalledWith(
      expect.objectContaining({
        retcode: '1',
        status: 'streaming',
        requestid: 'request-1',
        content: {
          data: buf,
        },
      })
    );
  });
});
