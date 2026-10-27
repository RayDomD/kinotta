import { expect, test, type Page } from '@playwright/test';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { startServer } from '../../server/main.ts';
import { DONE_MARKER } from '../../server/core/_internal/copy-watch.ts';
import { copyFixture } from '../helpers/project.ts';

test.beforeEach(() => {
  process.env.KINOTTA_HOME = mkdtempSync(join(tmpdir(), 'copy-round-trip-home-'));
});

async function auto(page: Page, url: string, title: string) {
  await page.goto(url);
  await page.getByRole('combobox', { name: 'Choose reel' }).selectOption('');
  await page.getByLabel('Or use a video in this project').selectOption('media/talk.mp4');
  await page.getByLabel('Reel name', { exact: true }).fill(title);
  await page.getByRole('button', { name: /^Auto/ }).click();
}

function runFakeAgent(jobDir: string) {
  const fakeScript = resolve('tests/core/fake-broll-agent.mjs');
  const res = spawnSync(process.execPath, [fakeScript, 'success'], {
    cwd: jobDir,
    input: 'prompt',
    env: { ...process.env, NODE_PATH: resolve('node_modules') },
    windowsHide: true,
  });
  expect(res.status).toBe(0);
}

test('a Copy request job whose output/ gets valid files and DONE loads as v2 with the strip reading "Your agent finished" and Open v2', async ({ page }) => {
  test.setTimeout(120_000);
  const projectDir = copyFixture('footage-project');
  const server = await startServer({
    projectDir,
    port: 0,
    transcriber: async () => [{ text: 'hello', start: 0.5, end: 1.0 }],
    agent: { settleMs: 100 },
  });
  const slug = 'copy-strip-finish';
  try {
    await server.project.saveAgentSettings({ provider: 'copy' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await auto(page, server.url, 'Copy strip finish');

    const strip = page.getByRole('region', { name: 'B-roll progress' });
    await expect(strip).toContainText('Waiting for your agent');
    await expect(strip.getByRole('button', { name: 'Copy request', exact: true })).toBeVisible();

    const job = (await server.project.agentJob(slug))!;
    expect(job).toBeDefined();
    const jobDir = join(projectDir, 'reels', slug, '.agent/jobs', job.id);
    const outputDir = join(jobDir, 'output');

    runFakeAgent(jobDir);
    writeFileSync(join(outputDir, DONE_MARKER), '');

    await expect(strip).toContainText('Your agent finished', { timeout: 30_000 });
    const openBtn = strip.getByRole('button', { name: 'Open v2', exact: true });
    await expect(openBtn).toBeVisible();

    await openBtn.click();
    await expect(page.locator('[data-verify-unit="VersionRail"]')).toHaveAttribute('data-verify-working', 'false');
    await expect(page.getByText('You are viewing v2, a frozen version.', { exact: true })).toBeVisible();
    await expect(strip).toHaveCount(0);
    expect((await server.project.readVersion(slug, 2)).issues).toEqual([]);
    expect(existsSync(join(projectDir, 'reels', slug, 'v2', DONE_MARKER))).toBe(false);
  } finally {
    await server.close();
  }
});

test('one filled while the server was stopped loads on start', async ({ page }) => {
  test.setTimeout(120_000);
  const projectDir = copyFixture('footage-project');
  let server = await startServer({
    projectDir,
    port: 0,
    transcriber: async () => [{ text: 'hello', start: 0.5, end: 1.0 }],
    agent: { settleMs: 100 },
  });
  const slug = 'copy-stopped-test';
  try {
    await server.project.saveAgentSettings({ provider: 'copy' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await auto(page, server.url, 'Copy stopped test');

    const strip = page.getByRole('region', { name: 'B-roll progress' });
    await expect(strip).toContainText('Waiting for your agent');

    const job = (await server.project.agentJob(slug))!;
    expect(job.state).toBe('copy-ready');
    const jobDir = join(projectDir, 'reels', slug, '.agent/jobs', job.id);
    const outputDir = join(jobDir, 'output');

    // Stop server while job is waiting in copy-ready
    await server.close();

    // While server is stopped, write valid files and DONE marker
    runFakeAgent(jobDir);
    writeFileSync(join(outputDir, DONE_MARKER), '');

    // Start server again: on startup, Kinotta recovers the job and publishes v2
    server = await startServer({
      projectDir,
      port: 0,
      transcriber: async () => [{ text: 'hello', start: 0.5, end: 1.0 }],
      agent: { settleMs: 100 },
    });

    await page.goto(server.url);

    await expect(strip).toContainText('Your agent finished');
    const openBtn = strip.getByRole('button', { name: 'Open v2', exact: true });
    await expect(openBtn).toBeVisible();

    await openBtn.click();
    await expect(page.locator('[data-verify-unit="VersionRail"]')).toHaveAttribute('data-verify-working', 'false');
    await expect(page.getByText('You are viewing v2, a frozen version.', { exact: true })).toBeVisible();
    expect((await server.project.readVersion(slug, 2)).issues).toEqual([]);
    expect(existsSync(join(projectDir, 'reels', slug, 'v2', DONE_MARKER))).toBe(false);
  } finally {
    await server.close();
  }
});

test('invalid output shows its reason with Retry', async ({ page }) => {
  test.setTimeout(120_000);
  const projectDir = copyFixture('footage-project');
  const server = await startServer({
    projectDir,
    port: 0,
    transcriber: async () => [{ text: 'hello', start: 0.5, end: 1.0 }],
    agent: { settleMs: 100 },
  });
  const slug = 'copy-invalid-test';
  try {
    await server.project.saveAgentSettings({ provider: 'copy' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await auto(page, server.url, 'Copy invalid test');

    const strip = page.getByRole('region', { name: 'B-roll progress' });
    await expect(strip).toContainText('Waiting for your agent');

    const job = (await server.project.agentJob(slug))!;
    expect(job).toBeDefined();
    const jobDir = join(projectDir, 'reels', slug, '.agent/jobs', job.id);
    const outputDir = join(jobDir, 'output');

    runFakeAgent(jobDir);
    // Corrupt shots.json so validation fails
    writeFileSync(join(outputDir, 'shots.json'), '{ "duration": 0, "shots": [] }');
    writeFileSync(join(outputDir, DONE_MARKER), '');

    await expect(strip).toContainText('Failed', { timeout: 30_000 });
    await expect(strip.locator('.agent-strip-error')).toContainText('Agent output changed the reel timeline duration');
    await expect(strip.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
    expect(existsSync(join(projectDir, 'reels', slug, 'v2'))).toBe(false);
  } finally {
    await server.close();
  }
});
