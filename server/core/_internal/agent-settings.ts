import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { KinottaError } from './errors.ts';
import { writeJsonAtomic } from './edit-list.ts';
import { agentCommand, tryCommand } from './runner.ts';

export type AgentProvider = 'claude' | 'codex' | 'copy';
export interface AgentSettings { provider: AgentProvider }
export const AGENT_USAGE_NOTICE = 'Background runs use your installed agent and your own account or plan quota. Each run starts fresh.';
const SETTINGS_FILE = '.kinotta-agent.json';
export async function readAgentSettings(projectDir: string): Promise<AgentSettings> {
  try {
    const settings = JSON.parse(await readFile(join(projectDir, SETTINGS_FILE), 'utf8')) as AgentSettings;
    if (settings && ['claude', 'codex', 'copy'].includes(settings.provider)) return { provider: settings.provider };
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
  return { provider: 'copy' };
}
export async function saveAgentSettings(projectDir: string, input: unknown): Promise<AgentSettings> {
  const provider = (input as Partial<AgentSettings> | null)?.provider;
  if (!provider || !['claude', 'codex', 'copy'].includes(provider)) throw new KinottaError('invalid', 'Choose Claude Code, Codex or Copy request.');
  const settings = { provider };
  await writeJsonAtomic(join(projectDir, SETTINGS_FILE), settings);
  return settings;
}
export async function detectAgents(): Promise<Array<{ provider: 'claude' | 'codex'; present: boolean }>> {
  return Promise.all((['claude', 'codex'] as const).map(async (provider) => {
    try {
      const command = await agentCommand(provider);
      const result = await tryCommand(command.command, [...command.prefix, '--version']);
      return { provider, present: result?.code === 0 };
    } catch { return { provider, present: false }; }
  }));
}
