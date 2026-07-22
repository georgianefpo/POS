import tf, { callbacks, losses } from '@tensorflow/tfjs-node';

async function trainModel (inputXs,outputYs) {
    // Camada de fluxo sequencial
    // O tf.sequential() cria o "esqueleto" do seu modelo de rede neural — uma pilha de camadas onde os dados passam em sequência, uma camada de cada vez, de cima para baixo.
    // Pense numa linha de montagem de fábrica:
    // Entrada → [Estação 1] → [Estação 2] → [Estação 3] → Saída
    // Cada estação (camada) recebe o resultado da anterior, faz o seu trabalho, e passa adiante. Nunca volta pra trás, nunca pula etapas — é sempre em sequência. Por isso o nome sequential.
    const model = tf.sequential() // Isso cria um modelo vazio, sem nenhuma camada ainda. 

    //Primeira camada

    // model.add(...)
    // "Instala uma nova estação na sua linha de montagem." Cada model.add empilha uma camada.
    
    // tf.layers.dense({...})
    // Cria uma camada "densa" (também chamada fully connected / totalmente conectada). "Densa" significa que cada neurônio dessa camada se conecta com TODOS os dados que chegam.
    //        ┌─ neurônio 1
    //entrada ─┼─ neurônio 2   ← cada entrada liga em cada neurônio
    //        └─ neurônio 3
    //             ...

    // inputShape - entrada com 7 posições (idade + 3 cores + 3 localidades)
    // Diz à rede: "cada exemplo que vou receber tem 7 números".
    // Importante: só a primeira camada precisa de inputShape. As próximas descobrem sozinhas, olhando a camada anterior.
    
    // units - 80 neurônios pq tem pouca base de treino 
    // quanto mais neurônios, mas complexidade a rede pode aprender 
    // e consequentimente mais processamento ela vai usar
    // São 80 "mini-calculadoras" trabalhando em paralelo, cada uma tentando aprender um padrão diferente dos dados.

    // activation - ReLu age como um filtro é como se ela deixasse apenas os dados interessantes seguirem viagem na rede
    // Se informação chegou nesse neurônio é positiva passa pra frente
    // Se for 0 ou negativa, pode jogar fora
    //
    model.add(tf.layers.dense({inputShape:[7], units:80, activation: 'relu'}))

    // Camada de Saida
    // 3 neuronios - um para cada categoria (premium, medium, basic)

    // activation: softmax - normaliza a saida em probabilidades
    model.add(tf.layers.dense({units:3, activation: 'softmax'}))

    // Agora vamos compilar o modelo - preparar o modelo e falar pra ele como
    // ele vai otimizar e qual vai ser o processo qu e ele vai usar para realmente 
    // aprender em cima destes padrões
    // O model.compile(...) é o passo que prepara o modelo para aprender. 
    // Até aqui você só montou a estrutura (as camadas). 
    // Compilar é definir as regras do treino: como o modelo vai medir seus erros e como vai se corrigir.

    // optimizer: 'adam' - treinador pessoal moderno para redes neurais 
    // ajustas os pesos de forma eficiente e inteligente 
    // ele vai aprender com o historico de erros e acertos 
    // o personal trainer que corrige com base no que o juiz apontou

    // loss - ele que vai executar o algoritmo
    // dado que acertei mantem esses dados, dado q eu errei descarta
    // categoricalCrossentropy - ele compara o que o modelo acha (os scores de cada categoria)
    // com a resposta certa
    // o juiz que aponta o quão errado ele está

    // metrics: 'accuracy' - vai dizer o quanto está dando certo ou errado
    // quando mais distante da previsão do modelo da resposta correta
    // maior o erro (loss)
    // Exemplo classico: classificação de imagem, recomendação, categorização de usuário
    // Qualquer coisa em que a resposta certa é apenas uma dentre varias possiveis 

    model.compile({
        optimizer: 'adam', // personal trainer
        loss: 'categoricalCrossentropy', // juiz
        metrics: 'accuracy' // placar
    })

    // Trreinamento do modelo 

    model.fit(
        inputXs,
        outputYs,
        {
            verbose: 0, // Não quero que mostre um monte de log automaticamente
            epochs: 100, // Vai passar 100x por toda nossa base de dados
            shuffle: true, // cada treinamento que ele fizer ele vai inverter a ordem
            // callbacks: {
            //     onEpochEnd: (epoch,log) => console.log(
            //         `Epoch: ${epoch}: loss = ${log.loss}`
            //     )
                
            // }
        }
        
    )

    return model

}

async function predict(model, pessoa){

    const tfImput = tf.tensor2d(pessoa) // Converte os dados da pessoa (um array JS comum) para tensor, que é o único formato que o modelo entende

    const predict = model.predict(tfImput) // O momento principal: o modelo passa a pessoa pelas camadas e devolve a previsão — aquelas 3 probabilidades do softmax:

    const predArray = await predict.array() // O resultado do predict ainda é um tensor. Essa linha o converte de volta para um array JavaScript normal, que você consegue ler e manipular

    return predArray[0].map( (prob,index) => ({prob,index}) ) // Pega o array de probabilidades e transforma cada número em um objeto que também guarda a posição (index)

    //     predArray[0] = [0.80, 0.15, 0.05]

    // vira:
    // [
    //   { prob: 0.80, index: 0 },   // premium
    //   { prob: 0.15, index: 1 },   // medium
    //   { prob: 0.05, index: 2 }    // basic
    // ]


}

// Exemplo de pessoas para treino (cada pessoa com idade, cor e localização)
// const pessoas = [
//     { nome: "Erick", idade: 30, cor: "azul", localizacao: "São Paulo" },
//     { nome: "Ana", idade: 25, cor: "vermelho", localizacao: "Rio" },
//     { nome: "Carlos", idade: 40, cor: "verde", localizacao: "Curitiba" }
// ];

// Vetores de entrada com valores já normalizados e one-hot encoded
// Ordem: [idade_normalizada, azul, vermelho, verde, São Paulo, Rio, Curitiba]
// const tensorPessoas = [
//     [0.33, 1, 0, 0, 1, 0, 0], // Erick
//     [0, 0, 1, 0, 0, 1, 0],    // Ana
//     [1, 0, 0, 1, 0, 0, 1]     // Carlos
// ]

// Usamos apenas os dados numéricos, como a rede neural só entende números.
// tensorPessoasNormalizado corresponde ao dataset de entrada do modelo.
const tensorPessoasNormalizado = [
    [0.33, 1, 0, 0, 1, 0, 0], // Erick
    [0, 0, 1, 0, 0, 1, 0],    // Ana
    [1, 0, 0, 1, 0, 0, 1]     // Carlos
]

// Labels das categorias a serem previstas (one-hot encoded)
// [premium, medium, basic]
const labelsNomes = ["premium", "medium", "basic"]; // Ordem dos labels
const tensorLabels = [
    [1, 0, 0], // premium - Erick
    [0, 1, 0], // medium - Ana
    [0, 0, 1]  // basic - Carlos
];

// Criamos tensores de entrada (xs) e saída (ys) para treinar o modelo
// O tf.tensor2d transforma um array JavaScript comum em uma matriz que o TensorFlow entende — um "tensor" de 2 dimensões (uma tabela com linhas e colunas).
// tf.tensor2d = "pegue esta tabela de números e converta para o formato que o TensorFlow usa para treinar o modelo".
const inputXs = tf.tensor2d(tensorPessoasNormalizado)
const outputYs = tf.tensor2d(tensorLabels)

// Vamos então começar a fazer o treinamento 

const model = await trainModel (inputXs,outputYs)

// Agora fornecer uma nova pessoa para ele dizer qual categoria seria ela de acordo com a 
// base de dados 

const pessoa = {
    nome: 'José',
    idade: 28,
    cor: 'verde',
    localizacao: 'Curitiba'
}

// Normalizando a idade de nova pessoa usando o mesmo padrão do treino
// Exemplo: idade_min = 25, idade_max = 40, então (28 - 25) / (40 - 25) = 0.2
const pessoaTensorNormalizada = [
    [0.2, 0, 0, 1, 0, 0, 1] 
]

const predictions = await predict (model,pessoaTensorNormalizada)

const results = predictions
    .sort((a,b) => b.prob - a.prob) // O truque b.prob - a.prob é o que dá a ordem decrescente. Se fosse a.prob - b.prob, seria crescente (menor primeiro). Aqui você quer o "vencedor" no topo.
    .map(p => `${labelsNomes[p.index]} (${(p.prob * 100).toFixed(2)} %)`)
    .join('\n')

console.log(results)

// inputXs.print();
// outputYs.print(); 