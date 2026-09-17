const path = require('path');
const fs = require('fs');
const Module = require('module');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..');
const SHARED_SRC = path.join(ROOT, '..', '..', 'packages', 'shared', 'src');
const API_SRC = path.join(ROOT, 'src');
const apiNM = path.join(ROOT, 'node_modules');
const rootNM = path.join(ROOT, '..', 'node_modules');
process.env.JWT_ACCESS_SECRET = 't';
process.env.REDIS_URL = '';
process.env.NODE_ENV = 'test';
process.env.PAYMENT_PROVIDER = 'mock';
process.env.PLATFORM_COMMISSION_BPS = '1000';
process.env.PAYMENT_HMAC_SECRET = 's';
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
Module._extensions['.ts'] = (m, f) => m._compile(compileTs(f), f);
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === '@nazdik/shared') return path.join(SHARED_SRC, 'index.ts');
  try {
    return orig.call(this, request, parent, ...rest);
  } catch (e) {
    const c = path.join(apiNM, request);
    if (fs.existsSync(c) || fs.existsSync(c + '.js')) return orig.call(this, c, parent, ...rest);
    throw e;
  }
};
const op = Module._nodeModulePaths;
Module._nodeModulePaths = function (from) {
  const p = op.call(this, from);
  p.unshift(apiNM, rootNM);
  return p;
};
(async () => {
  const { RedisService } = require(path.join(API_SRC, 'redis/redis.service.ts'));
  const { TimeSlotService } = require(path.join(API_SRC, 'orders/time-slot.service.ts'));
  const { OrdersService } = require(path.join(API_SRC, 'orders/orders.service.ts'));
  const { ReviewsService } = require(path.join(API_SRC, 'reviews/reviews.service.ts'));
  const { WalletService } = require(path.join(API_SRC, 'payments/wallet.service.ts'));
  const { IdempotencyService } = require(path.join(API_SRC, 'payments/idempotency.service.ts'));
  const { MockGateway } = require(path.join(API_SRC, 'payments/payment-gateway.ts'));
  const { PaymentsService } = require(path.join(API_SRC, 'payments/payments.service.ts'));
  const { NotificationService } = require(path.join(API_SRC, 'notifications/notification.service.ts'));
  const prismaStub = { $executeRaw: async () => 1 };
  const redis = new RedisService();
  redis.clearMemory();
  const reviews = new ReviewsService(prismaStub);
  const slots = new TimeSlotService(prismaStub);
  const orders = new OrdersService(prismaStub, slots, reviews);
  const wallet = new WalletService();
  const idem = new IdempotencyService(redis);
  const notif = new NotificationService();
  const payments = new PaymentsService(prismaStub, wallet, idem, notif, orders);
  payments.setGateway('mock', new MockGateway('s'));
  const order = await orders.createDeliveryOrder({
    consumerId: 'c_ref',
    vendorProfileId: 'vp_ref',
    lines: [{ title: 'item', unitPriceToman: 80000, quantity: 1 }],
  });
  const pay = await payments.createPaymentForOrder({ orderId: order.id, consumerId: 'c_ref' });
  console.log('pay', pay.id, pay.status, pay.authority, pay.provider);
  const wh = await payments.simulateBankSuccess(pay.id);
  console.log('wh', JSON.stringify(wh));
  console.log('after', payments.getPayment(pay.id).status);
  console.log('bal vp_ref', wallet.getBalance('vp_ref'));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
