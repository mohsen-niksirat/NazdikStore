/**
 * Phase 3 test runner — media pipeline, feed, purchase-gated reviews.
 */
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const SHARED_SRC = path.join(ROOT, '..', '..', 'packages', 'shared', 'src');
const API_SRC = path.join(ROOT, 'src');
const apiNM = path.join(ROOT, 'node_modules');
const rootNM = path.join(ROOT, '..', 'node_modules');

process.env.JWT_ACCESS_SECRET = 'test_access_secret';
process.env.REDIS_URL = '';
process.env.NODE_ENV = 'test';
process.env.MEDIA_ROOT = path.join(ROOT, 'test', 'tmp-uploads');

const compileTs = (filePath) => {
  const source = fs.readFileSync(filePath, 'utf8');
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
    fileName: filePath,
  }).outputText;
};
Module._extensions['.ts'] = function (module, filename) {
  module._compile(compileTs(filename), filename);
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === '@nazdik/shared') return path.join(SHARED_SRC, 'index.ts');
  try {
    return origResolve.call(this, request, parent, ...rest);
  } catch (e) {
    const candidate = path.join(apiNM, request);
    if (fs.existsSync(candidate) || fs.existsSync(`${candidate}.js`)) {
      return origResolve.call(this, candidate, parent, ...rest);
    }
    throw e;
  }
};
const origPaths = Module._nodeModulePaths;
Module._nodeModulePaths = function (from) {
  const paths = origPaths.call(this, from);
  paths.unshift(apiNM, rootNM);
  return paths;
};

const results = { passed: 0, failed: 0, errors: [] };
let currentSuite = null;
const suites = [];
function describe(name, fn) {
  const suite = { name, tests: [] };
  suites.push(suite);
  currentSuite = suite;
  fn();
  currentSuite = null;
}
function it(name, fn) {
  currentSuite.tests.push({ name, fn });
}
async function run() {
  for (const suite of suites) {
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
        console.log(`    ${err?.message || err}`);
      }
    }
  }
  console.log('\n────────────────────────────────');
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

// Minimal valid JPEG (SOI + APP0 + SOF-ish + SOS + EOI) without EXIF
function minimalJpeg(withExif = false) {
  const parts = [Buffer.from([0xff, 0xd8])]; // SOI
  if (withExif) {
    // APP1 EXIF segment — payload "Exif\0\0" + junk
    const payload = Buffer.concat([
      Buffer.from('Exif\0\0'),
      Buffer.from('MM\0*\0\0\0\0bGPSHERE'),
    ]);
    const len = payload.length + 2;
    parts.push(Buffer.from([0xff, 0xe1, (len >> 8) & 0xff, len & 0xff]), payload);
  }
  // APP0 JFIF
  const jfif = Buffer.from('JFIF\0\x01\x01\x00\x00\x01\x00\x01\x00\x00');
  const jlen = jfif.length + 2;
  parts.push(Buffer.from([0xff, 0xe0, (jlen >> 8) & 0xff, jlen & 0xff]), jfif);
  // SOS + tiny scan + EOI
  parts.push(Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]));
  parts.push(Buffer.from([0x00, 0x00, 0xff, 0xd9]));
  return Buffer.concat(parts);
}

function minimalPng() {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(64, 0),
  ]);
}

function svgPolyglot() {
  return Buffer.from(
    `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`,
  );
}

function htmlPolyglot() {
  return Buffer.from('<!DOCTYPE html><html><body>x</body></html>');
}

async function main() {
  const mediaSec = require(path.join(API_SRC, 'media/media-security.ts'));
  const { MediaService } = require(path.join(API_SRC, 'media/media.service.ts'));
  const { FeedService } = require(path.join(API_SRC, 'feed/feed.service.ts'));
  const { ReviewsService } = require(path.join(API_SRC, 'reviews/reviews.service.ts'));

  const prismaStub = {
    vendorProfile: { findUnique: async () => null },
    completedEngagement: { findFirst: async () => null },
  };

  describe('Media magic-bytes & malicious payload rejection', () => {
    it('detects JPEG / PNG / WEBP from bytes', () => {
      assert.strictEqual(mediaSec.detectImageMime(minimalJpeg()), 'image/jpeg');
      assert.strictEqual(mediaSec.detectImageMime(minimalPng()), 'image/png');
      const webp = Buffer.concat([
        Buffer.from('RIFF'),
        Buffer.from([0x20, 0, 0, 0]),
        Buffer.from('WEBP'),
        Buffer.alloc(8),
      ]);
      assert.strictEqual(mediaSec.detectImageMime(webp), 'image/webp');
      assert.strictEqual(mediaSec.detectImageMime(Buffer.from('nope')), null);
    });

    it('rejects SVG polyglot even if named .jpg', () => {
      const r = mediaSec.scanUpload(svgPolyglot(), {
        filename: 'photo.jpg',
        declaredMime: 'image/jpeg',
      });
      assert.strictEqual(r.ok, false);
      assert.strictEqual(r.code, 'MALICIOUS_PAYLOAD');
    });

    it('rejects HTML polyglot', () => {
      const r = mediaSec.scanUpload(htmlPolyglot(), { filename: 'x.jpg' });
      assert.strictEqual(r.ok, false);
    });

    it('rejects PHP / ELF / ZIP payloads', () => {
      assert.strictEqual(
        mediaSec.scanUpload(Buffer.from('<?php system($_GET[c]); ?>'), { filename: 'a.jpg' }).ok,
        false,
      );
      assert.strictEqual(
        mediaSec.scanUpload(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0, 0, 0, 0]), { filename: 'a.jpg' }).ok,
        false,
      );
      assert.strictEqual(
        mediaSec.scanUpload(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]), { filename: 'a.jpg' }).ok,
        false,
      );
    });

    it('rejects files over 5MB', () => {
      const big = Buffer.concat([minimalJpeg(), Buffer.alloc(5 * 1024 * 1024)]);
      const r = mediaSec.scanUpload(big, { filename: 'big.jpg' });
      assert.strictEqual(r.ok, false);
      assert.strictEqual(r.code, 'FILE_TOO_LARGE');
    });

    it('rejects declared MIME mismatch (png bytes claimed as jpeg)', () => {
      const r = mediaSec.scanUpload(minimalPng(), {
        filename: 'x.jpg',
        declaredMime: 'image/jpeg',
      });
      assert.strictEqual(r.ok, false);
      assert.strictEqual(r.code, 'MIME_MISMATCH');
    });

    it('accepts real JPEG/PNG', () => {
      assert.strictEqual(mediaSec.scanUpload(minimalJpeg(), { filename: 'ok.jpg' }).ok, true);
      assert.strictEqual(mediaSec.scanUpload(minimalPng(), { filename: 'ok.png' }).ok, true);
    });

    it('sanitizes path traversal filenames', () => {
      const name = mediaSec.sanitizeFilename('../../etc/passwd.jpg', 'image/jpeg');
      assert.ok(!name.includes('..'));
      assert.ok(!name.includes('/'));
      assert.ok(name.endsWith('.jpg'));
      const evil = mediaSec.sanitizeFilename('..\\..\\windows\\system32\\cmd.png', 'image/png');
      assert.ok(!evil.includes('\\'));
      assert.ok(evil.endsWith('.png'));
    });

    it('strips EXIF APP1 from JPEG', () => {
      const withExif = minimalJpeg(true);
      assert.ok(withExif.includes(Buffer.from('Exif')));
      const { data, stripped } = mediaSec.stripExif(withExif);
      assert.strictEqual(stripped, true);
      assert.ok(!data.includes(Buffer.from('GPSHERE')));
      assert.ok(data.subarray(0, 2).equals(Buffer.from([0xff, 0xd8])));
      assert.ok(data.subarray(-2).equals(Buffer.from([0xff, 0xd9])));
    });
  });

  describe('MediaService upload pipeline', () => {
    it('stores sanitized JPEG and records EXIF strip', async () => {
      const svc = new MediaService();
      const stored = await svc.upload({
        ownerId: 'user1',
        filename: '../../../evil/../menu.jpg',
        declaredMime: 'image/jpeg',
        buffer: minimalJpeg(true),
      });
      assert.ok(stored.id.startsWith('media_'));
      assert.strictEqual(stored.mimeType, 'image/jpeg');
      assert.ok(!stored.storagePath.includes('..'));
      assert.strictEqual(stored.exifStripped, true);
      assert.ok(stored.checksum.length === 64);
    });

    it('throws BadRequest on SVG polyglot', async () => {
      const svc = new MediaService();
      await assert.rejects(() =>
        svc.upload({
          ownerId: 'user1',
          filename: 'img.jpg',
          declaredMime: 'image/jpeg',
          buffer: svgPolyglot(),
        }),
      );
    });
  });

  describe('Purchase-gated reviews (Phase 3 criterion)', () => {
    it('blocks review without completed engagement', async () => {
      const reviews = new ReviewsService(prismaStub);
      reviews.clearMemory();
      await assert.rejects(
        () =>
          reviews.createReview({
            vendorProfileId: 'vp_food_1',
            consumerId: 'c_new',
            rating: 5,
            body: 'should fail',
          }),
        (err) => {
          const payload = err.getResponse?.() ?? err;
          assert.ok(
            JSON.stringify(payload).includes('FORBIDDEN') ||
              JSON.stringify(payload).includes('completed') ||
              err.status === 403,
            JSON.stringify(payload),
          );
          return true;
        },
      );
    });

    it('allows review after completed order/appointment', async () => {
      const reviews = new ReviewsService(prismaStub);
      reviews.clearMemory();
      reviews.grantEngagement('vp_food_1', 'c_ok');
      const r = await reviews.createReview({
        vendorProfileId: 'vp_food_1',
        consumerId: 'c_ok',
        rating: 5,
        body: 'عالی',
      });
      assert.strictEqual(r.rating, 5);
      assert.ok(r.consumerLabel.includes('***') || r.consumerLabel.length > 0);
    });

    it('rejects invalid rating values', async () => {
      const reviews = new ReviewsService(prismaStub);
      reviews.clearMemory();
      reviews.grantEngagement('vp', 'c');
      await assert.rejects(() =>
        reviews.createReview({ vendorProfileId: 'vp', consumerId: 'c', rating: 0 }),
      );
      await assert.rejects(() =>
        reviews.createReview({ vendorProfileId: 'vp', consumerId: 'c', rating: 6 }),
      );
    });

    it('one review per consumer per vendor (upsert)', async () => {
      const reviews = new ReviewsService(prismaStub);
      reviews.clearMemory();
      reviews.grantEngagement('vp_x', 'c_x');
      const a = await reviews.createReview({ vendorProfileId: 'vp_x', consumerId: 'c_x', rating: 3 });
      const b = await reviews.createReview({ vendorProfileId: 'vp_x', consumerId: 'c_x', rating: 5, body: 'updated' });
      assert.strictEqual(a.id, b.id);
      assert.strictEqual(b.rating, 5);
      assert.strictEqual(reviews.listForVendor('vp_x').length, 1);
    });

    it('vendor can reply to review; summary averages correctly', async () => {
      const reviews = new ReviewsService(prismaStub);
      reviews.clearMemory();
      reviews.grantEngagement('vp_r', 'c1');
      reviews.grantEngagement('vp_r', 'c2');
      const r1 = await reviews.createReview({ vendorProfileId: 'vp_r', consumerId: 'c1', rating: 4 });
      await reviews.createReview({ vendorProfileId: 'vp_r', consumerId: 'c2', rating: 5 });
      const replied = reviews.replyToReview({
        reviewId: r1.id,
        vendorProfileId: 'vp_r',
        vendorUserId: 'vendor1',
        body: 'ممنون از نظرتان',
      });
      assert.ok(replied.reply?.body.includes('ممنون'));
      const sum = reviews.summaryForVendor('vp_r');
      assert.strictEqual(sum.count, 2);
      assert.strictEqual(sum.average, 4.5);
    });

    it('forbids reply when review belongs to another vendor', async () => {
      const reviews = new ReviewsService(prismaStub);
      reviews.clearMemory();
      reviews.grantEngagement('vp_a', 'c1');
      const r = await reviews.createReview({ vendorProfileId: 'vp_a', consumerId: 'c1', rating: 5 });
      assert.throws(() =>
        reviews.replyToReview({
          reviewId: r.id,
          vendorProfileId: 'vp_b',
          vendorUserId: 'x',
          body: 'hi',
        }),
      );
    });
  });

  describe('Feed & vendor profile', () => {
    it('builds profile with posts, products, review summary', async () => {
      const feed = new FeedService(prismaStub, new MediaService());
      const reviews = new ReviewsService(prismaStub);
      feed.clearMemory();
      reviews.clearMemory();

      feed.seedProfile({
        id: 'vp_food_1',
        businessName: 'آشپزخانه مادر',
        vendorType: 'FOOD',
        isHomeBased: true,
        description: 'غذای خانگی',
      });
      feed.createPost({
        vendorProfileId: 'vp_food_1',
        caption: 'امروز قورمه',
        imageUrls: ['/media/a.jpg'],
        productTags: [{ productId: 'p1', title: 'قورمه', priceToman: 185000 }],
      });
      feed.createProduct({
        vendorProfileId: 'vp_food_1',
        title: 'قورمه',
        priceToman: 185000,
        stock: 10,
      });
      reviews.grantEngagement('vp_food_1', 'c1');
      await reviews.createReview({ vendorProfileId: 'vp_food_1', consumerId: 'c1', rating: 5 });

      const profile = feed.getVendorProfile('vp_food_1', reviews.summaryForVendor('vp_food_1'));
      assert.strictEqual(profile.businessName, 'آشپزخانه مادر');
      assert.strictEqual(profile.posts.length, 1);
      assert.strictEqual(profile.products.length, 1);
      assert.strictEqual(profile.products[0].priceToman, 185000);
      assert.strictEqual(profile.reviewSummary.count, 1);
      assert.strictEqual(profile.isHomeBased, true);
      assert.ok(profile.location);
    });

    it('lists local feed newest-first', () => {
      const feed = new FeedService(prismaStub, new MediaService());
      feed.clearMemory();
      feed.seedProfile({ id: 'vp1', businessName: 'A', vendorType: 'FOOD' });
      feed.seedProfile({ id: 'vp2', businessName: 'B', vendorType: 'BEAUTY' });
      feed.createPost({ vendorProfileId: 'vp1', caption: 'first' });
      feed.createPost({ vendorProfileId: 'vp2', caption: 'second' });
      const list = feed.listFeed(10);
      assert.ok(list.length >= 2);
      assert.strictEqual(list[0].caption, 'second');
      assert.strictEqual(list[0].businessName, 'B');
    });

    it('throws NotFound for unknown vendor profile', () => {
      const feed = new FeedService(prismaStub, new MediaService());
      feed.clearMemory();
      assert.throws(() => feed.getVendorProfile('missing'));
    });

    it('home-based profile still hides exact coords (only display + address label)', () => {
      const feed = new FeedService(prismaStub, new MediaService());
      feed.clearMemory();
      feed.seedProfile({
        id: 'vp_home',
        businessName: 'Home Kitchen',
        vendorType: 'FOOD',
        isHomeBased: true,
        address: 'محدوده',
        displayLat: 35.701,
        displayLng: 51.402,
      });
      const p = feed.getVendorProfile('vp_home');
      assert.strictEqual(p.isHomeBased, true);
      assert.ok(p.location);
      assert.strictEqual(typeof p.location.displayLat, 'number');
      // Profile page must not carry a separate exact pin field
      assert.ok(!('exactLat' in p.location));
      assert.ok(!('lat' in (p.location ?? {})));
    });
  });

  await run();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
