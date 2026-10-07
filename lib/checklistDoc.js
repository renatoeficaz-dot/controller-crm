// Passos do atendimento por documentação, na ordem em que a IA pede (um por vez).
// `chave` é o que fica salvo em Contact.checklistDocumentacao e o que a IA marca ao
// receber cada item. `pedido` é o texto exato mostrado ao cliente.
//
// categorias (leitura de imagem): comprovante_residencia | documento_identidade |
// selfie_documento | rede_social | conversa_parentes | perfil_app | historico_corridas |
// documento_veiculo | selfie_veiculo | fachada | cnpj | outro
export const PASSOS_DOC = {
  uber: [
    { chave: "comprovanteResidencia", rotulo: "Comprovante de residência no seu nome", pedido: "Comprovante de residência NO SEU NOME (sendo água ou luz do mês atual)", categorias: ["comprovante_residencia"] },
    { chave: "fotoDocumento", rotulo: "Foto do documento", pedido: "Foto do documento", categorias: ["documento_identidade"] },
    { chave: "cpf", rotulo: "Número do CPF", pedido: "Número do CPF", tipo: "dado" },
    { chave: "selfieDocumento", rotulo: "Selfie segurando o documento", pedido: "Foto segurando o documento na altura do rosto (selfie)", categorias: ["selfie_documento"] },
    { chave: "redeSocial", rotulo: "Print da rede social", pedido: "Print da rede social", categorias: ["rede_social"] },
    { chave: "conversaParentes", rotulo: "Print da conversa com parentes (até 10 dias)", pedido: "Print da conversa com parentes de até 10 dias", categorias: ["conversa_parentes"] },
    { chave: "referencias", rotulo: "3 contatos de referência", pedido: "3 contatos de referência (nome e telefone de cada um)", tipo: "contatos", minimo: 3 },
    { chave: "perfilApp", rotulo: "Print do perfil da Uber/app com veículo", pedido: "Print do perfil da Uber ou app e veículo cadastrado no nome", categorias: ["perfil_app"] },
    { chave: "historicoCorridas", rotulo: "Histórico das 2 últimas semanas de corrida", pedido: "Print com histórico das 2 últimas semanas de corrida", categorias: ["historico_corridas"] },
    { chave: "documentoVeiculo", rotulo: "Documento do veículo aberto", pedido: "Documento do veículo aberto", categorias: ["documento_veiculo"] },
    { chave: "placa", rotulo: "Placa do veículo (por escrito)", pedido: "Placa do veículo, digitada por escrito (ex.: ABC1D23)", tipo: "dado" },
    { chave: "selfieVeiculo", rotulo: "Foto com o veículo mostrando a placa", pedido: "Foto com o veículo mostrando a placa (selfie)", categorias: ["selfie_veiculo"] },
    { chave: "videoCasa", rotulo: "Vídeo saindo do veículo e entrando em casa", pedido: "Vídeo saindo do veículo e entrando em casa falando a data de hoje", tipo: "video" },
    { chave: "videoApp", rotulo: "Vídeo da tela ligando e desligando o app", pedido: "Vídeo da tela ligando e desligando o app", tipo: "video" },
  ],
  comerciante: [
    { chave: "enderecoComercial", rotulo: "Endereço do comércio com CEP", pedido: "Digite o endereço do comércio completo com CEP", tipo: "dado" },
    { chave: "nomeTipoComercio", rotulo: "Nome e tipo do comércio", pedido: "Nome e tipo do comércio (ex.: Bar do João — bar)", tipo: "dado" },
    { chave: "cpf", rotulo: "Número do CPF", pedido: "Número do CPF", tipo: "dado" },
    { chave: "cnpj", rotulo: "Número do CNPJ", pedido: "Número do CNPJ", tipo: "dado" },
    { chave: "fotoDocumento", rotulo: "Foto do documento", pedido: "Foto do documento", categorias: ["documento_identidade"] },
    { chave: "selfieDocumento", rotulo: "Selfie segurando o documento", pedido: "Foto segurando o documento na altura do rosto (selfie)", categorias: ["selfie_documento"] },
    { chave: "redeSocial", rotulo: "Print da rede social do comércio ou foto da fachada", pedido: "Print da rede social do comércio ou foto da fachada", categorias: ["rede_social", "fachada"] },
    { chave: "conversaParentes", rotulo: "Print da conversa com parentes (até 10 dias)", pedido: "Print da conversa com parentes de até 10 dias", categorias: ["conversa_parentes"] },
    { chave: "referencias", rotulo: "3 contatos de referência + contato do comércio", pedido: "3 contatos de referência + contato do comércio (nome e telefone de cada um)", tipo: "contatos", minimo: 4 },
    { chave: "enderecoResidencial", rotulo: "Endereço residencial", pedido: "Seu endereço residencial", tipo: "dado" },
    { chave: "videoEstabelecimento", rotulo: "Vídeo no estabelecimento", pedido: "Vídeo no estabelecimento falando: olá pessoal da Capcred, sou dono do [nome do estabelecimento] e estou aqui hoje precisando de algo pode chamar!", tipo: "video" },
  ],
};

// Lista [chave, rótulo] usada pela ficha (Kanban e Chat). Motoboy segue a lista de motorista.
// "cpfCnpj" é um passo composto: na ficha aparece como CPF e CNPJ separados.
function paraFicha(passos) {
  return passos.flatMap((p) => (p.compostoDe ? p.compostoDe.map((c) => [c, c.toUpperCase()]) : [[p.chave, p.rotulo]]));
}
export const CHECKLIST_DOC = {
  comerciante: paraFicha(PASSOS_DOC.comerciante),
  uber: paraFicha(PASSOS_DOC.uber),
};
