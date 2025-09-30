#!/usr/bin/env node

const https = require('https');
const { URL } = require('url');

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

const [customerId, bvn, dob, gender] = process.argv.slice(2);
if (!customerId || !bvn || !dob || !gender) {
  console.log('Usage: node scripts/anchorTier1Test.js <customerId> <bvn> <YYYY-MM-DD> <male|female> [tier1|tier2]');
  process.exit(0);
}

const anchorKey = process.env.ANCHOR_API_KEY;
const baseUrl = process.env.ANCHOR_BASE_URL || 'https://api.sandbox.getanchor.co';
if (!anchorKey) {
  fail('Set ANCHOR_API_KEY in your environment');
}

const normalizedGender = gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase();

const payload = JSON.stringify({
  data: {
    type: 'Verification',
    attributes: {
      level: 'TIER_2',
      level2: {
        bvn,
        dateOfBirth: dob,
        gender: normalizedGender,
      },
    },
  },
});

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-anchor-key': anchorKey,
        'Content-Length': body ? Buffer.byteLength(body) : 0,
      },
    };
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : null;
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          } else {
            resolve(json);
          }
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

(async () => {
  try {
    console.log(`➡️  Triggering Tier1 for ${customerId}`);
    await request('POST', `/api/v1/customers/${customerId}/verification/individual`, payload);
    console.log('✅ Triggered. Polling status...');
    const maxSeconds = 120;
    for (let i = 0; i < maxSeconds; i += 5) {
      await new Promise((r) => setTimeout(r, 5000));
      const status = await request('GET', `/api/v1/customers/${customerId}`);
    const verification = status?.data?.attributes?.verification;
    const current = verification?.level1?.status || verification?.status || 'unknown';
    console.log(`⏱️  Status after ${i + 5}s: ${current}`);
    if (current === 'unknown') {
      console.log('ℹ️  Full verification block:', JSON.stringify(verification, null, 2));
    }
      if (current === 'approved' || current === 'rejected') {
        console.log('🎯 Final status:', current);
        process.exit(0);
      }
    }
    console.log('⌛ Timed out waiting for approval.');
  } catch (err) {
    fail(err.message);
  }
})();
