import { useEffect, useState } from 'react';
import { fetchTools } from './api/index.ts';
import type { ToolStatus } from './api/index.ts';

/** The tools a start from video needs, and for each one the machine lacks, how to install it. Shows nothing until checked. */
export function MissingTools() {
  const [tools, setTools] = useState<ToolStatus[] | null>(null);
  useEffect(() => {
    let live = true;
    fetchTools()
      .then((check) => live && setTools(check.tools.filter((tool) => tool.neededFor.includes('video'))))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (tools === null) return null;
  const missing = tools.filter((tool) => !tool.present);
  return (
    <div className="rv-needs" role={missing.length > 0 ? 'alert' : undefined}>
      Needs on this machine:{' '}
      {tools.map((tool, i) => (
        <span key={tool.id}>
          <b>{tool.name}</b>
          {i < tools.length - 1 ? ', ' : '.'}
        </span>
      ))}{' '}
      {missing.length === 0 ? (
        'All found.'
      ) : (
        <>
          <span className="rv-needs-missing">{`${missing.length} missing:`}</span>
          <ul>
            {missing.map((tool) => (
              <li key={tool.id}>
                {tool.name}: <code>{tool.hint}</code>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}