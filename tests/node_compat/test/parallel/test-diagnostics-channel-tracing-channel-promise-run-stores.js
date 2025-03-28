// deno-fmt-ignore-file
// deno-lint-ignore-file

// Copyright Joyent and Node contributors. All rights reserved. MIT license.
// Taken from Node 23.9.0
// This file is automatically generated by `tests/node_compat/runner/setup.ts`. Do not modify this file manually.

'use strict';

const common = require('../common');
const { setTimeout } = require('node:timers/promises');
const { AsyncLocalStorage } = require('async_hooks');
const dc = require('diagnostics_channel');
const assert = require('assert');

const channel = dc.tracingChannel('test');
const store = new AsyncLocalStorage();

const firstContext = { foo: 'bar' };
const secondContext = { baz: 'buz' };

channel.start.bindStore(store, common.mustCall(() => {
  return firstContext;
}));

channel.asyncStart.bindStore(store, common.mustNotCall(() => {
  return secondContext;
}));

assert.strictEqual(store.getStore(), undefined);
channel.tracePromise(common.mustCall(async () => {
  assert.deepStrictEqual(store.getStore(), firstContext);
  await setTimeout(1);
  // Should _not_ switch to second context as promises don't have an "after"
  // point at which to do a runStores.
  assert.deepStrictEqual(store.getStore(), firstContext);
}));
assert.strictEqual(store.getStore(), undefined);
