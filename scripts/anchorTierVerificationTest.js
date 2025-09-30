#!/usr/bin/env node

const https = require('https');
const { URL } = require('url');
const crypto = require('crypto');
const { Buffer } = require('buffer');

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

const [customerId, tier, jsonPayload] = process.argv.slice(2);
if (!customerId || !tier || !jsonPayload) {
  console.log(
    'Usage: node scripts/anchorTierVerificationTest.js <customerId> <tier1|tier2|tier3> <attributes-json>'
  );
  process.exit(0);
}

let attributes;
try {
  attributes = JSON.parse(jsonPayload);
} catch (err) {
  fail('Payload must be valid JSON');
}

const anchorKey = process.env.ANCHOR_API_KEY;
const baseUrl = process.env.ANCHOR_BASE_URL || 'https://api.sandbox.getanchor.co';
if (!anchorKey) {
  fail('Set ANCHOR_API_KEY in your environment');
}

const tierUpper = tier.toUpperCase();
if (!['TIER1', 'TIER2', 'TIER3', 'TIER_1', 'TIER_2', 'TIER_3'].includes(tierUpper)) {
  fail('Tier must be tier1, tier2, or tier3');
}

const levelKey = `level${tierUpper.replace('TIER_', '')}`;
const payload = JSON.stringify({
  data: {
    type: 'Verification',
    attributes: {
      level: tierUpper.includes('_') ? tierUpper : tierUpper.replace('TIER', 'TIER_'),
      [levelKey]: attributes,
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
        'Content-Length': body ? Buffer.from(body).length : 0,
      },
    };
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        } else {
          resolve(data ? JSON.parse(data) : {});
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
    console.log(`➡️  Triggering ${tierUpper} for ${customerId}`);
    await request('POST', `/api/v1/customers/${customerId}/verification/individual`, payload);
    if (process.env.ANCHOR_WEBHOOK_SECRET) {
      const body = JSON.stringify(payload);
      const sha1Sig = crypto
        .createHmac('sha1', process.env.ANCHOR_WEBHOOK_SECRET)
        .update(body)
        .digest('base64');
      const sha256Sig = crypto
        .createHmac('sha256', process.env.ANCHOR_WEBHOOK_SECRET)
        .update(body)
        .digest('hex');
      console.log('🔐 Expected webhook signatures:');
      console.log('   x-anchor-signature:', sha1Sig);
      console.log('   x-anchor-signature (sha256=...):', `sha256=${sha256Sig}`);
    }
    console.log('✅ Triggered. Polling status...');
    const maxSeconds = 120;
    for (let elapsed = 5; elapsed <= maxSeconds; elapsed += 5) {
      await new Promise((res) => setTimeout(res, 5000));
      const statusResp = await request('GET', `/api/v1/customers/${customerId}`);
      const verification = statusResp?.data?.attributes?.verification;
      const current =
        verification?.level1?.status ||
        verification?.status ||
        verification?.latestStatus ||
        'unknown';
      console.log(`⏱️  Status after ${elapsed}s: ${current}`);
      if (current === 'approved' || current === 'rejected') {
        console.log('🎯 Final status:', current);
        if (verification?.level3?.status) {
          console.log('📄 Document status:', verification.level3.status);
        }
        process.exit(0);
      }
    }
    console.log('⌛ Timed out waiting for approval.');
  } catch (err) {
    fail(err.message);
  }
})();
