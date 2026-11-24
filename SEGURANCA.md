# Relatório de segurança — GestCel v0.20.0

Auditoria dos 27 itens do checklist. Legenda: CORRIGIDO / OK / PLATAFORMA / N/A / ATENÇÃO (ação sua).

## Falhas encontradas e corrigidas
1. Papel `anon` tinha privilégio de SELECT/INSERT/UPDATE/DELETE em todas as tabelas (só o RLS segurava). CORRIGIDO: revogado (migração 18); novos objetos também nascem sem acesso anon.
2. 22 funções (RPC) executáveis sem login (`/rest/v1/rpc/...`). CORRIGIDO: só `email_for_username`, `etiqueta_publica` e `avaliar_etiqueta` ficam públicas (necessárias ao login e à etiqueta do QR). Todas as demais exigem login e já checam o papel por dentro.
3. `handle_new_user`, `req_protegida`, `req_item_protegido` chamáveis como RPC. CORRIGIDO: revogado (são só gatilhos). `recalcular_item` também fechada.
4. `req_protegida` e `req_item_protegido` sem `search_path` fixo. CORRIGIDO.
5. Sem cabeçalhos de segurança no site. CORRIGIDO: `vercel.json` com CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy. Testado: login renderiza sem violações de CSP.
6. Senha mínima de 6. CORRIGIDO: cadastro exige 8+, letras e números, sem conter o usuário (login antigo continua funcionando).
7. Upload de XML sem limite. CORRIGIDO: máx. 2 MB e só .xml.
8. `avaliar_etiqueta` sem validar tamanho do token. CORRIGIDO.

## O que já estava correto
- RLS ligado nas 36 tabelas; políticas só para `authenticated`; isolamento por empresa/papel. Testado com PGlite entre empresas.
- Papel do novo usuário nunca vem do cadastro (primeiro = admin, resto = pendente). Escalada de privilégio impossível via metadata.
- Nenhuma chave secreta no código; só a anon key (pública por desenho) via variáveis VITE_; `.env` no .gitignore; sem sourcemaps.
- Sem `dangerouslySetInnerHTML`/eval; React escapa a saída (XSS). Sem SQL montado por concatenação (injeção). Sem console.log.
- CSRF: não se aplica (token no header Authorization, não em cookie). Senhas: bcrypt do Supabase Auth.

## Plataforma / não se aplica
- HTTPS/HSTS: Vercel. Rate limit de login/cadastro: Supabase Auth. CORS: API do Supabase, protegida por RLS. Pagamentos: não existe. Recuperação de senha por link: não existe (admin redefine).

## ATENÇÃO — ações suas (não consigo fazer daqui)
1. Supabase → Authentication → Sign In / Providers → Password: ative "Prevent use of leaked passwords" e coloque mínimo 8 (se o plano permitir).
2. Rode `npm audit`: sobra 1 alerta moderado/alto do esbuild/vite que afeta SÓ o servidor de desenvolvimento (`npm run dev`), não o site publicado. Não rode `npm run dev` em redes públicas; atualizar o vite exigiria salto de versão maior.
3. Se algum dia colou chave `service_role` ou `sb_secret` em chat/repositório, gere outra no Supabase (Settings → API).
4. Os avisos "SECURITY DEFINER executável por usuário logado" do linter continuam: são as funções do sistema, intencionais.
5. `email_for_username` permite descobrir se um usuário existe (necessário para login por usuário). Risco baixo; o e-mail é fictício.
