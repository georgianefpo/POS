// ============================================================
// formController.js — O CONTROLLER (o "maestro")
// ============================================================
// Responsabilidade: COORDENAR. Ele pega dados da View, chama os
// Services (IA e tradução) e devolve o resultado pra View mostrar.
// Não mexe direto na tela (isso é da View) nem fala direto com a IA
// no baixo nível (isso é do Service) — ele orquestra os dois.
// (É o "gerente": coordena garçom e cozinha, sem fazer o trabalho deles.)
export class FormController {
    // Recebe as peças prontas (injeção de dependência) e guarda em 'this'.
    constructor(aiService, translationService, view) {
        this.aiService = aiService;
        this.translationService = translationService;
        this.view = view;
        this.isGenerating = false; // "estou gerando resposta agora?"
    }

    // Liga todos os eventos da tela às ações do controller.
    // Repare: a View expõe métodos "on..."; aqui passamos a FUNÇÃO
    // que deve rodar quando o evento acontecer.
    setupEventListeners() {
        // Sliders: ao arrastar, atualiza o número mostrado.
        this.view.onTemperatureChange((e) => {
            this.view.updateTemperatureDisplay(e.target.value);
        });
        this.view.onTopKChange((e) => {
            this.view.updateTopKDisplay(e.target.value);
        });

        // Arquivo: mostra a prévia ao escolher; o botão bonito abre o seletor.
        this.view.onFileChange((event) => {
            this.view.handleFilePreview(event);
        });
        this.view.onFileButtonClick(() => {
            this.view.triggerFileInput();
        });

        // Envio do formulário.
        this.view.onFormSubmit(async (event) => {
            event.preventDefault(); // impede o recarregamento padrão da página

            // Se já está gerando, o clique vira "Parar".
            if (this.isGenerating) {
                this.stopGeneration();
                return;
            }
            await this.handleSubmit();
        });
    }

    // O fluxo principal quando o usuário clica em "Enviar".
    async handleSubmit() {
        const question = this.view.getQuestionText();
        if (!question.trim()) {
            return; // pergunta vazia? ignora
        }

        // Inicializa a tradução aproveitando o gesto do usuário (o submit).
        // Precisa ser aqui, no começo, pois Translator.create() exige gesto
        // pra baixar o modelo. Se falhar, seguimos sem tradução (não é fatal).
        try {
            await this.translationService.ensureInitialized();
        } catch (error) {
            console.warn('Tradução indisponível, seguindo sem traduzir:', error.message);
        }

        // Lê os parâmetros e o arquivo anexado da tela.
        const temperature = this.view.getTemperature();
        const topK = this.view.getTopK();
        const file = this.view.getFile();
        console.log('Using parameters:', { temperature, topK });

        this.toggleButton(true);                        // botão -> "Parar"
        this.view.setOutput('Processing your question...');

        try {
            // Pede a resposta à IA. createSession é um GERADOR (async*),
            // então devolve os pedaços aos poucos (streaming).
            const aiResponseChunks = await this.aiService.createSession(
                question,
                temperature,
                topK,
                file
            );

            this.view.setOutput('');
            let fullResponse = '';
            // Vai colando cada pedaço na tela (resposta em INGLÊS).
            for await (const chunk of aiResponseChunks) {
                if (this.aiService.isAborted()) {
                    break;                              // clicou "Parar"? sai
                }
                console.log('Received chunk:', chunk);
                fullResponse += chunk;
                this.view.setOutput(fullResponse);
            }

            // Terminou de gerar? Traduz o texto completo pro português.
            if (fullResponse && !this.aiService.isAborted()) {
                this.view.setOutput('Traduzindo resposta...');
                const translatedResponse = await this.translationService.translateToPortuguese(fullResponse);
                this.view.setOutput(translatedResponse);
            }
        } catch (error) {
            console.error('Error during AI generation:', error);
            this.view.setOutput(`Erro: ${error.message}`);
        }

        this.toggleButton(false);                       // botão volta pra "Enviar"
    }

    // Cancela a geração em andamento.
    stopGeneration() {
        this.aiService.abort();
        this.toggleButton(false);
    }

    // Alterna o estado do botão (e guarda se está gerando).
    toggleButton(isGenerating) {
        this.isGenerating = isGenerating;
        if (isGenerating) {
            this.view.setButtonToStopMode();
        } else {
            this.view.setButtonToSendMode();
        }
    }
}
