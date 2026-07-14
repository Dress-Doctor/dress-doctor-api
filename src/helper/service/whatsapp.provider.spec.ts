import { WhatsAppProvider } from './whatsapp.provider';

describe('WhatsAppProvider', () => {
  const provider = new WhatsAppProvider();
  const OLD = { ...process.env };

  afterEach(() => {
    process.env = { ...OLD };
    jest.restoreAllMocks();
  });

  it('falls back to a synthetic id when unconfigured (dev/CI)', async () => {
    delete process.env.WHATSAPP_API_URL;
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER;

    const res = await provider.send({
      to: '237690000000',
      templateName: 'login_verification_code',
      language: 'fr',
      variables: { code: '123456' },
    });

    expect(res.providerMessageId).toMatch(/^dev-/);
  });

  it('calls the Cloud API and returns the provider message id when configured', async () => {
    process.env.WHATSAPP_API_URL = 'https://graph.example.com';
    process.env.WHATSAPP_TOKEN = 'tok';
    process.env.WHATSAPP_PHONE_NUMBER = 'PN1';

    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messages: [{ id: 'wamid.123' }] }),
    } as Response);

    const res = await provider.send({
      to: '237690000000',
      templateName: 'login_verification_code',
      language: 'fr',
      variables: { code: '123456' },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.example.com/PN1/messages',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(res.providerMessageId).toBe('wamid.123');
  });

  it('throws when the provider returns a non-OK response', async () => {
    process.env.WHATSAPP_API_URL = 'https://graph.example.com';
    process.env.WHATSAPP_TOKEN = 'tok';
    process.env.WHATSAPP_PHONE_NUMBER = 'PN1';
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'bad' }),
    } as Response);

    await expect(
      provider.send({
        to: '237690000000',
        templateName: 't',
        language: 'fr',
        variables: {},
      }),
    ).rejects.toThrow(/WhatsApp send failed/);
  });
});
