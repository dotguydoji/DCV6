import { CourseMaterial, FAQItem, Product, ProductLanguage, ProductLevel, SiteContent } from './types';

// Exported so the order-submission flow (OrderSubmittedModal.tsx, the
// "Talk to an Admin" button) reuses the exact same links every product's
// own mobileUrl/desktopUrl already falls back to, instead of a second
// hardcoded copy that could drift out of sync.
export const MOBILE_URL = 'https://m.me/103186496068437';
export const DESKTOP_URL = 'https://www.facebook.com/share/p/1HMaPSeaty/';

const PROGRAMMING_LANGUAGES_CATEGORY = 'Programming Languages';
const WEB_DEVELOPMENT_CATEGORY = 'Web Dev & Tools';
const FRAMEWORKS_CATEGORY = 'Frameworks';
export const AI_COURSES_CATEGORY = 'Courses';
const AI_TOOLS_CATEGORY = 'Claude Notes';
const AI_AUTOMATION_CATEGORY = 'AI Tools & Automations';
const PRODUCTIVITY_CATEGORY = 'ADVANCED STUDY';
export const PRODUCTIVITY_APPS_CATEGORY = 'Productivity';
const PREORDER_THUMBNAIL = '/favicon.svg';

// The Productivity category itself is the one paid, subscribable product
// (₱59/month) - every feature underneath it (Typing Speed, and
// whatever's added later) is bundled in and gated on owning this single id,
// never priced or granted individually. Granted through the same
// buyers/{email}.productIds mechanism as every PDF, but never routed
// through /view/<id> or listed as a PDF in My Library - see
// isProductivityFeatureProductId below. The admin grant endpoint also
// relies on this exact id to skip its "must have an uploaded file" check
// and to record/refresh the monthly subscription start date.
export const PRODUCTIVITY_SUBSCRIPTION_PRODUCT_ID = 'productivity-subscription';

export const isProductivityFeatureProductId = (id: string): boolean =>
  id === PRODUCTIVITY_SUBSCRIPTION_PRODUCT_ID;

// Product thumbnails are served from a dedicated public R2 bucket
// (dc-notes-images), not Netlify's own bandwidth - R2 downloads are free
// regardless of volume, unlike Netlify's bandwidth cap. Falls back to the
// old local /images path when the env var isn't set (e.g. a fresh local
// checkout before .env is configured), so dev still works without it.
// Optional chaining on `.env` itself (not just the var) - this file is also
// imported by plain tsx/Node scripts (catalog:sync, chatbot-index:sync),
// where import.meta.env doesn't exist at all (it's a Vite-only construct),
// which previously crashed those scripts outright.
const IMAGE_BASE_URL = import.meta.env?.VITE_IMAGE_BASE_URL ?? '';

const LANGUAGE_FILE_SEGMENT: Record<ProductLanguage, 'english' | 'tagalog'> = {
  en: 'english',
  tl: 'tagalog'
};

type ProgrammingLanguageKey = 'c' | 'cpp' | 'csharp' | 'java' | 'javascript' | 'python';
type WebDevelopmentKey = 'html' | 'css' | 'jsdom' | 'package';
type ToolsItemKey = 'git-github-notes';
type AIItemKey =
  | 'claude-code-notes'
  | 'claude-mcp'
  | 'claude-subagents'
  | 'prompt-engineering-basics'
  | 'claude-projects-advanced'
  | 'claude-artifacts-advanced'
  | 'claude-skills-advanced'
  | 'claude-memory'
  | 'claude-connectors'
  | 'claude-projects-github'
  | 'publishing-website-portfolio'
  | 'claude-design'
  | 'claude-code-advanced'
  | 'claude-goal-loop-engineering'
  | 'claude-cowork'
  | 'claude-dispatch'
  | 'claude-in-chrome';
type AIAutomationItemKey = 'n8n-automation' | 'openclo' | 'hermes-agent';
type ProductivityItemKey = 'freshman-prep' | 'bscs-advance-study';

interface ProgrammingLanguageMeta {
  itemKey: ProgrammingLanguageKey;
  name: string;
}

interface ProgrammingLevelMeta {
  key: ProductLevel;
  label: string;
  folder: string;
  fileSuffix: string;
  price: Partial<Record<ProductLanguage, number>>;
  available: boolean;
}

interface WebDevelopmentMeta {
  itemKey: WebDevelopmentKey;
  title: string;
  fileStem: string;
  description: Record<ProductLanguage, string>;
  price: Record<ProductLanguage, number>;
}

interface AIItemMeta {
  itemKey: AIItemKey;
  title: string;
  description: Record<ProductLanguage, string>;
  price: Record<ProductLanguage, number>;
}

interface AIAutomationItemMeta {
  itemKey: AIAutomationItemKey;
  title: string;
  description: Record<ProductLanguage, string>;
  price: Record<ProductLanguage, number>;
  preOrder?: boolean;
  
}

type AICourseItemKey = 'code-mastery';

interface AICourseItemMeta {
  itemKey: AICourseItemKey;
  title: string;
  description: string;
  price: number;
  thumbnail: string;
  available: boolean;
  preOrder?: boolean;
  materials: CourseMaterial[];
}

interface ToolsItemMeta {
  itemKey: ToolsItemKey;
  title: string;
  description: Record<ProductLanguage, string>;
  price: Record<ProductLanguage, number>;
}

interface ProductivityItemMeta {
  itemKey: ProductivityItemKey;
  title: string;
  description: string;
  thumbnail: string;
  price: number;
  available: boolean;
  preOrder?: boolean;
}

export const SITE_CONTENT: SiteContent = {
  brandName: 'DC NOTES',
  brandTagline: 'Notes',
  hero: {
    mainTitle: 'Learn the easy way.',
    subTitle: 'DC NOTES / TECHNICAL LIBRARY'
  },
  footer: {
    description:
      'Easy-to-understand documentation made for beginners. Learn concepts step by step with clear explanations and helpful visuals.',
    copyright: '(c) 2026 DC NOTES. ALL RIGHTS RESERVED.'
  },
  socials: {
    facebook: 'https://facebook.com/dojicreates'
  }
};

export const CATEGORIES = [
  // AI_COURSES_CATEGORY,
  PROGRAMMING_LANGUAGES_CATEGORY,
  WEB_DEVELOPMENT_CATEGORY,
  FRAMEWORKS_CATEGORY,
  AI_TOOLS_CATEGORY,
  AI_AUTOMATION_CATEGORY,
  PRODUCTIVITY_CATEGORY,
  PRODUCTIVITY_APPS_CATEGORY
];

const PROGRAMMING_LANGUAGES: readonly ProgrammingLanguageMeta[] = [
  { itemKey: 'c', name: 'C' },
  { itemKey: 'cpp', name: 'C++' },
  { itemKey: 'csharp', name: 'C#' },
  { itemKey: 'java', name: 'Java' },
  { itemKey: 'javascript', name: 'JavaScript' },
  { itemKey: 'python', name: 'Python' }
];

const PROGRAMMING_LEVELS: readonly ProgrammingLevelMeta[] = [
  {
    key: 'beginner',
    label: 'Beginner',
    folder: 'programming-languages-beginners',
    fileSuffix: 'beginners',
    price: { en: 120, tl: 150 },
    available: true
  },
  {
    key: 'intermediate',
    label: 'Intermediate',
    folder: 'programming-languages-intermediate',
    fileSuffix: 'intermediate',
    price: { en: 180, tl: 210 },
    available: true
  },
  {
    key: 'advanced',
    label: 'Advanced',
    folder: 'programming-languages-advanced',
    fileSuffix: 'advanced',
    price: { en: 240, tl: 270 },
    available: true
  },
  {
    key: 'build-phase',
    label: 'Build Phase',
    folder: 'programming-languages-buildphase',
    fileSuffix: 'buildphase',
    price: {},
    available: false
  },
  {
    key: 'activities',
    label: 'Activities',
    folder: 'programming-languages-activities',
    fileSuffix: 'activities',
    price: { en: 120, tl: 120 },
    available: true
  },
  {
    key: 'package',
    label: 'Packages',
    folder: 'programming-languages-packages',
    fileSuffix: 'package',
    price: { en: 399, tl: 499 },
    available: true
  }
];

// Python was excluded from the price update - it keeps its previous prices
// (same figures every language used before this change) while every other
// language moves to PROGRAMMING_LEVELS' new prices above. Only the levels
// that actually changed need an entry here (Activities didn't change, so
// it's absent and falls through to the shared price like every other
// language).
const PYTHON_LEGACY_PRICES: Partial<Record<ProductLevel, Partial<Record<ProductLanguage, number>>>> = {
  beginner: { en: 150, tl: 199 },
  intermediate: { en: 199, tl: 250 },
  advanced: { en: 250, tl: 299 },
  package: { en: 499, tl: 599 }
};

const WEB_DEVELOPMENT_ITEMS: readonly WebDevelopmentMeta[] = [
  {
    itemKey: 'html',
    title: 'HTML',
    fileStem: 'html',
    description: {
      en: 'Structured HTML lessons focused on semantic layout, clean markup, and solid page-building fundamentals.',
      tl: 'Tagalog HTML lessons na nakatuon sa semantic layout, malinaw na markup, at matibay na page-building fundamentals.'
    },
    price: { en: 150, tl: 199 }
  },
  {
    itemKey: 'css',
    title: 'CSS',
    fileStem: 'css',
    description: {
      en: 'Modern CSS coverage for responsive layout, spacing systems, components, and polished visual styling.',
      tl: 'Tagalog CSS coverage para sa responsive layout, spacing systems, components, at mas maayos na visual styling.'
    },
    price: { en: 199, tl: 250 }
  },
  {
    itemKey: 'jsdom',
    title: 'JSDOM',
    fileStem: 'jsdom',
    description: {
      en: 'JavaScript DOM lessons that focus on events, interactivity, and the practical logic behind dynamic interfaces.',
      tl: 'Tagalog JavaScript DOM lessons na nakatuon sa events, interactivity, at praktikal na logic sa likod ng dynamic interfaces.'
    },
    price: { en: 299, tl: 350 }
  },
  {
    itemKey: 'package',
    title: 'Web Development Package',
    fileStem: 'webdev-package',
    description: {
      en: 'A combined web development package that brings HTML, CSS, and JavaScript DOM notes together in one set.',
      tl: 'Isang pinagsamang web development package na magkakasama ang HTML, CSS, at JavaScript DOM notes sa iisang set.'
    },
    price: { en: 599, tl: 699 }
  }
];

const TOOLS_ITEMS: readonly ToolsItemMeta[] = [
  {
    itemKey: 'git-github-notes',
    title: 'Git & GitHub Notes',
    description: {
      en: 'Git and GitHub notes focused on version control, repositories, commits, branches, and practical collaboration workflows.',
      tl: 'Git at GitHub notes sa Tagalog na nakatuon sa version control, repositories, commits, branches, at praktikal na collaboration workflows.'
    },
    price: { en: 350, tl: 399 }
  }
];

const AI_ITEMS: readonly AIItemMeta[] = [
  {
    itemKey: 'claude-mcp',
    title: 'Claude MCP',
    description: {
      en: 'Claude MCP notes focused on connecting Claude with external tools and structured workflows.',
      tl: 'Claude MCP notes na nakatuon sa pag-connect ng Claude sa external tools at structured workflows.'
    },
    price: { en: 120, tl: 150 }
  },
  {
    itemKey: 'claude-subagents',
    title: 'Claude Subagents',
    description: {
      en: 'Claude Subagents notes for breaking tasks into smaller helpers and improving multi-step coding support.',
      tl: 'Claude Subagents notes para hati-hatiin ang tasks sa mas maliliit na helpers at mas mapaganda ang multi-step coding support.'
    },
    price: { en: 199, tl: 250 }
  },
  // {
  //   itemKey: 'prompt-engineering-basics',
  //   title: 'Prompt Engineering Basics',
  //   description: {
  //     en: 'Foundational prompt engineering notes covering techniques, patterns, and best practices for effective AI communication.',
  //     tl: 'Pundamental na prompt engineering notes na sumasaklaw sa mga techniques, patterns, at best practices para sa epektibong AI communication.'
  //   },
  //   price: { en: 99, tl: 120 }
  // },
  // {
  //   itemKey: 'claude-projects-advanced',
  //   title: 'Claude Projects Advanced',
  //   description: {
  //     en: 'Advanced Claude Projects notes for organizing knowledge, managing context, and building structured project workflows.',
  //     tl: 'Advanced Claude Projects notes para sa pag-organisa ng knowledge, pamamahala ng context, at pagbuo ng structured project workflows.'
  //   },
  //   price: { en: 99, tl: 120 }
  // },
  // {
  //   itemKey: 'claude-artifacts-advanced',
  //   title: 'Claude Artifacts Advanced',
  //   description: {
  //     en: 'Advanced Claude Artifacts notes for creating interactive content, applications, and reusable components.',
  //     tl: 'Advanced Claude Artifacts notes para sa paggawa ng interactive content, applications, at reusable components.'
  //   },
  //   price: { en: 99, tl: 120 }
  // },
  // {
  //   itemKey: 'claude-skills-advanced',
  //   title: 'Claude Skills Advanced',
  //   description: {
  //     en: 'Advanced Claude Skills notes for building custom slash commands and extending Claude capabilities.',
  //     tl: 'Advanced Claude Skills notes para sa pagbuo ng custom slash commands at pagpapalawak ng Claude capabilities.'
  //   },
  //   price: { en: 99, tl: 120 }
  // },
  // {
  //   itemKey: 'claude-memory',
  //   title: 'Claude Memory',
  //   description: {
  //     en: 'Claude Memory notes covering persistent memory systems, context management, and knowledge retention strategies.',
  //     tl: 'Claude Memory notes na sumasaklaw sa persistent memory systems, context management, at knowledge retention strategies.'
  //   },
  //   price: { en: 99, tl: 120 }
  // },
  // {
  //   itemKey: 'claude-connectors',
  //   title: 'Claude Connectors',
  //   description: {
  //     en: 'Claude Connectors notes for integrating external data sources and services directly into Claude workflows.',
  //     tl: 'Claude Connectors notes para sa pag-integrate ng external data sources at services direkta sa Claude workflows.'
  //   },
  //   price: { en: 99, tl: 120 }
  // },
  // {
  //   itemKey: 'claude-projects-github',
  //   title: 'Claude Projects + GitHub',
  //   description: {
  //     en: 'Notes on connecting Claude Projects with GitHub for seamless version control and collaborative development.',
  //     tl: 'Notes sa pag-connect ng Claude Projects sa GitHub para sa seamless version control at collaborative development.'
  //   },
  //   price: { en: 99, tl: 120 }
  // },
  // {
  //   itemKey: 'publishing-website-portfolio',
  //   title: 'Publishing a Website Portfolio with Claude Artifacts',
  //   description: {
  //     en: 'Step-by-step notes on building and publishing a website portfolio using Claude Artifacts.',
  //     tl: 'Step-by-step na notes sa pagbuo at pag-publish ng website portfolio gamit ang Claude Artifacts.'
  //   },
  //   price: { en: 99, tl: 120 }
  // },
  // {
  //   itemKey: 'claude-design',
  //   title: 'Claude Design',
  //   description: {
  //     en: 'Claude Design notes covering UI/UX design workflows, visual creation, and design-to-code techniques.',
  //     tl: 'Claude Design notes na sumasaklaw sa UI/UX design workflows, visual creation, at design-to-code techniques.'
  //   },
  //   price: { en: 99, tl: 120 }
  // },
  // {
  //   itemKey: 'claude-code-advanced',
  //   title: 'Claude Code Advanced',
  //   description: {
  //     en: 'Advanced Claude Code notes for terminal, IDE integrations, and professional development workflows.',
  //     tl: 'Advanced Claude Code notes para sa terminal, IDE integrations, at professional development workflows.'
  //   },
  //   price: { en: 99, tl: 120 }
  // },
  // {
  //   itemKey: 'claude-goal-loop-engineering',
  //   title: 'Claude Goal and Loop Engineering',
  //   description: {
  //     en: 'Notes on Claude goal-setting and loop engineering for automated, recurring, and self-pacing workflows.',
  //     tl: 'Notes sa Claude goal-setting at loop engineering para sa automated, recurring, at self-pacing workflows.'
  //   },
  //   price: { en: 99, tl: 120 }
  // },
  // {
  //   itemKey: 'claude-cowork',
  //   title: 'Claude Cowork',
  //   description: {
  //     en: 'Claude Cowork notes for collaborative AI sessions, shared workspaces, and team-based workflows.',
  //     tl: 'Claude Cowork notes para sa collaborative AI sessions, shared workspaces, at team-based workflows.'
  //   },
  //   price: { en: 99, tl: 120 }
  // },
  // {
  //   itemKey: 'claude-dispatch',
  //   title: 'Claude Dispatch',
  //   description: {
  //     en: 'Claude Dispatch notes for controlling Claude remotely from your phone to your desktop.',
  //     tl: 'Claude Dispatch notes para sa remote control ng Claude mula sa iyong phone papunta sa iyong desktop.'
  //   },
  //   price: { en: 99, tl: 120 }
  // },
  // {
  //   itemKey: 'claude-in-chrome',
  //   title: 'Claude in Chrome',
  //   description: {
  //     en: 'Claude in Chrome notes for browser-based AI workflows, web automation, and Chrome extension usage.',
  //     tl: 'Claude in Chrome notes para sa browser-based AI workflows, web automation, at Chrome extension usage.'
  //   },
  //   price: { en: 99, tl: 120 }
  // }
];

const AI_AUTOMATION_ITEMS: readonly AIAutomationItemMeta[] = [
  {
    itemKey: 'n8n-automation',
    title: 'n8n Automation',
    description: {
      en: 'n8n Automation notes for building visual workflows, integrating APIs, and automating tasks without code.',
      tl: 'n8n Automation notes para sa pagbuo ng visual workflows, pag-integrate ng APIs, at pag-automate ng tasks nang walang code.'
    },
    price: { en: 299, tl: 350 }
  },
  {
    itemKey: 'openclo',
    title: 'Open Claw',
    description: {
      en: 'Open Claw notes for setting up and running OpenClaw, an open-source personal AI agent that automates tasks across messaging apps, files, and the web.',
      tl: 'Open Claw notes para sa pag-setup at pagpapatakbo ng OpenClaw, isang open-source personal AI agent na nag-a-automate ng tasks sa messaging apps, files, at web.'
    },
    price: { en: 299, tl: 350 },
  },
  {
    itemKey: 'hermes-agent',
    title: 'Hermes Agent',
    description: {
      en: 'Hermes Agent notes for building and deploying autonomous AI agents with structured task execution.',
      tl: 'Hermes Agent notes para sa pagbuo at pag-deploy ng autonomous AI agents na may structured task execution.'
    },
    price: { en: 299, tl: 350 },
  }
];

const AI_COURSES_ITEMS: readonly AICourseItemMeta[] = [
  // {
  //   itemKey: 'code-mastery',
  //   title: 'Claude Pro',
  //   description:
  //     'A complete Claude course covering everything from basics to advanced agentic workflows, design, code, and real-world projects. Every lesson includes a matching PDF reference guide.',
  //   price: 3500,
  //   thumbnail: '/images/courses/code-mastery.png',
  //   available: true,
  //   preOrder: true,
  //   materials: [
  //     { type: 'video', title: 'Claude Basics' },
  //     { type: 'video', title: 'Prompt Engineering Basics' },
  //     { type: 'video', title: 'Claude Projects Advanced' },
  //     { type: 'video', title: 'Claude Artifacts Advanced' },
  //     { type: 'video', title: 'Claude Skills Advanced' },
  //     { type: 'video', title: 'Claude Memory' },
  //     { type: 'video', title: 'Claude Connectors' },
  //     { type: 'video', title: 'Claude MCP + MCP Server' },
  //     { type: 'video', title: 'Claude Projects + GitHub' },
  //     { type: 'video', title: 'Publishing a Website Portfolio with Claude Artifacts' },
  //     { type: 'video', title: 'Claude Design' },
  //     { type: 'video', title: 'Claude Code Advanced (Terminal, VS Code, JetBrains)' },
  //     { type: 'video', title: 'Claude Goal and Loop Engineering (Slash Commands)' },
  //     { type: 'video', title: 'Claude Cowork' },
  //     { type: 'video', title: 'Claude Dispatch (Phone-to-Desktop Control)' },
  //     { type: 'video', title: 'Claude in Chrome' },
  //     { type: 'pdf',   title: 'Claude Basics' },
  //     { type: 'pdf',   title: 'Prompt Engineering Basics' },
  //     { type: 'pdf',   title: 'Claude Projects Advanced' },
  //     { type: 'pdf',   title: 'Claude Artifacts Advanced' },
  //     { type: 'pdf',   title: 'Claude Skills Advanced' },
  //     { type: 'pdf',   title: 'Claude Memory' },
  //     { type: 'pdf',   title: 'Claude Connectors' },
  //     { type: 'pdf',   title: 'Claude MCP + MCP Server' },
  //     { type: 'pdf',   title: 'Claude Projects + GitHub' },
  //     { type: 'pdf',   title: 'Publishing a Website Portfolio with Claude Artifacts' },
  //     { type: 'pdf',   title: 'Claude Design' },
  //     { type: 'pdf',   title: 'Claude Code Advanced (Terminal, VS Code, JetBrains)' },
  //     { type: 'pdf',   title: 'Claude Goal and Loop Engineering (Slash Commands)' },
  //     { type: 'pdf',   title: 'Claude Cowork' },
  //     { type: 'pdf',   title: 'Claude Dispatch (Phone-to-Desktop Control)' },
  //     { type: 'pdf',   title: 'Claude in Chrome' }
  //   ]
  // }
];

const PRODUCTIVITY_ITEMS: readonly ProductivityItemMeta[] = [];

type ProductSeed = Omit<Product, 'mobileUrl' | 'desktopUrl'>;

const createProduct = (product: ProductSeed): Product => ({
  mobileUrl: MOBILE_URL,
  desktopUrl: DESKTOP_URL,
  available: true,
  ...product,
  thumbnail: product.preOrder && !product.isCourse ? PREORDER_THUMBNAIL : product.thumbnail
});

const getProgrammingLanguageTitle = (languageName: string, level: ProductLevel) => {
  switch (level) {
    case 'activities':
      return `${languageName} Activities`;
    case 'package':
      return `${languageName} Package`;
    case 'build-phase':
      return `${languageName} Build Phase`;
    case 'beginner':
      return `${languageName} for Beginners`;
    case 'intermediate':
      return `${languageName} for Intermediate`;
    case 'advanced':
      return `${languageName} for Advanced`;
    default:
      return languageName;
  }
};

const getProgrammingLanguageDescription = (
  languageName: string,
  level: ProductLevel,
  language: ProductLanguage
) => {
  if (level === 'package') {
    return language === 'tl'
      ? `Bundled ${languageName} package sa Tagalog version para sa mas kumpletong learning set.`
      : `Bundled ${languageName} package in the English version for a more complete learning set.`;
  }

  if (level === 'build-phase') {
    return language === 'tl'
      ? `Ang ${languageName} Build Phase ay inihahanda pa at magiging available soon.`
      : `${languageName} Build Phase is still being prepared and will be available soon.`;
  }

  if (level === 'activities') {
    return language === 'tl'
      ? `Practice-focused na ${languageName} activities na ginawa para mapalakas ang logic, syntax, at hands-on problem solving.`
      : `Practice-focused ${languageName} activities designed to strengthen logic, syntax, and hands-on problem solving.`;
  }

  if (level === 'intermediate') {
    return language === 'tl'
      ? `Intermediate ${languageName} lessons na mas malalim ang examples, structure, at real coding workflows.`
      : `Intermediate ${languageName} lessons with deeper examples, stronger structure, and more practical coding workflows.`;
  }

  if (level === 'advanced') {
    return language === 'tl'
      ? `Advanced ${languageName} material para sa mas mataas na concepts, mas malalim na techniques, at mas seryosong development work.`
      : `Advanced ${languageName} material for higher-level concepts, deeper techniques, and more serious development work.`;
  }

  return language === 'tl'
    ? `Beginner-friendly na ${languageName} notes na may step-by-step lessons, malinaw na examples, at praktikal na exercises.`
    : `Beginner-friendly ${languageName} notes with step-by-step lessons, clear examples, and practical exercises.`;
};

const getProgrammingLanguageThumbnail = (
  itemKey: ProgrammingLanguageKey,
  level: ProgrammingLevelMeta,
  language: ProductLanguage
) => `${IMAGE_BASE_URL}/images/${level.folder}/${itemKey}-${level.fileSuffix}-${LANGUAGE_FILE_SEGMENT[language]}.webp`;

const getWebDevelopmentThumbnail = (fileStem: string, language: ProductLanguage) =>
  fileStem === 'webdev-package'
    ? `${IMAGE_BASE_URL}/images/wevdevelopment/${fileStem}-${LANGUAGE_FILE_SEGMENT[language]}.webp`
    : `${IMAGE_BASE_URL}/images/wevdevelopment/${fileStem}-webdevelopment-${LANGUAGE_FILE_SEGMENT[language]}.webp`;

const getToolsThumbnail = (itemKey: ToolsItemKey, language: ProductLanguage) => {
  switch (itemKey) {
    case 'git-github-notes':
      return `${IMAGE_BASE_URL}/images/tools/git-github-${LANGUAGE_FILE_SEGMENT[language]}.webp`;
    default:
      return '/web-app-manifest-512x512.png';
  }
};

const getAiThumbnail = (itemKey: AIItemKey, language: ProductLanguage) => {
  const seg = LANGUAGE_FILE_SEGMENT[language];
  switch (itemKey) {
    case 'claude-code-notes':
      return `${IMAGE_BASE_URL}/images/ai-tools/claude-code-${seg}.webp`;
    case 'claude-mcp':
      return `${IMAGE_BASE_URL}/images/ai-tools/claude-mcp-${seg === 'english' ? 'eng' : 'tag'}.webp`;
    case 'claude-subagents':
      return `${IMAGE_BASE_URL}/images/ai-tools/claude-subagents-${seg === 'english' ? 'eng' : 'tag'}.webp`;
    default:
      return '/favicon.svg';
  }
};

const programmingLanguageProducts = PROGRAMMING_LEVELS.flatMap((level) =>
  PROGRAMMING_LANGUAGES.flatMap((languageMeta) =>
    (['en', 'tl'] as const).map((language) =>
      createProduct({
        id: `pl-${languageMeta.itemKey}-${level.key}-${language}`,
        itemKey: languageMeta.itemKey,
        title: getProgrammingLanguageTitle(languageMeta.name, level.key),
        description: getProgrammingLanguageDescription(languageMeta.name, level.key, language),
        price:
          (languageMeta.itemKey === 'python' ? PYTHON_LEGACY_PRICES[level.key]?.[language] : undefined) ??
          level.price[language] ??
          0,
        thumbnail: getProgrammingLanguageThumbnail(languageMeta.itemKey, level, language),
        category: PROGRAMMING_LANGUAGES_CATEGORY,
        language,
        level: level.key,
        available: level.available
      })
    )
  )
);

const webDevelopmentProducts = WEB_DEVELOPMENT_ITEMS.flatMap((item) =>
  (['en', 'tl'] as const).map((language) =>
    createProduct({
      id: `wd-${item.itemKey}-${language}`,
      itemKey: item.itemKey,
      title: item.title,
      description: item.description[language],
      price: item.price[language],
      originalPrice:
        item.itemKey === 'package'
          ? language === 'tl'
            ? 80
            : 120
          : undefined,
      thumbnail: getWebDevelopmentThumbnail(item.fileStem, language),
      category: WEB_DEVELOPMENT_CATEGORY,
      language,
      preOrder: item.itemKey === 'jsdom' || item.itemKey === 'package'
    })
  )
);

const toolsProducts = TOOLS_ITEMS.flatMap((item) =>
  (['en', 'tl'] as const).map((language) =>
    createProduct({
      id: `tool-${item.itemKey}-${language}`,
      itemKey: item.itemKey,
      title: item.title,
      description: item.description[language],
      price: item.price[language],
      thumbnail: getToolsThumbnail(item.itemKey, language),
      category: WEB_DEVELOPMENT_CATEGORY,
      language
    })
  )
);

// Claude Skills - English only for now (no Tagalog version yet), so these
// are standalone entries (createProduct calls) rather than routed through
// AI_ITEMS/aiProducts below, which always generates both languages for
// every item. Placed first in PRODUCTS (before aiProducts/ai-claude-notes)
// so Claude Skills renders as the first item under the Claude Notes
// category, per owner request.
//
// IDs here MUST exactly match whatever productId each PDF was actually
// uploaded/granted under in the admin panel (Files tab) - getProductById()
// below falls back to a generic "pending catalog listing" placeholder
// (logo thumbnail, humanized title, category: 'Unlisted') for any owned id
// that doesn't match a real catalog entry. These 4 ids (WITH the "-en"
// suffix) were confirmed directly from the admin Files tab - a previous
// guess (no "-en" suffix) looked right because the fallback's humanized
// title strips "en"/"tl" segments before display either way, so the title
// alone could never actually prove whether the suffix was there.
const claudeSkillsProducts: Product[] = [
  createProduct({
    id: 'claude-skills-beg-en',
    title: 'Claude Skills Beginner',
    description: 'Beginner-friendly Claude Skills notes covering the basics of setting up and creating your own custom skills.',
    price: 120,
    thumbnail: `${IMAGE_BASE_URL}/images/ai-tools/claude-skills-beg-en.webp`,
    category: AI_TOOLS_CATEGORY,
    language: 'en',
    level: 'beginner'
  }),
  createProduct({
    id: 'claude-skills-int-en',
    title: 'Claude Skills Intermediate',
    description: 'Intermediate Claude Skills notes with deeper examples for building more capable, structured custom skills.',
    price: 150,
    thumbnail: `${IMAGE_BASE_URL}/images/ai-tools/claude-skills-int-en.webp`,
    category: AI_TOOLS_CATEGORY,
    language: 'en',
    level: 'intermediate'
  }),
  createProduct({
    id: 'claude-skills-adv-en',
    title: 'Claude Skills Advanced',
    description: 'Advanced Claude Skills notes for building complex, production-ready skills and extending what Claude can do.',
    price: 180,
    thumbnail: `${IMAGE_BASE_URL}/images/ai-tools/claude-skills-adv-en.webp`,
    category: AI_TOOLS_CATEGORY,
    language: 'en',
    level: 'advanced'
  }),
  createProduct({
    id: 'claude-skills-act-en',
    title: 'Claude Skills Activities',
    description: 'Hands-on Claude Skills activities and exercises to practice building and testing your own skills.',
    price: 99,
    thumbnail: `${IMAGE_BASE_URL}/images/ai-tools/claude-skills-act-en.webp`,
    category: AI_TOOLS_CATEGORY,
    language: 'en',
    level: 'activities'
  }),
  // Guessed to match the now-confirmed "-en" suffix pattern - still
  // unconfirmed since this one hasn't been uploaded/granted yet. When you
  // upload the actual bundle PDF in the admin Files tab, make sure the
  // productId you give it there is exactly "claude-skills-package-en" - or
  // tell me the id you used and I'll update this to match instead.
  // Thumbnail filename is a matching guess too (no dedicated package
  // thumbnail was provided) - upload one to this exact path in
  // dc-notes-images/images/ai-tools/, or tell me the real filename.
  createProduct({
    id: 'claude-skills-package-en',
    title: 'Claude Skill Package',
    description: 'Bundled Claude Skills package covering Beginner, Intermediate, and Advanced notes, with Activities included for free.',
    price: 450,
    thumbnail: `${IMAGE_BASE_URL}/images/ai-tools/claude-skills-package-en.webp`,
    category: AI_TOOLS_CATEGORY,
    language: 'en',
    level: 'package'
  })
];

const aiProducts = AI_ITEMS.flatMap((item) =>
  (['en', 'tl'] as const).map((language) =>
    createProduct({
      id: `ai-${item.itemKey}-${language}`,
      itemKey: item.itemKey,
      title: item.title,
      description: item.description[language],
      price: item.price[language],
      thumbnail: getAiThumbnail(item.itemKey, language),
      category: AI_TOOLS_CATEGORY,
      language,
      preOrder: false
    })
  )
);

const aiAutomationProducts = AI_AUTOMATION_ITEMS.flatMap((item) =>
  (['en', 'tl'] as const).map((language) =>
    createProduct({
      id: `ai-auto-${item.itemKey}-${language}`,
      itemKey: item.itemKey,
      title: item.title,
      description: item.description[language],
      price: item.price[language],
      thumbnail: '/favicon.svg',
      category: AI_AUTOMATION_CATEGORY,
      language,
      preOrder: true
    })
  )
);

const productivityProducts = PRODUCTIVITY_ITEMS.map((item) =>
  createProduct({
    id: `productivity-${item.itemKey}`,
    itemKey: item.itemKey,
    title: item.title,
    description: item.description,
    price: item.price,
    thumbnail: item.thumbnail,
    category: PRODUCTIVITY_CATEGORY,
    available: item.available,
    preOrder: item.preOrder
  })
);

const courseProducts = AI_COURSES_ITEMS.map((item) =>
  createProduct({
    id: `course-${item.itemKey}`,
    itemKey: item.itemKey,
    title: item.title,
    description: item.description,
    price: item.price,
    thumbnail: item.thumbnail,
    category: AI_COURSES_CATEGORY,
    available: item.available,
    preOrder: item.preOrder,
    isCourse: true,
    materials: item.materials
  })
);

export const PRODUCTS: Product[] = [
  ...programmingLanguageProducts,
  ...webDevelopmentProducts,
  ...toolsProducts,
  ...courseProducts,
  ...claudeSkillsProducts,
  ...aiProducts,
  ...aiAutomationProducts,
  ...productivityProducts,
  {
    id: 'bsit-complete',
    title: 'BSIT Advanced Study',
    description:
      'Preparation notes for incoming freshmen, covering practical reminders and basics to help them get ready before classes begin.',
    thumbnail: `${IMAGE_BASE_URL}/images/advance%20study/freshmen-prep.webp`,
    price: 150,
    mobileUrl: MOBILE_URL,
    desktopUrl: DESKTOP_URL,
    category: PRODUCTIVITY_CATEGORY,
    available: true
  },
  {
  id: 'bscs-complete',
  title: 'BSCS Advanced Study Guide',
  description:
    'Advanced study guide for BSCS students covering key topics, review materials, and preparation resources for deeper learning.',
  thumbnail: `${IMAGE_BASE_URL}/images/advance%20study/bscs-advance-study.webp`,
  price: 150,
  mobileUrl: MOBILE_URL,
  desktopUrl: DESKTOP_URL,
  category: PRODUCTIVITY_CATEGORY,
  available: true
},
  // The subscription itself - never rendered as a normal card (see
  // CategorySection.tsx's Productivity-specific rendering, which pulls this
  // one out of the grid and uses it to build the pricing container instead).
  // Still a real PRODUCTS entry so cart/checkout works exactly like every
  // other product.
  {
  id: PRODUCTIVITY_SUBSCRIPTION_PRODUCT_ID,
  title: 'Productivity Subscription',
  description:
    'One subscription unlocks every Productivity tool - starting with the Typing Speed, with more added over time at no extra cost.',
  thumbnail: '/favicon.svg',
  price: 59,
  billingPeriod: 'month',
  mobileUrl: MOBILE_URL,
  desktopUrl: DESKTOP_URL,
  category: PRODUCTIVITY_APPS_CATEGORY,
  available: true
},
  // Bundled features - displayed as individual cards under Productivity
  // (no price/add-to-cart of their own, isBundledFeature: true), but access
  // is always gated on owning PRODUCTIVITY_SUBSCRIPTION_PRODUCT_ID, never
  // this id. Add future Productivity features here the same way.
  {
  id: 'productivity-typing-speed',
  title: 'Typing Speed',
  description:
    'Track your words-per-minute and accuracy in real time, with multiple difficulty levels and a live on-screen keyboard.',
  thumbnail: '/favicon.svg',
  price: 0,
  mobileUrl: MOBILE_URL,
  desktopUrl: DESKTOP_URL,
  category: PRODUCTIVITY_APPS_CATEGORY,
  available: true,
  isBundledFeature: true
},
  {
  id: 'productivity-notebook',
  title: 'Notebook',
  description:
    'A dedicated space for rich-text notes, saved locally on your device and available anytime as its own standalone page.',
  thumbnail: '/favicon.svg',
  price: 0,
  mobileUrl: MOBILE_URL,
  desktopUrl: DESKTOP_URL,
  category: PRODUCTIVITY_APPS_CATEGORY,
  available: true,
  isBundledFeature: true
},
  {
  id: 'ai-claude-notes-en',
  title: 'Claude Notes',
  description: 'First release of Claude Notes with practical guidance for prompts, workflows, and everyday coding support.',
  price: 299,
  thumbnail: getAiThumbnail('claude-code-notes', 'en'),
  mobileUrl: MOBILE_URL,
  desktopUrl: DESKTOP_URL,
  category: AI_TOOLS_CATEGORY,
  language: 'en',
  available: true
},
{
  id: 'ai-claude-notes-tl',
  title: 'Claude Notes',
  description: 'First release ng Claude Notes na may praktikal na gabay para sa prompts, workflows, at pang-araw-araw na coding support.',
  price: 350,
  thumbnail: getAiThumbnail('claude-code-notes', 'tl'),
  mobileUrl: MOBILE_URL,
  desktopUrl: DESKTOP_URL,
  category: AI_TOOLS_CATEGORY,
  language: 'tl',
  available: true
},
];

const humanizeProductId = (id: string): string =>
  id
    .split('-')
    .filter((segment) => segment !== 'en' && segment !== 'tl')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

/**
 * A buyer can be granted a PDF (admin panel -> Buyers) before its real
 * catalog entry is hand-added here - without this, that PDF would either
 * vanish from "My Library" or block the direct /view/<id> link entirely,
 * even though the buyer is already authorized server-side. Falling back to
 * a title guessed from the id keeps it visible and openable immediately;
 * once a real PRODUCTS entry is added later, it takes over automatically
 * since this only synthesizes one when nothing real exists.
 */
export const getProductById = (id: string): Product => {
  const existing = PRODUCTS.find((product) => product.id === id);
  if (existing) return existing;

  return {
    id,
    title: humanizeProductId(id),
    description: 'This PDF was recently added and is pending its full catalog listing.',
    price: 0,
    thumbnail: PREORDER_THUMBNAIL,
    mobileUrl: MOBILE_URL,
    desktopUrl: DESKTOP_URL,
    category: 'Unlisted',
    available: true
  };
};

export const FAQS: FAQItem[] = [
  {
    question: 'What format are the notes in?',
    answer: 'The notes are in high-quality PDF format. They can be accessed anytime on your laptop, tablet, or phone.'
  },
  {
    question: 'How will I receive the PDF notes after payment?',
    answer:
      "After completing your payment, we'll grant access to the same Gmail you used to pay. Just sign in with that Gmail on the site and your PDF notes are ready to view instantly - no waiting for an email, no separate app."
  },
  {
    question: 'Do I need a Google Drive account or app to view my PDFs?',
    answer:
      "No. You don't need Google Drive or any other app. Sign in with your Gmail and your PDFs open directly on the site, in our own reader, with search built in."
  },
  {
    question: "How do I find PDFs I've already purchased?",
    answer:
      'Click "Sign In" at the top of the site and sign in with the same Gmail you used to purchase. You\'ll see every PDF you own in one place under "My Library," anytime you want to reopen them.'
  },
  {
    question: 'Is signing in with Google safe? Do you see my password?',
    answer:
      "It's safe - we never see or store your Google password. Signing in only confirms your identity through Google itself; we simply check that Gmail against what you've purchased."
  },
  {
    question: 'Are these notes suitable for absolute beginners?',
    answer:
      'Yes! The notes are designed for absolute beginners and progress up to mastery level. The explanations you hear on YouTube are the same style I use inside the PDF, but the notes go deeper, with more details, examples, and expanded topics to make sure you fully understand.'
  },
  {
    question: 'Is this a one-time payment?',
    answer: 'Yes, it is a one-time payment with lifetime access. No hidden charges or subscriptions.'
  },
  {
    question: 'How often are the notes updated?',
    answer:
      'The notes are regularly updated. Whenever we upload a new tutorial on YouTube, we also update the PDF notes so your material stays fresh and relevant.'
  },
  // {
  //   question: 'How will I access the courses after purchase?',
  //   answer: 'After your payment is confirmed, you will be given an access link where you can watch all course materials online.',
  //   isCourse: true
  // },
  // {
  //   question: 'What do the courses include?',
  //   answer: 'The courses include downloadable PDF materials and video lessons designed to guide you step-by-step through the topics.',
  //   isCourse: true
  // },
  // {
  //   question: 'Will I receive the files directly after buying?',
  //   answer: 'No, the course materials are not sent as individual files. Instead, you will be given access through a link where you can view everything anytime.',
  //   isCourse: true
  // },
];
