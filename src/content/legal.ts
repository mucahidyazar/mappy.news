import type { Locale } from "@/i18n/routing";

export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  items?: string[];
}

export interface LegalDocument {
  title: string;
  description: string;
  updated: string;
  sections: LegalSection[];
}

/** Last substantive change of the documents below. */
export const LEGAL_UPDATED_AT = "2026-10-21";

const privacy: Record<Locale, LegalDocument> = {
  tr: {
    title: "Gizlilik Politikası",
    description: "mappy.news hangi kişisel verileri, neden ve ne kadar süreyle işler; haklarını nasıl kullanabilirsin.",
    updated: "Son güncelleme",
    sections: [
      {
        heading: "1. Biz kimiz?",
        paragraphs: [
          "mappy.news, Türkiye'deki yerel olayları (kaza, yangın, asayiş, afet vb.) kaynaklarıyla birlikte haritada gösteren bir haber platformudur. Bu politika, 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) ve uygulanabildiği ölçüde Avrupa Genel Veri Koruma Tüzüğü (GDPR) kapsamında, siteyi kullanırken işlenen kişisel verileri açıklar.",
        ],
      },
      {
        heading: "2. Topladığımız veriler",
        items: [
          "Hesap bilgileri: ad soyad, e-posta adresi, şifrenin geri döndürülemez özeti (şifrenin kendisi saklanmaz). Google ile giriş yaparsan Google'ın paylaştığı ad, e-posta ve profil fotoğrafı.",
          "Paylaştığın içerikler: haber bildirimleri, seçtiğin konum, yorumlar, konum doğrulamaları ve eklediğin bağlantılar.",
          "Oturum ve güvenlik kayıtları: oturum çerezi, oturumun açıldığı IP adresi ve tarayıcı bilgisi (hesabını korumak ve kötüye kullanımı engellemek için).",
          "Görüntülenme sayacı: bir haberin kaç kez okunduğunu saymak için IP adresi ve tarayıcı bilgisinden günlük olarak üretilen, geri çözülemeyen bir özet. IP adresinin kendisi bu amaçla saklanmaz.",
          "Reklam ya da davranışsal takip amaçlı çerez kullanmıyoruz.",
        ],
      },
      {
        heading: "3. Verileri neden işliyoruz?",
        items: [
          "Hesabını oluşturmak, girişini doğrulamak ve hizmeti sunmak (sözleşmenin ifası).",
          "Bildirimleri ve yorumları incelemek, kuralları ihlal eden içerikleri kaldırmak, sahte hesapları ve spam'i engellemek (meşru menfaat).",
          "Puan ve rütbe sistemini işletmek, liderlik tablosunu göstermek.",
          "Hukuki yükümlülükleri yerine getirmek ve olası uyuşmazlıklarda haklarımızı korumak.",
        ],
      },
      {
        heading: "4. Herkese açık görünen bilgiler",
        items: [
          "Yorumlarında, liderlik tablosunda ve yayınlanan bildirimlerinde adın, profil fotoğrafın ve rütben görünür. E-posta adresin hiçbir zaman gösterilmez.",
          "Cinsel suç, aile içi şiddet ve kayıp vakaları gibi hassas olaylarda konum haritada en fazla mahalle düzeyinde gösterilir; mağdurların kimliği ve açık adresi yayınlanmaz.",
        ],
      },
      {
        heading: "5. Haber kaynakları ve yapay zekâ",
        paragraphs: [
          "Haber botumuz, kamuya açık RSS akışlarını ve resmi kurumların kamuya açık sosyal medya paylaşımlarını okur. Bu metinler, olayı sınıflandırmak, özetlemek ve konumunu çıkarmak için bir yapay zekâ hizmetine (varsayılan olarak Google Gemini) gönderilir. Bu işlemde senin hesap bilgilerin kullanılmaz. Her haberde özgün kaynağa bağlantı verilir; kaynakların tam metinleri yayınlanmaz.",
        ],
      },
      {
        heading: "6. Hizmet sağlayıcılar",
        items: [
          "Sunucu ve veritabanı: kendi yönettiğimiz sunucular (Türkiye).",
          "E-posta gönderimi: Resend (doğrulama ve şifre sıfırlama e-postaları için yalnızca e-posta adresin aktarılır).",
          "Google ile giriş: yalnızca bu yöntemi seçersen Google.",
          "Harita: harita görselleri tarayıcının OpenFreeMap sunucularından yüklenir; adres aramaları OpenStreetMap Nominatim hizmetine iletilir.",
          "Yapay zekâ: haber botunun analiz ettiği kamuya açık metinler için seçilen yapay zekâ sağlayıcısı.",
        ],
      },
      {
        heading: "7. Saklama süreleri",
        items: [
          "Hesap ve içerik verileri hesabın açık olduğu sürece saklanır; hesabını silersen birlikte silinir. Yayınlanmış haberler anonim olarak kalabilir.",
          "Oturum kayıtları en fazla 30 gün, görüntülenme özetleri 30 gün, haber botunun topladığı ham kayıtlar 90 gün saklanır.",
        ],
      },
      {
        heading: "8. Hakların",
        paragraphs: [
          "KVKK'nın 11. maddesi uyarınca verilerinin işlenip işlenmediğini öğrenme, bilgi talep etme, düzeltilmesini ya da silinmesini isteme ve işlemeye itiraz etme hakkına sahipsin. Profil sayfandaki ayarlardan adını değiştirebilir ve hesabını tamamen silebilirsin. Diğer talepler için bize ulaşabilirsin.",
        ],
      },
      {
        heading: "9. Çerezler ve yerel depolama",
        paragraphs: [
          "Yalnızca zorunlu çerezler kullanılır: oturum çerezi (giriş yapabilmen için) ve dil tercihi. Tema tercihin tarayıcının yerel depolamasında tutulur.",
        ],
      },
      {
        heading: "10. Değişiklikler",
        paragraphs: ["Bu politikayı güncellediğimizde sayfadaki tarihi değiştiririz. Önemli değişiklikleri sitede duyururuz."],
      },
    ],
  },
  en: {
    title: "Privacy Policy",
    description: "Which personal data mappy.news processes, why and for how long, and how you can exercise your rights.",
    updated: "Last updated",
    sections: [
      {
        heading: "1. Who we are",
        paragraphs: [
          "mappy.news is a news platform that maps local incidents in Turkey (accidents, fires, public safety, disasters, etc.) together with their sources. This policy explains which personal data is processed when you use the site, under the Turkish Personal Data Protection Law No. 6698 (KVKK) and, where applicable, the EU General Data Protection Regulation (GDPR).",
        ],
      },
      {
        heading: "2. What we collect",
        items: [
          "Account data: your name, email address and a one-way hash of your password (the password itself is never stored). If you sign in with Google, the name, email and profile picture Google shares.",
          "What you share: reports, the locations you pick, comments, location verifications and the links you add.",
          "Session and security records: the session cookie, and the IP address and browser of each session (to protect your account and prevent abuse).",
          "View counter: a daily, irreversible hash derived from your IP address and browser to count how often a story is read. The IP address itself is not stored for this purpose.",
          "We do not use advertising or behavioural tracking cookies.",
        ],
      },
      {
        heading: "3. Why we process it",
        items: [
          "To create your account, verify your sign-in and provide the service (performance of a contract).",
          "To review reports and comments, remove content that breaks the rules and stop fake accounts and spam (legitimate interest).",
          "To run the points and ranks system and show the leaderboard.",
          "To meet legal obligations and protect our rights in disputes.",
        ],
      },
      {
        heading: "4. What is public",
        items: [
          "Your name, profile picture and rank appear on your comments, on the leaderboard and on your published reports. Your email address is never shown.",
          "For sensitive incidents such as sexual crimes, domestic violence and missing persons, the map shows the location at neighborhood level at most; victims' identities and addresses are never published.",
        ],
      },
      {
        heading: "5. News sources and AI",
        paragraphs: [
          "Our news bot reads public RSS feeds and public social media posts of official institutions. These texts are sent to an AI service (Google Gemini by default) to classify, summarize and locate the incident. Your account data is not used for this. Every story links to its original source; full source texts are not republished.",
        ],
      },
      {
        heading: "6. Service providers",
        items: [
          "Servers and database: servers we operate ourselves (Turkey).",
          "Email delivery: Resend (only your email address, for verification and password reset emails).",
          "Google sign-in: Google, only if you choose this method.",
          "Maps: your browser loads map tiles from OpenFreeMap servers; address searches are forwarded to OpenStreetMap's Nominatim service.",
          "AI: the selected AI provider, for the public texts the news bot analyses.",
        ],
      },
      {
        heading: "7. Retention",
        items: [
          "Account and content data is kept while your account exists and is deleted with it. Published stories may remain without your name.",
          "Session records are kept for up to 30 days, view hashes for 30 days and the raw items collected by the news bot for 90 days.",
        ],
      },
      {
        heading: "8. Your rights",
        paragraphs: [
          "You have the right to learn whether your data is processed, request information, ask for correction or deletion and object to processing (KVKK art. 11, GDPR art. 15–21). You can change your name and delete your account completely in your profile settings. Contact us for any other request.",
        ],
      },
      {
        heading: "9. Cookies and local storage",
        paragraphs: [
          "Only essential cookies are used: the session cookie (so you can stay signed in) and your language preference. Your theme preference is kept in your browser's local storage.",
        ],
      },
      {
        heading: "10. Changes",
        paragraphs: ["When we update this policy we change the date on this page and announce important changes on the site."],
      },
    ],
  },
};

const terms: Record<Locale, LegalDocument> = {
  tr: {
    title: "Kullanım Koşulları",
    description: "mappy.news'i kullanırken geçerli olan kurallar.",
    updated: "Son güncelleme",
    sections: [
      {
        heading: "1. Hizmet",
        paragraphs: [
          "mappy.news, yerel olay haberlerini kaynaklarından derleyip haritada gösterir. Haberler; haber kuruluşlarının kamuya açık yayınlarından, resmi kurumların paylaşımlarından ve okur bildirimlerinden oluşur.",
          "mappy.news bir acil durum hizmeti değildir. Acil bir durumda 112'yi ara.",
        ],
      },
      {
        heading: "2. Hesabın",
        items: [
          "Hesap açmak için doğru bilgi vermeli ve e-posta adresini doğrulamalısın.",
          "Hesabının güvenliğinden sen sorumlusun; şifreni kimseyle paylaşma.",
          "Birden fazla hesapla puan toplamak ya da sistemi yanıltmak yasaktır.",
        ],
      },
      {
        heading: "3. İçerik kuralları",
        items: [
          "Yalnızca gerçek olduğuna inandığın olayları bildir; tahmin ve söylentiyi kesin bilgi gibi sunma.",
          "Başkalarının adını, telefonunu, plakasını, ev adresini veya fotoğrafını paylaşma. Mağdurların kimliğini açık edecek bilgi verme.",
          "Hakaret, iftira, nefret söylemi, şiddete çağrı ve yasa dışı içerik paylaşma.",
          "Telif hakkıyla korunan metinleri ve görselleri izinsiz kopyalama; kaynağa bağlantı ver.",
        ],
      },
      {
        heading: "4. Moderasyon",
        paragraphs: [
          "Okur bildirimleri ve konum doğrulamaları editörler tarafından incelenmeden yayınlanmaz. Kurallara uymayan içerikleri düzenleme, gizleme ya da silme; tekrarlanan ihlallerde hesabı geçici veya kalıcı olarak askıya alma hakkımız saklıdır.",
        ],
      },
      {
        heading: "5. İçeriklerinin kullanımı",
        paragraphs: [
          "Paylaştığın bildirim, yorum ve doğrulamaların sahibi sensin. Bunları mappy.news'te ve paylaşım bağlantılarında gösterebilmemiz için bize ücretsiz, münhasır olmayan bir kullanım izni vermiş olursun. Hesabını sildiğinde yorumların silinir; yayınlanmış haberler adın kaldırılarak kalabilir.",
        ],
      },
      {
        heading: "6. Puanlar",
        paragraphs: [
          "Puanlar ve rütbeler topluluğa katkını gösteren bir itibar sistemidir; parasal değeri yoktur, devredilemez ve paraya çevrilemez. Kötüye kullanım tespit edilirse puanlar geri alınabilir.",
        ],
      },
      {
        heading: "7. Sorumluluk",
        paragraphs: [
          "Haberler kaynaklardan ve yapay zekâ destekli araçlarla derlenir; hata içerebilir. Konum bilgisi çoğu zaman yaklaşıktır. İçeriklerin doğruluğu ve güncelliği konusunda garanti verilmez; önemli kararlar için resmi kaynakları kontrol et.",
        ],
      },
      {
        heading: "8. Değişiklikler ve uygulanacak hukuk",
        paragraphs: [
          "Bu koşulları güncelleyebiliriz; güncel metin her zaman bu sayfadadır. Koşullar Türkiye Cumhuriyeti hukukuna tabidir.",
        ],
      },
    ],
  },
  en: {
    title: "Terms of Use",
    description: "The rules that apply when you use mappy.news.",
    updated: "Last updated",
    sections: [
      {
        heading: "1. The service",
        paragraphs: [
          "mappy.news compiles local incident news from its sources and shows it on a map. Stories come from public publications of news organizations, posts of official institutions and reader reports.",
          "mappy.news is not an emergency service. In an emergency, call 112.",
        ],
      },
      {
        heading: "2. Your account",
        items: [
          "Give accurate information and verify your email address to open an account.",
          "You are responsible for keeping your account secure; never share your password.",
          "Using several accounts to collect points or otherwise gaming the system is not allowed.",
        ],
      },
      {
        heading: "3. Content rules",
        items: [
          "Only report incidents you believe are real; don't present guesses or rumours as facts.",
          "Don't share other people's names, phone numbers, plates, home addresses or photos. Never reveal victims' identities.",
          "No insults, defamation, hate speech, calls for violence or illegal content.",
          "Don't copy copyrighted texts or images without permission; link to the source instead.",
        ],
      },
      {
        heading: "4. Moderation",
        paragraphs: [
          "Reader reports and location verifications are only published after an editor reviews them. We may edit, hide or remove content that breaks the rules and suspend accounts temporarily or permanently for repeated violations.",
        ],
      },
      {
        heading: "5. Use of your content",
        paragraphs: [
          "You own the reports, comments and verifications you share. You grant us a free, non-exclusive licence to show them on mappy.news and in share previews. When you delete your account your comments are deleted; published stories may remain with your name removed.",
        ],
      },
      {
        heading: "6. Points",
        paragraphs: [
          "Points and ranks are a reputation system that reflects your contribution; they have no monetary value and cannot be transferred or cashed out. Points may be withdrawn if abuse is detected.",
        ],
      },
      {
        heading: "7. Liability",
        paragraphs: [
          "Stories are compiled from sources with AI-assisted tools and may contain mistakes. Locations are often approximate. We give no guarantee about the accuracy or timeliness of the content; check official sources before important decisions.",
        ],
      },
      {
        heading: "8. Changes and governing law",
        paragraphs: ["We may update these terms; the current version is always on this page. These terms are governed by the laws of the Republic of Turkey."],
      },
    ],
  },
};

export function getLegalDocument(kind: "privacy" | "terms", locale: Locale): LegalDocument {
  return (kind === "privacy" ? privacy : terms)[locale];
}
