// Seções do menu lateral de cada módulo. {h} = título de grupo, {k,n} = item.
const EST = [{ k: "estoque", n: "Estoque" }, { k: "historico", n: "Histórico" }];
export const SECOES = {
  estoque: EST, materia: EST, almoxarifado: EST,
  fichas: [{ k: "fichas", n: "Fichas das cadeiras" }, { k: "calcular", n: "Calcular pedidos" }],
  rh: [
    { k: "visao", n: "Visão geral" },
    { h: "Equipe" }, { k: "func", n: "Funcionários" }, { k: "setores", n: "Setores" },
    { h: "Contratações e demissões" }, { k: "turn", n: "Turnover" }, { k: "adm", n: "Contratações" }, { k: "des", n: "Demissões" },
    { h: "Experiência" }, { k: "exp", n: "Em andamento" }, { k: "exp_hist", n: "Avaliados" },
    { h: "Ausências" }, { k: "aus", n: "Atestados e faltas" },
    { h: "Saúde e segurança" }, { k: "exames", n: "Exames" }, { k: "epi", n: "Controle de EPI" }, { k: "epi_fichas", n: "Fichas de entrega" }, { k: "epi_tipos", n: "Tipos de EPI" },
    { h: "Ponto" }, { k: "ponto", n: "Cartão individual" }, { k: "ponto_res", n: "Resumo do mês" },
    { h: "Dinheiro" }, { k: "folha", n: "Folha do mês" }, { k: "vales", n: "Vales" }, { k: "dec", n: "13º salário" }
  ]
};
export const tituloSecao = (mod, k) => (SECOES[mod] || []).find(x => x.k === k)?.n || "";
