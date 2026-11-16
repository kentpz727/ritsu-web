import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeError, errorMessage, logError } from '../../src/lib/errors.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('P-16 error context', () => {
  it('describes an Error with name, message, and stack', () => {
    const d = describeError(new TypeError('bad value'));
    expect(d.name).toBe('TypeError');
    expect(d.message).toBe('bad value');
    expect(typeof d.stack).toBe('string');
  });

  it('describes non-Error throwables without crashing', () => {
    expect(describeError('plain failure')).toMatchObject({ name: 'Error', message: 'plain failure' });
    expect(describeError({ message: 'object failure', name: 'Custom' })).toMatchObject({
      name: 'Custom',
      message: 'object failure',
    });
    expect(errorMessage(null)).toBe('null');
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  it('logs one entry with the route and error context', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logError('render failure', new Error('boom'), { route: '/#/scores', action: 'render' });

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toBe('[P-16] render failure');
    expect(spy.mock.calls[0][1]).toMatchObject({
      route: '/#/scores',
      action: 'render',
      error: { name: 'Error', message: 'boom' },
    });
  });
});
