const CJK = "\\p{sc=Han}\\p{sc=Hiragana}\\p{sc=Katakana}\\p{sc=Hangul}";
const RUNS = new RegExp(`[${CJK}]+|[^\\s\\p{P}\\p{S}${CJK}]+`, "gu");
const CJK_RUN = new RegExp(`^[${CJK}]`, "u");

const STOP_WORDS = new Set(
  "a an and are as at be but by can do for from has have how if in is it its me my no not of on or our so that the their them then there these this to us was we were what when where which who why will with you your about into just than too very".split(
    " ",
  ),
);
// Function characters that pair with almost anything, so a bigram holding one
// says little about the topic.
const STOP_CHARS = new Set(
  "的了是在我你他她它们和与或也都就还这那有没不吗呢吧啊么什怎哪个要会能可为对把被给让到从上下里",
);

const MAX_INDEXED_TERMS = 48;
const MAX_SHORT_TERMS = 12;
const MAX_SCORED_TERMS = 64;

export interface RecallTerms {
  /** Words and CJK bigrams a matching entry is scored on. */
  scored: string[];
  /** Phrases of three or more characters for the trigram index. */
  indexed: string[];
  /** Two-character phrases the trigram index cannot hold. */
  short: string[];
}

function windows(chars: string[], size: number) {
  const result: string[] = [];
  for (let index = 0; index + size <= chars.length; index += 1) {
    result.push(chars.slice(index, index + size).join(""));
  }
  return result;
}

export function recallTerms(query: string): RecallTerms {
  const scored = new Set<string>();
  const indexed = new Set<string>();
  const short = new Set<string>();
  for (const [run] of query.toLowerCase().matchAll(RUNS)) {
    const chars = [...run];
    if (!CJK_RUN.test(run)) {
      if (chars.length < 2 || STOP_WORDS.has(run)) continue;
      scored.add(run);
      (chars.length >= 3 ? indexed : short).add(run);
      continue;
    }
    for (const trigram of windows(chars, 3)) indexed.add(trigram);
    for (const bigram of windows(chars, 2)) {
      if ([...bigram].some((char) => STOP_CHARS.has(char))) continue;
      scored.add(bigram);
      short.add(bigram);
    }
  }
  return {
    scored: [...scored].slice(0, MAX_SCORED_TERMS),
    indexed: [...indexed].slice(0, MAX_INDEXED_TERMS),
    short: [...short].slice(0, MAX_SHORT_TERMS),
  };
}

export interface RecallText {
  title: string;
  content: string;
  tags: readonly string[];
}

export interface RecallMatch {
  /** Scored terms the entry holds. */
  matched: number;
  /** Matched terms, a title or tag hit counting twice. */
  weight: number;
  /** 0..1; a title or tag hit counts twice a body hit. */
  score: number;
}

export function matchRecallTerms(
  terms: readonly string[],
  entry: RecallText,
): RecallMatch {
  if (terms.length === 0) return { matched: 0, weight: 0, score: 0 };
  const heading = `${entry.title}\n${entry.tags.join("\n")}`.toLowerCase();
  const body = entry.content.toLowerCase();
  let matched = 0;
  let weight = 0;
  for (const term of terms) {
    if (heading.includes(term)) {
      matched += 1;
      weight += 2;
    } else if (body.includes(term)) {
      matched += 1;
      weight += 1;
    }
  }
  return { matched, weight, score: weight / (terms.length * 2) };
}

/**
 * A whole message shares a stray word with many bodies, so one body match
 * counts only for a query that short; a title or tag match, or two body
 * matches, count for any query.
 */
export function isRecallHit(terms: readonly string[], match: RecallMatch) {
  return match.weight >= Math.min(2, terms.length) && match.weight > 0;
}
