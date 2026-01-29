import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
  en: {
    translation: {
      app: {
        title: "CRISOS",
        chat_intro: "I can guide you in a crisis and connect you to an operator if needed.",
        disclaimer_title_short: "Disclaimer",
        disclaimer_items: [
          "Guidance only; for immediate danger call 112.",
          "Responses based on official sources and may be delayed or incomplete.",
          "In life-threatening emergencies where you cannot consent, data may be shared with authorities (GDPR Art. 6(1)(d) & 9(2)(c)).",
          "Information shared only with public authorities, never commercial parties.",
        ],
        disclaimer_header: "CRISOS - Emergency Disclaimer",
        disclaimer_checkbox: "I have read and understood the information above",
        disclaimer_scroll_hint: "Scroll down to continue v",
        disclaimer_accept: "Accept and Continue",
        disclaimer_decline: "Decline",
        disclaimer_required_title: "Disclaimer required",
        disclaimer_decline_warning:
          "You must accept the disclaimer to use this service. For emergencies, please call 112.",
        disclaimer_review: "Review the disclaimer again",
        restricted_emergency_title: "Emergency numbers",
        restricted_safety_title: "Safety information",
        restricted_safety_items: [
          "Move to a safe area and stay calm.",
          "Follow official announcements.",
          "Keep your phone charged and inform loved ones.",
        ],
        disclaimer_close: "Close",
        disclaimer_sections: [
          {
            title: "General information",
            paragraphs: [
              "CRISOS is a digital tool that provides information and guidance in crisis situations. It does not replace official emergency instructions, professional medical care, or law enforcement.",
              "If you believe you or someone else is in immediate danger, call 112 immediately.",
            ],
          },
          {
            title: "Official sources",
            paragraphs: [
              "Content provided by CRISOS is derived from publicly available information published by public institutions such as disaster and emergency agencies, health authorities, and law enforcement.",
              "Due to outages or update delays, information may at times be incomplete, delayed, or out of date.",
            ],
          },
          {
            title: "Emergency Human Handover",
            paragraphs: [
              "The system may, in certain cases, hand you over to an authorized human operator such as the relevant public authority or official call center.",
              "In such cases, the incident record, the information you provided, and necessary technical data may be transferred to that operator to provide help as quickly and safely as possible. Data directly related to the incident is accessible only to assigned and authorized personnel.",
            ],
          },
          {
            title: "Location data",
            paragraphs: [
              "CRISOS may process your location data only in emergency and life-threatening situations to assess the incident and route it to the right units.",
              "Under normal conditions, location data is not collected or processed without your explicit consent. In emergencies where you cannot consent, location data may be shared with authorized public authorities during emergency human handover to protect your vital interests.",
              "The legal basis is GDPR Article 6(1)(d) and, where applicable for special-category data, Article 9(2)(c). Location data is deleted or anonymized once the purpose is fulfilled or after the required retention period.",
            ],
          },
          {
            title: "Microphone/Camera/Files",
            paragraphs: [
              "CRISOS may allow sharing additional data during support, including microphone access for voice messages or live audio, camera access for photos, video, or live images, and file uploads such as damage photos, medical reports, or official documents.",
              "These features are used with your explicit consent whenever possible, with a separate confirmation step for each feature. Shared content is processed only to assess the incident, route help, and provide support.",
              "If special-category data such as health or biometric data is shared, processing follows GDPR Article 9; in emergencies where consent cannot be obtained, Article 9(2)(c) may apply.",
            ],
          },
          {
            title: "Data sharing",
            paragraphs: [
              "Your data is shared only with legally authorized public institutions and official emergency services.",
              "It is not shared or sold to commercial third parties. Data is stored only for specific and legitimate purposes, to the minimum necessary extent, and for the required duration.",
            ],
          },
          {
            title: "Legal basis",
            paragraphs: [
              "Depending on the situation, processing may rely on GDPR Article 6(1)(a) where you have provided explicit consent, Article 6(1)(d) for vital interests, or Article 6(1)(e)/(f) for public interest or legitimate interest in line with national law.",
              "For special-category data, GDPR Article 9(2)(c) or other applicable bases may apply in emergencies where consent cannot be obtained.",
            ],
          },
          {
            title: "Your rights",
            paragraphs: [
              "Depending on your country and applicable law, you have rights to access, rectify, delete, restrict processing, object, and lodge a complaint about your personal data.",
              "To exercise these rights, contact the system operator via the relevant channels. By continuing to use this system, you acknowledge this notice. In emergencies, always prioritize official emergency lines such as 112.",
            ],
          },
        ],
      },
      navigation: {
        user: "User Console",
        admin: "Admin",
      },
      location: {
        title: "Location",
        hint: "Share a city or address for quick action.",
        placeholder: "Current Location",
        useGps: "Use GPS",
        save: "Save location",
        gpsActive: "GPS coordinates stored",
        gpsPrompt: "Location is required. Please allow GPS access or type your address.",
        gpsUnavailable: "GPS is unavailable. Please enter your city or address.",
        gpsDenied: "GPS permission denied. Please enter your city or address.",
      },
      status: {
        handoff: "Human operator engaged",
        waiting: "Please stay available. Your context has been handed over.",
      },
      actions: {
        title: "Quick actions",
        emergency: "Emergency Call 112",
        numbers: "Emergency numbers",
        warnings: "Official warnings",
        forecast: "Forecast",
        supply: "Supply Points",
        contact: "Contact points",
        evacuation: "Evacuation necessity",
        instructions: "Instructions",
      },
      chat: {
        title: "Chat Support",
        placeholder: "Type your message...",
        send: "Send",
        voiceStart: "Voice",
        voiceStop: "Stop",
        listeningPlaceholder: "Listening...",
        voiceError: "Voice input failed. Please try again.",
        voiceEmpty: "No speech detected. Please try again.",
        voiceUnsupported: "Voice input is not supported in this browser.",
        voicePermissionError: "Microphone permission denied.",
        voicePermissionBlocked: "Microphone access is blocked in your browser settings.",
        voiceSecureContext: "Voice input requires HTTPS or localhost.",
        quickReplies: "Quick replies",
        quickEmergency: "Emergency",
        quickTrapped: "I'm Trapped",
        quickSafe: "I'm Safe - Need Info",
      },
      admin: {
        queue: "Handover Queue",
        empty: "No active handovers.",
        select: "Select a handover",
        conversation: "Conversation",
        noConversation: "No active conversation",
        assign: "Assign",
        close: "Close",
        replyPlaceholder: "Write a response...",
      },
      alerts: {
        critical: "Critical situation detected",
        caution: "Stay alert and follow official guidance",
      },
      cards: {
        title: "Safety shortcuts",
        stay: "Stay with others when possible",
        power: "Keep a torch and spare batteries",
        meds: "Prepare essential medications",
      },
    },
  },
  de: {
    translation: {
      app: {
        title: "CRISOS",
        chat_intro: "Ich helfe in Krisen und kann bei Bedarf an einen Operator verbinden.",
        disclaimer_title_short: "Hinweis",
        disclaimer_items: [
          "Nur Orientierung; bei akuter Gefahr 112 anrufen.",
          "Antworten basieren auf offiziellen Quellen und konnen verzoegert oder unvollstandig sein.",
          "Bei lebensbedrohlichen Notfallen ohne Einwilligung konnen Daten an Behoerden weitergegeben werden (DSGVO Art. 6(1)(d) & 9(2)(c)).",
          "Informationen werden nur mit oeffentlichen Stellen geteilt, niemals mit kommerziellen Dritten.",
        ],
        disclaimer_header: "CRISOS - Notfallhinweis",
        disclaimer_checkbox: "Ich habe die obigen Informationen gelesen und verstanden",
        disclaimer_scroll_hint: "Zum Fortfahren nach unten scrollen v",
        disclaimer_accept: "Akzeptieren und fortfahren",
        disclaimer_decline: "Ablehnen",
        disclaimer_required_title: "Disclaimer erforderlich",
        disclaimer_decline_warning:
          "Sie muessen den Disclaimer akzeptieren, um diesen Dienst zu nutzen. Bitte rufen Sie in Notfaellen 112 an.",
        disclaimer_review: "Disclaimer erneut ansehen",
        restricted_emergency_title: "Notrufnummern",
        restricted_safety_title: "Sicherheitshinweise",
        restricted_safety_items: [
          "Gehen Sie in einen sicheren Bereich und bleiben Sie ruhig.",
          "Folgen Sie offiziellen Durchsagen.",
          "Halten Sie Ihr Telefon geladen und informieren Sie Angehorige.",
        ],
        disclaimer_close: "Schliessen",
        disclaimer_sections: [
          {
            title: "Allgemeine Informationen",
            paragraphs: [
              "CRISOS ist ein digitales Tool zur Information und Orientierung in Krisensituationen. Es ersetzt keine offiziellen Notfallanweisungen, keine professionelle medizinische Hilfe und keine Polizei.",
              "Wenn Sie glauben, dass Sie oder eine andere Person in unmittelbarer Gefahr sind, rufen Sie bitte sofort 112 an.",
            ],
          },
          {
            title: "Offizielle Quellen",
            paragraphs: [
              "Inhalte von CRISOS basieren auf oeffentlich verfuegbaren Informationen von Behoerden, z.B. Katastrophen- und Notfallstellen, Gesundheitsbehoerden und Polizei.",
              "Aufgrund von Ausfaellen oder Update-Verzoegerungen koennen Informationen unvollstaendig, verzoegert oder veraltet sein.",
            ],
          },
          {
            title: "Notfall-Weitergabe an menschliche Operatoren",
            paragraphs: [
              "Das System kann Sie in bestimmten Faellen an einen autorisierten menschlichen Operator uebergeben, z.B. an die zustaendige Behoerde oder ein offizielles Call Center.",
              "In diesem Fall koennen der Vorfallsbericht, die von Ihnen bereitgestellten Informationen und erforderliche technische Daten an den Operator uebermittelt werden, um moeglichst schnell und sicher Hilfe zu leisten. Daten, die direkt mit dem Vorfall zusammenhaengen, sind nur fuer beauftragtes und autorisiertes Personal zugaenglich.",
            ],
          },
          {
            title: "Standortdaten",
            paragraphs: [
              "CRISOS darf Standortdaten nur in akuten, lebensbedrohlichen Situationen verarbeiten, um den Vorfall zu bewerten und an die richtigen Stellen weiterzuleiten.",
              "Unter normalen Bedingungen werden Standortdaten ohne Ihre ausdrueckliche Einwilligung nicht erhoben oder verarbeitet. In Notfaellen, in denen Sie nicht einwilligen koennen, koennen Standortdaten im Rahmen der Emergency Human Handover an autorisierte Behoerden weitergegeben werden, um lebenswichtige Interessen zu schuetzen.",
              "Rechtsgrundlage ist DSGVO Art. 6(1)(d) und, soweit besondere Daten betroffen sind, Art. 9(2)(c). Standortdaten werden nach Zweckerfuellung oder nach Ablauf gesetzlicher Fristen geloescht oder anonymisiert.",
            ],
          },
          {
            title: "Mikrofon/Kamera/Dateien",
            paragraphs: [
              "CRISOS kann zusaetzliche Datenteilung ermoeglichen, z.B. Mikrofonzugriff fuer Sprachnachrichten oder Live-Audio, Kamerazugriff fuer Fotos, Videos oder Live-Bilder sowie Datei-Uploads wie Schadensfotos, medizinische Berichte oder offizielle Dokumente.",
              "Diese Funktionen werden moeglichst mit Ihrer ausdruecklichen Einwilligung und einer separaten Bestaetigung pro Funktion genutzt. Inhalte werden nur zur Bewertung des Vorfalls, zur richtigen Weiterleitung und zur Hilfeleistung verarbeitet.",
              "Werden besondere Daten wie Gesundheits- oder biometrische Daten geteilt, richtet sich die Verarbeitung nach DSGVO Art. 9; in Notfaellen ohne Einwilligung kann Art. 9(2)(c) gelten.",
            ],
          },
          {
            title: "Datenweitergabe",
            paragraphs: [
              "Ihre Daten werden nur mit gesetzlich autorisierten Behoerden und offiziellen Notdiensten geteilt.",
              "Sie werden nicht an kommerzielle Dritte weitergegeben oder verkauft. Daten werden nur fuer konkrete und legitime Zwecke, im erforderlichen Umfang und fuer die notwendige Dauer gespeichert.",
            ],
          },
          {
            title: "Rechtsgrundlage",
            paragraphs: [
              "Je nach Situation kann die Verarbeitung auf DSGVO Art. 6(1)(a) bei ausdruecklicher Einwilligung, Art. 6(1)(d) fuer lebenswichtige Interessen oder Art. 6(1)(e)/(f) fuer oeffentliches Interesse oder berechtigtes Interesse gemaess nationalem Recht gestuetzt werden.",
              "Fuer besondere Daten koennen DSGVO Art. 9(2)(c) oder andere anwendbare Rechtsgrundlagen in Notfaellen ohne Einwilligung gelten.",
            ],
          },
          {
            title: "Ihre Rechte",
            paragraphs: [
              "Abhaengig von Ihrem Land und geltendem Recht haben Sie Rechte auf Auskunft, Berichtigung, Loeschung, Einschraenkung der Verarbeitung, Widerspruch und Beschwerde bezueglich Ihrer personenbezogenen Daten.",
              "Um diese Rechte auszuueben, kontaktieren Sie bitte den Systembetreiber ueber die entsprechenden Kanaele. Durch die weitere Nutzung erkennen Sie an, dass Sie diesen Hinweis gelesen haben. In Notfaellen hat die Nutzung offizieller Notrufnummern wie 112 stets Vorrang.",
            ],
          },
        ],
      },
      navigation: {
        user: "Nutzerkonsole",
        admin: "Admin",
      },
      location: {
        title: "Standort",
        hint: "Stadt oder Adresse angeben fur schnelle Hilfe.",
        placeholder: "Aktueller Standort",
        useGps: "GPS verwenden",
        save: "Standort speichern",
        gpsActive: "GPS-Koordinaten gespeichert",
        gpsPrompt: "Standort wird benoetigt. Bitte GPS erlauben oder Adresse eingeben.",
        gpsUnavailable: "GPS ist nicht verfugbar. Bitte Stadt oder Adresse eingeben.",
        gpsDenied: "GPS verweigert. Bitte Stadt oder Adresse eingeben.",
      },
      status: {
        handoff: "Menschlicher Operator aktiv",
        waiting: "Bitte erreichbar bleiben. Kontext wurde ubergeben.",
      },
      actions: {
        title: "Schnellaktionen",
        emergency: "Notruf 112",
        numbers: "Notrufnummern",
        warnings: "Offizielle Warnungen",
        forecast: "Vorhersage",
        supply: "Versorgungspunkte",
        contact: "Kontaktpunkte",
        evacuation: "Evakuierung",
        instructions: "Anweisungen",
      },
      chat: {
        title: "Chat-Unterstutzung",
        placeholder: "Nachricht schreiben...",
        send: "Senden",
        voiceStart: "Sprache",
        voiceStop: "Stopp",
        listeningPlaceholder: "Hoere zu...",
        voiceError: "Spracheingabe fehlgeschlagen. Bitte erneut versuchen.",
        voiceEmpty: "Keine Sprache erkannt. Bitte erneut versuchen.",
        voiceUnsupported: "Spracheingabe wird in diesem Browser nicht unterstuetzt.",
        voicePermissionError: "Mikrofonzugriff wurde verweigert.",
        voicePermissionBlocked: "Mikrofonzugriff ist in den Browser-Einstellungen blockiert.",
        voiceSecureContext: "Sprachaufnahme erfordert HTTPS oder localhost.",
        quickReplies: "Schnellantworten",
        quickEmergency: "Notfall",
        quickTrapped: "Ich bin eingeschlossen",
        quickSafe: "Ich bin sicher - Infos",
      },
      admin: {
        queue: "Handover-Liste",
        empty: "Keine aktiven Ubergaben.",
        select: "Ubergabe auswahlen",
        conversation: "Gesprache",
        noConversation: "Kein aktives Gesprach",
        assign: "Zuweisen",
        close: "Schliessen",
        replyPlaceholder: "Antwort schreiben...",
      },
      alerts: {
        critical: "Kritische Lage erkannt",
        caution: "Bleiben Sie wachsam und folgen Sie offiziellen Hinweisen",
      },
      cards: {
        title: "Sicherheits-Shortcuts",
        stay: "Wenn moglich bei anderen bleiben",
        power: "Taschenlampe und Batterien bereithalten",
        meds: "Wichtige Medikamente vorbereiten",
      },
    },
  },
  tr: {
    translation: {
      app: {
        title: "CRISOS",
        chat_intro: "Kriz aninda yonlendirebilirim ve gerekirse operatora baglarim.",
        disclaimer_title_short: "Bildirim",
        disclaimer_items: [
          "Bu arac yalnizca yonlendirme icindir; acil durumda 112'yi arayin.",
          "Yanitlar resmi kaynaklara dayanir ve gecikmeli veya eksik olabilir.",
          "Hayati tehlikede ve riza veremiyorsaniz, veriler yetkili kurumlarla paylasilabilir (GDPR Madde 6(1)(d) ve 9(2)(c)).",
          "Bilgiler yalnizca kamu kurumlariyla paylasilir, ticari taraflarla paylasilmaz.",
        ],
        disclaimer_header: "CRISOS - Acil Durum Bildirimi",
        disclaimer_checkbox: "Yukaridaki bilgileri okudum ve anladim",
        disclaimer_scroll_hint: "Devam etmek icin asagi kaydirin v",
        disclaimer_accept: "Anladim ve Devam Et",
        disclaimer_decline: "Reddet",
        disclaimer_required_title: "Disclaimer gerekli",
        disclaimer_decline_warning:
          "Bu hizmeti kullanmak icin disclaimer'i kabul etmeniz gerekmektedir. Acil durumda lutfen 112'yi arayin.",
        disclaimer_review: "Disclaimer'i tekrar gozden gecir",
        restricted_emergency_title: "Acil numaralar",
        restricted_safety_title: "Temel guvenlik bilgisi",
        restricted_safety_items: [
          "Guvenli bir alana gecin ve sakin kalin.",
          "Resmi duyurulari takip edin.",
          "Telefonunuzu sarjli tutun ve yakinlariniza haber verin.",
        ],
        disclaimer_close: "Kapat",
        disclaimer_sections: [
          {
            title: "Genel Bilgilendirme",
            paragraphs: [
              "CRISOS, kriz durumlarinda bilgilendirme ve yonlendirme destegi saglayan bir dijital aractir. Resmi acil durum talimatlarinin, profesyonel tibbi yardimin veya kolluk kuvvetlerinin yerini almaz.",
              "Kendinizin veya bir baskasinin derhal tehlikede oldugunu dusunuyorsaniz lutfen hemen 112'yi arayin.",
            ],
          },
          {
            title: "Resmi Kaynaklar",
            paragraphs: [
              "CRISOS tarafindan sunulan icerik, kamu kurumlarinin acik kaynakli bilgilerinden turetilir.",
              "Altyapi kesintileri veya guncelleme gecikmeleri nedeniyle bilgiler zaman zaman eksik, gecikmis veya guncel olmayabilir.",
            ],
          },
          {
            title: "Acil Insan Operatore Devretme",
            paragraphs: [
              "Sistem, belirli durumlarda sizi yetkili insan operatore devredebilir. Bu durumda olay kaydi, verdiginiz bilgiler ve gerekli gorulen teknik veriler ilgili operatore aktarilabilir.",
              "Aktarimin amaci, size en hizli ve guvenli sekilde yardim saglamaktir. Olayla dogrudan iliskili veriler yalnizca gorevli ve yetkili personel tarafindan erisilebilir olur.",
            ],
          },
          {
            title: "Konum Verisi",
            paragraphs: [
              "CRISOS, yalnizca acil ve hayati tehlike iceren durumlarda, olayin degerlendirilmesi ve dogru birimlere yonlendirilmesi amaciyla konum verinizi isleyebilir.",
              "Normal kosullarda konum veriniz acik rizaniz olmadan toplanmaz veya islenmez. Ancak acil bir durumda ve riza veremeyeceginiz hallerde, emergency human handover surecinde hayati cikarlarinizi korumak amaciyla konum veriniz yetkili kamu otoriteleriyle paylasilabilir.",
              "Yasal dayanak GDPR Madde 6(1)(d) ve ozel nitelikli veriler icin Madde 9(2)(c)'dir. Konum verileri amac gerceklestiginde veya ilgili mevzuatin gerektirdigi sure sonunda silinir ya da anonimlestirilir.",
            ],
          },
          {
            title: "Mikrofon/Kamera/Dosya",
            paragraphs: [
              "CRISOS destek surecinde mikrofon erisimi, kamera erisimi ve dosya yukleme gibi ek veri paylasimlarini mumkun kilabilir.",
              "Bu ozellikler mumkun oldugunda acik rizaniz ile ve her bir ozellik icin ayri onay adimi uzerinden kullanilir. Paylasilan icerikler yalnizca olayin degerlendirilmesi, uygun yonlendirme ve yardim amaciyla islenir.",
              "Ozel nitelikli veriler paylasildiginda isleme GDPR Madde 9 kapsaminda yurutulur; acil ve hayati tehlike durumlarinda riza alinamadiginda Madde 9(2)(c) uygulanabilir.",
            ],
          },
          {
            title: "Veri Paylasimi",
            paragraphs: [
              "Verileriniz yalnizca yasal olarak yetkilendirilmis kamu kurumlari ve resmi acil durum hizmetleriyle paylasilir.",
              "Ticari amaclarla ucuncu taraflarla paylasilmaz veya satilmaz. Veriler yalnizca belirli ve mesru amaclar icin, gerektigi kadar ve sureyle saklanir.",
            ],
          },
          {
            title: "Hukuki Dayanak",
            paragraphs: [
              "CRISOS tarafindan gerceklestirilen kisisel veri isleme faaliyetleri, somut duruma gore GDPR Madde 6(1)(a), 6(1)(d), 6(1)(e) veya (f) kapsaminda dayanabilir.",
              "Ozel nitelikli veriler icin GDPR Madde 9(2)(c) gibi ilgili yasal dayanaklar acil durumlarda uygulanabilir.",
            ],
          },
          {
            title: "Haklariniz",
            paragraphs: [
              "Bulundugunuz ulke ve gecerli mevzuata bagli olarak erisim, duzeltme, silme, islemeyi kisitlama, itiraz ve sikayet haklarina sahipsiniz.",
              "Bu haklarinizi kullanmak icin ilgili iletisim kanallarindan sistem operatoru ile iletisime gecin. Bu sistemi kullanmaya devam ederek, yukarida aciklanan amaclar, kapsam ve sinirlar cercevesinde calistigini anladiginizi kabul etmis sayilirsiniz. Acil bir durumda her zaman 112 gibi resmi acil durum hatlarini kullanmaniz tavsiye edilir.",
            ],
          },
        ],
      },
      navigation: {
        user: "Kullanici Konsolu",
        admin: "Admin",
      },
      location: {
        title: "Konum",
        hint: "Hizli destek icin sehir veya adres paylasin.",
        placeholder: "Mevcut Konum",
        useGps: "GPS kullan",
        save: "Konumu kaydet",
        gpsActive: "GPS koordinatlari kaydedildi",
        gpsPrompt: "Konum gerekli. Lutfen GPS izni verin veya adres girin.",
        gpsUnavailable: "GPS kullanilamiyor. Lutfen sehir veya adres girin.",
        gpsDenied: "GPS izni reddedildi. Lutfen sehir veya adres girin.",
      },
      status: {
        handoff: "Insan operator devrede",
        waiting: "Lutfen musait kalin. Bilgiler aktarildi.",
      },
      actions: {
        title: "Hizli islemler",
        emergency: "Acil arama 112",
        numbers: "Acil numaralar",
        warnings: "Resmi uyarilar",
        forecast: "Hava durumu",
        supply: "Tedarik Noktalari",
        contact: "Iletisim noktasi",
        evacuation: "Tahliye gerekliligi",
        instructions: "Talimatlar",
      },
      chat: {
        title: "Sohbet destegi",
        placeholder: "Mesajinizi yazin...",
        send: "Gonder",
        voiceStart: "Ses",
        voiceStop: "Durdur",
        listeningPlaceholder: "Dinleniyor...",
        voiceError: "Sesli giris basarisiz. Tekrar deneyin.",
        voiceEmpty: "Ses algilanamadi. Tekrar deneyin.",
        voiceUnsupported: "Bu tarayici sesli girisi desteklemiyor.",
        voicePermissionError: "Mikrofon izni reddedildi.",
        voicePermissionBlocked: "Mikrofon izni tarayici ayarlarinda engellendi.",
        voiceSecureContext: "Sesli giris icin HTTPS veya localhost gerekir.",
        quickReplies: "Hizli cevaplar",
        quickEmergency: "Acil durum",
        quickTrapped: "Mahsur kaldim",
        quickSafe: "Guvendeyim - Bilgi",
      },
      admin: {
        queue: "Handover Sirasi",
        empty: "Aktif handover yok.",
        select: "Handover secin",
        conversation: "Gorusme",
        noConversation: "Aktif gorusme yok",
        assign: "Ustlen",
        close: "Kapat",
        replyPlaceholder: "Yaniti yazin...",
      },
      alerts: {
        critical: "Kritik durum tespit edildi",
        caution: "Resmi talimatlari takip edin",
      },
      cards: {
        title: "Guvenlik kisa yollar",
        stay: "Mumkunse yalniz kalmayin",
        power: "Fener ve pil hazir bulundurun",
        meds: "Temel ilaclari hazirlayin",
      },
    },
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
