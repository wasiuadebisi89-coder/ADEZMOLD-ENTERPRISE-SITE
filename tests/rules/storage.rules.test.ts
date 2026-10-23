import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { getBytes, ref, uploadBytes } from 'firebase/storage';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-bms',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'companies/A/members/alice'), { status: 'active', permissions: [] });
    await setDoc(doc(db, 'companies/B/members/bob'), { status: 'active', permissions: [] });
    await setDoc(doc(db, 'companies/A/attachments/att1'), { status: 'pending', uploadedBy: 'alice', fileName: 'receipt.pdf' });
    await setDoc(doc(db, 'companies/A/attachments/done'), { status: 'stored', uploadedBy: 'alice', fileName: 'old.pdf' });
    await uploadBytes(ref(ctx.storage(), 'companies/A/attachments/done/old.pdf'), new Uint8Array([1, 2, 3]), {
      contentType: 'application/pdf',
    });
  });
});

const storage = (uid: string) => env.authenticatedContext(uid).storage();
const pdf = { contentType: 'application/pdf' };
const small = new Uint8Array([37, 80, 68, 70]);

describe('C6 storage isolation', () => {
  it('member uploads to a pending attachment they own', async () => {
    await assertSucceeds(uploadBytes(ref(storage('alice'), 'companies/A/attachments/att1/receipt.pdf'), small, pdf));
  });
  it('other tenant cannot upload or read', async () => {
    await assertFails(uploadBytes(ref(storage('bob'), 'companies/A/attachments/att1/receipt.pdf'), small, pdf));
    await assertFails(getBytes(ref(storage('bob'), 'companies/A/attachments/done/old.pdf')));
  });
  it('member reads stored attachments of their company', async () => {
    await assertSucceeds(getBytes(ref(storage('alice'), 'companies/A/attachments/done/old.pdf')));
  });
  it('rejects uploads without a pending record, wrong file name, disallowed type or > 10 MB', async () => {
    await assertFails(uploadBytes(ref(storage('alice'), 'companies/A/attachments/nope/receipt.pdf'), small, pdf));
    await assertFails(uploadBytes(ref(storage('alice'), 'companies/A/attachments/done/old.pdf'), small, pdf));
    await assertFails(uploadBytes(ref(storage('alice'), 'companies/A/attachments/att1/other.pdf'), small, pdf));
    await assertFails(
      uploadBytes(ref(storage('alice'), 'companies/A/attachments/att1/receipt.pdf'), small, { contentType: 'application/x-msdownload' }),
    );
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    await assertFails(uploadBytes(ref(storage('alice'), 'companies/A/attachments/att1/receipt.pdf'), big, pdf));
  });
  it('denies everything outside the attachments path', async () => {
    await assertFails(uploadBytes(ref(storage('alice'), 'public/anything.pdf'), small, pdf));
  });
});
