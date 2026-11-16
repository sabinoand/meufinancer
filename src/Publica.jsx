import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { supabase } from "./supabaseClient.js";

const css = `
body{margin:0;background:#0b1b4d;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.pub{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
.pub .box{background:#fff;border-radius:18px;max-width:420px;width:100%;overflow:hidden}
.pub img.logo{width:100%;display:block}
.pub .in{padding:20px;display:grid;gap:12px}
.pub h1{margin:0;font-size:20px}.pub .m{color:#6b7385;font-size:14px}
.pub .info{background:#f1f4fb;border-radius:12px;padding:12px;font-size:15px;line-height:1.6}
.stars{display:flex;gap:6px;justify-content:center}
.stars button{background:none;border:0;cursor:pointer;padding:2px}
.pub textarea,.pub input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #d5d9e2;border-radius:8px;font-size:15px;font-family:inherit}
.pub .go{border:0;border-radius:10px;background:#1d4ed8;color:#fff;font-size:16px;padding:12px;cursor:pointer}
.pub .go:disabled{opacity:.5}.pub .err{background:#fde8e8;color:#b42318;padding:8px 12px;border-radius:8px;font-size:14px}
.pub .ok{background:#dcfce7;color:#166534;padding:12px;border-radius:10px;text-align:center}
`;

export default function Publica({ token }) {
  const [info, setInfo] = useState(undefined);
  const [nota, setNota] = useState(0);
  const [coment, setComent] = useState("");
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.rpc("etiqueta_publica", { p_token: token }).then(({ data, error }) => {
      if (error) setErro("Não foi possível carregar. Tente novamente."); 
      setInfo(data || null);
    });
  }, [token]);

  async function enviar() {
    if (!nota) return setErro("Toque nas estrelas para escolher a nota.");
    setBusy(true); setErro("");
    const { error } = await supabase.rpc("avaliar_etiqueta", { p_token: token, p_nota: nota, p_comentario: coment, p_avaliador: nome });
    setBusy(false);
    if (error) return setErro(error.message);
    setEnviado(true);
  }

  return (
    <div className="pub">
      <style>{css}</style>
      <div className="box">
        <img className="logo" src="/logo.jpg" alt="GestCel" />
        <div className="in">
          {info === undefined && <span className="m">Carregando...</span>}
          {info === null && <div className="err">{erro || "Etiqueta não encontrada."}</div>}
          {info && (
            <>
              <h1>Produto fabricado por</h1>
              <div className="info">
                <strong style={{ fontSize: 18 }}>{info.empresa}</strong><br />
                {info.cadeira} · {info.cor}<br />
                <span className="m">Pedido #{info.pedido} · {new Date(info.fabricada_em).toLocaleDateString("pt-BR")}</span>
              </div>
              {(info.avaliada || enviado) ? (
                <div className="ok">{enviado ? "Obrigado pela sua avaliação!" : `Este produto já foi avaliado (${info.nota} de 5).`}</div>
              ) : (
                <>
                  <div className="m" style={{ textAlign: "center" }}>Como você avalia este produto?</div>
                  <div className="stars">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} onClick={() => setNota(n)} aria-label={`${n} estrelas`}>
                        <Star size={38} color="#f59e0b" fill={n <= nota ? "#f59e0b" : "none"} />
                      </button>
                    ))}
                  </div>
                  <textarea rows="3" placeholder="Comentário (opcional)" value={coment} onChange={e => setComent(e.target.value)} />
                  <input placeholder="Seu nome (opcional)" value={nome} onChange={e => setNome(e.target.value)} />
                  {erro && <div className="err">{erro}</div>}
                  <button className="go" disabled={busy} onClick={enviar}>{busy ? "Enviando..." : "Enviar avaliação"}</button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
