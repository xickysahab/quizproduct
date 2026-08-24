import { testDatabaseUrl } from './setup';

/**
 * Points this worker at the test database before anything imports Prisma.
 *
 * `config/prisma.ts` reads DATABASE_URL when the module is first evaluated, so
 * this has to happen in a setup file rather than inside a test — by the time a
 * test body runs, the pool is already connected to whatever the developer had
 * in their .env.
 */
process.env.DATABASE_URL = testDatabaseUrl();
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'integration_test_secret_at_least_32_characters';

// Enough for `isRazorpayConfigured()` to pass, so the guards that sit in front
// of the network call can be tested without making one. No test reaches
// Razorpay itself.
process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
process.env.RAZORPAY_KEY_SECRET = 'integration_secret';

// Run the suite as a GST-registered supplier. Config is read once when the
// module is first evaluated, so this has to be set here rather than inside a
// test — and it matters: with no GSTIN every sale is untaxed, checkout stops
// asking for a place of supply, and the guard under test never fires. It also
// keeps checkout from reaching Razorpay, because the guard returns first.
process.env.SELLER_GSTIN = '27AAPFU0939F1ZV';
process.env.SELLER_STATE_CODE = '27';
process.env.SELLER_LEGAL_NAME = 'Integration Test Supplier';
process.env.SELLER_ADDRESS = 'Test Address, Pune';
