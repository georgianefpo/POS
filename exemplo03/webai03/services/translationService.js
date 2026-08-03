// ============================================================
// translationService.js — SERVICE de TRADUÇÃO
// ============================================================
// Responsabilidade: usar duas APIs nativas do Chrome —
//   - Translator: traduz de um idioma pra outro (aqui, EN -> PT)
//   - LanguageDetector: descobre em que idioma um texto está
// Assim, a resposta da IA (que vem em inglês) chega ao usuário em português.
export class TranslationService {
    constructor() {
        this.translator = null;        // o tradutor (criado sob demanda)
        this.languageDetector = null;  // o detector de idioma
    }

    // Inicializa só uma vez. Deve ser chamada a partir de um gesto do usuário
    // (clique/submit), pois Translator.create() exige gesto pra baixar o modelo.
    async ensureInitialized() {
        if (this.translator && this.languageDetector) {
            return true; // já inicializado, não faz de novo
        }
        return this.initialize();
    }

    // Cria de fato o tradutor e o detector (baixa os modelos na 1ª vez).
    async initialize() {
        try {
            this.translator = await Translator.create({
                sourceLanguage: 'en',   // de inglês
                targetLanguage: 'pt',   // para português
                monitor(m) {
                    // mostra o progresso do download do modelo de tradução
                    m.addEventListener('downloadprogress', (e) => {
                        const percent = ((e.loaded / e.total) * 100).toFixed(0);
                        console.log(`Translator downloaded ${percent}%`);
                    });
                }
            });
            console.log('Translator initialized');

            this.languageDetector = await LanguageDetector.create();
            console.log('Language Detector initialized');

            return true;
        } catch (error) {
            console.error('Error initializing translation:', error);
            throw new Error('⚠️ Erro ao inicializar APIs de tradução.');
        }
    }

    // Traduz um texto pro português (com uma otimização: se já está em PT, pula).
    async translateToPortuguese(text) {
        // Se o tradutor não inicializou, devolve o texto original (não quebra).
        if (!this.translator) {
            console.warn('Translator not available, returning original text');
            return text;
        }

        try {
            // 1) Detecta o idioma primeiro.
            if (this.languageDetector) {
                const detectionResults = await this.languageDetector.detect(text);
                console.log('Detected languages:', detectionResults);

                // Se já está em português, não precisa traduzir.
                // O '?.' evita erro caso detectionResults[0] não exista.
                if (detectionResults && detectionResults[0]?.detectedLanguage === 'pt') {
                    console.log('Text is already in Portuguese');
                    return text;
                }
            }

            // 2) Traduz em streaming. IMPORTANTE: aqui cada 'chunk' já é a
            //    tradução COMPLETA até o momento (não é um pedaço a acumular),
            //    por isso apenas SUBSTITUÍMOS 'translated' a cada passo.
            const stream = this.translator.translateStreaming(text);
            let translated = '';
            for await (const chunk of stream) {
                translated = chunk; // cada chunk = tradução inteira até agora
            }
            console.log('Translated text:', translated);
            return translated;
        } catch (error) {
            console.error('Translation error:', error);
            return text; // se a tradução falhar, mostra o texto original
        }
    }
}
