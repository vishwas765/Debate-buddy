// The research workspace Debate Buddy can build without its AI engine.
// It contains no facts and no sources: only a plan, search queries and search
// links (which open live searches, not documents), plus empty prompts to fill in.
const q = text => encodeURIComponent(text);
const FORMAT_NAME = {'for-against': 'For / Against', group: 'Group Discussion', mun: 'Model United Nations'};

export function offlineWorkspace({topic, format, side = '', committee = '', country = ''}) {
  const t = topic.trim(), quoted = `"${t.replace(/^this house (would|believes that|believes|supports)\s+/i, '')}"`;
  const queries = [
    `${quoted} arguments for and against`,
    `${quoted} evidence study`,
    `${quoted} statistics site:gov OR site:int`,
    `${quoted} policy report filetype:pdf`,
    `${quoted} latest news`
  ];
  if (format === 'mun') {
    queries.push(`${quoted} United Nations resolution`, `${country || '<your country>'} position ${quoted}`, `${country || '<your country>'} statement ${committee || 'General Assembly'}`, `${quoted} voting record United Nations`);
  }
  const links = [
    ['Google Scholar search', `https://scholar.google.com/scholar?q=${q(t)}`, 'peer-reviewed research and working papers'],
    ['Google News search', `https://news.google.com/search?q=${q(t)}`, 'recent coverage from established news organizations'],
    ['Our World in Data search', `https://ourworldindata.org/search?q=${q(t)}`, 'charts and datasets with documented sources'],
    ['Wikipedia search', `https://en.wikipedia.org/w/index.php?search=${q(t)}`, 'orientation only: follow its references to primary sources, do not cite it']
  ];
  if (format === 'mun') links.unshift(['UN Digital Library search', `https://digitallibrary.un.org/search?ln=en&p=${q(t)}`, 'UN resolutions, reports and voting records']);

  const sideLine = format === 'for-against' ? (side ? `You plan to argue **${side === 'for' ? 'For' : 'Against'}**. Prepare both sides anyway: your rebuttals depend on it.` : 'You have not chosen a side yet. Prepare both sides equally.') : '';
  const formatSection = format === 'mun' ? `## Your MUN game plan
- [Analysis] Committee: ${committee || 'not chosen yet'}. Read its mandate first, so your proposals stay within what it can actually do.
- [Analysis] Country: ${country || 'not chosen yet'}. Find its most recent official statement on this agenda (UN press releases, the mission's website, the foreign ministry).
- [Analysis] List likely allies and opponents only after checking actual votes or statements. Until then, treat them as guesses.
- [Analysis] Draft two red lines, two areas where you can compromise, and one clause you would sponsor.
- [Analysis] Verify before committee: recent votes, regional bloc positions, any treaty your country has or has not signed.`
    : format === 'group' ? `## Your discussion game plan
- [Analysis] Write down three viewpoints the group is likely to hold, and one point where they could agree.
- [Analysis] Prepare two questions that move a discussion forward (for example "what would change your mind?").
- [Analysis] Plan how you will invite a quiet participant in, and how you will summarise before closing.`
      : `## Your case game plan
- [Analysis] Define the key terms in the motion the way that is fairest to both sides.
- [Analysis] For each side, outline two or three arguments: claim, reasoning, evidence, impact.
- [Analysis] Predict the two biggest points of clash and decide how you would weigh them.`;

  return `## In short
This brief was built offline. Debate Buddy could not reach its AI engine, so nothing here is researched or checked, and there are no facts or sources. Use the plan and the searches to build your own notes.
## Key terms
- [Analysis] Topic: ${t} (${FORMAT_NAME[format]}). ${sideLine}
- [Analysis] Write a two-sentence neutral summary of the topic after reading two credible sources.
- [Analysis] List the three to five terms that need a definition, and note where each definition comes from.

## Why people disagree
- [Analysis] Rewrite the topic as one question that both sides answer differently.
- [Analysis] Note what has happened recently that makes this topic contested now.

## Arguments to find
- [Analysis] For each side, find the single strongest argument and one piece of evidence a judge would accept (official data, a peer-reviewed study, a law or an expert body).

## How the other side will respond
- [Analysis] For every argument you collect, write the best reply and your answer to that reply.

## Who is affected
- [Analysis] Who gains, who loses, over what time frame, and how certain is each impact?

## Still unsettled
- [Analysis] Note what the evidence does not settle. These make good points of information.

## Your research plan
1. Read one neutral overview to learn the vocabulary and the main positions.
2. Find official or primary sources (laws, government or UN documents, statistics agencies) for the core facts, because judges trust them most.
3. Find one or two peer-reviewed or expert studies for each side, so your evidence is balanced.
4. Read recent news from established outlets to see what changed lately.
5. Write rebuttals for the strongest opposing points.
6. Condense everything onto the revision sheet below.

## What to search
${queries.map(x => `- ${x}`).join('\n')}
These links open live searches (they are not sources themselves):
${links.map(([name, url, why]) => `- [${name}](${url}): ${why}`).join('\n')}
- Official sites: the relevant government ministry, parliament or legislature, and statistics office for the countries involved.
- International organizations: the UN body, World Bank, WHO, OECD or other organization responsible for this area.

## Sources
No sources were retrieved, because live research was unavailable. Add each source you use with its title, publisher, date, link and why it matters.

${formatSection}

## Cheat sheet
- Key facts (with source): …
- Definitions: …
- Top three arguments: …
- Top three rebuttals: …
- Speaking reminders: signpost your points, answer the strongest opposing point first, finish with why your side wins.`;
}
