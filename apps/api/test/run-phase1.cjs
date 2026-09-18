/**
 * Standalone Phase 1 test runner — no Jest/npm install required.
 * Compiles TS sources on the fly via the local TypeScript package,
 * then runs assertions with node:assert.
 */
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const Module = require('module');
const { installResolveHook, installTsHook } = require('./dep-paths.cjs');

const ROOT = path.resolve(__dirname, '..');
const SHARED_SRC = path.join(ROOT, '..', '..', 'packages', 'shared', 'src');
const API_SRC = path.join(ROOT, 'src');

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test_access_secret';
process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL_DAYS = '30';
process.env.OTP_TTL_SECONDS = '120';
process.env.OTP_LENGTH = '5';
process.env.OTP_MAX_PER_WINDOW = '3';
process.env.OTP_WINDOW_SECONDS = '300';
process.env.SMS_PROVIDER = 'console';
process.env.REDIS_URL = '';
process.env.NODE_ENV = 'test';

installResolveHook({ root: ROOT, sharedSrc: SHARED_SRC, apiSrc: API_SRC });
const ts = installTsHook();

function compileTs(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      sourceMap: false,
    },
    fileName: filePath,
  }).outputText;
}

Module._extensions['.ts'] = function (module, filename) {
  module._compile(compileTs(filename), filename);
};

const results = { passed: 0, failed: 0, errors: [] };
const suites = [];
let currentSuite = null;
const onlyTests = [];

function describe(name, fn) {
  suites.push({ name, fn, tests: [] });
  currentSuite = suites[suites.length - 1];
  fn();
  currentSuite = null;
}

function it(name, fn) {
  const test = { name, fn };
  if (currentSuite) currentSuite.tests.push(test);
  else onlyTests.push(test);
}

async function runSuite(suite) {
  console.log(`\n${suite.name}`);
  for (const test of suite.tests) {
    try {
      await test.fn();
      results.passed++;
      console.log(`  OK ${test.name}`);
    } catch (err) {
      results.failed++;
      results.errors.push({ suite: suite.name, test: test.name, err });
      console.log(`  FAIL ${test.name}`);
      console.log(`    ${err && err.message ? err.message.split('\n')[0] : String(err)}`);
    }
  }
}

async function main() {
  const shared = require(path.join(SHARED_SRC, 'index.ts'));

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

  describe('RedisService sliding-window rate limit', () => {
    const { RedisService } = require(path.join(API_SRC, 'redis/redis.service.ts'));
    it('blocks 4th request when limit is 3', async () => {
      const redis = new RedisService();
      redis.clearMemory();
      const opts = { key: 'test:b', limit: 3, windowSeconds: 60 };
      await redis.slidingWindowRateLimit(opts);
      await redis.slidingWindowRateLimit(opts);
      await redis.slidingWindowRateLimit(opts);
      const fourth = await redis.slidingWindowRateLimit(opts);
      assert.strictEqual(fourth.allowed, false);
    });
  });

  describe('OtpService', () => {
    const { OtpService } = require(path.join(API_SRC, 'auth/otp.service.ts'));
    const { RedisService } = require(path.join(API_SRC, 'redis/redis.service.ts'));
    function makeOtp() {
      const redis = new RedisService();
      redis.clearMemory();
      const sms = { sendOtp: async () => undefined, calls: [] };
      const otp = new OtpService(redis, sms);
      return { otp, sms };
    }
    it('issues 5-digit OTP and rate-limits after 3', async () => {
      const { otp, sms } = makeOtp();
      const res = await otp.requestOtp('09123456789', '1.2.3.4');
      assert.strictEqual(res.phone, '09123456789');
      assert.strictEqual(sms.calls.length, 0); // sms stub doesn't record unless patched
      const code = await otp.peekOtp('09123456789');
      assert.ok(/^\d{5}$/.test(code));
      await otp.requestOtp('09123456789', '1.2.3.4');
      await otp.requestOtp('09123456789', '1.2.3.4');
      await assert.rejects(() => otp.requestOtp('09123456789', '1.2.3.4'));
    });
  });

  describe('TokenService', () => {
    const { TokenService } = require(path.join(API_SRC, 'auth/token.service.ts'));
    const { RedisService } = require(path.join(API_SRC, 'redis/redis.service.ts'));
    function makeTokens() {
      const { JwtService } = require('@nestjs/jwt');
      const jwt = new JwtService({ secret: 'test_access_secret', signOptions: { expiresIn: '15m' } });
      const redis = new RedisService();
      redis.clearMemory();
      return { tokens: new TokenService(jwt, redis), redis };
    }
    const user = { id: 'user_1', phone: '09123456789', role: 'CONSUMER' };
    it('issues tokens and rotates refresh', async () => {
      const { tokens } = makeTokens();
      const issued = await tokens.issueTokens(user);
      assert.ok(issued.accessToken);
      const payload = tokens.verifyAccess(issued.accessToken);
      assert.strictEqual(payload.sub, user.id);
      const { userId } = await tokens.rotateRefreshToken(issued.refreshToken);
      assert.strictEqual(userId, user.id);
      await assert.rejects(() => tokens.rotateRefreshToken(issued.refreshToken));
    });
  });

  describe('RolesGuard (RBAC)', () => {
    const { RolesGuard } = require(path.join(API_SRC, 'auth/guards/roles.guard.ts'));
    function ctxWithUser(user) {
      return {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({ getRequest: () => ({ user }) }),
      };
    }
    it('ADMIN bypasses; CONSUMER cannot access VENDOR route', () => {
      const vals1 = [false, ['VENDOR']];
      const g1 = new RolesGuard({ getAllAndOverride: () => vals1.shift() });
      assert.strictEqual(g1.canActivate(ctxWithUser({ id: '3', phone: '09', role: 'ADMIN' })), true);
      const vals2 = [false, ['VENDOR']];
      const g2 = new RolesGuard({ getAllAndOverride: () => vals2.shift() });
      assert.throws(() => g2.canActivate(ctxWithUser({ id: '1', phone: '09', role: 'CONSUMER' })));
    });
  });

  describe('AuthService profile completion', () => {
    const { AuthService } = require(path.join(API_SRC, 'auth/auth.service.ts'));
    function makeAuth() {
      const prisma = {
        user: { findUnique: async () => null, upsert: async () => null, update: async () => null },
        vendorProfile: { findUnique: async () => null },
        authAuditLog: { create: async () => ({}) },
      };
      const otp = { requestOtp: async () => ({}), verifyOtp: async () => ({ phone: '09123456789' }) };
      const token = {
        issueTokens: async () => ({ accessToken: 'at', expiresIn: 900, refreshToken: 'rt' }),
        rotateRefreshToken: async () => ({ userId: 'u1' }),
        revokeUserSessions: async () => undefined,
      };
      return { auth: new AuthService(prisma, otp, token), prisma };
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
    });
    it('creates vendor profile when valid; rejects self ADMIN', async () => {
      const { auth, prisma } = makeAuth();
      prisma.user.findUnique = async () => baseUser;
      prisma.vendorProfile.findUnique = async () => null;
      prisma.user.update = async () => ({
        ...baseUser,
        role: 'VENDOR',
        vendorProfile: {
          id: 'vp1',
          businessName: 'x',
          vendorType: 'FOOD',
          categoryTags: [],
          nationalId: '0084575948',
          verificationStatus: 'PENDING',
          description: null,
          socialLinks: {},
          isHomeBased: true,
        },
      });
      const result = await auth.completeProfile('u1', {
        role: 'VENDOR',
        businessName: 'x',
        vendorType: 'FOOD',
        nationalId: '0084575948',
      });
      assert.strictEqual(result.user.role, 'VENDOR');
    });
  });

  for (const suite of suites) {
    await runSuite(suite);
  }

  console.log('\n--------------------------------');
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  if (results.errors.length) {
    for (const e of results.errors) {
      console.log(`- [${e.suite}] ${e.test}`);
      console.log(e.err?.stack || e.err);
    }
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Runner crashed:', err);
  process.exit(1);
});
