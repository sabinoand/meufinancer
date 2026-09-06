# Meufinancer

Controle financeiro pessoal — React + Vite + Supabase (banco de dados, autenticação e RLS por usuário).

## Rodando localmente

```bash
npm install
cp .env.example .env   # já vem preenchido com as chaves do projeto Supabase criado
npm run dev
```

## Variáveis de ambiente

- `VITE_SUPABASE_URL` — URL do projeto Supabase
- `VITE_SUPABASE_ANON_KEY` — chave pública (anon), protegida por Row Level Security no banco

## Deploy (grátis)

1. Suba este código para um repositório no GitHub.
2. Importe o repositório na Vercel (vercel.com → New Project).
3. Em "Environment Variables", adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (valores em `.env.example`).
4. Deploy. Pronto — site no ar de graça no plano Hobby da Vercel.

## Banco de dados

O projeto Supabase já está criado e com as tabelas, autenticação e políticas de segurança (cada usuário só acessa seus próprios dados) configuradas. Basta criar uma conta pela tela de login do próprio site.
