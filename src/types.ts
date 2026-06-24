
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
