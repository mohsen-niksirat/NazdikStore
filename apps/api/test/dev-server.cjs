/**
 * Lightweight local API server — no Nest CLI required.
 * Boots the Nest app in-process for offline/dev use.
 */
const path = require('path');
const fs = require('fs');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const SHARED_SRC = path.join(ROOT, '..', '..', 'packages', 'shared', 'src');
const API_SRC = path.join(ROOT, 'src');
const apiNM = path.join(ROOT, 'node_modules');
const rootNM = path.join(ROOT, '..', 'node_modules');

// Load .env if present
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
process.env.ALLOW_OFFLINE = process.env.ALLOW_OFFLINE ?? '1';
process.env.REDIS_URL = process.env.REDIS_URL || '';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'dev_access_change_me';
process.env.PAYMENT_PROVIDER = process.env.PAYMENT_PROVIDER || 'mock';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:3000';
process.env.SEED_MAP = process.env.SEED_MAP || '1';

const compileTs = (p) =>
  ts.transpileModule(fs.readFileSync(p, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
    fileName: p,
  }).outputText;

Module._extensions['.ts'] = (mod, filename) => {
  mod._compile(compileTs(filename), filename);
};

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === '@nazdik/shared') {
    return path.join(SHARED_SRC, 'index.ts');
  }
  try {
    return origResolve.call(this, request, parent, ...rest);
  } catch (err) {
    for (const base of [apiNM, rootNM]) {
      const candidate = path.join(base, request);
      if (fs.existsSync(candidate) || fs.existsSync(candidate + '.js') || fs.existsSync(candidate + '.ts')) {
        return origResolve.call(this, candidate, parent, ...rest);
      }
    }
    throw err;
  }
};

const origPaths = Module._nodeModulePaths;
Module._nodeModulePaths = function (from) {
  const paths = origPaths.call(this, from);
  paths.unshift(apiNM, rootNM);
  return paths;
};

async function main() {
  // Prefer Nest bootstrap when @nestjs/platform-express is complete
  let canNest = false;
  try {
    require.resolve('@nestjs/core', { paths: [apiNM, rootNM] });
    require.resolve('@nestjs/platform-express', { paths: [apiNM, rootNM] });
    require.resolve('express', { paths: [apiNM, rootNM] });
    canNest = true;
  } catch {
    canNest = false;
  }

  if (!canNest) {
    console.error('Nest runtime incomplete. Run from repo root: npm install');
    console.error('Then: npm run dev:api  (or npm run dev --workspace=@nazdik/api)');
    process.exit(1);
  }

  // Reuse main.ts bootstrap via dynamic import of AppModule + NestFactory
  const { NestFactory } = require(path.join(apiNM, '@nestjs/core'));
  const { ValidationPipe, VersioningType } = require(path.join(apiNM, '@nestjs/common'));
  const helmet = require(path.join(apiNM, 'helmet'));
  const { AppModule } = require(path.join(API_SRC, 'app.module.ts'));
  const { AllExceptionsFilter } = require(path.join(API_SRC, 'common/filters/all-exceptions.filter.ts'));

  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  app.use(helmet({ contentSecurityPolicy: false }));
  app.enableCors({
    origin: process.env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
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
    const config = new DocumentBuilder()
      .setTitle('NazdikStore API')
      .setDescription('Hyperlocal multi-vendor marketplace')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  } catch {
    /* swagger optional offline */
  }

  const port = Number(process.env.PORT || 4000);
  await app.listen(port);
  console.log(`NazdikStore API (local) → http://localhost:${port}/api`);
  console.log(`Health → http://localhost:${port}/api/v1/health`);
  console.log(`Swagger → http://localhost:${port}/api/docs`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
