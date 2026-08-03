// ============================================================
// aiService.js — SERVICE de IA (o "coração": fala com o Gemini Nano)
// ============================================================
// Responsabilidade: toda a conversa de baixo nível com a Prompt API
// do Chrome (checar disponibilidade, criar a sessão, enviar prompt
// multimodal, fazer streaming). Não sabe nada de tela — só de IA.
export class AIService {
    constructor() {
        this.session = null;          // a sessão atual com o modelo
        this.abortController = null;  // o "cancelador" da geração
    }

    // "Porteiro": verifica se dá pra usar a IA. Retorna uma LISTA de erros
    // (pra mostrar na tela) ou null se está tudo certo.
    async checkRequirements() {
        const errors = [];

        // @ts-ignore
        const isChrome = !!window.chrome; // !! transforma em true/false
        if (!isChrome) {
            errors.push("⚠️ Este recurso só funciona no Google Chrome ou Chrome Canary (versão recente).");
        }

        // 'X in self' = "a API X existe neste navegador?"
        if (!('LanguageModel' in self)) {
            errors.push("⚠️ As APIs nativas de IA não estão ativas.");
            errors.push("Ative a seguinte flag em chrome://flags/:");
            errors.push("- Prompt API for Gemini Nano (chrome://flags/#prompt-api-for-gemini-nano)");
            errors.push("Depois reinicie o Chrome e tente novamente.");
            return errors;
        }

        // A API de tradução existe? Checa se EN->PT está disponível.
        if ('Translator' in self) {
            const translatorAvailability = await Translator.availability({
                sourceLanguage: 'en',
                targetLanguage: 'pt'
            });
            console.log('Translator Availability:', translatorAvailability);

            if (translatorAvailability === 'no') {
                errors.push("⚠️ Tradução de inglês para português não está disponível.");
            }
        } else {
            errors.push("⚠️ A API de Tradução não está ativa.");
            errors.push("Ative a seguinte flag em chrome://flags/:");
            errors.push("- Translation API (chrome://flags/#translation-api)");
        }

        // A API de detecção de idioma existe?
        if (!('LanguageDetector' in self)) {
            errors.push("⚠️ A API de Detecção de Idioma não está ativa.");
            errors.push("Ative a seguinte flag em chrome://flags/:");
            errors.push("- Language Detection API (chrome://flags/#language-detector-api)");
        }

        if (errors.length > 0) {
            return errors;
        }

        // Disponibilidade do modelo de linguagem: available / downloadable /
        // downloading / unavailable (igual ao webai01).
        const availability = await LanguageModel.availability({ languages: ["en"] });
        console.log('Language Model Availability:', availability);

        if (availability === 'available') {
            return null; // tudo pronto
        }
        if (availability === 'unavailable') {
            errors.push(`⚠️ O seu dispositivo não suporta modelos de linguagem nativos de IA.`);
        }
        if (availability === 'downloading') {
            errors.push(`⚠️ O modelo de linguagem de IA está sendo baixado. Por favor, aguarde alguns minutos e tente novamente.`);
        }
        if (availability === 'downloadable') {
            // Precisa baixar: tenta baixar agora (com monitor de progresso no console).
            errors.push(`⚠️ O modelo de linguagem de IA precisa ser baixado, baixando agora... (acompanhe o progresso no terminal do chrome)`);
            try {
                const session = await LanguageModel.create({
                    expectedInputLanguages: ["en"],
                    monitor(m) {
                        m.addEventListener('downloadprogress', (e) => {
                            const percent = ((e.loaded / e.total) * 100).toFixed(0);
                            console.log(`Downloaded ${percent}%`);
                        });
                    }
                });
                await session.prompt('Hello'); // "aquece" o modelo
                session.destroy();

                // Confere de novo depois de baixar.
                const newAvailability = await LanguageModel.availability({ languages: ["en"] });
                if (newAvailability === 'available') {
                    return null; // baixou com sucesso
                }
            } catch (error) {
                console.error('Error downloading model:', error);
                errors.push(`⚠️ Erro ao baixar o modelo: ${error.message}`);
            }
        }

        return errors.length > 0 ? errors : null;
    }

    // Retorna os parâmetros padrão (temperature/topK) pra configurar os sliders.
    async getParams() {
        // Chrome 150 não expõe LanguageModel.params(); usamos os valores padrão do Gemini Nano.
        const params = {
            defaultTemperature: 1,
            defaultTopK: 3,
            maxTemperature: 2,
            maxTopK: 128,
        };
        console.log('Language Model Params (padrão):', params);
        return params;
    }

    // O CORAÇÃO: cria uma sessão nova com os parâmetros atuais e faz o prompt.
    // 'async*' = FUNÇÃO GERADORA: entrega a resposta em pedaços com 'yield',
    // em vez de tudo de uma vez. Quem chama usa 'for await' pra receber.
    async* createSession(question, temperature, topK, file = null) {
        this.abortController?.abort();                  // cancela geração anterior (se houver)
        this.abortController = new AbortController();    // cria um novo "cancelador"

        // Destrói a sessão antiga pra criar uma nova com os params atualizados.
        if (this.session) {
            this.session.destroy();
        }

        this.session = await LanguageModel.create({
            // Avisamos que tipos de entrada esperamos. É MULTIMODAL: texto + imagem.
            expectedInputs: [
                { type: "text", languages: ["en"] },
                // { type: "audio" },  // áudio = 'unavailable' neste Chrome/hardware;
                //                        pedir essa capacidade derruba o create() inteiro.
                { type: "image" },
            ],
            expectedOutputs: [{ type: "text", languages: ["en"] }], // saída: texto em inglês
            temperature: temperature, // <- valores vindos dos sliders
            topK: topK,
            initialPrompts: [
                {
                    role: 'system',
                    // No multimodal, o content é um ARRAY de partes tipadas.
                    content: [{
                        type: "text",
                        value: `You are an AI assistant that responds clearly and objectively.
                        Always respond in plain text format instead of markdown.`
                    }]
                },
            ],
        });

        // Monta a mensagem do usuário: começa com o texto...
        const contentArray = [{ type: "text", value: question }];

        // ...e, se houver arquivo, adiciona imagem/áudio à mesma mensagem.
        if (file) {
            const fileType = file.type.split('/')[0]; // "image" ou "audio"
            if (fileType === 'image' || fileType === 'audio') {
                // Converte o arquivo num Blob (formato que a API entende).
                const blob = new Blob([await file.arrayBuffer()], { type: file.type });
                contentArray.push({ type: fileType, value: blob });
                console.log(`Adding ${fileType} to prompt:`, file.name);
            }
        }

        // Envia em streaming. 'signal' liga o cancelamento (botão Parar) ao stream.
        const responseStream = await this.session.promptStreaming(
            [
                {
                    role: 'user',
                    content: contentArray, // texto (+ imagem) juntos
                },
            ],
            {
                signal: this.abortController.signal,
            }
        );

        // Entrega cada pedaço com 'yield'. Se o usuário abortou, para.
        for await (const chunk of responseStream) {
            if (this.abortController.signal.aborted) {
                break;
            }
            yield chunk;
        }
    }

    // Cancela a geração (chamado pelo botão "Parar").
    abort() {
        this.abortController?.abort();
    }

    // Diz se a geração foi cancelada.
    isAborted() {
        return this.abortController?.signal.aborted;
    }
}
