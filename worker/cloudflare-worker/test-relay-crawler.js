#!/usr/bin/env node

/**
 * Test script for Relay Crawler Worker
 * Tests both local development and deployed instances
 */

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Color codes
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

// Test configuration
const tests = {
  local: 'http://localhost:8787',
  deployed: null // Will be set by user
};

async function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function testEndpoint(url, endpoint, options = {}) {
  try {
    console.log(`${colors.blue}Testing: ${endpoint}${colors.reset}`);
    
    const response = await fetch(`${url}${endpoint}`, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body
    });
    
    const text = await response.text();
    let data;
    
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = text;
    }
    
    if (response.ok) {
      console.log(`${colors.green}✅ Status: ${response.status}${colors.reset}`);
      console.log('Response:', JSON.stringify(data, null, 2));
    } else {
      console.log(`${colors.red}❌ Status: ${response.status}${colors.reset}`);
      console.log('Response:', data);
    }
    
    return { success: response.ok, data };
  } catch (error) {
    console.log(`${colors.red}❌ Error: ${error.message}${colors.reset}`);
    return { success: false, error: error.message };
  }
}

async function testCrawler(baseUrl, authToken) {
  console.log(`\n${colors.yellow}=== Testing Relay Crawler at ${baseUrl} ===${colors.reset}\n`);
  
  // Test 1: Health check
  console.log(`${colors.yellow}Test 1: Health Check${colors.reset}`);
  const health = await testEndpoint(baseUrl, '/health');
  
  if (health.success && health.data.stats) {
    const stats = health.data.stats;
    console.log(`\n${colors.blue}Current Stats:${colors.reset}`);
    console.log(`- Last crawl: ${stats.lastCrawl ? new Date(stats.lastCrawl).toISOString() : 'Never'}`);
    console.log(`- Total events: ${stats.totalEvents || 0}`);
    console.log(`- Successful relays: ${stats.successfulRelays || 0}/${stats.totalRelays || 0}`);
    console.log(`- Crawl duration: ${stats.crawlDuration || 0}ms`);
  }
  
  // Test 2: Statistics
  console.log(`\n${colors.yellow}Test 2: Statistics${colors.reset}`);
  await testEndpoint(baseUrl, '/stats');
  
  // Test 3: Manual trigger (without auth)
  console.log(`\n${colors.yellow}Test 3: Manual Trigger (No Auth)${colors.reset}`);
  const triggerNoAuth = await testEndpoint(baseUrl, '/trigger', {
    method: 'POST'
  });
  
  // Test 4: Manual trigger (with auth if provided)
  if (authToken) {
    console.log(`\n${colors.yellow}Test 4: Manual Trigger (With Auth)${colors.reset}`);
    const triggerWithAuth = await testEndpoint(baseUrl, '/trigger', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    if (triggerWithAuth.success) {
      console.log(`\n${colors.green}✅ Crawler triggered successfully!${colors.reset}`);
      console.log('Waiting 5 seconds for crawl to complete...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Check updated stats
      console.log(`\n${colors.yellow}Checking updated stats...${colors.reset}`);
      await testEndpoint(baseUrl, '/health');
    }
  }
  
  // Test 5: 404 handling
  console.log(`\n${colors.yellow}Test 5: 404 Handling${colors.reset}`);
  await testEndpoint(baseUrl, '/invalid-endpoint');
}

async function runLocalTest() {
  console.log(`${colors.yellow}Starting local development server test...${colors.reset}`);
  console.log('Make sure you have the worker running locally with:');
  console.log(`${colors.blue}wrangler dev -c wrangler-crawler.toml --local${colors.reset}\n`);
  
  const ready = await question('Is the local server running? (y/n): ');
  if (ready.toLowerCase() !== 'y') {
    console.log('Please start the local server first.');
    return;
  }
  
  await testCrawler(tests.local);
}

async function runDeployedTest() {
  const url = await question('Enter the deployed worker URL (e.g., https://relay-crawler.your-subdomain.workers.dev): ');
  if (!url) {
    console.log('URL is required');
    return;
  }
  
  const hasAuth = await question('Do you have a WORKER_AUTH_TOKEN configured? (y/n): ');
  let authToken = null;
  
  if (hasAuth.toLowerCase() === 'y') {
    authToken = await question('Enter the auth token: ');
  }
  
  await testCrawler(url, authToken);
}

async function monitorLogs() {
  console.log(`\n${colors.yellow}To monitor live logs, run one of these commands:${colors.reset}`);
  console.log(`\n${colors.blue}Development:${colors.reset}`);
  console.log('wrangler tail -c wrangler-crawler.toml');
  console.log(`\n${colors.blue}Staging:${colors.reset}`);
  console.log('wrangler tail --env staging -c wrangler-crawler.toml');
  console.log(`\n${colors.blue}Production:${colors.reset}`);
  console.log('wrangler tail --env production -c wrangler-crawler.toml');
}

async function main() {
  console.log(`${colors.green}🕷️  Relay Crawler Test Suite${colors.reset}\n`);
  
  const testType = await question(
    'What would you like to test?\n' +
    '1. Local development server\n' +
    '2. Deployed worker\n' +
    '3. View log monitoring commands\n' +
    'Choice (1-3): '
  );
  
  switch (testType) {
    case '1':
      await runLocalTest();
      break;
    case '2':
      await runDeployedTest();
      break;
    case '3':
      await monitorLogs();
      break;
    default:
      console.log('Invalid choice');
  }
  
  rl.close();
}

// Error handling
process.on('unhandledRejection', (error) => {
  console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
  rl.close();
  process.exit(1);
});

// Run tests
main().catch(error => {
  console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
  rl.close();
  process.exit(1);
});