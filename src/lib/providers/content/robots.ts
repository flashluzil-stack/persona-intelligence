/**
 * Minimal robots.txt evaluation (RFC 9309): selects the most specific
 * user-agent group, then applies the longest matching Allow/Disallow rule.
 */

interface Group {
  agents: string[];
  rules: Array<{ allow: boolean; path: string }>;
}

export function parseRobots(body: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (key === "allow" || key === "disallow") {
      lastWasAgent = false;
      if (!current) continue;
      if (key === "disallow" && value === "") continue;
      current.rules.push({ allow: key === "allow", path: value });
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

function ruleMatches(rulePath: string, path: string): boolean {
  const anchored = rulePath.endsWith("$");
  const pattern = (anchored ? rulePath.slice(0, -1) : rulePath)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${pattern}${anchored ? "$" : ""}`).test(path);
}

export function isPathAllowed(groups: Group[], userAgentToken: string, path: string): boolean {
  const ua = userAgentToken.toLowerCase();
  const specific = groups.filter((g) => g.agents.some((a) => a !== "*" && ua.includes(a)));
  const selected = specific.length > 0 ? specific : groups.filter((g) => g.agents.includes("*"));
  if (selected.length === 0) return true;
  let best: { allow: boolean; length: number } | null = null;
  for (const group of selected) {
    for (const rule of group.rules) {
      if (!ruleMatches(rule.path, path)) continue;
      const length = rule.path.length;
      if (!best || length > best.length || (length === best.length && rule.allow)) {
        best = { allow: rule.allow, length };
      }
    }
  }
  return best ? best.allow : true;
}
