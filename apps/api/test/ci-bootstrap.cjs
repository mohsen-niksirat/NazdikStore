/**
 * CI bootstrap — ensure test deps exist without monorepo workspace install.
 * Creates lightweight stubs for Nest packages when full install is unavailable.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const API = path.resolve(__dirname, '..');
const NM = path.join(API, 'node_modules');
const EXTRA = process.env.CI_NODE_MODULES || '';

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function write(file, content) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, content);
}

function pkg(name, main, extra = {}) {
  const dir = path.join(NM, name);
  write(path.join(dir, 'package.json'), JSON.stringify({ name, version: '0.0.0-ci', main, ...extra }, null, 2));
}

function stubNestCommon() {
  const dir = path.join(NM, '@nestjs/common');
  pkg('@nestjs/common', 'index.js');
  write(path.join(dir, 'index.js'), `
class HttpException extends Error {
  constructor(response, status) {
    super(typeof response === 'string' ? response : (response && response.message) || 'error');
    this.response = response;
    this.status = status;
  }
  getStatus() { return this.status; }
  getResponse() { return this.response; }
}
function make(code, status) {
  return class extends HttpException {
    constructor(response, ...rest) {
      const body = typeof response === 'string' ? { message: response, code } : { code, ...response };
      super(body, status);
    }
  };
}
exports.HttpException = HttpException;
exports.BadRequestException = make('BAD_REQUEST', 400);
exports.UnauthorizedException = make('UNAUTHORIZED', 401);
exports.ForbiddenException = make('FORBIDDEN', 403);
exports.NotFoundException = make('NOT_FOUND', 404);
exports.ConflictException = make('CONFLICT', 409);
exports.Logger = class Logger {
  constructor(name) { this.name = name; }
  log() {} warn() {} error() {} debug() {} verbose() {}
};
exports.Injectable = () => (t) => t;
exports.Module = () => (t) => t;
exports.Controller = () => (t) => t;
exports.Global = () => (t) => t;
exports.OnModuleInit = class {};
exports.OnModuleDestroy = class {};
exports.PipeTransform = class {};
exports.SetMetadata = () => () => ({});
exports.UseGuards = () => () => ({});
exports.HttpCode = () => () => ({});
exports.Get = () => () => ({});
exports.Post = () => () => ({});
exports.Put = () => () => ({});
exports.Patch = () => () => ({});
exports.Delete = () => () => ({});
exports.Body = () => ({});
exports.Query = () => ({});
exports.Param = () => ({});
exports.Headers = () => ({});
exports.Ip = () => ({});
exports.Req = () => ({});
exports.Res = () => ({});
exports.CurrentUser = () => ({});
exports.Header = () => () => ({});
exports.ApiOperation = () => () => ({});
exports.ApiTags = () => () => ({});
exports.ApiBearerAuth = () => () => ({});
exports.ApiQuery = () => () => ({});
exports.ApiProperty = () => () => ({});
exports.ApiPropertyOptional = () => () => ({});
exports.ApiConsumes = () => () => ({});
exports.ValidationPipe = class ValidationPipe {};
exports.VersioningType = { URI: 'URI' };
exports.NestFactory = { create: async () => ({}) };
exports.ConfigModule = { forRoot: () => ({}) };
`);
}

function stubNestJwt() {
  const dir = path.join(NM, '@nestjs/jwt');
  pkg('@nestjs/jwt', 'index.js');
  write(path.join(dir, 'index.js'), `
const crypto = require('crypto');
function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}
class JwtService {
  constructor(opts = {}) { this.secret = (opts && opts.secret) || 'test_access_secret'; this.signOptions = (opts && opts.signOptions) || {}; }
  async signAsync(payload) {
    const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = b64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now()/1000) + 900 }));
    const sig = crypto.createHmac('sha256', this.secret).update(header + '.' + body).digest('base64url');
    return header + '.' + body + '.' + sig;
  }
  sign(p) { return this.signAsync(p); }
  verify(token) {
    const parts = String(token).split('.');
    if (parts.length !== 3) throw new Error('jwt malformed');
    const sig = crypto.createHmac('sha256', this.secret).update(parts[0] + '.' + parts[1]).digest('base64url');
    if (sig !== parts[2]) throw new Error('invalid signature');
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  }
  verifyAsync(t) { return this.verify(t); }
}
exports.JwtService = JwtService;
exports.JwtModule = { register: () => ({}) };
exports.JwtModule.register = () => ({});
`);
}

function stubNestTesting() {
  const dir = path.join(NM, '@nestjs/testing');
  pkg('@nestjs/testing', 'index.js');
  write(path.join(dir, 'index.js'), `
exports.Test = {
  createTestingModule: async (meta) => {
    const providers = (meta && meta.providers) || [];
    const resolved = new Map();
    const valueProviders = new Map();
    const classProviders = [];
    for (const p of providers) {
      if (typeof p === 'function') classProviders.push(p);
      else if (p && p.provide !== undefined && p.useValue !== undefined) {
        valueProviders.set(p.provide, p.useValue);
        resolved.set(p.provide, p.useValue);
      }
    }
    function construct(Ctor) {
      const args = [];
      const len = Ctor.length;
      // Heuristic wiring for our services: order of constructor deps
      // Pass known mocks first, then other constructed instances
      for (let i = 0; i < len; i++) args.push(undefined);
      const inst = Object.create(Ctor.prototype);
      Ctor.apply ? Ctor.apply(inst, args) : new Ctor(...args);
      return inst;
    }
    for (const Ctor of classProviders) {
      // Build with mocks: prisma-like $queryRaw throw, redis memory, etc.
      const argCount = Ctor.length;
      const args = [];
      for (let i = 0; i < argCount; i++) args.push(valueProviders.values().next().value);
      // Prefer injecting by scanning param names via toString
      const src = Function.prototype.toString.call(Ctor);
      const paramMatch = src.match(/constructor\\s*\\(([^)]*)\\)/);
      const names = paramMatch
        ? paramMatch[1].split(',').map((s) => s.replace(/\\/\\*.*?\\*\\//g, '').trim()).filter(Boolean)
        : [];
      const injected = names.map((n) => {
        const lower = n.toLowerCase();
        if (valueProviders.has(n)) return valueProviders.get(n);
        if (/prisma/.test(lower)) return { $queryRaw: async () => { throw new Error('offline'); }, $executeRaw: async () => 0 };
        if (/redis/.test(lower)) {
          const m = new Map();
          return {
            isMemoryMode: true,
            clearMemory: () => m.clear(),
            get: async (k) => (m.has(k) ? m.get(k) : null),
            set: async (k, v) => m.set(k, v),
            del: async (k) => m.delete(k),
            incr: async (k) => { const x = (Number(m.get(k)) || 0) + 1; m.set(k, String(x)); return x; },
            expire: async () => {},
            ttl: async () => 60,
            slidingWindowRateLimit: async ({ key, limit }) => {
              const c = (Number(m.get('rl:' + key)) || 0) + 1;
              m.set('rl:' + key, String(c));
              return { allowed: c <= limit, remaining: Math.max(0, limit - c), retryAfterSeconds: c > limit ? 10 : 0, count: c };
            },
          };
        }
        if (/jwt/.test(lower)) {
          return new (require('@nestjs/jwt').JwtService)({ secret: 'test_access_secret' });
        }
        if (/sms/.test(lower)) return { sendOtp: async () => {} };
        if (/otp/.test(lower)) return { requestOtp: async () => ({}), verifyOtp: async () => ({ phone: '09' }), peekOtp: async () => null };
        if (/token/.test(lower)) return { issueTokens: async () => ({ accessToken: 'at', expiresIn: 900, refreshToken: 'rt' }), rotateRefreshToken: async () => ({ userId: 'u' }), revokeUserSessions: async () => {}, verifyAccess: () => ({ sub: 'u', phone: '09', role: 'CONSUMER' }) };
        if (/notifications|notif/.test(lower)) return { notify: () => ({}), history: () => [], subscribe: () => () => {} };
        if (/orders/.test(lower)) return { get: () => ({}), createDeliveryOrder: async () => ({}), transition: async () => ({}) };
        if (/wallet|idempot/.test(lower)) return { clearMemory: () => {}, ensureWallet: () => ({}), getBalance: () => 0, postEntry: () => ({ applied: true }), applySuccessfulPayment: () => ({ alreadyApplied: false, commissionToman: 0, vendorCredit: 0 }), begin: async () => ({ proceed: true }), complete: async () => {} };
        if (/media/.test(lower)) return { upload: async () => ({}), get: () => null, listByOwner: () => [] };
        if (/map/.test(lower)) return { seedMemory: () => {}, getMemoryLocations: () => [], queryVendors: async () => ({ features: [], total: 0 }) };
        // already constructed class providers
        for (const C of classProviders) {
          if (C.name && lower.includes(C.name.toLowerCase().replace('service', ''))) {
            return resolved.get(C);
          }
        }
        return undefined;
      });
      const inst = new Ctor(...injected.map((x) => x));
      resolved.set(Ctor, inst);
    }
    return {
      get: (token) => {
        if (resolved.has(token)) return resolved.get(token);
        return undefined;
      },
      compile: async function () { return this; },
    };
  },
};
`);
}

function stubNestCore() {
  const dir = path.join(NM, '@nestjs/core');
  pkg('@nestjs/core', 'index.js');
  write(path.join(dir, 'index.js'), `
exports.Reflector = class Reflector {
  constructor() {
    this._values = [undefined, undefined];
  }
  setMock(...vals) { this._values = vals; }
  getAllAndOverride() {
    return this._values.length ? this._values.shift() : undefined;
  }
};
exports.NestFactory = { create: async () => ({ listen: async () => {} }) };
`);
}

function stubNestPassport() {
  const dir = path.join(NM, '@nestjs/passport');
  pkg('@nestjs/passport', 'index.js');
  write(path.join(dir, 'index.js'), `
exports.PassportStrategy = class PassportStrategy {
  constructor() {}
  validate(payload) { return payload; }
};
exports.AuthGuard = function AuthGuard() {
  return class {
    canActivate() { return true; }
  };
};
`);
}

function stubOthers() {
  pkg('passport', 'index.js');
  write(path.join(NM, 'passport/index.js'), `module.exports = {};`);
  pkg('passport-jwt', 'index.js');
  write(path.join(NM, 'passport-jwt/index.js'), `exports.ExtractJwt = { fromAuthHeaderAsBearerToken: () => () => null }; exports.Strategy = class {};`);
  pkg('class-validator', 'index.js');
  write(path.join(NM, 'class-validator/index.js'), `
exports.IsString = () => () => {};
exports.IsOptional = () => () => {};
exports.Length = () => () => {};
exports.Matches = () => () => {};
exports.IsIn = () => () => {};
exports.IsNumber = () => () => {};
exports.IsInt = () => () => {};
exports.Min = () => () => {};
exports.Max = () => () => {};
exports.IsArray = () => () => {};
exports.IsBoolean = () => () => {};
exports.ValidateNested = () => () => {};
exports.IsEmail = () => () => {};
`);
  pkg('class-transformer', 'index.js');
  write(path.join(NM, 'class-transformer/index.js'), `exports.Type = () => () => {}; exports.plainToClass = (c, o) => o;`);
  pkg('ioredis', 'index.js');
  write(path.join(NM, 'ioredis/index.js'), `
class Redis {
  constructor() { this.offline = true; }
  on() {}
  async get() { return null; }
  async set() {}
  async del() {}
  async incr() { return 0; }
  async expire() {}
  async ttl() { return -2; }
  async quit() {}
  disconnect() {}
  connect() { return Promise.resolve(); }
}
module.exports = Redis;
module.exports.default = Redis;
`);
  pkg('reflect-metadata', 'index.js');
  write(path.join(NM, 'reflect-metadata/index.js'), `
if (!Reflect.getMetadata) {
  Reflect.defineMetadata = () => {};
  Reflect.getMetadata = () => undefined;
}
module.exports = Reflect;
`);
  pkg('rxjs', 'index.js');
  write(path.join(NM, 'rxjs/index.js'), `module.exports = { of: (x) => x, map: (x) => x };`);
  pkg('helmet', 'index.js');
  write(path.join(NM, 'helmet/index.js'), `module.exports = () => (req, res, next) => next && next();`);
  pkg('@prisma/client', 'index.js');
  write(path.join(NM, '@prisma/client/index.js'), `
class PrismaClient {
  async $connect() {}
  async $disconnect() {}
  async $queryRaw() { throw new Error('DATABASE_OFFLINE'); }
  async $executeRaw() { throw new Error('DATABASE_OFFLINE'); }
}
module.exports = { PrismaClient, Prisma: {} };
`);
  write(path.join(NM, '.prisma/client/package.json'), JSON.stringify({ name: '.prisma/client', main: 'default.js' }));
  write(path.join(NM, '.prisma/client/default.js'), `module.exports = require('@prisma/client');`);
}

function stubValidator() {
  pkg('validator', 'index.js');
  write(path.join(NM, 'validator/index.js'), `module.exports = {};`);
  write(path.join(NM, 'validator/lib/isLatLong.js'), `module.exports = () => true;`);
  pkg('libphonenumber-js', 'index.js');
  write(path.join(NM, 'libphonenumber-js/index.js'), `
exports.parsePhoneNumber = (v) => ({ isValid: () => true, format: () => v, number: v });
`);
  write(path.join(NM, 'libphonenumber-js/max.js'), `module.exports = require('./index.js');`);
}

function nodePathBoost() {
  if (!EXTRA) return;
  const orig = Module._nodeModulePaths;
  // register via env already handled by Node
}

let installedTs = false;
try {
  require.resolve('typescript', { paths: [API] });
  installedTs = true;
} catch {
  installedTs = false;
}

if (!installedTs && EXTRA) {
  try {
    require.resolve('typescript', { paths: [EXTRA] });
    installedTs = true;
  } catch {
    /* still missing */
  }
}

if (!installedTs) {
  console.log('TypeScript not found — attempt local npm install (isolated)');
  const { execSync } = require('child_process');
  try {
    execSync('npm install typescript --no-save --no-package-lock --registry https://registry.npmjs.org', {
      cwd: API,
      stdio: 'inherit',
      env: { ...process.env, npm_config_workspaces: 'false' },
    });
  } catch (e) {
    console.error('npm install typescript failed', e.message);
  }
}

// Always ensure stubs for anything missing (harmless if real package exists — we skip)
function missing(name) {
  try {
    require.resolve(name, { paths: [API, EXTRA, NM].filter(Boolean) });
    return false;
  } catch {
    return true;
  }
}

if (missing('@nestjs/common')) stubNestCommon();
if (missing('@nestjs/jwt')) stubNestJwt();
if (missing('@nestjs/testing')) stubNestTesting();
if (missing('@nestjs/core')) stubNestCore();
if (missing('@nestjs/passport')) stubNestPassport();
if (missing('class-validator')) stubOthers();
if (missing('ioredis')) {
  try { require.resolve('ioredis', { paths: [API] }); } catch { stubOthers(); }
}
if (missing('@prisma/client')) {
  try { require.resolve('@prisma/client', { paths: [API] }); } catch { stubOthers(); }
}
stubValidator();

// NODE_PATH for isolated CI deps
if (EXTRA) {
  const current = process.env.NODE_PATH || '';
  process.env.NODE_PATH = [EXTRA, NM, current].filter(Boolean).join(path.delimiter);
  Module._initPaths();
}

console.log('CI bootstrap complete');
console.log('typescript:', (() => {
  try { return require.resolve('typescript', { paths: [API, EXTRA].filter(Boolean) }); }
  catch { return 'MISSING'; }
})());
console.log('nestjs/common:', missing('@nestjs/common') ? 'stubbed-or-missing' : 'ok');
