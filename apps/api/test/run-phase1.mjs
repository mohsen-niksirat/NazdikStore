/**
 * Standalone Phase 1 test runner — no Jest/npm install required.
 * Compiles TS sources on the fly via the local TypeScript package,
 * then runs assertions with node:assert.
 */
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const SHARED_SRC = path.join(ROOT, '..', '..', 'packages', 'shared', 'src');
const API_SRC = path.join(ROOT, 'src');

// --- env ---
process.env.JWT_ACCESS_SECRET = 'test_access_secret';
process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL_DAYS = '30';
process.env.OTP_TTL_SECONDS = '120';
process.env.OTP_LENGTH = '5';
process.env.OTP_MAX_PER_WINDOW = '3';
process.env.OTP_WINDOW_SECONDS = '300';
process.env.SMS_PROVIDER = 'console';
process.env.REDIS_URL = '';
process.env.NODE_ENV = 'test';

// --- TS transpile require hook ---
const origJs = Module._extensions['.js'];
function compileTs(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      sourceMap: false,
    },
    fileName: filePath,
  });
  return outputText;
}

Module._extensions['.ts'] = function (module, filename) {
  module._compile(compileTs(filename), filename);
};

// --- module aliases ---
const apiNM = path.join(ROOT, 'node_modules');
const rootNM = path.join(ROOT, '..', 'node_modules');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === '@nazdik/shared') {
    return path.join(SHARED_SRC, 'index.ts');
  }
  if (request.startsWith('@/') || request.startsWith('@/src/')) {
    const rel = request.replace(/^@\/(src\/)?/, '');
    return path.join(API_SRC, rel.endsWith('.ts') ? rel : `${rel}.ts`);
  }
  // Prefer api node_modules then root
  try {
    return origResolve.call(this, request, parent, ...rest);
  } catch (e) {
    try {
      return origResolve.call(this, request, { ...parent, paths: [apiNM, rootNM] }, ...rest);
    } catch (e2) {
      // try absolute in api nm
      const candidate = path.join(apiNM, request);
      if (fs.existsSync(candidate) || fs.existsSync(`${candidate}.js`) || fs.existsSync(path.join(candidate, 'index.js'))) {
        return origResolve.call(this, candidate, parent, ...rest);
      }
      throw e2;
    }
  }
};

// Also patch Module._nodeModulePaths for parent dirs
const origPaths = Module._nodeModulePaths;
Module._nodeModulePaths = function (from) {
  const paths = origPaths.call(this, from);
  paths.unshift(apiNM, rootNM);
  return paths;
};

// --- mini test framework ---
const results = { passed: 0, failed: 0, errors: [] };
const suites = [];

function describe(name, fn) {
  suites.push({ name, fn, tests: [] });
  currentSuite = suites[suites.length - 1];
  fn();
  currentSuite = null;
}
let currentSuite = null;
const onlyTests = [];

function it(name, fn) {
  const test = { name, fn };
  if (currentSuite) currentSuite.tests.push(test);
  else onlyTests.push(test);
}

function itEach(cases, nameFn, fn) {
  for (const c of cases) {
    const label = typeof nameFn === 'function' ? nameFn(c) : String(c);
    it(label, () => fn(c));
  }
}

async function runSuite(suite) {
  console.log(`\n${suite.name}`);
  for (const test of suite.tests) {
    try {
      await test.fn();
      results.passed++;
      console.log(`  ✓ ${test.name}`);
    } catch (err) {
      results.failed++;
      results.errors.push({ suite: suite.name, test: test.name, err });
      console.log(`  ✗ ${test.name}`);
      console.log(`    ${err && err.message ? err.message.split('\n')[0] : String(err)}`);
    }
  }
}

// Inject mini framework into require cache for test files
const frameworkPath = path.join(__dirname, '__framework_runtime.js');
// We'll just define tests by requiring modules and using local describe/it

async function main() {
  // Load shared via hook
  const shared = require(path.join(SHARED_SRC, 'index.ts'));

  // ========== TEST 1: phone ==========
  describe('Iranian phone utilities', () => {
    it('accepts valid formats', () => {
      for (const raw of ['09123456789', '+989123456789', '00989123456789', '989123456789', '0912 345 6789']) {
        assert.strictEqual(shared.isValidIrMobile(raw), true, `should accept ${raw}`);
      }
    });
    it('rejects invalid formats', () => {
      for (const raw of ['0912345678', '08123456789', '1234567890', '091234567890', '', 'abc']) {
        assert.strictEqual(shared.isValidIrMobile(raw), false, `should reject ${raw}`);
      }
    });
    it('normalizes to local 09 form', () => {
      assert.strictEqual(shared.normalizeIrMobile('+989123456789'), '09123456789');
      assert.strictEqual(shared.normalizeIrMobile('00989123456789'), '09123456789');
      assert.strictEqual(shared.normalizeIrMobile('989123456789'), '09123456789');
    });
    it('throws on invalid normalize', () => {
      assert.throws(() => shared.normalizeIrMobile('123'), /INVALID_IR_MOBILE/);
    });
    it('E164 + display + mask', () => {
      assert.strictEqual(shared.toE164IrMobile('09123456789'), '+989123456789');
      assert.strictEqual(shared.formatIrMobileDisplay('09123456789'), '0912 345 6789');
      assert.strictEqual(shared.maskIrMobile('09123456789'), '0912 *** 6789');
    });
  });

  // ========== TEST 2: error envelopes ==========
  describe('Localized error envelopes', () => {
    it('returns Persian + English for known codes', () => {
      const env = shared.buildErrorEnvelope(shared.ERROR_CODES.OTP_RATE_LIMITED);
      assert.strictEqual(env.success, false);
      assert.strictEqual(env.error.code, 'OTP_RATE_LIMITED');
      assert.ok(env.error.message.includes('زیاد'));
      assert.ok(env.error.messageEn.includes('Too many'));
    });
    it('falls back for unknown codes', () => {
      const env = shared.buildErrorEnvelope('UNKNOWN_CODE_XYZ');
      assert.strictEqual(env.error.message, shared.ERROR_MESSAGES_FA.INTERNAL_ERROR);
    });
    it('includes details', () => {
      const env = shared.buildErrorEnvelope(shared.ERROR_CODES.OTP_RATE_LIMITED, { retryAfterSeconds: 42 });
      assert.deepStrictEqual(env.error.details, { retryAfterSeconds: 42 });
    });
  });

  // ========== TEST 3: Redis rate limit ==========
  const { RedisService } = require(path.join(API_SRC, 'redis/redis.service.ts'));
  describe('RedisService sliding-window rate limit', () => {
    let redis;
    beforeEachLocal(() => {
      redis = new RedisService();
      if (redis.clearMemory) redis.clearMemory();
    });

    it('allows under limit', async () => {
      redis = new RedisService();
      redis.clearMemory();
      const r = await redis.slidingWindowRateLimit({ key: 'test:a', limit: 3, windowSeconds: 60 });
      assert.strictEqual(r.allowed, true);
      assert.strictEqual(r.count, 1);
    });

    it('blocks 4th request when limit is 3', async () => {
      redis = new RedisService();
      redis.clearMemory();
      const opts = { key: 'test:b', limit: 3, windowSeconds: 60 };
      await redis.slidingWindowRateLimit(opts);
      await redis.slidingWindowRateLimit(opts);
      await redis.slidingWindowRateLimit(opts);
      const fourth = await redis.slidingWindowRateLimit(opts);
      assert.strictEqual(fourth.allowed, false);
      assert.strictEqual(fourth.count, 3);
      assert.ok(fourth.retryAfterSeconds > 0);
    });

    it('separate buckets per key', async () => {
      redis = new RedisService();
      redis.clearMemory();
      const opts = { limit: 2, windowSeconds: 60 };
      await redis.slidingWindowRateLimit({ ...opts, key: 'phone:0912' });
      await redis.slidingWindowRateLimit({ ...opts, key: 'phone:0912' });
      const other = await redis.slidingWindowRateLimit({ ...opts, key: 'phone:0935' });
      assert.strictEqual(other.allowed, true);
    });

    it('set/get/ttl/del roundtrip', async () => {
      redis = new RedisService();
      redis.clearMemory();
      await redis.set('k', 'v', 30);
      assert.strictEqual(await redis.get('k'), 'v');
      assert.ok((await redis.ttl('k')) > 0);
      await redis.del('k');
      assert.strictEqual(await redis.get('k'), null);
    });
  });

  function beforeEachLocal() {
    /* placeholder for symmetry */
  }

  // ========== TEST 4: OTP service ==========
  const { OtpService } = require(path.join(API_SRC, 'auth/otp.service.ts'));
  const { SmsService } = require(path.join(API_SRC, 'auth/sms.service.ts'));

  describe('OtpService', () => {
    function makeOtp() {
      const redis = new RedisService();
      redis.clearMemory();
      const sms = { sendOtp: async () => undefined, calls: [] };
      const realSend = sms.sendOtp;
      sms.sendOtp = async (...args) => {
        sms.calls.push(args);
        return realSend(...args);
      };
      const otp = new OtpService(redis, sms);
      return { otp, redis, sms };
    }

    it('issues 5-digit OTP and sends SMS', async () => {
      const { otp, sms } = makeOtp();
      const res = await otp.requestOtp('09123456789', '1.2.3.4');
      assert.strictEqual(res.phone, '09123456789');
      assert.strictEqual(res.expiresInSeconds, 120);
      assert.strictEqual(sms.calls.length, 1);
      const code = await otp.peekOtp('09123456789');
      assert.ok(/^\d{5}$/.test(code), `code=${code}`);
    });

    it('rejects invalid phone', async () => {
      const { otp } = makeOtp();
      await assert.rejects(() => otp.requestOtp('08123456789', '1.2.3.4'));
    });

    it('rate-limits after 3 requests per phone', async () => {
      const { otp } = makeOtp();
      await otp.requestOtp('09123456789', '1.2.3.4');
      await otp.requestOtp('09123456789', '1.2.3.4');
      await otp.requestOtp('09123456789', '1.2.3.4');
      await assert.rejects(
        () => otp.requestOtp('09123456789', '1.2.3.4'),
        (err) => {
          const body = err.response || err.getResponse?.() || err;
          const code = body.code || body?.response?.code || err.message;
          assert.ok(
            String(JSON.stringify(err)).includes('OTP_RATE_LIMITED') ||
              String(err.message).includes('OTP_RATE_LIMITED') ||
              (err.getResponse && JSON.stringify(err.getResponse()).includes('OTP_RATE_LIMITED')),
            `expected OTP_RATE_LIMITED got ${err.message} / ${JSON.stringify(err.getResponse?.())}`,
          );
          return true;
        },
      );
    });

    it('rate-limits by IP independently', async () => {
      const { otp } = makeOtp();
      await otp.requestOtp('09123456789', '10.0.0.1');
      await otp.requestOtp('09123456788', '10.0.0.1');
      await otp.requestOtp('09123456787', '10.0.0.1');
      await assert.rejects(() => otp.requestOtp('09123456786', '10.0.0.1'));
    });

    it('verifies correct OTP and deletes it (single-use)', async () => {
      const { otp } = makeOtp();
      await otp.requestOtp('09123456789', '1.2.3.4');
      const code = await otp.peekOtp('09123456789');
      const result = await otp.verifyOtp('09123456789', code);
      assert.strictEqual(result.phone, '09123456789');
      assert.strictEqual(await otp.peekOtp('09123456789'), null);
      await assert.rejects(() => otp.verifyOtp('09123456789', code));
    });

    it('rejects wrong OTP', async () => {
      const { otp } = makeOtp();
      await otp.requestOtp('09123456789', '1.2.3.4');
      const code = await otp.peekOtp('09123456789');
      const wrong = code === '00000' ? '11111' : '00000';
      await assert.rejects(() => otp.verifyOtp('09123456789', wrong));
    });
  });

  // ========== TEST 5: Token service ==========
  const { TokenService } = require(path.join(API_SRC, 'auth/token.service.ts'));

  describe('TokenService', () => {
    function makeTokens() {
      const { JwtService } = require(path.join(apiNM, '@nestjs/jwt'));
      const jwt = new JwtService({
        secret: 'test_access_secret',
        signOptions: { expiresIn: '15m' },
      });
      const redis = new RedisService();
      redis.clearMemory();
      return { tokens: new TokenService(jwt, redis), redis };
    }
    const user = { id: 'user_1', phone: '09123456789', role: 'CONSUMER' };

    it('issues access + refresh tokens', async () => {
      const { tokens } = makeTokens();
      const issued = await tokens.issueTokens(user);
      assert.ok(issued.accessToken);
      assert.ok(issued.refreshToken);
      assert.strictEqual(issued.expiresIn, 900);
    });

    it('access token payload contains sub/phone/role', async () => {
      const { tokens } = makeTokens();
      const issued = await tokens.issueTokens(user);
      const payload = tokens.verifyAccess(issued.accessToken);
      assert.strictEqual(payload.sub, user.id);
      assert.strictEqual(payload.phone, user.phone);
      assert.strictEqual(payload.role, 'CONSUMER');
    });

    it('rejects garbage access tokens', () => {
      const { tokens } = makeTokens();
      assert.throws(() => tokens.verifyAccess('not.a.jwt'));
    });

    it('rotates refresh tokens (old token dies after use)', async () => {
      const { tokens } = makeTokens();
      const first = await tokens.issueTokens(user);
      const { userId } = await tokens.rotateRefreshToken(first.refreshToken);
      assert.strictEqual(userId, user.id);
      await assert.rejects(() => tokens.rotateRefreshToken(first.refreshToken));
    });

    it('rejects empty refresh tokens', async () => {
      const { tokens } = makeTokens();
      await assert.rejects(() => tokens.rotateRefreshToken(''));
    });

    it('revokes all sessions for a user', async () => {
      const { tokens } = makeTokens();
      const issued = await tokens.issueTokens(user);
      await tokens.revokeUserSessions(user.id);
      await assert.rejects(() => tokens.rotateRefreshToken(issued.refreshToken));
    });
  });

  // ========== TEST 6: RBAC ==========
  const { RolesGuard } = require(path.join(API_SRC, 'auth/guards/roles.guard.ts'));

  describe('RolesGuard (RBAC)', () => {
    function ctxWithUser(user) {
      return {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({ getRequest: () => ({ user }) }),
      };
    }
    function makeGuard(map) {
      return new RolesGuard({ getAllAndOverride: map });
    }

    it('allows public routes', () => {
      const guard = makeGuard(() => true);
      assert.strictEqual(guard.canActivate(ctxWithUser()), true);
    });

    it('allows when no roles metadata', () => {
      const guard = makeGuard(() => undefined);
      assert.strictEqual(guard.canActivate(ctxWithUser({ id: '1', phone: '09', role: 'CONSUMER' })), true);
    });

    it('allows CONSUMER when CONSUMER required', () => {
      const vals = [false, ['CONSUMER']];
      const guard = makeGuard(() => vals.shift());
      assert.strictEqual(guard.canActivate(ctxWithUser({ id: '1', phone: '09', role: 'CONSUMER' })), true);
    });

    it('forbids CONSUMER on VENDOR-only route', () => {
      const vals = [false, ['VENDOR']];
      const guard = makeGuard(() => vals.shift());
      assert.throws(() => guard.canActivate(ctxWithUser({ id: '1', phone: '09', role: 'CONSUMER' })));
    });

    it('allows VENDOR on VENDOR-only route', () => {
      const vals = [false, ['VENDOR']];
      const guard = makeGuard(() => vals.shift());
      assert.strictEqual(guard.canActivate(ctxWithUser({ id: '2', phone: '09', role: 'VENDOR' })), true);
    });

    it('ADMIN bypasses role restrictions', () => {
      const vals = [false, ['VENDOR']];
      const guard = makeGuard(() => vals.shift());
      assert.strictEqual(guard.canActivate(ctxWithUser({ id: '3', phone: '09', role: 'ADMIN' })), true);
    });

    it('throws when required roles set but no user', () => {
      const vals = [false, ['CONSUMER']];
      const guard = makeGuard(() => vals.shift());
      assert.throws(() => guard.canActivate(ctxWithUser(undefined)));
    });
  });

  // ========== TEST 7: AuthService profile ==========
  const { AuthService } = require(path.join(API_SRC, 'auth/auth.service.ts'));

  describe('AuthService profile completion', () => {
    function makeAuth() {
      const prisma = {
        user: {
          findUnique: async () => null,
          upsert: async () => null,
          update: async () => null,
        },
        vendorProfile: { findUnique: async () => null },
        authAuditLog: { create: async () => ({}) },
      };
      const otp = {
        requestOtp: async () => ({}),
        verifyOtp: async () => ({ phone: '09123456789' }),
      };
      const token = {
        issueTokens: async () => ({ accessToken: 'at', expiresIn: 900, refreshToken: 'rt' }),
        rotateRefreshToken: async () => ({ userId: 'u1' }),
        revokeUserSessions: async () => undefined,
      };
      return { auth: new AuthService(prisma, otp, token), prisma, otp, token };
    }
    const baseUser = {
      id: 'u1',
      phone: '09123456789',
      role: 'CONSUMER',
      firstName: null,
      lastName: null,
      avatarUrl: null,
      isPhoneVerified: true,
      createdAt: new Date(),
    };

    it('validates Iranian national ID check digit', () => {
      const { auth } = makeAuth();
      assert.strictEqual(auth.isValidIranianNationalId('0084575948'), true);
      assert.strictEqual(auth.isValidIranianNationalId('1234567890'), false);
      assert.strictEqual(auth.isValidIranianNationalId('123'), false);
    });

    it('completes consumer profile without vendor fields', async () => {
      const { auth, prisma } = makeAuth();
      prisma.user.findUnique = async () => baseUser;
      prisma.user.update = async () => ({
        ...baseUser,
        role: 'CONSUMER',
        firstName: 'Sara',
        vendorProfile: null,
      });
      const result = await auth.completeProfile('u1', {
        role: 'CONSUMER',
        firstName: 'Sara',
        lastName: 'Ahmadi',
      });
      assert.strictEqual(result.user.firstName, 'Sara');
      assert.strictEqual(result.vendorProfile, null);
    });

    it('requires businessName + vendorType for VENDOR', async () => {
      const { auth, prisma } = makeAuth();
      prisma.user.findUnique = async () => baseUser;
      await assert.rejects(() => auth.completeProfile('u1', { role: 'VENDOR' }));
    });

    it('rejects self-assigned ADMIN (stays CONSUMER)', async () => {
      const { auth, prisma } = makeAuth();
      prisma.user.findUnique = async () => baseUser;
      prisma.user.update = async () => ({
        ...baseUser,
        role: 'CONSUMER',
        vendorProfile: null,
      });
      const result = await auth.completeProfile('u1', { role: 'ADMIN' });
      assert.strictEqual(result.user.role, 'CONSUMER');
    });

    it('creates vendor profile when role=VENDOR with valid data', async () => {
      const { auth, prisma } = makeAuth();
      prisma.user.findUnique = async () => baseUser;
      prisma.vendorProfile.findUnique = async () => null;
      prisma.user.update = async () => ({
        ...baseUser,
        role: 'VENDOR',
        vendorProfile: {
          id: 'vp1',
          businessName: 'آشپزخانه نزدیک',
          vendorType: 'FOOD',
          categoryTags: ['home-chef'],
          nationalId: '0084575948',
          verificationStatus: 'PENDING',
          description: 'غذای خانگی',
          socialLinks: {},
          isHomeBased: true,
        },
      });
      const result = await auth.completeProfile('u1', {
        role: 'VENDOR',
        businessName: 'آشپزخانه نزدیک',
        vendorType: 'FOOD',
        nationalId: '0084575948',
        description: 'غذای خانگی',
        isHomeBased: true,
        categoryTags: ['home-chef'],
      });
      assert.strictEqual(result.user.role, 'VENDOR');
      assert.strictEqual(result.vendorProfile.businessName, 'آشپزخانه نزدیک');
      assert.strictEqual(result.vendorProfile.vendorType, 'FOOD');
    });

    it('rejects invalid national ID for vendors', async () => {
      const { auth, prisma } = makeAuth();
      prisma.user.findUnique = async () => baseUser;
      await assert.rejects(() =>
        auth.completeProfile('u1', {
          role: 'VENDOR',
          businessName: 'X',
          vendorType: 'FOOD',
          nationalId: '1234567890',
        }),
      );
    });

    it('conflicts when national ID already used by another vendor', async () => {
      const { auth, prisma } = makeAuth();
      prisma.user.findUnique = async () => baseUser;
      prisma.vendorProfile.findUnique = async () => ({
        id: 'other',
        userId: 'someone-else',
        nationalId: '0084575948',
      });
      await assert.rejects(() =>
        auth.completeProfile('u1', {
          role: 'VENDOR',
          businessName: 'X',
          vendorType: 'BEAUTY',
          nationalId: '0084575948',
        }),
      );
    });

    it('verifyOtp upserts user and issues tokens', async () => {
      const { auth, prisma, otp } = makeAuth();
      otp.verifyOtp = async () => ({ phone: '09123456789' });
      prisma.user.upsert = async () => ({ ...baseUser, vendorProfile: null });
      prisma.authAuditLog.create = async () => ({});
      const result = await auth.verifyOtp('09123456789', '12345', '1.2.3.4', 'test');
      assert.strictEqual(result.user.phone, '09123456789');
      assert.strictEqual(result.tokens.accessToken, 'at');
      assert.strictEqual(result.requiresProfileCompletion, false);
    });
  });

  // Run all suites
  for (const suite of suites) {
    await runSuite(suite);
  }
  for (const test of onlyTests) {
    try {
      await test.fn();
      results.passed++;
    } catch (err) {
      results.failed++;
      results.errors.push({ suite: '(root)', test: test.name, err });
    }
  }

  console.log('\n────────────────────────────────');
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  if (results.errors.length) {
    console.log('\nFailures:');
    for (const e of results.errors) {
      console.log(`- [${e.suite}] ${e.test}`);
      console.log(`  ${e.err?.stack || e.err}`);
    }
  }
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Runner crashed:', err);
  process.exit(1);
});
