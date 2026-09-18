import { describe, expect, it } from 'vitest';
import { maskProfanity } from '../utils/profanity';

const masked = (text: string) => maskProfanity(text).text;

describe('maskProfanity', () => {
  it.each([
    ['you are a fucking idiot', 'you are a ******* idiot'],
    ['F@CK this', '**** this'],
    ['fuuuuck', '*******'],
    ['sh!t happens', '**** happens'],
    ['chutiya hai tu', '******* hai tu'],
    ['Bhosdike!', '********!'],
    ['teri maa ki', '**** *** **'],
  ])('masks %s', (input, output) => {
    expect(masked(input)).toBe(output);
  });

  it.each([
    ['मादरचोद कहीं का', /^\*+ कहीं का$/],
    ['तू भोसड़ीके है', /^तू \*+ है$/],
    ['चूतिया', /^\*+$/],
  ])('masks Devanagari %s', (input, pattern) => {
    expect(masked(input)).toMatch(pattern);
  });

  it.each([
    'The class passed the assessment',
    'Scunthorpe United',
    'Sachin hit a chakka',
    'The penis and vagina are reproductive organs',
    'Akbar ruled after 1556, long after 500 BC',
    'meri maa ne khana banaya',
    'ullu raat ko jaagta hai',
    'साला मज़ाक था',
    'मेरी माँ शिक्षक हैं',
  ])('leaves %s alone', (input) => {
    expect(maskProfanity(input)).toEqual({ text: input, masked: false });
  });

  it('matches a nukta whichever way it was encoded', () => {
    const decomposed = 'भोसड़ीके'.normalize('NFD');
    expect(maskProfanity(decomposed).masked).toBe(true);
  });
});
