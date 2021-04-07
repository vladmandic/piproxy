#!/usr/bin/env node

/* eslint-disable global-require */
/* eslint-disable import/no-extraneous-dependencies */

const fs = require('fs');
const proc = require('child_process');
const process = require('process');

let npm = {};

async function exec(cmd, msg) {
  return new Promise((resolve) => {
    if (msg) process.stdout.write(`Running: ${msg} ...`);
    const t0 = process.hrtime.bigint();
    proc.exec(cmd, (err, stdout, stderr) => {
      // if (err) process.stdout.write(`${err}\n`);
      let json = {};
      try {
        json = JSON.parse(`${stdout}${stderr}`);
      } catch { /**/ }
      const t1 = process.hrtime.bigint();
      const ms = Math.trunc(parseFloat((t1 - t0).toString()) / 1000000);
      if (msg) process.stdout.write(`\r${msg} completed in ${ms.toLocaleString()}ms\n`);
      resolve(json);
    });
  });
}

async function deleteExamples() {
  await exec('find node_modules -type d -name "example*" -exec rm -rf {} \\; 2>/dev/null', 'Deleting module samples');
}

async function main() {
  process.stdout.write('Starting Setup\n');
  const f = './setup.json';
  if (!fs.existsSync('./package.json')) {
    process.stdout.write('Not a project home');
    process.exit(1);
  }

  const p = JSON.parse(fs.readFileSync('./package.json').toString());
  process.stdout.write(`${p.name} server v${p.version}\n`);
  process.stdout.write(`Platform=${process.platform} Arch=${process.arch} Node=${process.version}\n`);
  process.stdout.write('Project dependencies\n');
  process.stdout.write(` production: ${Object.keys(p.dependencies || {}).length}\n`);
  process.stdout.write(` development: ${Object.keys(p.devDependencies || {}).length}\n`);
  process.stdout.write(` optional: ${Object.keys(p.optionalDependencies || {}).length}\n`);
  if (fs.existsSync(f)) npm = JSON.parse(fs.readFileSync(f).toString());

  // npm install
  npm.installProd = await exec('npm install --only=prod --json', 'NPM install production modules');
  npm.installDev = await exec('npm install --only=dev --json', 'NPM install development modules');
  npm.installOpt = await exec('npm install --only=opt --json', 'NPM install optional modules');

  // npm optimize
  npm.update = await exec('npm update --depth=5 --json', 'NPM update modules');
  npm.dedupe = await exec('npm dedupe --json', 'NPM deduplicate modules');
  npm.prune = await exec('npm prune --no-production --json', 'NPM prune unused modules');
  npm.audit = await exec('npm audit fix --json', 'NPM audit modules');

  // delete examples
  await deleteExamples();

  // npm analyze
  npm.outdated = await exec('npm outdated --depth=5 --json', 'NPM outdated check');
  process.stdout.write(`NPM indirect outdated modules: ${Object.keys(npm.outdated).length}\n`);
  npm.ls = await exec('npm ls --json', 'NPM list full');
  const meta = npm.prune.audit.metadata;
  process.stdout.write(`Total dependencies: production=${meta.dependencies} development=${meta.devDependencies} optional=${meta.optionalDependencies}\n`);

  // npm.cache = await exec('npm cache verify', 'NPM verify cache');

  process.stdout.write('Results written to setup.json\n');
  fs.writeFileSync(f, JSON.stringify(npm, null, 2));
}

main();
