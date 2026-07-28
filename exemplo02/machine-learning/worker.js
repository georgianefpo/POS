/* =============================================================================
 * worker.js — OS "OLHOS" DO BOT
 * =============================================================================
 *
 * A ideia em uma frase:
 *   Recebe uma FOTO da tela do jogo e devolve ONDE está o pato (x, y).
 *
 * Assim como no exemplo01 e no movie_rating, vale a regra de ouro:
 *   >> Rede neural nao entende imagem. So entende NUMEROS (tensores). <<
 *   Por isso, metade do trabalho aqui e "traduzir" a foto para o formato
 *   de numeros que o modelo espera (o pre-processamento), rodar o modelo,
 *   e depois "traduzir de volta" os numeros que ele devolve em coordenadas.
 *
 * Por que isto roda num Web Worker?
 *   Rodar uma rede neural e pesado. Se rodasse na pagina principal, o jogo
 *   travaria a cada frame. O worker e uma "linha de execucao separada": faz
 *   o trabalho pesado no fundo e conversa com o jogo so por MENSAGENS
 *   (postMessage / onmessage). Guarde esses dois nomes — voltamos neles no fim.
 * ========================================================================== */


// importScripts carrega a biblioteca TensorFlow.js dentro do worker. Ela nos da
// o objeto global `tf`, com tudo pra criar tensores e rodar o modelo na GPU.
importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@latest');

// --- Configuracao ----------------------------------------------------------
const MODEL_PATH = `yolov5n_web_model/model.json`;   // o modelo YOLOv5n ja treinado
const LABELS_PATH = `yolov5n_web_model/labels.json`; // os nomes das classes que ele conhece
const INPUT_MODEL_DIMENTIONS = 640                   // o YOLO exige a imagem em 640x640
const CLASS_THRESHOLD = 0.4;                         // confianca minima p/ aceitar uma deteccao (40%)

// Estado global do worker: preenchidos uma vez, quando o modelo carrega.
let _labels = []    // ex.: ['person', 'bicycle', ..., 'kite', ...] (as 80 classes do COCO)
let _model = null   // a rede neural em si, pronta pra "prever"


/* -----------------------------------------------------------------------------
 * loadModelAndLabels — LIGAR OS OLHOS (roda uma vez, no inicio)
 * ---------------------------------------------------------------------------
 * O YOLOv5n e um detector de objetos PRE-TREINADO (no dataset COCO). Ele nao
 * foi treinado com "patos" — a sacada do exercicio e que o pato pixelado acaba
 * sendo reconhecido como a classe 'kite' (pipa). Nao precisamos treinar nada:
 * so carregamos o modelo pronto e usamos.
 * -------------------------------------------------------------------------- */
async function loadModelAndLabels() {
    await tf.ready()  // espera o TensorFlow escolher e ligar o backend (WebGL/GPU)

    // Baixa a lista de nomes das classes e o modelo (a arquitetura + os pesos ja aprendidos).
    _labels = await (await fetch(LABELS_PATH)).json()
    _model = await tf.loadGraphModel(MODEL_PATH)

    // "warmup" (aquecimento): roda o modelo uma vez com uma imagem falsa (so 1s).
    // A primeira inferencia sempre e a mais lenta (a GPU compila os shaders);
    // fazer isso agora evita um engasgo no primeiro frame de verdade.
    const dummyInput = tf.ones(_model.inputs[0].shape)
    await _model.executeAsync(dummyInput)
    tf.dispose(dummyInput)  // libera a imagem falsa da memoria da GPU

    // Avisa a pagina: "modelo carregado, pode mandar frames".
    postMessage({ type: 'model-loaded' })
}


/* -----------------------------------------------------------------------------
 * preprocessImage — TRADUZIR A FOTO PARA "NUMEROS" (o encoding da imagem)
 * ---------------------------------------------------------------------------
 * O modelo nao aceita uma foto crua; ele exige um TENSOR num formato exato.
 * Tensor = o nome que o TensorFlow da pra uma lista/matriz de numeros turbinada
 * pra fazer contas rapido na GPU. Aqui montamos esse tensor em 4 passos:
 *
 *   1. tf.browser.fromPixels(): le os pixels da imagem -> tensor [altura, largura, 3]
 *      (o "3" sao os canais R, G, B de cada pixel)
 *   2. resizeBilinear(...640x640): o YOLO SO aceita 640x640, entao redimensiona
 *   3. .div(255): cada cor vem de 0 a 255; dividir por 255 "espreme" tudo pra
 *      o intervalo [0, 1]. Isso e a NORMALIZACAO — a mesma ideia dos outros
 *      exemplos: deixar os numeros numa escala justa pro modelo.
 *   4. .expandDims(0): o modelo espera um "lote" (batch) de imagens, mesmo que
 *      seja so uma. Isso adiciona uma dimensao na frente -> [1, 640, 640, 3].
 *
 * tf.tidy(): um "faxineiro automatico". Todo tensor temporario criado la dentro
 * e descartado ao final, menos o que a gente retorna. Sem isso, cada frame
 * deixaria lixo na GPU (vazamento de memoria).
 * -------------------------------------------------------------------------- */
function preprocessImage(input) {
    return tf.tidy(() => {
        const image = tf.browser.fromPixels(input)

        return tf.image
            .resizeBilinear(image, [INPUT_MODEL_DIMENTIONS, INPUT_MODEL_DIMENTIONS])
            .div(255)
            .expandDims(0)
    })
}


/* -----------------------------------------------------------------------------
 * runInference — PERGUNTAR AO MODELO "o que voce ve?"
 * ---------------------------------------------------------------------------
 * Entrega o tensor da imagem ao modelo e recebe a resposta. O YOLO devolve
 * VARIOS tensores; os 3 primeiros que nos interessam sao:
 *   - boxes:   as caixas (retangulos) de cada objeto detectado
 *   - scores:  a confianca (0 a 1) de cada deteccao
 *   - classes: qual classe (indice) e cada deteccao
 *
 * Detalhe importante de memoria (GPU):
 *   - .data() PUXA os numeros de dentro do tensor pra um array JS normal
 *     (sai da GPU e vai pra CPU) — assim conseguimos fazer laços com eles depois.
 *   - .dispose() LIBERA cada tensor da GPU. Se nao liberarmos, a memoria estoura.
 * -------------------------------------------------------------------------- */
async function runInference(tensor) {
    const output = await _model.executeAsync(tensor)  // roda a rede (aqui mora o custo)
    tf.dispose(tensor)  // ja podemos jogar fora o tensor da imagem de entrada

    // Assume que as 3 primeiras saidas sao: caixas (boxes), pontuacoes (scores) e classes.
    const [boxes, scores, classes] = output.slice(0, 3)

    // Puxa os 3 de uma vez (em paralelo) pra arrays JS comuns.
    const [boxesData, scoresData, classesData] = await Promise.all(
        [
            boxes.data(),
            scores.data(),
            classes.data(),
        ]
    )

    output.forEach(t => t.dispose())  // libera TODOS os tensores de saida da GPU

    return {
        boxes: boxesData,
        scores: scoresData,
        classes: classesData
    }
}


/* -----------------------------------------------------------------------------
 * processPrediction — TRADUZIR OS NUMEROS DE VOLTA EM "onde atirar"
 * ---------------------------------------------------------------------------
 * Aqui filtramos e transformamos as deteccoes cruas em coordenadas uteis.
 * Para cada deteccao:
 *   1. Ignora as de baixa confianca (score < CLASS_THRESHOLD).
 *   2. Ignora tudo que nao for 'kite' (a "fantasia" do pato). E o unico objeto
 *      voador do jogo, entao filtrar por essa classe basta.
 *   3. As caixas vem NORMALIZADAS (valores de 0 a 1). Multiplicar por width/height
 *      converte de volta pra PIXELS reais da imagem.
 *   4. Calcula o CENTRO da caixa (x1 + metade da largura) — e nele que miramos.
 *
 * function* + yield (generator): em vez de montar uma lista e retornar no fim,
 * o generator "entrega" cada pato assim que fica pronto. Quem consome (o laco
 * la embaixo) recebe um de cada vez — simples e sem lista intermediaria.
 * -------------------------------------------------------------------------- */
function * processPrediction({boxes, scores, classes}, width, height) {
    for (let index = 0; index < scores.length; index++){
        if (scores[index] < CLASS_THRESHOLD) continue   // confianca baixa demais -> pula

        const label = _labels[classes[index]]
        if (label !== 'kite') continue                  // nao e o pato (kite) -> pula

        // boxes e um array "achatado": [x1,y1,x2,y2, x1,y1,x2,y2, ...].
        // slice pega os 4 numeros desta deteccao (os cantos do retangulo).
        let [x1,y1,x2,y2] = boxes.slice(index * 4, (index +1) * 4)

        // de coordenadas normalizadas (0..1) para pixels reais da imagem
        x1 *= width
        x2 *= width
        y1 *= height
        y2 *= height

        // centro do retangulo = canto superior-esquerdo + metade do tamanho
        const boxWidth = x2 - x1
        const boxHeight = y2 - y1
        const centerX = x1 + boxWidth / 2
        const centerY = y1 + boxHeight / 2

        yield {
            x: centerX,
            y: centerY,
            score: (scores[index] * 100).toFixed(2)  // confianca em % (ex.: "87.34")
        }
    }
}


// Dispara o carregamento do modelo assim que o worker nasce.
loadModelAndLabels()


/* =============================================================================
 * onmessage — A "CENTRAL TELEFONICA" (onde tudo se conecta)
 * =============================================================================
 * E aqui que o worker OUVE a pagina. O jogo manda, a cada ~200ms, uma foto da
 * tela com { type: 'predict', image: <bitmap> }. Para cada foto, o worker:
 *   pre-processa -> roda o modelo -> extrai os patos -> responde cada um com
 *   postMessage({ type: 'prediction', x, y, score }).
 *
 * A trava `_busy` (economia de memoria da GPU):
 *   Rodar o modelo demora. Se um novo frame chega enquanto o anterior ainda
 *   esta sendo processado, NAO comecamos outra inferencia em paralelo — isso
 *   empilharia tensores na GPU ate estourar (aquele aviso "High memory usage").
 *   Em vez disso, descartamos o frame novo (e liberamos o bitmap com .close()).
 *   Assim so existe UMA inferencia por vez.
 * ========================================================================== */
let _busy = false
self.onmessage = async ({ data }) => {
    if (data.type !== 'predict') return

    // Modelo ainda carregando OU ja tem inferencia rodando -> descarta este frame.
    if (!_model || _busy) {
        data.image.close?.()  // libera o bitmap descartado da memoria
        return
    }

    _busy = true
    try {
        const input = preprocessImage(data.image)   // foto -> tensor
        const { width, height } = data.image        // guarda o tamanho real p/ desnormalizar

        const inferenceResults = await runInference(input)  // roda a rede

        // Para cada pato encontrado, avisa a pagina onde ele esta.
        for (const prediction of processPrediction(inferenceResults, width, height)) {
            postMessage({
                type: 'prediction',
                ...prediction
            })
        }
    } finally {
        data.image.close?.()  // libera o bitmap deste frame
        _busy = false         // libera a trava para o proximo frame
    }
};

console.log('🧠 YOLOv5n Web Worker initialized');
