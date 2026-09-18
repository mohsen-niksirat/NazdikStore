/**
 * Shared module-resolution bootstrap for Nazdik test runners.
 * Require this FIRST in every run-phase*.cjs
 */
const path = require('path');
const fs = require('fs');
const Module = require('module');

function installResolveHook({ root, sharedSrc, apiSrc }) {
  const apiNM = path.join(root, 'node_modules');
  const rootNM = path.join(root, '..', 'node_modules');
  const ciNM = process.env.CI_NODE_MODULES || '';
  const searchRoots = [apiNM, rootNM, ciNM].filter(Boolean);
  const origResolve = Module._resolveFilename;
  const origPaths = Module._nodeModulePaths;

  Module._resolveFilename = function (request, parent, ...rest) {
    if (request === '@nazdik/shared' && sharedSrc) {
      return path.join(sharedSrc, 'index.ts');
    }
    try {
      return origResolve.call(this, request, parent, ...rest);
    } catch (e) {
      for (const base of searchRoots) {
        const candidate = path.join(base, request);
        if (
          fs.existsSync(candidate) ||
          fs.existsSync(`${candidate}.js`) ||
          fs.existsSync(path.join(candidate, 'index.js')) ||
          fs.existsSync(path.join(candidate, 'package.json'))
        ) {
          return origResolve.call(this, candidate, parent, ...rest);
        }
      }
      throw e;
    }
  };

  Module._nodeModulePaths = function (from) {
    const paths = origPaths.call(this, from);
    paths.unshift(...searchRoots);
    return paths;
  };

  return searchRoots;
}

function installTsHook() {
  let ts;
  try {
    ts = require('typescript');
  } catch {
    const ci = process.env.CI_NODE_MODULES;
    if (ci) ts = require(path.join(ci, 'typescript'));
    else throw new Error('typescript not installed');
  }
  Module._extensions['.ts'] = function (mod, filename) {
    const source = fs.readFileSync(filename, 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
      },
      fileName: filename,
    });
    mod._compile(outputText, filename);
  };
  return ts;
}

module.exports = { installResolveHook, installTsHook };
