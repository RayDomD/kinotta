import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, it, vi } from 'vitest';

const command = vi.hoisted(() => vi.fn());
vi.mock('../../server/core/_internal/runner.ts', () => ({
  agentCommand: async (provider: string) => ({ command: provider, prefix: [] }),
  tryCommand: command,
}));
beforeEach(() => { vi.resetModules(); command.mockReset(); });

it.each([
  [true, true, 'claude'], [false, true, 'codex'], [false, false, 'copy'],
])('defaults with Claude %s and Codex %s to %s without saving, and caches detection', async (claude, codex, provider) => {
  command.mockImplementation(async (name: string) => ({ code: (name === 'claude' ? claude : codex) ? 0 : 1 }));
  const { readAgentSettings, detectAgents } = await import('../../server/core/_internal/agent-settings.ts');
  const dir = await mkdtemp(join(tmpdir(), 'agent-settings-'));
  expect(await readAgentSettings(dir)).toEqual({ provider });
  expect(await readAgentSettings(dir)).toEqual({ provider });
  await detectAgents();
  expect(command).toHaveBeenCalledTimes(2);
  await expect(readFile(join(dir, '.kinotta-agent.json'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('honors an existing provider and confirmation without detection', async () => {
  const { readAgentSettings } = await import('../../server/core/_internal/agent-settings.ts');
  const dir = await mkdtemp(join(tmpdir(), 'agent-settings-'));
  await writeFile(join(dir, '.kinotta-agent.json'), JSON.stringify({ provider: 'codex', confirmed: true }));
  expect(await readAgentSettings(dir)).toEqual({ provider: 'codex', confirmed: true });
  expect(command).not.toHaveBeenCalled();
});

it('saves confirmation and provider independently, preserving the other field', async () => {
  command.mockResolvedValue({ code: 1 });
  const { readAgentSettings, saveAgentSettings } = await import('../../server/core/_internal/agent-settings.ts');
  const dir = await mkdtemp(join(tmpdir(), 'agent-settings-'));
  await saveAgentSettings(dir, { provider: 'claude' });
  expect(await saveAgentSettings(dir, { confirmed: true })).toEqual({ provider: 'claude', confirmed: true });
  expect(await saveAgentSettings(dir, { provider: 'codex' })).toEqual({ provider: 'codex', confirmed: true });
  expect(await readAgentSettings(dir)).toEqual({ provider: 'codex', confirmed: true });
  await expect(saveAgentSettings(dir, {})).rejects.toMatchObject({ code: 'invalid' });
  await expect(saveAgentSettings(dir, { confirmed: 'true' })).rejects.toMatchObject({ code: 'invalid' });
});
