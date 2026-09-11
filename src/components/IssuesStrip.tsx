import type { Issue } from "../types";

interface IssuesStripProps {
  issues: Issue[];
  notes: string[];
}

export function IssuesStrip({ issues, notes }: IssuesStripProps) {
  return (
    <>
      {issues.length > 0 ? (
        <div className="notice">
          <h3>{issues.length} rule{issues.length === 1 ? "" : "s"} not met</h3>
          <ul>
            {issues.slice(0, 8).map((issue, i) => (
              <li key={i}>{issue.text}</li>
            ))}
            {issues.length > 8 && <li>…and {issues.length - 8} more.</li>}
          </ul>
        </div>
      ) : (
        <div className="notice good">
          <h3>Clean</h3>
          Every rule in the staffing policy is met for this month.
        </div>
      )}
      {notes.length > 0 && (
        <div className="notice subtle">
          <h3>Generator notes</h3>
          <ul>
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
