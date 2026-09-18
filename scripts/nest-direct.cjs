/**
 * Direct Nest bootstrap — bypass @nestjs/cli (broken optional deps on this host).
 * Boots the real Nest app from apps/api/src with ALLOW_OFFLINE Prisma fallback.
 */
const path = require('path');
const fs = require('fs');
const Module = require('module');

const API = path.resolve(__dirname, '../apps/api');
const SHARED = path.resolve(__dirname, '../packages/shared/src');
const apiNM = path.join(API, 'node_modules');
const ciNM = process.env.CI_NODE_MODULES || '';
const searchRoots = [apiNM, ciNM, path.resolve(__dirname, '../node_modules')].filter(Boolean);

// resolve hook
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === '@nazdik/shared') return path.join(SHARED, 'index.ts');
  try {
    return origResolve.call(this, request, parent, ...rest);
  } catch (e) {
    for (const base of searchRoots) {
      const c = path.join(base, request);
      if (fs.existsSync(c) || fs.existsSync(c + '.js') || fs.existsSync(path.join(c, 'index.js'))) {
        return origResolve.call(this, c, parent, ...rest);
      }
    }
    throw e;
  }
};
const origPaths = Module._nodeModulePaths;
Module._nodeModulePaths = function (from) {
  const p = origPaths.call(this, from);
  p.unshift(...searchRoots);
  return p;
};

// TS transpile
const ts = require(path.join(apiNM, 'typescript'));
Module._extensions['.ts'] = function (mod, filename) {
  const src = fs.readFileSync(filename, 'utf8');
  const out = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
    fileName: filename,
  }).outputText;
  mod._compile(out, filename);
};

// load env
const envFile = path.join(API, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
}
process.env.ALLOW_OFFLINE = '1';
process.env.REDIS_URL = process.env.REDIS_URL || '';
process.env.PORT = process.env.PORT || '4100';

async function main() {
  const { NestFactory } = require(path.join(apiNM, '@nestjs/core'));
  const { ValidationPipe, VersioningType } = require(path.join(apiNM, '@nestjs/common'));
  const helmet = require(path.join(apiNM, 'helmet'));
  const { AppModule } = require(path.join(API, 'src/app.module.ts'));
  const { AllExceptionsFilter } = require(path.join(API, 'src/common/filters/all-exceptions.filter.ts'));

  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  try {
    app.use(helmet({ contentSecurityPolicy: false }));
  } catch {
    /* ignore */
  }
  app.enableCors({
    origin: true,
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  try {
    const { DocumentBuilder, SwaggerModule } = require(path.join(apiNM, '@nestjs/swagger'));
    const cfg = new DocumentBuilder().setTitle('NazdikStore Nest').setVersion('1.0').addBearerAuth().build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, cfg));
  } catch (e) {
    console.warn('swagger skipped', e.message);
  }

  const port = Number(process.env.PORT || 4100);
  await app.listen(port);
  console.log(`NEST API ready → http://127.0.0.1:${port}/api/v1/health`);
  console.log(`DATABASE_URL=${process.env.DATABASE_URL || '(none)'}`);
}

main().catch((e) => {
  console.error('Nest bootstrap failed:', e);
  process.exit(1);
});
