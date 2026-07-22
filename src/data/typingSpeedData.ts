/**
 * Paragraph bank + UI copy for the Typing Speed. Two categories
 * (English/Tagalog) matching the rest of the site's bilingual content,
 * each with three difficulty levels.
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
    English: {
      easy: [
        'The cat sat on the mat. It was a warm and sunny day. Birds sang in the trees above the quiet yard.',
        'I like to read books at night. A good story can take you to a whole new world in just a few pages.',
        'We walked to the store to buy some milk and bread. The sun was setting and the sky turned orange.'
      ],
      normal: [
        'Learning to type quickly takes regular practice and patience. Focus on accuracy first, and speed will follow naturally over time.',
        'Good habits are built one small step at a time. Consistency matters more than intensity when you are trying to improve any skill.',
        'A clear plan makes even a difficult task feel manageable. Break big goals into smaller pieces you can finish in a single sitting.'
      ],
      hard: [
        'Technology continues to reshape how we learn, work, and communicate, often faster than our habits and expectations can adjust.',
        'Debugging a program requires patience, careful observation, and the willingness to question assumptions that once seemed obvious.',
        'Effective documentation anticipates the reader\'s confusion before it happens, explaining not just what to do but why it matters.'
      ]
    },
    Tagalog: {
      easy: [
        'Maganda ang panahon ngayon. Maaraw at malamig ang hangin sa labas ng bahay namin ngayong umaga.',
        'Gusto kong matuto ng bagong bagay araw-araw. Ang bawat karanasan ay may aral na maaaring matutunan.',
        'Pumunta kami sa palengke upang bumili ng gulay at prutas. Masaya ang byahe kahit medyo mainit.'
      ],
      normal: [
        'Ang regular na pagsasanay ay tumutulong upang mapabilis ang pagta-type nang hindi nakakalimutan ang tamang paraan.',
        'Mahalaga ang disiplina sa pag-aaral. Kahit maliit na hakbang araw-araw, malaki ang maitutulong nito sa mahabang panahon.',
        'Ang malinaw na plano ay ginagawang mas madali ang anumang gawain, lalo na kapag ito ay hinahati sa maliliit na bahagi.'
      ],
      hard: [
        'Ang teknolohiya ay patuloy na nagbabago sa paraan ng ating pag-aaral, pagtatrabaho, at pakikipag-usap sa isa\'t isa.',
        'Ang pag-aayos ng maling code ay nangangailangan ng pasensya, mataman na pagmamasid, at kakayahang tanungin ang sariling pagkaunawa.',
        'Ang mabuting dokumentasyon ay hindi lamang naglalarawan ng hakbang kundi ipinapaliwanag din kung bakit ito mahalagang sundin.'
      ]
    }
  }
};
