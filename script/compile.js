#! /usr/bin/env node
'use strict'

const {join, parse} = require('path')
const {readdirSync, readFileSync, statSync, rmdirSync, unlinkSync, existsSync} = require('fs')
const {assign, getOwnPropertyNames} = Object
const {info} = global.console
const jtry = require('just-try')
const {mkdirSync, writeFileSync} = require('fs-force')
const rgxmap = require('./build-rules.js')
const ignore = require('./ignore-rules.js')
const depsTree = require('./get-deps-tree.js')
const {projdir, src, out, lib, dep, getlib, jreq, tryReadJSON} = require('../lib/common-vars.js')
const cmpset = require('../lib/compare-set.js')
const getModifiedDate = require('../lib/get-mtime.js')
const createdOutputFiles = new Set()
const mtimeTable = tryReadJSON(join(dep, 'mtime.json'))
const genDepsTree = assign({}, require('./dep-map-json.js'))
const markedChanges = getChangedFiles()

info(`\n${markedChanges.size} files are marked as modified.`)
info('\nBUILDING...')
compile(src, out, 0)
info('\nCLEANING...')
clean(out)
info('\nUPDATING...')
update()
info('\ndone.')

function getChangedFiles () {
  const result = new Set()
  let previous
  let current = new Set(getOwnPropertyNames(depsTree))
  for (const filename in mtimeTable) {
    if (!existsSync(filename)) {
      delete mtimeTable[filename]
      delete genDepsTree[filename]
      current.delete(filename)
    }
  }
  do {
    previous = new Set(current)
    for (const dependent of current) {
      check(dependent) && mark(dependent)
      for (const dependency of depsTree[dependent] || []) {
        check(dependency) && mark(dependent)
      }
    }
  } while (!cmpset(previous, current))
  return result
  function check (name) {
    if (result.has(name)) return true
    const prevmtime = mtimeTable[name]
    const currmtime = getModifiedDate(name)
    if (prevmtime === undefined || prevmtime < currmtime) {
      mtimeTable[name] = currmtime
      return true
    }
    return false
  }
  function mark (name) {
    result.add(name)
    current.delete(name)
  }
}

function compile (source, target, level) {
  if (ignore(source)) return
  const stats = statSync(source)
  if (stats.isDirectory()) {
    mkdirSync(target)
    readdirSync(source).forEach(item => compile(join(source, item), join(target, item), level + 1))
  } else if (stats.isFile()) {
    const {dir, name} = parse(target)
    rgxmap.some(([regex, suffix, build]) => {
      if (!regex.test(source)) return false
      const target = join(dir, name + suffix)
      const isTargetExists = existsSync(target)
      createdOutputFiles.add(target)
      if (markedChanges.has(source)) {
        const sourcecode = readFileSync(source)
        const locals = {projdir, src, out, lib, source, target, dir, name, sourcecode, require, getlib, jreq, markedChanges, level}
        info('▸▸ @bd ' + source)
        const {body, dependencies} = build(sourcecode, locals)
        genDepsTree[source] = dependencies
        writeFileSync(target, body)
        info(`   ${isTargetExists ? '~~~' : '+++'} ` + target + ' (up to date)')
      }
      return true
    }) || updateVersion(source, target)
  } else {
    throw new Error(`Invalid type of fs entry: ${source}`)
  }
}

function clean (target) {
  const stats = statSync(target)
  if (stats.isDirectory()) {
    readdirSync(target).forEach(item => clean(join(target, item)))
    removeEmptyDirectory(target)
  } else if (stats.isFile()) {
    createdOutputFiles.has(target) || removeFile(target)
  }
}

function update () {
  writeFileSync(join(dep, 'dependencies.json'), JSON.stringify(genDepsTree, undefined, 2))
  writeFileSync(join(dep, 'mtime.json'), JSON.stringify(mtimeTable, undefined, 2))
}

function updateVersion (source, target) {
  const isTargetExists = existsSync(target)
  createdOutputFiles.add(target)
  if (markedChanges.has(source)) {
    info('▸▸ @cp ' + source)
    writeFileSync(target, readFileSync(source))
    info(`   ${isTargetExists ? '~~~' : '+++'} ` + target + ' (up to date)')
  }
}

function removeEmptyDirectory (dirname) {
  readdirSync(dirname).length || jtry(() => {
    info('▸▸ @rm ' + dirname)
    rmdirSync(dirname)
    info('   --- ' + dirname + ' (empty directory)')
  })
}

function removeFile (filename) {
  info('▸▸ @rm ' + filename)
  unlinkSync(filename)
  info('   --- ' + filename + ' (redundant file)')
}
