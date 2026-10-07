import { CURRENT_CONSENT_VERSION, assertConsent } from './consent.js';
import { ConsentRequiredError } from './errors.js';

describe('assertConsent (TC-AUTH-008)', () => {
  it('accepts the current policy version', () => {
    expect(() => assertConsent(CURRENT_CONSENT_VERSION)).not.toThrow();
  });

  it.each([undefined, '', '2020-01-01', `${CURRENT_CONSENT_VERSION} `])('rejects %j', (version) => {
    expect(() => assertConsent(version)).toThrow(ConsentRequiredError);
  });

  it('is a rule violation with code CONSENT_REQUIRED', () => {
    expect(new ConsentRequiredError()).toMatchObject({
      code: 'CONSENT_REQUIRED',
      kind: 'rule_violation',
    });
  });
});
