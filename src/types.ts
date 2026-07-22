
export interface CourseMaterial {
  type: 'video' | 'pdf';
  title: string;
}

export type ProductLanguage = 'en' | 'tl';

export type ProductLevel =
  | 'beginner'
  | 'intermediate'
  | 'advanced'
  | 'build-phase'
  | 'activities'
  | 'package';

export interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  originalPrice?: number;
  thumbnail: string;
  mobileUrl: string;
  desktopUrl: string;
  category: string;
  language?: ProductLanguage;
  level?: ProductLevel;
  itemKey?: string;
  available?: boolean;
  preOrder?: boolean;
  isCourse?: boolean;
  materials?: CourseMaterial[];
  /** Recurring price instead of a one-time purchase - shown as "/mo" next to the price. */
  billingPeriod?: 'month';
  /**
   * A feature bundled into a paid category subscription (e.g. the Typing
   * Speed Test under Productivity) rather than something purchased on its
   * own - shown in its category listing with no price/add-to-cart button,
   * since access comes from owning the category's subscription product
   * instead. See CategorySection.tsx's Productivity-specific rendering.
   */
  isBundledFeature?: boolean;
}

export interface FAQItem {
  question: string;
  answer: string;
  isCourse?: boolean;
}

export interface SiteContent {
  brandName: string;
  brandTagline: string;
  hero: {
    mainTitle: string;
    subTitle: string;
  };
  footer: {
    description: string;
    copyright: string;
  };
  socials: {
    facebook: string;
  };
}
