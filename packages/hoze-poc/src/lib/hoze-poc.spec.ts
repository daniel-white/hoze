import { describe, it, expect } from 'vitest';

import { hozePoc } from './hoze-poc';

describe('hozePoc', () => {
  it('should work', () => {
    expect(hozePoc()).toEqual('hoze-poc');
  });
});
