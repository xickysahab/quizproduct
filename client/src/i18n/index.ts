/**
 * Participant-facing translations.
 *
 * The wedge Slido has no answer to. Their product is English-only, which is a
 * real problem in an Indian lecture hall, a government training session, or a
 * factory-floor town hall.
 *
 * Deliberately dependency-free: the participant surface is two screens and
 * roughly sixty strings, so a typed dictionary is the right size for the job —
 * and it keeps the participant bundle small, which matters on the congested
 * venue networks this product runs on.
 *
 * The host dashboard stays English for now. Translating an admin UI is a much
 * larger surface with far less leverage.
 */

export const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'mr', label: 'Marathi', native: 'मराठी' },
  { code: 'bn', label: 'Bengali', native: 'বাংলা' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు' },
  { code: 'gu', label: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

/** Every string the participant can see. English is the reference. */
const en = {
  'join.eyebrow': 'Participant Portal',
  'join.title': 'Join a Live Session',
  'join.subtitle': "Enter the code shown on the host's screen",
  'join.code': 'Room Code',
  'join.name': 'Your Name',
  'join.nameOptional': 'optional',
  'join.namePlaceholder': 'Leave blank to stay anonymous',
  'join.submit': 'Enter Live Session',
  'join.connecting': 'Connecting…',
  'join.errorCode': 'Enter the code shown on screen',
  'join.errorGeneric': 'Unable to join. Check the code and try again.',

  'live.connected': 'Connected',
  'live.reconnecting': 'Reconnecting',
  'live.offlineQueued': 'Saved. It will send when you reconnect.',
  'live.player': 'Player',
  'live.waitingTitle': "You're in",
  'live.waitingBody': 'Waiting for the host to present the next question…',
  'live.ready': 'Connected & Ready',
  'live.activeQuestion': 'Active Question',
  'live.results': 'Results',
  'live.timeRemaining': 'Time remaining',
  'live.timeUp': "Time's up",
  'live.timeUpMessage': 'Time is up for this question.',
  'live.submitAnswer': 'Submit answer',
  'live.updateAnswer': 'Update answer',
  'live.submitSelection': 'Submit selection',
  'live.updateSelection': 'Update selection',
  'live.recorded': 'Response recorded — you may update until the host advances',
  'live.correct': 'Correct!',
  'live.incorrect': 'Not quite',
  'live.leaderboard': 'Live leaderboard',
  'live.yourPlace': 'Your place',
  'live.textPlaceholder': 'Type your answer',
  'live.wordPlaceholder': 'Type a word or short phrase',
  'live.tabPoll': 'Live poll',
  'live.tabQa': 'Ask a question',
  'live.sessionExpired': 'Session expired. Please rejoin the room.',

  'qa.placeholder': 'Ask the speaker something…',
  'qa.anonymous': 'Ask anonymously',
  'qa.ask': 'Ask',
  'qa.sending': 'Sending…',
  'qa.empty': 'No questions yet. Be the first to ask.',
  'qa.pending': 'Awaiting review',
  'qa.answered': 'Answered',
  'qa.anonymousLabel': 'Anonymous',
  'qa.you': 'you',
  'qa.upvote': 'Upvote',
  'qa.posted': 'Question posted.',
  'qa.sentForReview': 'Sent to the host for review.',
  'qa.failed': 'Could not post that question. Try again.',
  'qa.voteFailed': 'Could not register that vote.',

  'end.eyebrow': 'Session Concluded',
  'end.title': 'Session complete',
  'end.thanks': 'Thank you for taking part',
  'end.scored': 'You scored {score} of {total}, ranked {rank} of {participants}.',
  'end.recorded': 'Your responses were recorded.',
  'end.home': 'Return to Home',

  'lang.label': 'Language',
} as const;

export type TranslationKey = keyof typeof en;

type Dictionary = Partial<Record<TranslationKey, string>>;

const hi: Dictionary = {
  'join.eyebrow': 'प्रतिभागी पोर्टल',
  'join.title': 'लाइव सत्र में शामिल हों',
  'join.subtitle': 'होस्ट की स्क्रीन पर दिखाया गया कोड डालें',
  'join.code': 'रूम कोड',
  'join.name': 'आपका नाम',
  'join.nameOptional': 'वैकल्पिक',
  'join.namePlaceholder': 'गुमनाम रहने के लिए खाली छोड़ें',
  'join.submit': 'सत्र में शामिल हों',
  'join.connecting': 'जोड़ा जा रहा है…',
  'join.errorCode': 'स्क्रीन पर दिखाया गया कोड डालें',
  'join.errorGeneric': 'शामिल नहीं हो सके। कोड जाँचें और फिर कोशिश करें।',

  'live.connected': 'जुड़ा हुआ',
  'live.reconnecting': 'फिर से जोड़ा जा रहा है',
  'live.offlineQueued': 'सहेजा गया। कनेक्शन आते ही भेज दिया जाएगा।',
  'live.player': 'प्रतिभागी',
  'live.waitingTitle': 'आप जुड़ चुके हैं',
  'live.waitingBody': 'होस्ट के अगला प्रश्न दिखाने की प्रतीक्षा है…',
  'live.ready': 'जुड़ा और तैयार',
  'live.activeQuestion': 'वर्तमान प्रश्न',
  'live.results': 'परिणाम',
  'live.timeRemaining': 'शेष समय',
  'live.timeUp': 'समय समाप्त',
  'live.timeUpMessage': 'इस प्रश्न का समय समाप्त हो गया है।',
  'live.submitAnswer': 'उत्तर भेजें',
  'live.updateAnswer': 'उत्तर बदलें',
  'live.submitSelection': 'चयन भेजें',
  'live.updateSelection': 'चयन बदलें',
  'live.recorded': 'उत्तर दर्ज हुआ — होस्ट के आगे बढ़ने तक बदल सकते हैं',
  'live.correct': 'सही!',
  'live.incorrect': 'गलत',
  'live.leaderboard': 'लीडरबोर्ड',
  'live.yourPlace': 'आपका स्थान',
  'live.textPlaceholder': 'अपना उत्तर लिखें',
  'live.wordPlaceholder': 'एक शब्द या छोटा वाक्यांश लिखें',
  'live.tabPoll': 'लाइव पोल',
  'live.tabQa': 'प्रश्न पूछें',
  'live.sessionExpired': 'सत्र समाप्त हो गया। कृपया फिर से शामिल हों।',

  'qa.placeholder': 'वक्ता से कुछ पूछें…',
  'qa.anonymous': 'गुमनाम रूप से पूछें',
  'qa.ask': 'पूछें',
  'qa.sending': 'भेजा जा रहा है…',
  'qa.empty': 'अभी कोई प्रश्न नहीं। पहला प्रश्न आपका हो।',
  'qa.pending': 'समीक्षा प्रतीक्षित',
  'qa.answered': 'उत्तर दिया गया',
  'qa.anonymousLabel': 'गुमनाम',
  'qa.you': 'आप',
  'qa.upvote': 'समर्थन करें',
  'qa.posted': 'प्रश्न भेजा गया।',
  'qa.sentForReview': 'होस्ट की समीक्षा के लिए भेजा गया।',
  'qa.failed': 'प्रश्न नहीं भेजा जा सका। फिर कोशिश करें।',
  'qa.voteFailed': 'वोट दर्ज नहीं हो सका।',

  'end.eyebrow': 'सत्र समाप्त',
  'end.title': 'सत्र पूरा हुआ',
  'end.thanks': 'भाग लेने के लिए धन्यवाद',
  'end.scored': 'आपने {total} में से {score} अंक पाए, {participants} में {rank} स्थान।',
  'end.recorded': 'आपके उत्तर दर्ज कर लिए गए।',
  'end.home': 'होम पर लौटें',

  'lang.label': 'भाषा',
};

const mr: Dictionary = {
  'join.title': 'लाइव सत्रात सहभागी व्हा',
  'join.subtitle': 'होस्टच्या स्क्रीनवरील कोड टाका',
  'join.code': 'रूम कोड',
  'join.name': 'तुमचे नाव',
  'join.nameOptional': 'ऐच्छिक',
  'join.namePlaceholder': 'निनावी राहण्यासाठी रिकामे ठेवा',
  'join.submit': 'सत्रात सहभागी व्हा',
  'live.waitingTitle': 'तुम्ही सहभागी झाला आहात',
  'live.waitingBody': 'होस्ट पुढील प्रश्न दाखवण्याची वाट पाहत आहोत…',
  'live.activeQuestion': 'सध्याचा प्रश्न',
  'live.results': 'निकाल',
  'live.timeRemaining': 'उरलेला वेळ',
  'live.timeUp': 'वेळ संपली',
  'live.submitAnswer': 'उत्तर पाठवा',
  'live.tabPoll': 'लाइव्ह पोल',
  'live.tabQa': 'प्रश्न विचारा',
  'qa.placeholder': 'वक्त्याला काही विचारा…',
  'qa.anonymous': 'निनावी विचारा',
  'qa.ask': 'विचारा',
  'qa.answered': 'उत्तर दिले',
  'end.title': 'सत्र पूर्ण झाले',
  'end.thanks': 'सहभागासाठी धन्यवाद',
  'lang.label': 'भाषा',
};

const bn: Dictionary = {
  'join.title': 'লাইভ সেশনে যোগ দিন',
  'join.subtitle': 'হোস্টের স্ক্রিনে দেখানো কোড লিখুন',
  'join.code': 'রুম কোড',
  'join.name': 'আপনার নাম',
  'join.nameOptional': 'ঐচ্ছিক',
  'join.namePlaceholder': 'নাম ছাড়া যোগ দিতে খালি রাখুন',
  'join.submit': 'সেশনে যোগ দিন',
  'live.waitingTitle': 'আপনি যোগ দিয়েছেন',
  'live.waitingBody': 'হোস্টের পরবর্তী প্রশ্নের অপেক্ষায়…',
  'live.activeQuestion': 'বর্তমান প্রশ্ন',
  'live.results': 'ফলাফল',
  'live.timeRemaining': 'বাকি সময়',
  'live.timeUp': 'সময় শেষ',
  'live.submitAnswer': 'উত্তর পাঠান',
  'live.tabPoll': 'লাইভ পোল',
  'live.tabQa': 'প্রশ্ন করুন',
  'qa.placeholder': 'বক্তাকে কিছু জিজ্ঞাসা করুন…',
  'qa.anonymous': 'নাম ছাড়া জিজ্ঞাসা করুন',
  'qa.ask': 'জিজ্ঞাসা করুন',
  'qa.answered': 'উত্তর দেওয়া হয়েছে',
  'end.title': 'সেশন সম্পন্ন',
  'end.thanks': 'অংশগ্রহণের জন্য ধন্যবাদ',
  'lang.label': 'ভাষা',
};

const ta: Dictionary = {
  'join.title': 'நேரலை அமர்வில் இணையுங்கள்',
  'join.subtitle': 'திரையில் காட்டப்படும் குறியீட்டை உள்ளிடவும்',
  'join.code': 'அறை குறியீடு',
  'join.name': 'உங்கள் பெயர்',
  'join.nameOptional': 'விருப்பத்தேர்வு',
  'join.namePlaceholder': 'பெயரின்றி இணைய காலியாக விடவும்',
  'join.submit': 'அமர்வில் இணைக',
  'live.waitingTitle': 'நீங்கள் இணைந்துவிட்டீர்கள்',
  'live.waitingBody': 'அடுத்த கேள்விக்காக காத்திருக்கிறோம்…',
  'live.activeQuestion': 'தற்போதைய கேள்வி',
  'live.results': 'முடிவுகள்',
  'live.timeRemaining': 'மீதமுள்ள நேரம்',
  'live.timeUp': 'நேரம் முடிந்தது',
  'live.submitAnswer': 'பதிலை அனுப்பு',
  'live.tabPoll': 'நேரலை வாக்கெடுப்பு',
  'live.tabQa': 'கேள்வி கேளுங்கள்',
  'qa.placeholder': 'பேச்சாளரிடம் கேளுங்கள்…',
  'qa.anonymous': 'பெயரின்றி கேளுங்கள்',
  'qa.ask': 'கேள்',
  'qa.answered': 'பதிலளிக்கப்பட்டது',
  'end.title': 'அமர்வு முடிந்தது',
  'end.thanks': 'பங்கேற்றதற்கு நன்றி',
  'lang.label': 'மொழி',
};

const te: Dictionary = {
  'join.title': 'లైవ్ సెషన్‌లో చేరండి',
  'join.subtitle': 'స్క్రీన్‌పై చూపిన కోడ్‌ను నమోదు చేయండి',
  'join.code': 'రూమ్ కోడ్',
  'join.name': 'మీ పేరు',
  'join.nameOptional': 'ఐచ్ఛికం',
  'join.namePlaceholder': 'పేరు లేకుండా చేరాలంటే ఖాళీగా ఉంచండి',
  'join.submit': 'సెషన్‌లో చేరండి',
  'live.waitingTitle': 'మీరు చేరారు',
  'live.waitingBody': 'తదుపరి ప్రశ్న కోసం వేచి ఉన్నాము…',
  'live.activeQuestion': 'ప్రస్తుత ప్రశ్న',
  'live.results': 'ఫలితాలు',
  'live.timeRemaining': 'మిగిలిన సమయం',
  'live.timeUp': 'సమయం ముగిసింది',
  'live.submitAnswer': 'సమాధానం పంపండి',
  'live.tabPoll': 'లైవ్ పోల్',
  'live.tabQa': 'ప్రశ్న అడగండి',
  'qa.placeholder': 'వక్తను ఏదైనా అడగండి…',
  'qa.anonymous': 'పేరు లేకుండా అడగండి',
  'qa.ask': 'అడగండి',
  'qa.answered': 'సమాధానం ఇవ్వబడింది',
  'end.title': 'సెషన్ పూర్తయింది',
  'end.thanks': 'పాల్గొన్నందుకు ధన్యవాదాలు',
  'lang.label': 'భాష',
};

const gu: Dictionary = {
  'join.title': 'લાઇવ સત્રમાં જોડાઓ',
  'join.subtitle': 'સ્ક્રીન પર દર્શાવેલ કોડ દાખલ કરો',
  'join.code': 'રૂમ કોડ',
  'join.name': 'તમારું નામ',
  'join.nameOptional': 'વૈકલ્પિક',
  'join.namePlaceholder': 'અનામી રહેવા ખાલી રાખો',
  'join.submit': 'સત્રમાં જોડાઓ',
  'live.waitingTitle': 'તમે જોડાઈ ગયા છો',
  'live.waitingBody': 'આગળના પ્રશ્નની રાહ જોઈ રહ્યા છીએ…',
  'live.activeQuestion': 'વર્તમાન પ્રશ્ન',
  'live.results': 'પરિણામો',
  'live.timeRemaining': 'બાકી સમય',
  'live.timeUp': 'સમય પૂરો',
  'live.submitAnswer': 'જવાબ મોકલો',
  'live.tabPoll': 'લાઇવ પોલ',
  'live.tabQa': 'પ્રશ્ન પૂછો',
  'qa.placeholder': 'વક્તાને કંઈક પૂછો…',
  'qa.anonymous': 'અનામી રીતે પૂછો',
  'qa.ask': 'પૂછો',
  'qa.answered': 'જવાબ અપાયો',
  'end.title': 'સત્ર પૂર્ણ',
  'end.thanks': 'ભાગ લેવા બદલ આભાર',
  'lang.label': 'ભાષા',
};

const kn: Dictionary = {
  'join.title': 'ಲೈವ್ ಸೆಷನ್‌ಗೆ ಸೇರಿ',
  'join.subtitle': 'ಪರದೆಯಲ್ಲಿ ತೋರಿಸಿದ ಕೋಡ್ ನಮೂದಿಸಿ',
  'join.code': 'ರೂಮ್ ಕೋಡ್',
  'join.name': 'ನಿಮ್ಮ ಹೆಸರು',
  'join.nameOptional': 'ಐಚ್ಛಿಕ',
  'join.namePlaceholder': 'ಅನಾಮಧೇಯರಾಗಿರಲು ಖಾಲಿ ಬಿಡಿ',
  'join.submit': 'ಸೆಷನ್‌ಗೆ ಸೇರಿ',
  'live.waitingTitle': 'ನೀವು ಸೇರಿದ್ದೀರಿ',
  'live.waitingBody': 'ಮುಂದಿನ ಪ್ರಶ್ನೆಗಾಗಿ ಕಾಯುತ್ತಿದ್ದೇವೆ…',
  'live.activeQuestion': 'ಪ್ರಸ್ತುತ ಪ್ರಶ್ನೆ',
  'live.results': 'ಫಲಿತಾಂಶಗಳು',
  'live.timeRemaining': 'ಉಳಿದ ಸಮಯ',
  'live.timeUp': 'ಸಮಯ ಮುಗಿದಿದೆ',
  'live.submitAnswer': 'ಉತ್ತರ ಕಳುಹಿಸಿ',
  'live.tabPoll': 'ಲೈವ್ ಪೋಲ್',
  'live.tabQa': 'ಪ್ರಶ್ನೆ ಕೇಳಿ',
  'qa.placeholder': 'ಭಾಷಣಕಾರರನ್ನು ಕೇಳಿ…',
  'qa.anonymous': 'ಅನಾಮಧೇಯವಾಗಿ ಕೇಳಿ',
  'qa.ask': 'ಕೇಳಿ',
  'qa.answered': 'ಉತ್ತರಿಸಲಾಗಿದೆ',
  'end.title': 'ಸೆಷನ್ ಮುಗಿದಿದೆ',
  'end.thanks': 'ಭಾಗವಹಿಸಿದ್ದಕ್ಕೆ ಧನ್ಯವಾದಗಳು',
  'lang.label': 'ಭಾಷೆ',
};

const DICTIONARIES: Record<LanguageCode, Dictionary> = { en, hi, mr, bn, ta, te, gu, kn };

const STORAGE_KEY = 'participantLanguage';

const isSupported = (value: string): value is LanguageCode =>
  LANGUAGES.some((language) => language.code === value);

/**
 * Stored choice first, then the browser's own preference. Someone whose phone
 * is already in Hindi should not have to ask for Hindi.
 */
export const detectLanguage = (): LanguageCode => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && isSupported(stored)) return stored;

  for (const candidate of navigator.languages || [navigator.language]) {
    const base = candidate?.split('-')[0]?.toLowerCase();
    if (base && isSupported(base)) return base;
  }

  return 'en';
};

export const setLanguage = (code: LanguageCode): void => {
  localStorage.setItem(STORAGE_KEY, code);
};

/**
 * Looks a key up, falling back to English for anything not yet translated —
 * so a partial dictionary degrades to a mixed-language screen rather than
 * blank text or a raw key.
 */
export const translate = (
  code: LanguageCode,
  key: TranslationKey,
  vars?: Record<string, string | number>
): string => {
  const text = DICTIONARIES[code]?.[key] ?? en[key] ?? key;
  if (!vars) return text;

  return Object.entries(vars).reduce(
    (out, [name, value]) => out.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value)),
    text
  );
};
