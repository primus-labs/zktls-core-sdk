'use strict';

/**
 * Preload for soak: Primus SDK reads PRIMUS_SDK_ENV before the main module runs.
 * Default soak to dev/test endpoints; set PRIMUS_SDK_ENV=production to override.
 */
if (process.env.PRIMUS_SDK_ENV === undefined || process.env.PRIMUS_SDK_ENV === '') {
  process.env.PRIMUS_SDK_ENV = 'test';
}
