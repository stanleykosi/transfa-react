import { parseScannedPayload } from './scanPayload';

describe('parseScannedPayload', () => {
  it('parses money drop URLs with drop_id query', () => {
    const parsed = parseScannedPayload(
      'https://trytransfa.com/_huncho25_?drop_id=2ed44f19-b7f8-4687-bf13-2f2d91557341'
    );

    expect(parsed).toEqual({
      type: 'money_drop',
      dropId: '2ed44f19-b7f8-4687-bf13-2f2d91557341',
      rawValue: 'https://trytransfa.com/_huncho25_?drop_id=2ed44f19-b7f8-4687-bf13-2f2d91557341',
    });
  });

  it('parses payment request URLs with request_id query', () => {
    const parsed = parseScannedPayload(
      'https://transfa.app/pay?request_id=6e36be4f-70e5-462a-b94f-b7d0f3874a16'
    );

    expect(parsed).toEqual({
      type: 'payment_request',
      requestId: '6e36be4f-70e5-462a-b94f-b7d0f3874a16',
      rawValue: 'https://transfa.app/pay?request_id=6e36be4f-70e5-462a-b94f-b7d0f3874a16',
    });
  });

  it('parses user profile links', () => {
    const parsed = parseScannedPayload('https://trytransfa.com/_biggerman26_');

    expect(parsed).toEqual({
      type: 'user_profile',
      username: '_biggerman26_',
      rawValue: 'https://trytransfa.com/_biggerman26_',
    });
  });

  it('parses reserved usernames when they are profile links', () => {
    const parsed = parseScannedPayload('https://trytransfa.com/pay');

    expect(parsed).toEqual({
      type: 'user_profile',
      username: 'pay',
      rawValue: 'https://trytransfa.com/pay',
    });
  });

  it('keeps transfa.app product routes from being parsed as usernames', () => {
    const parsed = parseScannedPayload('https://transfa.app/pay');
    expect(parsed.type).toBe('unknown');
  });

  it('parses bare usernames as user profile links', () => {
    const parsed = parseScannedPayload('_biggerman26_');

    expect(parsed).toEqual({
      type: 'user_profile',
      username: '_biggerman26_',
      rawValue: '_biggerman26_',
    });
  });

  it('parses bare reserved usernames as user profile links', () => {
    const parsed = parseScannedPayload('request');

    expect(parsed).toEqual({
      type: 'user_profile',
      username: 'request',
      rawValue: 'request',
    });
  });

  it('returns unknown for unsupported values', () => {
    const parsed = parseScannedPayload('not-a-supported-qr');
    expect(parsed.type).toBe('unknown');
  });

  it('returns unknown for non-Transfa URLs that look like profile paths', () => {
    const parsed = parseScannedPayload('https://example.com/_biggerman26_');
    expect(parsed.type).toBe('unknown');
  });
});
