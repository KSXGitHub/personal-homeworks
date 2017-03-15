#! /usr/bin/env node
'use strict'

const {dirname, join, parse} = require('path')
const {readdirSync, readFileSync, statSync, mkdirSync, writeFileSync} = require('fs')
const {info} = global.console
const jtry = require('just-try')
const rgxmap = require('./build-rules.js')
const projdir = dirname(__dirname)
const src = join(projdir, 'src')
const out = join(projdir, 'out')
const lib = join(projdir, 'lib')
const tryGetModifiedDate = file => jtry(() => statSync(file).mtime, () => -Infinity)

compile(src, out, 0)
info('done.')

function compile (source, target, level) {
  const stats = statSync(source)
  if (stats.isDirectory()) {
    jtry(() => statSync(target).isDirectory(), () => false) || mkdirSync(target)
    readdirSync(source).forEach(item => compile(join(source, item), join(target, item), level + 1))
  } else if (stats.isFile()) {
    const {dir, name} = parse(target)
    rgxmap.some(([regex, suffix, compile]) => {
      if (!regex.test(source)) return false
      const target = join(dir, name + suffix)
      const sourcemtime = stats.mtime
      const targetmtime = tryGetModifiedDate(target)
      if (sourcemtime > targetmtime) {
        const sourcecode = readFileSync(source)
        const locals = {projdir, src, out, source, target, dir, name, sourcecode, require, getlib, jreq, sourcemtime, targetmtime}
        info(':: Compiling ' + source)
        const output = compile(sourcecode, locals)
        writeFileSync(target, output)
        info('-- Created ' + target)
        return true
      } else {
        info(':: Skipping ' + source)
        return true
      }
    }) || updateVersion(source, target)
  } else {
    throw new Error(`Invalid type of fs entry: ${source}`)
  }
}

function getlib (...name) {
  return jreq(lib, ...name)
}

function jreq (...name) {
  return require(join(...name))
}

function updateVersion (source, target) {
  const sourcemtime = tryGetModifiedDate(source)
  const targetmtime = tryGetModifiedDate(target)
  if (sourcemtime > targetmtime) {
    info(':: Copying ' + source)
    writeFileSync(target, readFileSync(source))
    info('-- Created ' + target)
  } else {
    info(':: Skipping ' + source)
  }
}
