import englishParagraphs from './typingSpeedParagraphs.en.json';
import tagalogParagraphs from './typingSpeedParagraphs.tl.json';

/**
 * Paragraph bank + UI copy for the Typing Speed. Two categories
 * (English/Tagalog) matching the rest of the site's bilingual content, each
 * with three difficulty levels - the actual paragraph text lives in
 * typingSpeedParagraphs.en.json / typingSpeedParagraphs.tl.json (kept as
 * plain data files, not TS, so they're easy to review/extend without
 * touching any logic here). Content in both files is deliberately scoped to
 * science and math only - no religion, culture, race, politics, or society -
 * keep any future additions to that same scope.
 */
interface TypingSpeedLevelParagraphs {
  easy: string[];
  normal: string[];
  hard: string[];
}

interface TypingSpeedData {
  ui: Record<string, string>;
  paragraphs: {
    English: TypingSpeedLevelParagraphs;
    Tagalog: TypingSpeedLevelParagraphs;
  };
}

export const TYPING_SPEED_DATA: TypingSpeedData = {
  ui: {
    wpm: 'WPM',
    errors: 'Errors',
    time: 'Time',
    result: 'Auto Restart',
    capsLock: 'Caps Lock is on',
    reset: 'Restart',
    testComplete: 'Test Complete',
    tryAgain: 'Try Again',
    pressEnter: 'Press Enter to try again'
  },
  paragraphs: {
    English: englishParagraphs,
    Tagalog: tagalogParagraphs
  }
};
