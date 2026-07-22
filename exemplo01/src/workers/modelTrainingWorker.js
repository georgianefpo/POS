// Carrega a biblioteca TensorFlow.js direto de um CDN. Depois disso, o objeto
// global `tf` fica disponível em todo este arquivo (tf.tensor1d, tf.layers, etc).
import 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js';
// Nomes das mensagens trocadas entre a página principal e este worker.
import { workerEvents } from '../events/constants.js';

console.log('Model training worker initialized');

// Guardamos o contexto e o modelo em variáveis globais para que eles SOBREVIVAM
// entre mensagens: treinamos uma vez e reaproveitamos na hora de recomendar.
let _globalCtx = {};
let _model = null;

// Peso (importância) de cada característica na recomendação. Somam 1.0.
// A categoria é o que mais importa (40%); a idade, o que menos importa (10%).
const WEIGHTS = {
    category: 0.4,
    color: 0.3,
    price: 0.2,
    age: 0.1
}

// Espreme um valor para o intervalo 0..1, para que preços (grandes) e idades
// (pequenos) fiquem na mesma escala. O `|| 1` evita divisão por zero quando
// min === max (todos os valores iguais), o que daria NaN.
const normalize = (value, min,max) => (value - min) / ((max-min) || 1)

// Descobre os "fatos gerais" dos dados que serão usados para codificar tudo:
// mínimos/máximos (para normalizar), índices de cor/categoria (para o one-hot)
// e a idade média de quem compra cada produto.
function makeContext (products, users) {

    // Idade mínima e máxima entre todos os usuários.
    const ages = users.map(u => u.age)
    const minAge = Math.min(...ages)
    const maxAge = Math.max(...ages)

    // Preço mínimo e máximo entre todos os produtos.
    const prices = products.map(p => p.price)
    const minPrice = Math.min(...prices)
    const maxPrice = Math.max(...prices)

    // Lista de cores sem repetição (new Set) e um mapa cor -> posição.
    // Ex.: { preto: 0, prata: 1, azul: 2, ... } — essa posição vira o one-hot.
    const colors = [...new Set(products.map(p => p.color))]
    const colorsIndex = Object.fromEntries(
        colors.map((color, index) => [color, index])
    )

    // Mesma ideia para as categorias: { eletrônicos: 0, vestuário: 1, ... }.
    const categories = [...new Set(products.map(p => p.category))]
    const categoriesIndex = Object.fromEntries(
        categories.map((category, index) => [category, index])
    )

    // Computar a média de idade dos compradores por produto

    // Idade "do meio", usada como chute para produtos que ninguém comprou ainda.
    const midAge = (minAge + maxAge) / 2
    const ageSums = {}   // soma das idades de quem comprou cada produto
    const ageCounts = {} // quantas pessoas compraram cada produto

    // Percorre todas as compras de todos os usuários, acumulando soma e contagem.
    users.forEach(user => {
        user.purchases.forEach( p => {
            ageSums[p.name] = (ageSums[p.name] || 0) + user.age
            ageCounts[p.name] = (ageCounts[p.name] || 0) + 1
         }
        )
    });


    // Para cada produto: idade média de quem o comprou (ou midAge se ninguém
    // comprou), já normalizada para 0..1. Ex.: "Fones" comprados por 25, 27 e 28
    // anos -> média ~26,6 -> normalizada.
    const productAvgAgeNorm = Object.fromEntries(
        products.map( product => {
           const avg = ageCounts[product.name] ? ageSums[product.name] / ageCounts[product.name] :
           midAge

           return [product.name, normalize(avg,minAge,maxAge)]
         }
        )
    )

    // Devolve tudo o que as funções de encoding vão precisar.
    return{
        products,
        users,
        colorsIndex,
        categoriesIndex,
        productAvgAgeNorm,
        minAge,
        maxAge,
        minPrice,
        maxPrice,
        numCategories: categories.length,
        numColors: colors.length,
        // Tamanho do vetor de um produto: preço + idade + categorias + cores.
        dimensions: 2 + categories.length + colors.length // age + price + categorias + cores

    }



}

// One-hot com peso: cria uma lista de zeros com um único 1 na posição `index`
// (marca um "X" na coluna certa) e multiplica tudo pelo peso da característica.
// Ex.: index=2, length=4, weight=0.4  ->  [0, 0, 0.4, 0]
const oneHotWeighted =  (index, length, weight) =>
    tf.oneHot(index, length).cast('float32').mul(weight)

// Transforma UM produto em um vetor de números (14 no total, neste dataset).
function encodeProduct (product,context){
    // Preço normalizado (0..1) multiplicado pelo peso do preço. -> 1 número
    const price = tf.tensor1d([
        normalize(
            product.price,
            context.minPrice,
            context.maxPrice
        ) * WEIGHTS.price
    ])

    // Idade média (já normalizada) de quem compra esse produto, com peso.
    // O `?? 0.5` usa 0.5 como padrão caso o produto não esteja no mapa. -> 1 número
    const age = tf.tensor1d([
        (
            context.productAvgAgeNorm[product.name] ?? 0.5
        ) * WEIGHTS.age
    ])

    // One-hot da categoria (tamanho = nº de categorias), com peso. -> 4 números
    const category = oneHotWeighted(
        context.categoriesIndex[product.category],
        context.numCategories,
        WEIGHTS.category
    )

    // One-hot da cor (tamanho = nº de cores), com peso. -> 8 números
    const color = oneHotWeighted(
        context.colorsIndex[product.color],
        context.numColors,
        WEIGHTS.color
    )

    // Cola os quatro pedaços num único vetor: [preço, idade, ...categoria, ...cor].
    return tf.concat1d([price, age, category, color])

}

// Transforma UM usuário em um vetor do mesmo tamanho de um produto (14).
function encodeUser (user,context){

    // Caso normal: o usuário É a média dos produtos que ele comprou.
    if(user.purchases && user.purchases.length){
        return tf.stack(
            user.purchases.map(product => encodeProduct(product,context))
        ) // empilha os produtos comprados
        .mean(0) // tira a média por coluna
        .reshape([
            1,
            context.dimensions
        ]) // arruma a forma → tabela 1×14
    }

    // Caso sem compras: não dá para tirar média, então usamos só a idade
    // (com peso) e zeramos categoria e cor.
    return tf.concat1d(
        [
            tf.zeros([1]),
            tf.tensor1d([
                normalize(user.age, context.minAge, context.maxAge) * WEIGHTS.age
            ]),
            tf.zeros([context.numCategories]),
            tf.zeros([context.numColors])
        ]
    ).reshape([1,context.dimensions])

}

// Constrói a rede neural, configura como ela aprende e a treina.
async function configureNeuralNetTrain(trainData){

    // Modelo sequencial: uma pilha de camadas, os dados descem de cima para baixo.
    const model = tf.sequential()

    // 1ª camada: recebe a entrada (28 números) e a expande para 128 neurônios.
    // 'relu' zera valores negativos e deixa passar os positivos.
    model.add(
        tf.layers.dense({
            inputShape: [trainData.inputDimension],
            units: 128,
            activation: 'relu'
        })
    )
    // Camadas do meio: vão afunilando a informação (128 -> 64 -> 32).
    model.add(
        tf.layers.dense({
            units: 64,
            activation: 'relu'
        })
    )
    model.add(
        tf.layers.dense({
            units: 32,
            activation: 'relu'
        })
    )
    // Camada final: 1 neurônio com 'sigmoid', que devolve uma probabilidade 0..1
    // ("chance de o usuário gostar desse produto").
    model.add(
        tf.layers.dense({
            units: 1,
            activation: 'sigmoid'
        })
    )

    // Define COMO a rede aprende antes de treinar.
    model.compile({
        optimizer: tf.train.adam(0.01), // quem ajusta os pesos; 0.01 = tamanho do passo
        loss: 'binaryCrossentropy',     // "nota de erro" ideal para respostas sim/não
        metrics: ['accuracy']           // acompanha a % de acertos (não afeta o treino)
    })

    // Treino de verdade: olha os exemplos (xs -> ys) 100 vezes (épocas),
    // em lotes de 32, embaralhando a ordem a cada passada.
    await model.fit(trainData.xs, trainData.ys, {
        epochs: 100,
        batchSize: 32,
        shuffle: true,
        callbacks: {
            // Ao fim de cada época, envia o progresso para a página desenhar o gráfico.
            onEpochEnd: (epoch, logs) => {
                 postMessage({
                    type: workerEvents.trainingLog,
                    epoch: epoch,
                    loss: logs.loss,
                    accuracy: logs.acc
                 });
            }
        }
    })

    return model

}

// Monta os exemplos de treino: cruza cada usuário com TODOS os produtos.
function  createTrainingData (context) {
    const inputs = [] // cada item: [ ...vetorUsuário, ...vetorProduto ] (28 números)
    const labels = [] // cada item: 1 se o usuário comprou, 0 se não

    context.users
    .filter(u => u.purchases.length) // ignora usuários sem nenhuma compra
    .forEach(user => {
        // Vetor do usuário (14 números). dataSync() traz os números do tensor
        // para um array JS comum, para podermos usar o spread [...].
        const userVector = encodeUser(user, context).dataSync()

        context.products.forEach(product => {
            const productVector = encodeProduct(product, context).dataSync()
            // Resposta certa: o usuário realmente comprou este produto?
            const label = user.purchases.some(purchase => purchase.name === product.name) ? 1 : 0
            inputs.push([...userVector, ... productVector])
            labels.push(label)
        })

    })

    return {
        xs: tf.tensor2d(inputs),                        // as "perguntas" (N x 28)
        ys: tf.tensor2d(labels, [labels.length, 1]),    // as "respostas certas" (N x 1)
        inputDimension: context.dimensions * 2
        // tamanho = UserVector + ProductVector

    }
}

// Ponto de entrada do treino, disparado pela mensagem 'train:model'.
async function trainModel({ users }) {
    console.log('Training model with users:', users)

    // Avisa a página que já começamos (barra de progresso em 50%).
    postMessage({ type: workerEvents.progressUpdate, progress: { progress: 50 } });

    // VAMOS PRIMEIRO CARREGAR OS PRODUTOS EM MEMÓRIA

    const products = await ( await fetch ('/data/products.json')).json()

    // AGORA VAMOS CRIAR O CONTEXTO DOS DADOS

    const context = makeContext(products, users)

    // AGORA VAMOS TRANSFORMAR OS DADOS DO CONTEXTO EM TENSORES JS

    // Pré-calcula o vetor de cada produto e guarda junto com seus dados originais
    // (meta), para não precisar recodificar na hora de recomendar.
    context.productVectors = products.map(product => {
        return{
            name: product.name,
            meta: {...product},
            vector: encodeProduct(product,context).dataSync()
        }
    })

    _globalCtx = context // guarda o contexto para reuso nas recomendações

    const trainData = createTrainingData(context)

    _model = await configureNeuralNetTrain(trainData) // guarda o modelo treinado

    // Avisa a página: 100% e treino concluído.
    postMessage({ type: workerEvents.progressUpdate, progress: { progress: 100 } });
    postMessage({ type: workerEvents.trainingComplete });


}

// Gera as recomendações para um usuário usando o modelo já treinado.
function recommend(user, ctx) {
     if (!_model) return // sem modelo treinado, não há o que recomendar

     // Vetor do usuário (14 números).
     const userVector = encodeUser(user, ctx).dataSync()
     // Monta a entrada da rede: o usuário combinado com cada produto (28 números).
     const inputs = ctx.productVectors.map(({vector}) => {
        return [...userVector, ...vector]
     })

     const inputTensor = tf.tensor2d(inputs)

     // predict() = "não aprenda, só me dê a resposta". Uma nota por produto.
     const predictions = _model.predict(inputTensor)

     const scores = predictions.dataSync() // notas 0..1 em um array comum

     // Junta cada produto (com seus dados originais) à nota que a rede deu.
     const recomendations = ctx.productVectors.map((item, index) => {
        return {
            ...item.meta,
            name: item.name,
            score: scores[index]
        }
     })

     // Ordena do maior score para o menor: os mais recomendados primeiro.
     const sortedItems = recomendations.sort((a,b) => b.score - a.score)

     // Envia a lista pronta para a página exibir.
     postMessage({
        type: workerEvents.recommend,
        user,
        recommendations: sortedItems
     })

    console.log('will recommend for user:', user)
    // postMessage({
    //     type: workerEvents.recommend,
    //     user,
    //     recommendations: []
    // });
}


// Mapa "ação -> função": diz qual função rodar para cada tipo de mensagem.
// Evita uma pilha de if/else lá embaixo.
const handlers = {
    [workerEvents.trainModel]: trainModel,
    [workerEvents.recommend]: d => recommend(d.user, _globalCtx),
};

// A "central telefônica" do worker: toda mensagem vinda da página cai aqui.
// Lê o campo `action`, separa o resto dos dados e chama o handler correspondente.
self.onmessage = e => {
    const { action, ...data } = e.data;
    if (handlers[action]) handlers[action](data);
};
