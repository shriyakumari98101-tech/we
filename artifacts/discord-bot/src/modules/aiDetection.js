const AI_PHRASES = [
  "i sincerely apologize",
  "take full responsibility",
  "going forward",
  "i want to assure you",
  "i deeply regret",
  "in conclusion",
  "it is important to note",
  "i would like to appeal",
  "please accept my apology",
  "i understand the gravity",
  "moving forward",
  "i acknowledge",
  "rest assured",
  "i am committed to",
  "in retrospect",
  "upon reflection",
  "i assure you",
  "henceforth",
  "i have come to realize",
  "this has been a learning experience",
  "i want to emphasize",
  "i would appreciate",
  "i am truly sorry for",
  "i genuinely regret",
  "i hope you understand",
  "i am writing to appeal",
  "i understand that my actions",
  "i take this matter",
  "i want to make it clear",
  "on reflection",
  "i sincerely hope",
  "i am deeply sorry",
  "i will ensure",
  "i promise to",
  "i can assure you",
  "i would like to assure",
  "i fully understand",
  "going forward i will",
  "i am aware that",
  "it was wrong of me",
  "i have reflected",
  "i realize now that",
  "this was a mistake on my part",
];

const TRANSITION_WORDS = [
  "furthermore",
  "moreover",
  "additionally",
  "consequently",
  "nevertheless",
  "nonetheless",
  "therefore",
  "thus",
  "hence",
  "accordingly",
  "in addition",
  "as a result",
  "in summary",
  "to summarize",
  "in retrospect",
  "in conclusion",
  "for instance",
  "for example",
  "such as",
  "it is worth noting",
  "it should be noted",
  "it is important",
  "on the other hand",
  "at the same time",
];

const HUMAN_MARKERS = [
  "idk",
  "tbh",
  "ngl",
  "lol",
  "lmao",
  "wtf",
  "omg",
  "bruh",
  "nah",
  "yeah",
  "kinda",
  "gonna",
  "wanna",
  "gotta",
  "lemme",
  "cuz",
  "cus",
  "dunno",
  "imo",
  "smh",
  "ugh",
  "bro",
  "man,",
  "bro,",
  "dude",
  "yea",
  "yep",
  "nope",
  "like i said",
  "i swear",
  "no cap",
  "fr fr",
  "lowkey",
  "highkey",
  "deadass",
];

export async function detectAIContent(transcript) {
  const text = transcript.toLowerCase();
  const original = transcript;
  let score = 0;
  const reasons = [];

  let aiPhraseCount = 0;
  for (const phrase of AI_PHRASES) {
    if (text.includes(phrase)) {
      aiPhraseCount++;
      score += 14;
    }
  }
  if (aiPhraseCount > 0) {
    reasons.push(`${aiPhraseCount} AI signature phrase${aiPhraseCount > 1 ? "s" : ""} detected`);
  }

  let transCount = 0;
  for (const t of TRANSITION_WORDS) {
    if (text.includes(t)) transCount++;
  }
  if (transCount >= 3) {
    score += 25;
    reasons.push(`${transCount} formal transition words`);
  } else if (transCount === 2) {
    score += 14;
    reasons.push(`${transCount} formal transition words`);
  } else if (transCount === 1) {
    score += 6;
  }

  let humanCount = 0;
  for (const h of HUMAN_MARKERS) {
    if (text.includes(h)) humanCount++;
  }
  if (humanCount >= 3) {
    score -= 35;
    reasons.push(`Strong casual language (${humanCount} markers)`);
  } else if (humanCount >= 1) {
    score -= 18;
    reasons.push(`Casual language detected`);
  }

  const hasLowercaseI = /(?:^| )i(?:'m|'ve|'ll|'d| |$)/m.test(original);
  if (hasLowercaseI) {
    score -= 10;
  }

  const sentences = original
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);

  if (sentences.length >= 3) {
    const lengths = sentences.map((s) => s.split(/\s+/).length);
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance =
      lengths.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / lengths.length;

    if (avg > 20 && variance < 25) {
      score += 22;
      reasons.push("Uniform long sentences (AI pattern)");
    } else if (avg > 15 && variance < 35) {
      score += 10;
    }

    const allCapped = sentences.filter(
      (s) => s[0] === s[0].toUpperCase() && /[a-zA-Z]/.test(s[0])
    ).length;
    const capRatio = allCapped / sentences.length;
    if (capRatio > 0.92 && sentences.length >= 5) {
      score += 8;
      reasons.push("Perfect punctuation/capitalization");
    }
  }

  const paragraphs = original
    .split(/\n\s*\n/)
    .filter((p) => p.trim().length > 30);
  if (paragraphs.length >= 4) {
    score += 16;
    reasons.push(`${paragraphs.length} structured paragraphs`);
  } else if (paragraphs.length >= 3) {
    score += 8;
  }

  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;

  if (wordCount < 25) {
    score -= 22;
    reasons.push("Very short/concise answer");
  } else if (wordCount < 50) {
    score -= 10;
  }

  const uniqueWords = new Set(words.map((w) => w.replace(/[^a-z]/g, "")));
  const typeTokenRatio = uniqueWords.size / Math.max(wordCount, 1);
  if (wordCount > 60 && typeTokenRatio > 0.72) {
    score += 10;
    reasons.push("High vocabulary diversity");
  }

  const hasEllipsis = /\.{2,}/.test(original);
  const hasRunOn = /[a-z]{1}[A-Z]/.test(original);
  const hasAllLower = /^[a-z]/.test(original.trim());
  const typoLikePatterns = (original.match(/\b[a-z]{2,}[A-Z][a-z]+\b/g) || []).length;

  if (hasEllipsis || hasAllLower || typoLikePatterns > 2) {
    score -= 12;
    reasons.push("Human-like informal style");
  }

  const formalWordList = [
    "sincerely",
    "humbly",
    "respectfully",
    "hereby",
    "aforementioned",
    "subsequent",
    "unequivocally",
    "wholeheartedly",
    "profoundly",
    "genuinely regret",
    "deeply apologize",
    "fully commit",
    "utmost",
    "paramount",
  ];
  let formalCount = 0;
  for (const fw of formalWordList) {
    if (text.includes(fw)) formalCount++;
  }
  if (formalCount >= 2) {
    score += 18;
    reasons.push(`${formalCount} overly formal words`);
  } else if (formalCount === 1) {
    score += 8;
  }

  const isAI = score >= 38;
  const rawConfidence = Math.min(Math.max(score, 0), 100);
  const confidence = isAI
    ? Math.min(Math.round((score / 80) * 100), 99)
    : Math.max(Math.round(100 - (Math.max(score, 0) / 38) * 60), 40);

  return {
    isAI,
    confidence,
    reason:
      reasons.length > 0
        ? reasons.join("; ")
        : isAI
        ? "Multiple AI writing patterns detected"
        : "Natural human writing style",
    score,
  };
}
