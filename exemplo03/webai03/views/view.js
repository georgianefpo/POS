// ============================================================
// view.js — A VIEW (a camada da TELA)
// ============================================================
// Responsabilidade ÚNICA: falar com a interface. Pegar o que o
// usuário digitou, mostrar respostas, mexer em botões/imagens.
// A View NÃO sabe nada de IA — ela só cuida do que aparece na tela.
// (É o "garçom": conversa com o cliente, não cozinha.)
export class View {
    // O constructor roda quando fazemos 'new View()'. Aqui pegamos
    // TODOS os elementos da tela pelos seus ids e guardamos em this.elements,
    // pra não repetir document.getElementById(...) o tempo todo.
    constructor() {
        this.elements = {
            temperature: document.getElementById('temperature'),
            temperatureValue: document.getElementById('temp-value'),
            topKValue: document.getElementById('topk-value'),
            topK: document.getElementById('topK'),
            form: document.getElementById('question-form'),
            questionInput: document.getElementById('question'),
            output: document.getElementById('output'),
            button: document.getElementById('ask-button'),
            year: document.getElementById('year'),
            fileInput: document.getElementById('file-input'),       // input de arquivo (escondido)
            filePreview: document.getElementById('file-preview'),   // onde a imagem aparece
            fileUploadBtn: document.getElementById('file-upload-btn'),
            fileSelectedName: document.getElementById('file-selected-name'),
        };
    }

    // Escreve o ano atual no rodapé. new Date().getFullYear() = ano de hoje.
    setYear() {
        this.elements.year.textContent = new Date().getFullYear();
    }

    // Configura os limites e valores iniciais dos sliders, a partir dos
    // parâmetros padrão do modelo (recebidos do aiService).
    initializeParameters(params) {
        this.elements.topK.max = params.maxTopK;                 // topK vai até 128
        this.elements.topK.min = 1;
        this.elements.topK.value = params.defaultTopK;           // começa em 3
        this.elements.topKValue.textContent = params.defaultTopK;

        this.elements.temperatureValue.textContent = params.defaultTemperature;
        this.elements.temperature.max = params.maxTemperature;   // temperature até 2
        this.elements.temperature.min = 0;
        this.elements.temperature.value = params.defaultTemperature; // começa em 1
    }

    // Atualizam o numerinho ao lado do slider enquanto você arrasta.
    updateTemperatureDisplay(value) {
        this.elements.temperatureValue.textContent = value;
    }
    updateTopKDisplay(value) {
        this.elements.topKValue.textContent = value;
    }

    // "Getters": leem o que está na tela e devolvem pro controller.
    getQuestionText() {
        return this.elements.questionInput.value;                // o texto digitado
    }
    getTemperature() {
        return parseFloat(this.elements.temperature.value);      // "1.5" (texto) -> 1.5 (número)
    }
    getTopK() {
        return parseInt(this.elements.topK.value);               // "20" -> 20 (inteiro)
    }
    getFile() {
        return this.elements.fileInput.files[0];                 // o 1º arquivo anexado (ou undefined)
    }

    // "Setters": escrevem na tela.
    setOutput(text) {
        this.elements.output.textContent = text;                 // substitui o conteúdo da saída
    }
    appendOutput(text) {
        this.elements.output.textContent += text;                // acrescenta ao fim
    }

    // Mostra a lista de erros (ex.: falta ativar flag) e desativa o botão.
    showError(errors) {
        this.elements.output.innerHTML = errors.join('<br/>');   // junta com quebra de linha
        this.elements.button.disabled = true;
    }

    // O MESMO botão vira "Parar" ou "Enviar". classList add/remove liga/desliga
    // uma classe CSS (que muda a cor, provavelmente pra vermelho no "Parar").
    setButtonToStopMode() {
        this.elements.button.textContent = 'Parar';
        this.elements.button.classList.add('stop-button');
    }
    setButtonToSendMode() {
        this.elements.button.textContent = 'Enviar';
        this.elements.button.classList.remove('stop-button');
    }

    // Mostra uma PRÉVIA do arquivo anexado (miniatura da imagem ou player de áudio)
    // e um botão pra remover. Puro trabalho de tela.
    handleFilePreview(event) {
        const file = event.target.files[0];
        this.elements.filePreview.innerHTML = '';        // limpa prévia anterior
        this.elements.fileSelectedName.textContent = '';

        if (!file) return;                               // nenhum arquivo? sai

        // Mostra o nome do arquivo escolhido
        this.elements.fileSelectedName.textContent = `✓ ${file.name}`;
        this.elements.fileSelectedName.classList.add('selected');

        // file.type é algo como "image/png"; split('/')[0] pega "image".
        const fileType = file.type.split('/')[0];
        const fileInfo = document.createElement('div'); // cria um <div> na memória
        fileInfo.className = 'file-info';

        if (fileType === 'image') {
            // Cria um <img> apontando pro arquivo local (URL.createObjectURL
            // gera um link temporário pro arquivo que está no navegador).
            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            img.className = 'preview-image';
            fileInfo.appendChild(img);
        } else if (fileType === 'audio') {
            const audio = document.createElement('audio');
            audio.src = URL.createObjectURL(file);
            audio.controls = true;
            audio.className = 'preview-audio';
            fileInfo.appendChild(audio);
        }

        // Botão de remover: limpa o input e a prévia ao clicar.
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-file-btn';
        removeBtn.textContent = '× Remover arquivo';
        removeBtn.onclick = () => {
            this.elements.fileInput.value = '';
            this.elements.filePreview.innerHTML = '';
            this.elements.fileSelectedName.textContent = '';
            this.elements.fileSelectedName.classList.remove('selected');
        };
        fileInfo.appendChild(removeBtn);

        this.elements.filePreview.appendChild(fileInfo); // joga tudo na tela
    }

    // Clica no input de arquivo escondido (o botão bonito dispara este clique).
    triggerFileInput() {
        this.elements.fileInput.click();
    }

    // ---- "on...": a View só REGISTRA quem deve ser avisado de cada evento. ----
    // Ela recebe um 'callback' (uma função) e o liga ao evento. QUEM decide o
    // que fazer é o Controller — a View só repassa o aviso. Isso mantém a tela
    // "burra" (só UI) e a lógica no Controller.
    onTemperatureChange(callback) {
        this.elements.temperature.addEventListener('input', callback);
    }
    onTopKChange(callback) {
        this.elements.topK.addEventListener('input', callback);
    }
    onFileChange(callback) {
        this.elements.fileInput.addEventListener('change', callback);
    }
    onFileButtonClick(callback) {
        this.elements.fileUploadBtn.addEventListener('click', callback);
    }
    onFormSubmit(callback) {
        this.elements.form.addEventListener('submit', callback);
    }
}
