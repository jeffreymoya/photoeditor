#!/usr/bin/env node
/**
 * SST Smoke Test Script
 *
 * Validates live SST deployment with basic smoke tests:
 * - API endpoint health
 * - Presign endpoint
 * - Status endpoint
 * - CloudWatch logs presence
 *
 * Run via: make live-test
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Read SST outputs
const outputsPath = path.join(__dirname, '../infra/sst/.sst/outputs.json');

if (!fs.existsSync(outputsPath)) {
  console.error('❌ SST outputs not found. Deploy with: make live-dev');
  process.exit(1);
}

const outputs = JSON.parse(fs.readFileSync(outputsPath, 'utf8'));
const apiUrl = outputs.api;

if (!apiUrl) {
  console.error('❌ API URL not found in SST outputs');
  process.exit(1);
}

console.log('🔍 Testing SST deployment...');
console.log(`   API URL: ${apiUrl}`);
console.log('');

// Helper to make HTTP requests
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data ? JSON.parse(data) : null,
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data,
          });
        }
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function runSmokeTests() {
  let passed = 0;
  let failed = 0;

  // Test 1: Presign endpoint
  console.log('📝 Test 1: POST /presign');
  try {
    const presignReq = {
      fileName: 'smoke-test.jpg',
      contentType: 'image/jpeg',
      fileSize: 1024,
      prompt: 'test',
    };

    const res = await request(`${apiUrl}/presign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-correlation-id': 'smoke-test-' + Date.now(),
      },
      body: JSON.stringify(presignReq),
    });

    if (res.statusCode === 200 && res.body && res.body.jobId && res.body.presignedUrl) {
      console.log('   ✅ Presign endpoint responded correctly');
      console.log(`      Job ID: ${res.body.jobId}`);
      passed++;

      // Test 2: Status endpoint with job ID
      console.log('');
      console.log('📊 Test 2: GET /status/{jobId}');
      const statusRes = await request(`${apiUrl}/status/${res.body.jobId}`);

      if (statusRes.statusCode === 200 && statusRes.body && statusRes.body.jobId) {
        console.log('   ✅ Status endpoint responded correctly');
        console.log(`      Status: ${statusRes.body.status}`);
        passed++;
      } else {
        console.log(`   ❌ Status endpoint failed (${statusRes.statusCode})`);
        failed++;
      }
    } else {
      console.log(`   ❌ Presign endpoint failed (${res.statusCode})`);
      console.log(`      Body: ${JSON.stringify(res.body)}`);
      failed++;
    }
  } catch (error) {
    console.log(`   ❌ Presign test error: ${error.message}`);
    failed++;
  }

  // Test 3: Status endpoint - 404 for non-existent job
  console.log('');
  console.log('🔍 Test 3: GET /status/{jobId} - non-existent job');
  try {
    const res = await request(`${apiUrl}/status/non-existent-job-id`);
    if (res.statusCode === 404) {
      console.log('   ✅ Correctly returned 404 for non-existent job');
      passed++;
    } else {
      console.log(`   ❌ Expected 404, got ${res.statusCode}`);
      failed++;
    }
  } catch (error) {
    console.log(`   ❌ Status 404 test error: ${error.message}`);
    failed++;
  }

  // Summary
  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('Smoke Test Results');
  console.log('═══════════════════════════════════════');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log('');

  if (failed > 0) {
    console.log('⚠️  Some tests failed. Check logs and stack outputs.');
    process.exit(1);
  } else {
    console.log('🎉 All smoke tests passed!');
    console.log('');
    console.log('📊 CloudWatch Observability:');
    console.log(`   - Logs: https://console.aws.amazon.com/cloudwatch/home?region=${outputs.region || 'us-east-1'}#logsV2:log-groups`);
    console.log(`   - Metrics: https://console.aws.amazon.com/cloudwatch/home?region=${outputs.region || 'us-east-1'}#metricsV2:`);
    console.log('');
  }
}

runSmokeTests().catch((error) => {
  console.error('❌ Smoke tests failed:', error);
  process.exit(1);
});
