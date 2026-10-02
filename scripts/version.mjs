import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
if (process.env.GITHUB_SHA && process.env.GITHUB_SHA !== sourceSha)
  throw new Error('Build checkout does not match the CI source revision')
const dirty = Boolean(
  execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
    encoding: 'utf8',
  }).trim(),
)
const { name, version } = JSON.parse(readFileSync('package.json', 'utf8'))
writeFileSync(
  'dist/version.json',
  JSON.stringify(
    { project: name, version, sourceSha, builtAt: new Date().toISOString(), dirty },
    null,
    2,
  ) + '\n',
)
const files = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
  )
const sums = files('dist')
  .filter((path) => !path.endsWith('SHA256SUMS'))
  .sort()
  .map(
    (path) =>
      `${createHash('sha256').update(readFileSync(path)).digest('hex')}  ${relative('dist', path)}`,
  )
writeFileSync('dist/SHA256SUMS', sums.join('\n') + '\n')
console.log(`Build manifest: ${sourceSha}${dirty ? ' (uncommitted source)' : ''}`)
