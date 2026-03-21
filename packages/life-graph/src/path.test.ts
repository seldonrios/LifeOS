import assert from 'node:assert/strict';
import test from 'node:test';

import { getDefaultLifeGraphPath, resolveLifeGraphPath } from './path';

test('getDefaultLifeGraphPath honors explicit env override', () => {
  const path = getDefaultLifeGraphPath({
    baseDir: '/repo',
    env: {
      LIFEOS_GRAPH_PATH: './tmp/graph.json',
    } as NodeJS.ProcessEnv,
    platform: 'linux',
    homeDir: '/home/test',
  });

  assert.match(path, /repo[\\/]tmp[\\/]graph\.json$/);
});

test('getDefaultLifeGraphPath resolves unix user data path', () => {
  const path = getDefaultLifeGraphPath({
    env: {} as NodeJS.ProcessEnv,
    platform: 'linux',
    homeDir: '/home/test',
  });

  assert.equal(path, '/home/test/.local/share/lifeos/life-graph.json');
});

test('getDefaultLifeGraphPath resolves windows appdata path', () => {
  const path = getDefaultLifeGraphPath({
    env: {
      APPDATA: 'C:\\Users\\Test\\AppData\\Roaming',
    } as NodeJS.ProcessEnv,
    platform: 'win32',
    homeDir: 'C:\\Users\\Test',
  });

  assert.equal(path, 'C:\\Users\\Test\\AppData\\Roaming\\lifeos\\life-graph.json');
});

test('resolveLifeGraphPath returns provided absolute path', () => {
  const path = resolveLifeGraphPath('/tmp/custom.json', {
    baseDir: '/repo',
  });

  assert.equal(path, '/tmp/custom.json');
});

test('resolveLifeGraphPath resolves relative paths against baseDir', () => {
  const path = resolveLifeGraphPath('./graphs/demo.json', {
    baseDir: '/repo',
  });

  assert.match(path, /repo[\\/]graphs[\\/]demo\.json$/);
});
