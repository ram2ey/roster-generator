import type { Issue } from "../types";
import { Icon } from "./Icon";

interface IssuesStripProps {
  issues: Issue[];
  notes: string[];
}

export function IssuesStrip({ issues, notes }: IssuesStripProps) {
  return (
    <>
      {issues.length > 0 ? (
        <div className="notice">
          <details><summary><Icon name="info" size={18} />{issues.length} staffing issue{issues.length === 1 ? "" : "s"} to review</summary>
          <ul>
            {issues.map((issue, i) => (
              <li key={i}>{issue.text}</li>
            ))}
          </ul>
          </details>
        </div>
      ) : (
        <div className="notice good">
          <h3><Icon name="check" size={18} /> Your roster meets the staffing rules</h3>
          All configured staffing checks pass for this period.
        </div>
      )}
      {notes.length > 0 && (
        <div className="notice subtle">
          <details><summary>Generation notes</summary>
          <ul>
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
          </details>
        </div>
      )}
    </>
  );
}
