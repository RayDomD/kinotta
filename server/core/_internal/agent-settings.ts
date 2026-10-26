import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { KinottaError } from './errors.ts';
import { writeJsonAtomic } from './edit-list.ts';
import { agentCommand, tryCommand } from './runner.ts';

export type AgentProvider = 'claude' | 'codex' | 'copy';
export interface AgentSettings { provider: AgentProvider; confirmed?: boolean }
export const AGENT_USAGE_NOTICE = 'Background runs use your installed agent and your own account or plan quota. Each run starts fresh.';
const SETTINGS_FILE = '.kinotta-agent.json';
export async function readAgentSettings(projectDir: string): Promise<AgentSettings> {
  try {
    const settings = JSON.parse(await readFile(join(projectDir, SETTINGS_FILE), 'utf8')) as AgentSettings;
    if (settings && ['claude', 'codex', 'copy'].includes(settings.provider)) return { provider: settings.provider, ...(settings.confirmed === true ? { confirmed: true } : {}) };
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
  return { provider: (await detectAgents()).find((agent) => agent.present)?.provider ?? 'copy' };
}
export async function saveAgentSettings(projectDir: string, input: unknown): Promise<AgentSettings> {
  const patch = input as Partial<AgentSettings> | null;
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)
    || (patch.provider === undefined && patch.confirmed === undefined)
    || (patch.provider !== undefined && !['claude', 'codex', 'copy'].includes(patch.provider))
    || (patch.confirmed !== undefined && patch.confirmed !== true)) {
    throw new KinottaError('invalid', 'Choose Claude Code, Codex or Copy request, or confirm background builds.');
  }
  const settings: AgentSettings = {
    ...await readAgentSettings(projectDir),
    ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
    ...(patch.confirmed === true ? { confirmed: true } : {}),
  };
  await writeJsonAtomic(join(projectDir, SETTINGS_FILE), settings);
  return settings;
}
let detection: Promise<Array<{ provider: 'claude' | 'codex'; present: boolean }>> | undefined;
export async function detectAgents(): Promise<Array<{ provider: 'claude' | 'codex'; present: boolean }>> {
  return detection ??= Promise.all((['claude', 'codex'] as const).map(async (provider) => {
    try {
      const command = await agentCommand(provider);
      const result = await tryCommand(command.command, [...command.prefix, '--version']);
      return { provider, present: result?.code === 0 };
    } catch { return { provider, present: false }; }
  }));
}
