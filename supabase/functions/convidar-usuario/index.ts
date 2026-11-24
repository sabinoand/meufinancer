// Convite / redefinição de senha por link. Só o administrador pode chamar.
// Não envia e-mail: devolve um link de uso único para o admin mandar (WhatsApp, e-mail...).
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PAPEIS = ["admin", "cel", "almoxarife", "fornecedor"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "Método não permitido." }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });

  // 1) quem está chamando precisa ser administrador ativo
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: quem, error: eAuth } = await admin.auth.getUser(jwt);
  if (eAuth || !quem?.user) return json({ erro: "Sessão inválida. Entre de novo." }, 401);
  const { data: eu } = await admin.from("perfis").select("papel,ativo").eq("user_id", quem.user.id).maybeSingle();
  if (!eu || eu.papel !== "admin" || !eu.ativo) return json({ erro: "Só o administrador pode fazer isso." }, 403);

  let b;
  try { b = await req.json(); } catch { return json({ erro: "Pedido inválido." }, 400); }

  let origem;
  try {
    const u = new URL(String(b.origin || ""));
    if (!(u.protocol === "https:" || u.hostname === "localhost")) throw new Error();
    origem = u.origin;
  } catch { return json({ erro: "Endereço do sistema inválido." }, 400); }

  const montar = (hash, tipo) => `${origem}/?convite=${encodeURIComponent(hash)}&tipo=${tipo}`;

  // 2) convidar usuário novo
  if (b.acao === "convidar") {
    const nome = String(b.nome || "").trim();
    const email = String(b.email || "").trim().toLowerCase();
    const papel = String(b.papel || "");
    if (!nome || nome.length > 100) return json({ erro: "Informe o nome (até 100 letras)." }, 400);
    if (!EMAIL_RE.test(email) || email.length > 254) return json({ erro: "E-mail inválido." }, 400);
    if (!PAPEIS.includes(papel)) return json({ erro: "Papel inválido." }, 400);

    let empresaId = null;
    if (papel === "fornecedor") {
      const { data: emp } = await admin.from("empresas").select("id,tipo,ativo").eq("id", b.empresa_id || "").maybeSingle();
      if (!emp || emp.tipo !== "terceirizada" || !emp.ativo) return json({ erro: "Escolha a empresa terceirizada." }, 400);
      empresaId = emp.id;
    } else if (papel === "cel" || papel === "almoxarife") {
      const { data: cel } = await admin.from("empresas").select("id").eq("tipo", "cel").eq("ativo", true).limit(1).maybeSingle();
      empresaId = cel?.id ?? null;
    }

    const { data: usado } = await admin.from("perfis").select("user_id").eq("email_contato", email).maybeSingle();
    if (usado) return json({ erro: "Já existe uma conta com esse e-mail." }, 409);

    const { data: g, error: eg } = await admin.auth.admin.generateLink({ type: "invite", email, options: { data: { nome } } });
    if (eg || !g?.user || !g?.properties?.hashed_token) {
      const jaExiste = /already|registered|exists/i.test(eg?.message || "");
      return json({ erro: jaExiste ? "Já existe uma conta com esse e-mail." : "Não foi possível criar o convite." }, jaExiste ? 409 : 500);
    }
    const id = g.user.id;
    const { error: ep } = await admin.from("perfis").update({ nome, papel, empresa_id: empresaId, email_contato: email, ativo: true }).eq("user_id", id);
    if (ep) {
      await admin.auth.admin.deleteUser(id);
      return json({ erro: "Não foi possível criar o perfil. Tente de novo." }, 500);
    }
    return json({ link: montar(g.properties.hashed_token, "invite"), email, nome, user_id: id });
  }

  // 3) novo link para quem já tem conta (convite não usado ou senha esquecida)
  if (b.acao === "redefinir") {
    const alvo = String(b.user_id || "");
    const { data: ua, error: eu2 } = await admin.auth.admin.getUserById(alvo);
    if (eu2 || !ua?.user?.email) return json({ erro: "Usuário não encontrado." }, 404);
    const { data: p } = await admin.from("perfis").select("nome").eq("user_id", alvo).maybeSingle();
    const confirmado = !!(ua.user.email_confirmed_at || ua.user.confirmed_at);
    const tipo = confirmado ? "recovery" : "invite";
    const { data: g, error: eg } = await admin.auth.admin.generateLink({ type: tipo, email: ua.user.email });
    if (eg || !g?.properties?.hashed_token) return json({ erro: "Não foi possível gerar o link." }, 500);
    return json({ link: montar(g.properties.hashed_token, tipo), email: ua.user.email, nome: p?.nome || "", user_id: alvo });
  }

  return json({ erro: "Ação inválida." }, 400);
});
