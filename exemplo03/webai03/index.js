// ============================================================
// index.js — PONTO DE ENTRADA da aplicação (o "liga tudo")
// ============================================================
// Este arquivo não faz o trabalho pesado: ele só CRIA as peças
// (services, view, controller) e as conecta. É o "main" do app.
//
// 'import' traz coisas que outros arquivos "exportaram" (export).
// Só funciona porque o HTML carrega este script como type="module".
import { AIService } from './services/aiService.js';                 // fala com a IA (Gemini Nano)
import { TranslationService } from './services/translationService.js'; // traduz EN -> PT
import { View } from './views/view.js';                              // mexe na tela
import { FormController } from './controllers/formController.js';     // o "maestro"

// (async function main(){ ... })() = função que se executa SOZINHA
// assim que a página carrega. O 'async' permite usar 'await' dentro.
(async function main() {
    // 1) Cria as peças. 'new Classe()' fabrica um objeto a partir do "molde".
    const aiService = new AIService();
    const translationService = new TranslationService();
    const view = new View();

    // 2) Escreve o ano atual no rodapé.
    view.setYear();

    // 3) "Porteiro": a IA está disponível? Se retornar erros, mostra e PARA.
    const errors = await aiService.checkRequirements();
    if (errors) {
        view.showError(errors);
        return; // encerra o main — sem IA não dá pra continuar
    }

    // A tradução é inicializada preguiçosamente no primeiro envio
    // (translationService.ensureInitialized dentro do FormController),
    // porque Translator.create() exige um gesto do usuário pra baixar o modelo.

    // 4) Pega os parâmetros padrão (temperature/topK) e configura os sliders.
    const params = await aiService.getParams();
    view.initializeParameters(params);

    // 5) Cria o controller ENTREGANDO as peças que ele vai coordenar
    //    (isso se chama "injeção de dependência": dar as ferramentas prontas).
    const controller = new FormController(aiService, translationService, view);
    controller.setupEventListeners(); // liga os cliques/digitação

    console.log('Application initialized successfully');
})();
