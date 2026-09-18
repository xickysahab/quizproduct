/**
 * Masks abuse in text that can end up on a projector: open-text answers, word
 * clouds, audience questions and display names.
 *
 * Masked, not rejected — a participant who typed one bad word still gets their
 * answer in, and nobody is locked out mid-quiz. Matching is by whole word, so
 * "class", "Scunthorpe" and "assessment" are left alone.
 *
 * The lists are the real work, and are meant to be edited: English lists are
 * easy to find, Hindi ones — in Devanagari and in romanized Hinglish — mostly
 * are not. Add a word in lowercase; spelling games (f@ck, fuuuck, sh!t) are
 * handled by normalisation, so list the plain spelling once.
 */

/** Whole words. */
const WORDS = [
  // English
  'fuck', 'fucks', 'fucked', 'fucker', 'fuckers', 'fucking', 'fuk', 'fck', 'fcuk', 'wtf', 'stfu', 'motherfucker',
  'shit', 'shits', 'shitty', 'bullshit', 'bitch', 'bitches', 'bastard', 'bastards', 'ass', 'asses', 'asshole',
  'assholes', 'dick', 'dicks', 'dickhead', 'cock', 'cocks', 'cunt', 'cunts', 'pussy', 'slut', 'sluts', 'whore',
  'whores', 'wanker', 'twat', 'prick', 'bollocks', 'jerkoff', 'dumbass', 'jackass', 'retard', 'retarded', 'nigger',
  'nigga', 'faggot', 'fag', 'porn', 'boobs', 'tits', 'dildo',
  // Hinglish (romanized Hindi)
  'chutiya', 'chutiye', 'chutia', 'chootiya', 'chutiyapa', 'chut', 'choot', 'bhosdi', 'bhosdike', 'bhosadike',
  'bhosda', 'bhosdiwale', 'bhosdiwala', 'madarchod', 'madarchodd', 'maderchod', 'mc', 'bc', 'bhenchod',
  'behenchod', 'bhanchod', 'benchod', 'bsdk', 'bkl', 'bhenkelode', 'lund', 'lauda', 'lawda', 'loda',
  'lavde', 'lodu', 'gaandu', 'gandu', 'gaand', 'gand', 'randi', 'raand', 'randwa', 'harami', 'haramkhor',
  'haramzada', 'haramzade', 'kutta', 'kutte', 'kutti', 'kamina', 'kamine', 'kaminey', 'jhant', 'jhaatu', 'jhatu',
  'tatti', 'chodu', 'chod', 'chodna', 'chudai', 'suar', 'saala', 'saali', 'ullu', 'bakchod',
  'bakchodi', 'gadha', 'bhadwa', 'bhadwe', 'dalla', 'teri', 'maa',
  // Devanagari
  'चूतिया', 'चुतिया', 'चूतिये', 'चुतिये', 'चूत', 'भोसड़ी', 'भोसडी', 'भोसड़ीके', 'भोसडीके', 'भोसड़ा', 'मादरचोद',
  'बहनचोद', 'बहनचोद', 'भेनचोद', 'लंड', 'लौड़ा', 'लौडा', 'लौड़े', 'गांडू', 'गांड', 'गाण्ड', 'रंडी', 'रण्डी',
  'हरामी', 'हरामज़ादा', 'हरामजादा', 'हरामखोर', 'कुत्ता', 'कुत्ते', 'कुत्तिया', 'कमीना', 'कमीने', 'झांट', 'झाटू',
  'टट्टी', 'चोदू', 'चोद', 'चुदाई', 'भड़वा', 'भडवा', 'भड़वे', 'दल्ला', 'साला', 'साली', 'उल्लू',
];

/**
 * Left out on purpose, because a classroom uses them straight: penis and
 * vagina (biology), chakka (a six), chudi (bangles), hijra (a community's
 * name), lode (English), B.C. (history).
 *
 * Words that the list above would get wrong in a classroom. "teri", "maa",
 * "saala", "kutta", "gadha" and "ullu" are everyday Hindi on their own —
 * "teri maa" and "ullu ka pattha" are the insults, so they are matched as
 * phrases instead.
 */
const HARMLESS_ALONE = new Set([
  'teri', 'maa', 'saala', 'saali', 'kutta', 'kutte', 'kutti', 'gadha', 'ullu', 'suar', 'chod', 'gand', 'mc', 'bc',
  'साला', 'साली', 'कुत्ता', 'कुत्ते', 'उल्लू', 'चोद',
]);
const PHRASES = [
  ['teri', 'maa'], ['teri', 'maa', 'ki'], ['ullu', 'ka', 'pattha'], ['kutte', 'ki', 'aulad'], ['saala', 'kutta'],
  ['mc', 'bc'], ['तेरी', 'माँ'], ['तेरी', 'मां'], ['उल्लू', 'का', 'पट्ठा'], ['कुत्ते', 'की', 'औलाद'],
];

/** Prefixes unambiguous enough that anything starting with them is abuse. */
const ROOTS = ['fuck', 'motherf', 'bhosd', 'madarch', 'maderch', 'behench', 'bhench', 'chutiy', 'bhadw', 'भोसड़', 'मादरच', 'बहनच'];

/** Devanagari with a nukta (ड़) has two encodings; compare in one. */
const norm = (s: string): string => s.normalize('NFKC').toLowerCase();

const LIST = new Set(WORDS.filter((w) => !HARMLESS_ALONE.has(w)).map(norm));
const ROOT_FORMS = ROOTS.map(norm);
const PHRASE_FORMS = PHRASES.map((phrase) => phrase.map(norm));

const LEET: Record<string, string> = { '@': 'a', '4': 'a', '3': 'e', '1': 'i', '!': 'i', '0': 'o', '$': 's', '5': 's', '7': 't', '*': '' };

/** The spellings a token could be hiding: as typed, de-leeted, and with repeats squeezed. */
const forms = (token: string): string[] => {
  const lower = norm(token);
  const plain = lower.replace(/[@!$*]/g, '');
  const deleet = lower.replace(/[@4310!$57*]/g, (c) => LEET[c] ?? '');
  const out = new Set<string>();
  for (const f of [plain, deleet]) {
    const squeezed = f.replace(/(.)\1{2,}/gu, '$1$1');
    out.add(squeezed);
    out.add(squeezed.replace(/(.)\1/gu, '$1'));
  }
  return [...out].filter(Boolean);
};

const isBad = (token: string): boolean =>
  forms(token).some((f) => LIST.has(f) || ROOT_FORMS.some((root) => f.length > root.length && f.startsWith(root)));

// Letters, combining marks (Devanagari matras) and digits, plus the symbols
// people substitute for letters — but only inside a word, so the "!" ending
// "Bhosdike!" stays punctuation while the one in "sh!t" is a letter.
const TOKEN = /(?:[\p{L}\p{M}\p{N}]|[@$!*](?=[@$!*]*[\p{L}\p{M}\p{N}]))+/gu;

const stars = (token: string): string => '*'.repeat([...token].length);

export const maskProfanity = (text: string): { text: string; masked: boolean } => {
  const tokens = [...text.matchAll(TOKEN)];
  const hide = new Set<number>();

  tokens.forEach((match, i) => {
    if (isBad(match[0])) hide.add(i);
  });

  const plain = tokens.map((m) => forms(m[0])[0]);
  for (const phrase of PHRASE_FORMS) {
    for (let i = 0; i + phrase.length <= plain.length; i += 1) {
      if (phrase.every((word, j) => plain[i + j] === word)) {
        for (let j = 0; j < phrase.length; j += 1) hide.add(i + j);
      }
    }
  }

  if (hide.size === 0) return { text, masked: false };

  let out = '';
  let last = 0;
  tokens.forEach((match, i) => {
    if (!hide.has(i)) return;
    out += text.slice(last, match.index) + stars(match[0]);
    last = match.index! + match[0].length;
  });
  return { text: out + text.slice(last), masked: true };
};

/** Already-masked text, whether masked on the way in or on the way out. */
export const looksMasked = (text: string): boolean => /\*{2,}/.test(text);
