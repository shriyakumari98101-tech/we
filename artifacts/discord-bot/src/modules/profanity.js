const BLOCKED_WORDS = [
  "fuck",
  "bitch",
  "cunt",
  "cock",
  "dick",
  "pussy",
  "nigga",
  "nigger",
  "nigge",
  "niga",
  "niger",
  "faggot",
  "retard",
  "whore",
  "slut",
];

const SUBSTITUTIONS = {
  "@": "a", "4": "a", "á": "a", "à": "a", "ä": "a", "â": "a",
  "3": "e", "é": "e", "è": "e", "ë": "e",
  "1": "i", "!": "i", "|": "i", "í": "i", "ì": "i",
  "0": "o", "ó": "o", "ö": "o", "ø": "o",
  "$": "s", "5": "s", "ß": "ss",
  "+": "t", "7": "t",
  "ph": "f",
  "ü": "u", "ú": "u",
  "ñ": "n",
};

function normalize(text) {
  let t = text.toLowerCase();
  for (const [from, to] of Object.entries(SUBSTITUTIONS)) {
    t = t.split(from).join(to);
  }
  t = t.replace(/(.)\1{2,}/g, "$1$1");
  t = t.replace(/[^a-z\s]/g, "");
  return t;
}

export function findProfanity(text) {
  const norm = normalize(text);
  const squished = norm.replace(/\s+/g, "");

  for (const word of BLOCKED_WORDS) {
    const wbRegex = new RegExp(`\\b${word}\\b`);
    if (wbRegex.test(norm)) return word;

    if (word.length >= 5 && squished.includes(word)) {
      return word;
    }
  }
  return null;
}

export function containsProfanity(text) {
  return findProfanity(text) !== null;
}
