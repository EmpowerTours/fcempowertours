#!/usr/bin/env node
/**
 * UI Screenshot Tool
 * Takes screenshots of the app for visual verification
 *
 * Usage: node scripts/screenshot.cjs [page] [output]
 * Example: node scripts/screenshot.cjs /oracle screenshot.png
 *
 * First time setup: npx playwright install chromium
 */

const { chromium } = require('playwright');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const DEFAULT_PAGE = '/oracle';
const DEFAULT_OUTPUT = 'screenshot.png';

async function takeScreenshot(pagePath = DEFAULT_PAGE, outputFile = DEFAULT_OUTPUT) {
  console.log(`📸 Taking screenshot of ${BASE_URL}${pagePath}...`);

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Set mobile viewport (Farcaster frame size)
    await page.setViewportSize({ width: 424, height: 695 });

    // Navigate to the page
    await page.goto(`${BASE_URL}${pagePath}`, {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    // Wait for animations
    await page.waitForTimeout(1000);

    // Take screenshot
    const outputPath = path.resolve(process.cwd(), outputFile);
    await page.screenshot({ path: outputPath, fullPage: false });

    console.log(`✅ Screenshot saved to: ${outputPath}`);
    return outputPath;

  } catch (error) {
    console.error('❌ Screenshot failed:', error.message);
    if (error.message.includes('Executable doesn\'t exist')) {
      console.log('💡 Run: npx playwright install chromium');
    }
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

const args = process.argv.slice(2);
takeScreenshot(args[0] || DEFAULT_PAGE, args[1] || DEFAULT_OUTPUT);
