import type { SourceKind, SourceTrust } from "./constants";

export interface CategorySeed {
  key: string;
  nameTr: string;
  nameEn: string;
  color: string;
  icon: string;
  isSensitive: boolean;
  aiHint: string;
}

/** The incident categories shown on the map. Keys are stable identifiers used by the bot and filters. */
export const CATEGORY_SEEDS: CategorySeed[] = [
  {
    key: "traffic_incidents",
    nameTr: "Trafik Kazası",
    nameEn: "Traffic Accident",
    color: "#F59E0B",
    icon: "car-crash",
    isSensitive: false,
    aiHint: "Trafik kazaları, zincirleme kazalar, yayaya çarpma, devrilme, iş makinesi ve tren kazaları.",
  },
  {
    key: "fire_explosion",
    nameTr: "Yangın ve Patlama",
    nameEn: "Fire & Explosion",
    color: "#EA580C",
    icon: "fire-and-explosion",
    isSensitive: false,
    aiHint: "Bina, araç, orman ve iş yeri yangınları; doğalgaz, tüp ve diğer patlamalar.",
  },
  {
    key: "theft_robbery",
    nameTr: "Hırsızlık ve Gasp",
    nameEn: "Theft & Robbery",
    color: "#DC2626",
    icon: "mask",
    isSensitive: false,
    aiHint: "Ev, iş yeri ve araç hırsızlıkları, kapkaç, gasp ve soygun.",
  },
  {
    key: "violence",
    nameTr: "Şiddet ve Saldırı",
    nameEn: "Violence & Assault",
    color: "#B91C1C",
    icon: "angry-man",
    isSensitive: false,
    aiHint: "Kavga, bıçaklı/silahlı saldırı, yaralama ve cinayet.",
  },
  {
    key: "fraud_scam",
    nameTr: "Dolandırıcılık",
    nameEn: "Fraud & Scam",
    color: "#7C3AED",
    icon: "credit-card",
    isSensitive: false,
    aiHint: "Telefon, internet ve sahte kimlikle dolandırıcılık, sahtecilik operasyonları.",
  },
  {
    key: "drug_crimes",
    nameTr: "Uyuşturucu",
    nameEn: "Drug Crimes",
    color: "#059669",
    icon: "drug",
    isSensitive: false,
    aiHint: "Uyuşturucu operasyonları, ele geçirme ve satıcı yakalamaları.",
  },
  {
    key: "natural_disaster",
    nameTr: "Doğal Afet",
    nameEn: "Natural Disaster",
    color: "#0891B2",
    icon: "storm",
    isSensitive: false,
    aiHint: "Deprem, sel, heyelan, fırtına, çığ ve diğer afetler; bina çökmesi.",
  },
  {
    key: "terror_security",
    nameTr: "Terör ve Güvenlik",
    nameEn: "Terror & Security",
    color: "#7F1D1D",
    icon: "pistol",
    isSensitive: false,
    aiHint: "Terör saldırıları, şüpheli paket, silahlı çatışma ve güvenlik operasyonları.",
  },
  {
    key: "missing_persons",
    nameTr: "Kayıp ve Arama",
    nameEn: "Missing Persons",
    color: "#475569",
    icon: "magnify",
    isSensitive: true,
    aiHint: "Kayıp kişi ilanları, arama kurtarma çalışmaları, boğulma ve kayıp vakaları.",
  },
  {
    key: "domestic_violence",
    nameTr: "Aile İçi Şiddet",
    nameEn: "Domestic Violence",
    color: "#C026D3",
    icon: "family",
    isSensitive: true,
    aiHint: "Aile içi şiddet ve kadına yönelik şiddet olayları.",
  },
  {
    key: "sexual_crimes",
    nameTr: "Cinsel Suçlar",
    nameEn: "Sexual Crimes",
    color: "#BE185D",
    icon: "shield-star",
    isSensitive: true,
    aiHint: "Cinsel saldırı, taciz ve istismar olayları. Mağdurun kimliği ve adresi asla verilmez.",
  },
  {
    key: "other_incidents",
    nameTr: "Diğer Olaylar",
    nameEn: "Other Incidents",
    color: "#2563EB",
    icon: "newspaper-sharp",
    isSensitive: false,
    aiHint: "Yukarıdakilere uymayan yerel asayiş olayları: iş kazası, elektrik çarpması, hayvan saldırısı vb.",
  },
];

export interface SourceSeed {
  kind: SourceKind;
  name: string;
  url: string;
  homepageUrl: string;
  trust: SourceTrust;
  isActive: boolean;
  pollIntervalMinutes: number;
}

/** National outlets with working RSS/Atom feeds; the bot screens their general feeds for local incidents. */
export const RSS_SOURCE_SEEDS: SourceSeed[] = [
  {
    kind: "rss",
    name: "Anadolu Ajansı",
    url: "https://www.aa.com.tr/tr/rss/default?cat=guncel",
    homepageUrl: "https://www.aa.com.tr",
    trust: "media",
    isActive: true,
    pollIntervalMinutes: 15,
  },
  {
    kind: "rss",
    name: "TRT Haber",
    url: "https://www.trthaber.com/turkiye_articles.rss",
    homepageUrl: "https://www.trthaber.com",
    trust: "media",
    isActive: true,
    pollIntervalMinutes: 15,
  },
  {
    kind: "rss",
    name: "NTV",
    url: "https://www.ntv.com.tr/turkiye.rss",
    homepageUrl: "https://www.ntv.com.tr",
    trust: "media",
    isActive: true,
    pollIntervalMinutes: 20,
  },
  {
    kind: "rss",
    name: "Habertürk",
    url: "https://www.haberturk.com/rss/kategori/gundem.xml",
    homepageUrl: "https://www.haberturk.com",
    trust: "media",
    isActive: true,
    pollIntervalMinutes: 20,
  },
  {
    kind: "rss",
    name: "CNN Türk",
    url: "https://www.cnnturk.com/feed/rss/turkiye/news",
    homepageUrl: "https://www.cnnturk.com",
    trust: "media",
    isActive: true,
    pollIntervalMinutes: 20,
  },
  {
    kind: "rss",
    name: "Hürriyet",
    url: "https://www.hurriyet.com.tr/rss/gundem",
    homepageUrl: "https://www.hurriyet.com.tr",
    trust: "media",
    isActive: false,
    pollIntervalMinutes: 30,
  },
  {
    kind: "rss",
    name: "Sözcü",
    url: "https://www.sozcu.com.tr/feeds-rss-category-gundem",
    homepageUrl: "https://www.sozcu.com.tr",
    trust: "media",
    isActive: false,
    pollIntervalMinutes: 30,
  },
  {
    kind: "rss",
    name: "Cumhuriyet",
    url: "https://www.cumhuriyet.com.tr/rss/son_dakika.xml",
    homepageUrl: "https://www.cumhuriyet.com.tr",
    trust: "media",
    isActive: false,
    pollIntervalMinutes: 30,
  },
  {
    kind: "rss",
    name: "Yeni Şafak",
    url: "https://www.yenisafak.com/rss?xml=gundem",
    homepageUrl: "https://www.yenisafak.com",
    trust: "media",
    isActive: false,
    pollIntervalMinutes: 30,
  },
];
