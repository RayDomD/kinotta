import { useEffect, useId, useState } from 'react';
import { fetchTools } from './api/index.ts';
import type { ToolStatus } from './api/index.ts';

/** Names each tool a start from video needs and the machine lacks, with how to install it. Shows nothing when all are present. */
export function MissingTools() {
  const titleId = useId();
  const [missing, setMissing] = useState<ToolStatus[]>([]);
  useEffect(() => {
    let live = true;
    fetchTools()
      .then((check) => live && setMissing(check.missing))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (missing.length === 0) return null;
  return (
    <section className="issues" aria-labelledby={titleId}>
      <h2 id={titleId}>
        Starting from a video needs {missing.length === 1 ? 'a tool' : 'tools'} that {missing.length === 1 ? 'is' : 'are'} missing
        <span className="num">{missing.length} missing</span>
      </h2>
      <ul>
        {missing.map((tool) => (
          <li key={tool.id}>
            {tool.name}: <code>{tool.hint}</code>
          </li>
        ))}
      </ul>
    </section>
  );
}