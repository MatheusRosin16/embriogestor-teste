/*
============================================================
CATÁLOGOS DO EMBRIOGESTOR
============================================================
Todos os catálogos são editáveis pelo sistema.

A ideia é que estes sejam os valores iniciais.
O usuário poderá acrescentar novos itens posteriormente.
*/


// ============================================================
// RAÇAS BOVINAS
// ============================================================

const RACAS_INICIAIS = [

    // Zebuínas
    "Brahman",
    "Gir",
    "Gir Leiteiro",
    "Guzerá",
    "Indubrasil",
    "Nelore",
    "Nelore Mocho",
    "Nelore Pelagens",
    "Sindi",
    "Tabapuã",

    // Taurinas europeias - corte
    "Aberdeen Angus",
    "Red Angus",
    "Hereford",
    "Polled Hereford",
    "Shorthorn",
    "Charolês",
    "Limousin",
    "Piemontês",
    "Marchigiana",
    "Chianina",
    "Romagnola",
    "Blonde d'Aquitaine",
    "Belgian Blue",
    "Salers",
    "Devon",
    "Galloway",
    "Highland",
    "Wagyu",
    "Akaushi",
    "Bazadaise",
    "Gasconne",
    "Parthenaise",
    "Normande",
    "Aubrac",
    "Bazadaise",
    "Tarentaise",

    // Taurinas europeias - leite
    "Holandesa",
    "Holandês",
    "Jersey",
    "Pardo-Suíça",
    "Brown Swiss",
    "Guernsey",
    "Ayrshire",
    "Shorthorn Leiteiro",
    "Milking Shorthorn",
    "Montbéliarde",
    "Fleckvieh",
    "Simmental",
    "Simental",
    "Normanda",
    "Norueguesa Vermelha",
    "Red Danish",
    "Swedish Red",
    "Holstein",

    // Raças adaptadas / tropicais
    "Caracu",
    "Curraleiro Pé-Duro",
    "Pantaneiro",
    "Crioulo Lageano",
    "Lageano",
    "Maine-Anjou",
    "Senepol",
    "Romosinuano",
    "Tuli",
    "Africander",
    "Bonsmara",
    "Nguni",
    "Drakensberger",

    // Sintéticas / compostas
    "Brangus",
    "Braford",
    "Canchim",
    "Girolando",
    "Guzolando",
    "Santa Gertrudis",
    "Beefmaster",
    "Droughtmaster",
    "Simbrah",
    "Brahmousin",
    "Canchim Leiteiro",
    "Senangus",
    "Montana",
    "Purunã",
    "Lavínia",
    "Ibagé",

    // Raças africanas / indianas / asiáticas
    "Guzerá",
    "Sahiwal",
    "Red Sindhi",
    "Kankrej",
    "Hariana",
    "Tharparkar",
    "Ongole",
    "Gir Mocho",
    "Nelore Mocho",

    // Outras
    "Dexter",
    "Pinzgauer",
    "Murray Grey",
    "Beef Shorthorn",
    "Blonde d'Aquitaine",
    "Lincoln Red",
    "Welsh Black",
    "South Devon",
    "British White",
    "Belmont Red",
    "Danish Red",
    "Dutch Belted",
    "Fleckvieh",
    "Gelbvieh",
    "Brown Swiss",
    "Vorderwald",
    "Original Braunvieh",
    "Rätisches Grauvieh",
    "Texas Longhorn",

    // Opção para cadastro manual
    "Outra"

];


// ============================================================
// CENTRAIS / EMPRESAS DE GENÉTICA
// ============================================================

const CENTRAIS_INICIAIS = [

    "ABS Global / ABS Pecplan",
    "Alta Genetics",
    "CRV",
    "Central Bela Vista",
    "Semex Brasil",
    "Central Tairana",
    "STgenetics",
    "Select Sires",
    "Genex",
    "Accelerated Genetics",
    "Araucária Genética Bovina",
    "Genética Aditiva",
    "Programa PAINT",
    "Nova Geração",
    "Brasif",
    "In Vitro Brasil",
    "ABS",
    "Alta",
    "CRV Lagoa",
    "Semex",
    "Outra"

];


// ============================================================
// PROFISSÕES
// ============================================================

const PROFISSOES_INICIAIS = [

    "Médico(a) Veterinário(a)",

    "Zootecnista",

    "Biólogo(a)",

    "Técnico(a) em Agropecuária",

    "Técnico(a) em Veterinária",

    "Embriologista",

    "Responsável Técnico",

    "Auxiliar de Laboratório",

    "Auxiliar de Reprodução Animal",

    "Inseminador(a)",

    "Coletador(a) de Oócitos",

    "Técnico(a) de Campo",

    "Supervisor(a) de Laboratório",

    "Gerente de Laboratório",

    "Administrador(a)",

    "Assistente Administrativo",

    "Secretário(a)",

    "Outro"

];


// ============================================================
// CATEGORIAS DAS DOADORAS
// ============================================================

const CATEGORIAS_DOADORAS = [

    "Vaca",
    "Bezerra",
    "Novilha",
    "Primípara"

];


// ============================================================
// STATUS DA DOADORA
// ============================================================

const STATUS_DOADORA = [

    "Ativo",
    "Inativo"

];


// ============================================================
// QUALIDADE DOS OÓCITOS
// ============================================================

const QUALIDADES_OOCITOS = [

    "Grau 1",
    "Grau 2",
    "Grau 3",
    "Grau 4",
    "Grau 5",
    "Degenerado",
    "Não classificável"

];


// ============================================================
// CLASSIFICAÇÃO DOS EMBRIÕES D7
// ============================================================

const GRAUS_EMBRIOES_D7 = [

    "Grau 1 - Excelente",
    "Grau 2 - Bom",
    "Grau 3 - Regular",
    "Grau 4 - Ruim",
    "Degenerado",
    "Não classificável"

];


// ============================================================
// ESTÁGIO DO EMBRIÃO D7
// ============================================================

const ESTAGIOS_EMBRIAO_D7 = [

    "Mórula",
    "Mórula compacta",
    "Blastocisto inicial",
    "Blastocisto",
    "Blastocisto expandido",
    "Blastocisto eclodido",
    "Eclodido"

];


// ============================================================
// DESTINO DO EMBRIÃO
// ============================================================

const DESTINOS_EMBRIAO = [

    "TRANSFERENCIA A FRESCO",
    "TRANSFERENCIA DT",
    "TRANSFERENCIA VT",
    "DESCARTADO"

];


// ============================================================
// DIAGNÓSTICOS
// ============================================================

const DIAGNOSTICOS = [

    "Pendente",
    "Prenhe",
    "Vazia",
    "Perda gestacional",
    "Reabsorção",
    "Morte embrionária",
    "Aborto",
    "Não avaliada"

];