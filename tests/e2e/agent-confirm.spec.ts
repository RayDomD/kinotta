import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';

async function serve(provider: 'claude' | 'codex' | 'copy') {
  process.env.KINOTTA_HOME = mkdtempSync(join(tmpdir(), 'agent-confirm-home-'));
  const server = await startServer({ projectDir: copyFixture('footage-project'), port: 0 });
  await server.project.saveAgentSettings({ provider });
  return server;
}
async function startPage(page: Page, url: string) {
  await page.goto(url);
  await page.getByRole('combobox', { name: 'Choose reel' }).selectOption('');
  await page.getByLabel('Or use a video in this project').selectOption('media/talk.mp4');
}
async function interceptBuilds(page: Page) {
  const builds: Record<string, unknown>[] = [];
  await page.route('**/api/reels', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    builds.push(route.request().postDataJSON());
    // Keep the start screen open for a second attempt; no agent or transcription can run.
    await route.fulfill({ status: 409, json: { error: 'Build intercepted for test' } });
  });
  return builds;
}

test('Auto asks once, Cancel starts nothing, and a remembered yes survives reload', async ({ page }) => {
  const server = await serve('claude');
  try {
    const builds = await interceptBuilds(page);
    await startPage(page, server.url);
    await page.screenshot({ path: 'tests/artifacts/agent-confirm-before.png' });
    await page.getByRole('button', { name: /^Auto/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Build it all now?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toContainText('Claude Code');
    await expect(dialog.getByRole('checkbox')).toBeChecked();
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(builds).toHaveLength(0);
    expect((await server.project.agentSettings()).confirmed).toBeUndefined();
    await page.getByRole('button', { name: /^Auto/ }).click();
    await page.screenshot({ path: 'tests/artifacts/agent-confirm-after.png' });
    await dialog.getByRole('button', { name: 'Build now' }).click();
    await expect(page.getByRole('alert')).toContainText('Build intercepted');
    expect(builds).toHaveLength(1);
    expect(builds[0]).toMatchObject({ agentConfirmed: true });
    expect(await server.project.agentSettings()).toMatchObject({ provider: 'claude', confirmed: true });
    await startPage(page, server.url);
    await page.getByRole('button', { name: /^Auto/ }).click();
    await expect(page.getByRole('alert')).toContainText('Build intercepted');
    expect(builds).toHaveLength(2);
    await expect(dialog).toHaveCount(0);
  } finally { await server.close(); }
});


test('Codex can be approved for one build, Escape cancels, and saving failures start nothing', async ({ page }) => {
  const server = await serve('codex');
  try {
    const builds = await interceptBuilds(page);
    await startPage(page, server.url);
    await expect(page.locator('.dx-hint')).toContainText('B-roll runs with Codex on your plan.');
    await page.getByRole('button', { name: /^Auto/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Build it all now?' });
    await expect(dialog).toContainText('Codex');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(builds).toHaveLength(0);
    await page.getByRole('button', { name: /^Auto/ }).click();
    await page.route('**/api/agent/settings', (route) => route.request().method() === 'PUT'
      ? route.fulfill({ status: 500, json: { error: 'Settings unavailable' } }) : route.continue());
    await dialog.getByRole('button', { name: 'Build now' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Settings unavailable');
    expect(builds).toHaveLength(0);
    await dialog.getByRole('checkbox').uncheck();
    await dialog.getByRole('button', { name: 'Build now' }).click();
    await expect(page.getByRole('alert')).toContainText('Build intercepted');
    expect(builds).toEqual([expect.objectContaining({ agentConfirmed: true })]);
    expect((await server.project.agentSettings()).confirmed).toBeUndefined();
    await page.getByRole('button', { name: /^Auto/ }).click();
    await expect(dialog).toBeVisible();
  } finally { await server.close(); }
});

test('Copy builds immediately with the paste-request hint', async ({ page }) => {
  const server = await serve('copy');
  try {
    const builds = await interceptBuilds(page);
    await startPage(page, server.url);
    await expect(page.locator('.dx-hint')).toHaveText('No agent found on this machine: Auto makes the cut and prepares the b-roll request for you to paste.');
    await page.getByRole('button', { name: /^Auto/ }).click();
    await expect(page.getByRole('alert')).toContainText('Build intercepted');
    expect(builds).toHaveLength(1);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } finally { await server.close(); }
});

test('Direction Build asks before starting a reel', async ({ page }) => {
  const server = await serve('claude');
  try {
    const builds = await interceptBuilds(page);
    await startPage(page, server.url);
    await page.getByRole('button', { name: /^Direct/ }).click();
    await page.getByRole('list', { name: 'Direction steps' }).getByRole('button', { name: /Check/ }).click();
    await page.getByRole('button', { name: /Build the first cut/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Build it all now?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(builds).toHaveLength(0);
    await page.getByRole('button', { name: /Build the first cut/ }).click();
    await dialog.getByRole('checkbox').uncheck();
    await dialog.getByRole('button', { name: 'Build now' }).click();
    await expect(page.getByRole('alert')).toContainText('Build intercepted');
    expect(builds).toEqual([expect.objectContaining({ agentConfirmed: true })]);
  } finally { await server.close(); }
});

test('Settings Agent pane saves the provider and keeps the project yes', async ({ page }) => {
  const server = await serve('claude');
  try {
    await server.project.saveAgentSettings({ confirmed: true });
    await page.goto(server.url);
    await page.getByRole('button', { name: /^Edit / }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await settings.getByRole('button', { name: 'Agent', exact: true }).click();
    const provider = settings.getByLabel('Agent for background builds');
    await expect(provider).toHaveValue('claude');
    await provider.selectOption('codex');
    await expect.poll(() => server.project.agentSettings()).toMatchObject({ provider: 'codex', confirmed: true });
    await provider.selectOption('copy');
    await expect.poll(() => server.project.agentSettings()).toMatchObject({ provider: 'copy', confirmed: true });
    await page.screenshot({ path: 'tests/artifacts/agent-settings-after.png' });
    await settings.getByRole('button', { name: 'Close Settings' }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(settings.getByLabel('Agent for background builds')).toHaveValue('copy');
  } finally { await server.close(); }
});
