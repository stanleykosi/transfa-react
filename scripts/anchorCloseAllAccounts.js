#!/usr/bin/env node

/**
 * Utility script to iterate over all deposit accounts issued via Anchor and close them.
 *
 * Requirements:
 *   - Node.js 18+
 *   - Environment variables:
 *       ANCHOR_API_KEY   (required)
 *       ANCHOR_BASE_URL  (optional, defaults to sandbox)
 *       ANCHOR_PAGE_SIZE (optional, defaults to 100)
 *
 * Usage:
 *   node scripts/anchorCloseAllAccounts.js
 *
 * The script paginates through /api/v1/accounts, extracts each account ID, and
 * calls DELETE /api/v1/accounts/{accountId}/close. It logs progress and a final summary.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.ANCHOR_BASE_URL || 'https://api.sandbox.getanchor.co';
const API_KEY = process.env.ANCHOR_API_KEY || process.env.CUSTOMER_SERVICE_ANCHOR_API_KEY;
const PAGE_SIZE = parseInt(process.env.ANCHOR_PAGE_SIZE || '100', 10);

const CSV_PATH = process.env.ANCHOR_ACCOUNT_CSV;

if (!API_KEY) {
  console.error('ERROR: Anchor API key is required. Set ANCHOR_API_KEY or CUSTOMER_SERVICE_ANCHOR_API_KEY before running this script.');
  process.exit(1);
}

const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'x-anchor-key': API_KEY,
  },
  timeout: 30_000,
});

async function fetchAccountsPage(pageNumber, offset) {
  const params = {
    'page[number]': pageNumber,
    'page[size]': PAGE_SIZE,
    'page[offset]': offset,
    sort: '-createdAt',
  };

  const response = await client.get('/api/v1/accounts', { params });
  const { data = [], meta = {}, links = {} } = response.data || {};

  return {
    accounts: Array.isArray(data) ? data : [],
    meta,
    links,
  };
}

async function closeAccount(accountId) {
  try {
    await client.delete(`/api/v1/accounts/${accountId}/close`);
    console.log(`✅ Closed account ${accountId}`);
    return { accountId, success: true };
  } catch (error) {
    const status = error.response?.status;
    const detail = error.response?.data || error.message;
    console.error(`❌ Failed to close account ${accountId} (status ${status ?? 'n/a'}):`, detail);
    return { accountId, success: false, detail };
  }
}

async function closeAllAccounts() {
  if (CSV_PATH) {
    const absoluteCsvPath = path.resolve(CSV_PATH);
    console.log(`Anchor cleanup: loading account IDs from CSV ${absoluteCsvPath}`);
    const csvContent = fs.readFileSync(absoluteCsvPath, 'utf8');
    const ids = parseAccountIdsFromCsv(csvContent);
    console.log(`Found ${ids.length} account ID(s) in CSV. Closing sequentially...`);
    let closed = 0;
    let failed = 0;
    for (const accountId of ids) {
      const result = await closeAccount(accountId);
      if (result.success) {
        closed += 1;
      } else {
        failed += 1;
      }
    }
    console.log('--- CSV Summary ---');
    console.log(`Total accounts processed: ${ids.length}`);
    console.log(`Successfully closed:        ${closed}`);
    console.log(`Failures:                  ${failed}`);
    if (failed > 0) {
      process.exitCode = 1;
    }
    return;
  }

  let page = 2; // start from the second page for debugging pagination
  let offset = PAGE_SIZE; // skip the first page entirely
  let totalProcessed = 0;
  let totalClosed = 0;
  let totalFailed = 0;
  const seen = new Set();

  console.log('Starting Anchor deposit account cleanup...');

  // Loop over every page until there are no accounts left or no next link.
  // Rely on both the data length and the presence of a "next" link to be safe.
  while (true) {
    let pageResult;
    try {
      pageResult = await fetchAccountsPage(page, offset);
    } catch (error) {
      console.error(`❌ Failed to fetch accounts page ${page}:`, error.response?.data || error.message);
      break;
    }

    const { accounts, meta } = pageResult;

    if (!accounts.length) {
      console.log(`No accounts returned for page ${page}. Assuming end of collection.`);
      break;
    }

    console.log(`Processing page ${page} (${accounts.length} accounts)...`);
    console.log('Meta pagination info:', meta?.pagination);

    let newAccountsOnPage = 0;

    for (const account of accounts) {
      const accountId = account?.id;
      if (!accountId) {
        console.warn('⚠️  Encountered account without an ID field, skipping:', account);
        continue;
      }

      if (seen.has(accountId)) {
        console.log(`ℹ️  Skipping already processed account ${accountId}`);
        continue;
      }

      newAccountsOnPage += 1;
      seen.add(accountId);

      totalProcessed += 1;
      const result = await closeAccount(accountId);
      if (result.success) {
        totalClosed += 1;
      } else {
        totalFailed += 1;
      }
    }

    if (newAccountsOnPage === 0) {
      console.log('⚠️  No new accounts returned on this page. Anchor API may not be honoring pagination parameters. Stopping to avoid infinite loop.');
      break;
    }

    const pagination = meta?.pagination || {};
    const totalPages = pagination.totalPages;
    const totalRecords = pagination.total;

    if (!totalPages || page >= totalPages) {
      console.log('Reached the final page according to meta.pagination. Cleanup run complete.');
      break;
    }

    offset += accounts.length;
    if (typeof totalRecords === 'number' && offset >= totalRecords) {
      console.log('Offset reached total number of records. Cleanup completed.');
      break;
    }

    page += 1;
  }

  console.log('--- Summary ---');
  console.log(`Total accounts processed: ${totalProcessed}`);
  console.log(`Successfully closed:        ${totalClosed}`);
  console.log(`Failures:                  ${totalFailed}`);

  if (totalFailed > 0) {
    console.log('Some accounts could not be closed. Check logs above for details.');
    process.exitCode = 1;
  }
}

function parseAccountIdsFromCsv(csvContent) {
  const lines = csvContent.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const ids = [];
  for (const line of lines) {
    // naive split on comma; adjust if the CSV has more columns
    const [firstColumn] = line.split(',');
    if (firstColumn && firstColumn !== 'account_id') {
      ids.push(firstColumn.trim());
    }
  }
  return ids;
}

closeAllAccounts().catch((error) => {
  console.error('Unexpected error during cleanup:', error);
  process.exit(1);
});

