// @ts-check
/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'refactor',
        'test',
        'docs',
        'chore',
        'ci',
        'build',
        'perf',
        'style',
      ],
    ],
    'scope-enum': [
      2,
      'always',
      ['server', 'web', 'generator', 'shared', 'db', 'ci', 'docs'],
    ],
  },
};
