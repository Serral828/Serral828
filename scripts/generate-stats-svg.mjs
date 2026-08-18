import { readFileSync, writeFileSync } from "node:fs";

const input = process.argv[2] ?? "data/github-stats.json";
const output = process.argv[3] ?? "assets/github-stats.svg";
const demo = process.argv.includes("--demo");

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function compact(value) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0);
}

function demoPayload() {
  const today = new Date();
  const weeks = [];
  for (let week = 0; week < 53; week += 1) {
    const contributionDays = [];
    for (let day = 0; day < 7; day += 1) {
      const seed = (week * 17 + day * 31 + 11) % 29;
      contributionDays.push({
        date: new Date(today.getTime() - ((52 - week) * 7 + (6 - day)) * 86400000).toISOString().slice(0, 10),
        contributionCount: seed < 18 ? 0 : (seed % 4) + 1,
      });
    }
    weeks.push({ contributionDays });
  }
  return {
    data: {
      user: {
        contributionsCollection: {
          totalCommitContributions: 142,
          totalIssueContributions: 18,
          totalPullRequestContributions: 31,
          totalPullRequestReviewContributions: 27,
          contributionCalendar: { totalContributions: 403, weeks },
        },
        repositories: { totalCount: 16, nodes: [{ stargazerCount: 42, forkCount: 11 }] },
      },
    },
  };
}

function loadPayload() {
  if (demo) return demoPayload();
  return JSON.parse(readFileSync(input, "utf8"));
}

function getData(payload) {
  const user = payload?.data?.user ?? {};
  const collection = user.contributionsCollection ?? {};
  const calendar = collection.contributionCalendar ?? { totalContributions: 0, weeks: [] };
  const repositories = user.repositories ?? { totalCount: 0, nodes: [] };
  const nodes = repositories.nodes ?? [];
  return {
    calendar,
    stats: {
      commit: collection.totalCommitContributions ?? 0,
      issue: collection.totalIssueContributions ?? 0,
      pullReq: collection.totalPullRequestContributions ?? 0,
      review: collection.totalPullRequestReviewContributions ?? 0,
      repo: repositories.totalCount ?? 0,
      contributions: calendar.totalContributions ?? 0,
      stars: nodes.reduce((sum, repo) => sum + (repo.stargazerCount ?? 0), 0),
      forks: nodes.reduce((sum, repo) => sum + (repo.forkCount ?? 0), 0),
    },
  };
}

function points(values) {
  return values.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

function diamond(x, y, width = 15, height = 8) {
  return [[x, y], [x + width / 2, y - height], [x + width, y], [x + width / 2, y + height]];
}

function cube(x, y, level, color) {
  const depth = level === 0 ? 1 : 4 + level * 6;
  const top = diamond(x, y - depth);
  const floor = diamond(x, y);
  const left = [top[0], top[3], floor[3], floor[0]];
  const right = [top[3], top[2], floor[2], floor[3]];
  return [
    `<polygon points="${points(left)}" fill="#7ea844" opacity="${level ? "0.80" : "0.24"}"/>`,
    `<polygon points="${points(right)}" fill="#6c963b" opacity="${level ? "0.88" : "0.28"}"/>`,
    `<polygon points="${points(top)}" fill="${color}" stroke="#a7bd62" stroke-width="0.7"/>`,
  ].join("");
}

function heatmap(calendar) {
  const cells = [];
  const weeks = calendar.weeks?.length ? calendar.weeks : demoPayload().data.user.contributionsCollection.contributionCalendar.weeks;
  weeks.forEach((week, col) => {
    (week.contributionDays ?? []).forEach((day) => {
      const date = new Date(`${day.date}T00:00:00Z`);
      cells.push({
        col,
        row: Number.isNaN(date.getTime()) ? 0 : date.getUTCDay(),
        count: day.contributionCount ?? 0,
        date: day.date,
      });
    });
  });
  cells.sort((a, b) => (a.col + a.row) - (b.col + b.row));
  const colors = ["#edf3df", "#d8eba2", "#9bd26d", "#4fae4e", "#1f7138"];
  return cells.map((cell) => {
    const level = cell.count === 0 ? 0 : Math.min(4, Math.ceil(Math.log2(cell.count + 1)));
    const x = 92 + (cell.col - cell.row) * 14.3;
    const y = 145 + (cell.col + cell.row) * 8.2;
    return cube(x, y, level, colors[level]);
  }).join("");
}

function radar(stats) {
  const labels = ["Commit", "Issue", "PullReq", "Review", "Repo"];
  const values = [stats.commit, stats.issue, stats.pullReq, stats.review, stats.repo];
  const max = Math.max(...values, 1);
  const cx = 1030;
  const cy = 185;
  const radius = 105;
  const angle = (index) => -Math.PI / 2 + (index * Math.PI * 2) / labels.length;
  const point = (index, distance) => [cx + Math.cos(angle(index)) * distance, cy + Math.sin(angle(index)) * distance];
  const rings = [0.25, 0.5, 0.75, 1].map((ratio) => `<polygon points="${points(labels.map((_, i) => point(i, radius * ratio)))}" fill="none" stroke="#abb5bd" stroke-width="0.8" stroke-dasharray="3 4"/>`).join("");
  const axes = labels.map((_, i) => `<line x1="${cx}" y1="${cy}" x2="${point(i, radius)[0]}" y2="${point(i, radius)[1]}" stroke="#abb5bd" stroke-width="0.8" stroke-dasharray="3 4"/>`).join("");
  const area = points(values.map((value, i) => point(i, radius * Math.max(0.08, Math.log1p(value) / Math.log1p(max)))));
  const labelNodes = labels.map((label, i) => {
    const [x, y] = point(i, radius + 25);
    const anchor = x < cx - 8 ? "end" : x > cx + 8 ? "start" : "middle";
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" class="radar-label">${escapeXml(label)}</text>`;
  }).join("");
  return `<g>${rings}${axes}<polygon points="${area}" fill="#7bd66a" fill-opacity="0.62" stroke="#2f8f46" stroke-width="4" stroke-linejoin="round"/>${labelNodes}</g>`;
}

function statLine(x, value, label, icon) {
  return `<g transform="translate(${x} 724)"><text x="0" y="0" class="stat-icon">${escapeXml(icon)}</text><text x="28" y="0" class="stat-value">${escapeXml(value)}</text><text x="${28 + Math.max(32, String(value).length * 15)}" y="0" class="stat-label">${escapeXml(label)}</text></g>`;
}

function render(payload) {
  const { calendar, stats } = getData(payload);
  const days = calendar.weeks?.flatMap((week) => week.contributionDays ?? []) ?? [];
  const dates = days.map((day) => day.date).filter(Boolean).sort();
  const dateLabel = dates.length ? `${dates[0]} / ${dates.at(-1)}` : "GitHub activity";
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="790" viewBox="0 0 1280 790" role="img" aria-labelledby="title desc">
  <title id="title">Serral828 GitHub activity</title>
  <desc id="desc">Contribution heatmap, activity radar and public repository statistics.</desc>
  <rect width="1280" height="790" fill="#ffffff"/>
  <style>
    text { font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; fill: #101828; }
    .muted { fill: #7a8694; font-size: 15px; letter-spacing: .02em; }
    .radar-label { font-size: 21px; font-weight: 500; }
    .stat-icon { font-size: 28px; font-weight: 700; fill: #1a2548; }
    .stat-value { font-size: 31px; font-weight: 750; fill: #101828; }
    .stat-label { font-size: 23px; fill: #101828; }
    @media (prefers-color-scheme: dark) {
      text { fill: #e6edf3; }
      .muted, .stat-label { fill: #9aa6b2; }
      .stat-icon, .stat-value { fill: #e6edf3; }
    }
  </style>
  <text x="1205" y="33" text-anchor="end" class="muted">${escapeXml(dateLabel)}</text>
  <g aria-label="Contribution heatmap">${heatmap(calendar)}</g>
  <g transform="translate(0 0)" aria-label="Repository summary">
    <circle cx="165" cy="610" r="90" fill="none" stroke="#e6f4d7" stroke-width="50"/>
    <circle cx="165" cy="610" r="90" fill="none" stroke="#83df49" stroke-width="50" stroke-dasharray="565 1" transform="rotate(-90 165 610)"/>
    <circle cx="165" cy="610" r="63" fill="#ffffff"/>
    <text x="165" y="617" text-anchor="middle" class="stat-value">${escapeXml(stats.repo)}</text>
    <rect x="315" y="601" width="19" height="19" fill="#83df49"/>
    <text x="345" y="618" class="stat-label">Public repos</text>
  </g>
  <g aria-label="Activity radar">${radar(stats)}</g>
  ${statLine(335, compact(stats.contributions), "contributions", "◆")}
  ${statLine(650, compact(stats.stars), "stars", "☆")}
  ${statLine(850, compact(stats.forks), "forks", "⑂")}
</svg>
`;
  return svg;
}

writeFileSync(output, render(loadPayload()), "utf8");
console.log(`Wrote ${output}`);
