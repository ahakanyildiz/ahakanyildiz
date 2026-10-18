// Generates assets/top-langs.svg (Tokyo Night theme) from all owned, non-fork repositories,
// including private ones when GH_TOKEN has the "repo" scope. Only language percentages are
// rendered; private repository names are never written anywhere.
//
// Env: GH_TOKEN (access token), GH_USER (login)
import fs from 'node:fs'

const TOKEN = process.env.GH_TOKEN
const LOGIN = process.env.GH_USER
// Markup/styling languages are skipped so they don't drown out programming languages
const SKIP = new Set(['HTML', 'CSS', 'SCSS', 'Less', 'Jupyter Notebook'])
const LANG_COUNT = 8

const C = { bg: '#1a1b27', title: '#70a5fd', label: '#a9b1d6', track: '#2a2e45' }

async function gql(query, variables) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'profile-cards' },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors))
  return json.data
}

const REPOS = `query($login: String!, $cursor: String) {
  user(login: $login) {
    repositories(first: 100, after: $cursor, ownerAffiliations: OWNER, isFork: false) {
      pageInfo { hasNextPage endCursor }
      nodes { languages(first: 20, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name color } } } }
    }
  }
}`

let cursor = null
const repos = []
do {
  const { user } = await gql(REPOS, { login: LOGIN, cursor })
  repos.push(...user.repositories.nodes)
  cursor = user.repositories.pageInfo.hasNextPage ? user.repositories.pageInfo.endCursor : null
} while (cursor)

const langs = new Map()
for (const r of repos) {
  for (const { size, node } of r.languages.edges) {
    if (SKIP.has(node.name)) continue
    const l = langs.get(node.name) ?? { size: 0, color: node.color ?? '#8b8b8b' }
    l.size += size
    langs.set(node.name, l)
  }
}
const total = [...langs.values()].reduce((s, l) => s + l.size, 0) || 1
const top = [...langs.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, LANG_COUNT)

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const pct = (l) => ((l.size / total) * 100).toFixed(1)

const W = 400
const H = 80 + Math.ceil(top.length / 2) * 25
let x = 25
const bar = top
  .map(([, l]) => {
    const w = (l.size / total) * (W - 50)
    const r = `<rect x="${x.toFixed(2)}" y="52" width="${Math.max(w, 1).toFixed(2)}" height="8" fill="${l.color}"/>`
    x += w
    return r
  })
  .join('')
const list = top
  .map(([name, l], i) => {
    const tx = 25 + (i % 2) * 180
    const ty = 88 + Math.floor(i / 2) * 25
    return `<g class="row" style="animation-delay:${150 + i * 90}ms" transform="translate(${tx},${ty})">
    <circle cx="5" cy="-4" r="5" fill="${l.color}"/>
    <text x="16" y="0" fill="${C.label}" font-size="13">${esc(name)} ${pct(l)}%</text>
  </g>`
  })
  .join('\n  ')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Segoe UI', Ubuntu, 'Helvetica Neue', Sans-Serif">
  <style>.row{opacity:0;animation:in .5s ease-out forwards}@keyframes in{to{opacity:1}}</style>
  <rect x="0.5" y="0.5" rx="12" width="${W - 1}" height="${H - 1}" fill="${C.bg}"/>
  <text x="25" y="35" fill="${C.title}" font-size="18" font-weight="600">Most Used Languages</text>
  <mask id="bar"><rect x="25" y="52" width="${W - 50}" height="8" rx="4" fill="#fff"/></mask>
  <rect x="25" y="52" width="${W - 50}" height="8" rx="4" fill="${C.track}"/>
  <g mask="url(#bar)">${bar}</g>
  ${list}
</svg>
`

fs.mkdirSync('assets', { recursive: true })
fs.writeFileSync('assets/top-langs.svg', svg)
console.log(`${repos.length} repos, ${langs.size} languages -> assets/top-langs.svg`)
console.log('Top:', top.map(([n, l]) => `${n} ${pct(l)}%`).join(', '))
