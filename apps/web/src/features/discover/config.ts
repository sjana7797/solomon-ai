export const COUNTRIES = [
  { code: "IN", name: "India" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "SG", name: "Singapore" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "JP", name: "Japan" },
] as const;

export type CountryCode = (typeof COUNTRIES)[number]["code"];

export const TOPICS = [
  { id: "top", label: "Top", terms: ["", "news"] },
  { id: "tech", label: "Tech", terms: ["technology", "AI startups"] },
  { id: "business", label: "Business", terms: ["business", "economy markets"] },
  { id: "science", label: "Science", terms: ["science", "space research"] },
  { id: "sports", label: "Sports", terms: ["sports", "cricket football"] },
  { id: "entertainment", label: "Entertainment", terms: ["entertainment", "movies music"] },
  { id: "health", label: "Health", terms: ["health", "medical research"] },
] as const;

export type TopicId = (typeof TOPICS)[number]["id"];

export const COUNTRY_CODES = COUNTRIES.map((c) => c.code) as [CountryCode, ...CountryCode[]];
export const TOPIC_IDS = TOPICS.map((t) => t.id) as [TopicId, ...TopicId[]];

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  snippet: string;
  image: string | null;
  publishedAt: string | null;
}
