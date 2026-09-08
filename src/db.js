import { supabase } from "./supabaseClient.js";

/* ---- row <-> app-model mapping ---- */

const txFromRow = (r) => ({
  id: r.id, type: r.type, description: r.description, amount: Number(r.amount),
  date: r.date, category: r.category, paymentMethod: r.payment_method, account: r.account,
  status: r.status, cardId: r.card_id, fatura: r.fatura, recurring: r.recurring,
  note: r.note, receivedDate: r.received_date,
  installment: r.installment_number ? { number: r.installment_number, total: r.installment_total, groupId: r.installment_group_id } : undefined
});

const txToRow = (t, userId) => ({
  user_id: userId, type: t.type, description: t.description, amount: t.amount, date: t.date,
  category: t.category, payment_method: t.paymentMethod, account: t.account, status: t.status,
  card_id: t.cardId || null, fatura: t.fatura || null, recurring: !!t.recurring, note: t.note || null,
  received_date: t.receivedDate || null,
  installment_number: t.installment?.number || null, installment_total: t.installment?.total || null,
  installment_group_id: t.installment?.groupId || null
});

const cardFromRow = (r) => ({ id: r.id, name: r.name, bank: r.bank, limit: Number(r.limit_amount), dueDay: r.due_day, closingDay: r.closing_day, color: r.color, active: r.active });
const cardToRow = (c, userId) => ({ user_id: userId, name: c.name, bank: c.bank, limit_amount: c.limit, due_day: c.dueDay, closing_day: c.closingDay, color: c.color, active: c.active !== false });

const payableFromRow = (r) => ({ id: r.id, description: r.description, amount: Number(r.amount), dueDate: r.due_date, category: r.category, recurring: r.recurring, periodicity: r.periodicity, status: r.status, note: r.note });
const payableToRow = (p, userId) => ({ user_id: userId, description: p.description, amount: p.amount, due_date: p.dueDate, category: p.category, recurring: !!p.recurring, periodicity: p.periodicity, status: p.status, note: p.note || null });

const receivableFromRow = (r) => ({ id: r.id, who: r.who, description: r.description, amount: Number(r.amount), dueDate: r.due_date, category: r.category, status: r.status, note: r.note });
const receivableToRow = (r, userId) => ({ user_id: userId, who: r.who, description: r.description, amount: r.amount, due_date: r.dueDate, category: r.category, status: r.status, note: r.note || null });

const savingsFromRow = (r) => ({ id: r.id, name: r.name, type: r.type, balance: Number(r.balance), note: r.note });
const savingsToRow = (s, userId) => ({ user_id: userId, name: s.name, type: s.type, balance: s.balance, note: s.note || null });

const transferToRow = (t, userId) => ({ user_id: userId, date: t.date, amount: t.amount, direction: t.direction, savings_id: t.savingsId });

/* Every write goes through this — if Supabase rejects it, we throw instead of
   silently pretending it worked (that silence was the cause of a real bug:
   installment inserts were failing and the UI still said "saved"). */
function ok(res, label) {
  if (res?.error) {
    console.error(`[meufinancer] ${label} failed:`, res.error);
    throw new Error(res.error.message || `Falha ao salvar (${label}).`);
  }
  return res;
}

export async function loadAllData(userId) {
  const [settingsRes, catRes, cardsRes, txRes, payRes, recRes, savRes, trfRes, invRes] = await Promise.all([
    supabase.from("settings").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("categories").select("*").eq("user_id", userId).order("created_at"),
    supabase.from("cards").select("*").eq("user_id", userId).order("created_at"),
    supabase.from("transactions").select("*").eq("user_id", userId).order("date", { ascending: false }),
    supabase.from("payables").select("*").eq("user_id", userId).order("due_date"),
    supabase.from("receivables").select("*").eq("user_id", userId).order("due_date"),
    supabase.from("savings").select("*").eq("user_id", userId).order("created_at"),
    supabase.from("transfers").select("*").eq("user_id", userId).order("date"),
    supabase.from("paid_invoices").select("*").eq("user_id", userId)
  ]);

  const paidInvoices = {};
  (invRes.data || []).forEach(r => { paidInvoices[`${r.card_id}|${r.fatura}`] = true; });

  return {
    isDemo: settingsRes.data?.is_demo ?? false,
    settings: {
      userName: settingsRes.data?.user_name || "Usuário",
      username: settingsRes.data?.username || "",
      currency: settingsRes.data?.currency || "BRL",
      theme: settingsRes.data?.theme || "light",
      alertLimits: settingsRes.data?.alert_limits || [80, 90, 95],
      savingsGoal: Number(settingsRes.data?.savings_goal || 0),
      lastSeenVersion: settingsRes.data?.last_seen_version || null
    },
    categories: (catRes.data || []).map(c => c.name),
    cards: (cardsRes.data || []).map(cardFromRow),
    transactions: (txRes.data || []).map(txFromRow),
    payables: (payRes.data || []).map(payableFromRow),
    receivables: (recRes.data || []).map(receivableFromRow),
    savings: (savRes.data || []).map(savingsFromRow),
    transfers: (trfRes.data || []).map(r => ({ id: r.id, date: r.date, amount: Number(r.amount), direction: r.direction, savingsId: r.savings_id })),
    paidInvoices
  };
}

export async function updateSettings(userId, patch) {
  const row = {};
  if (patch.userName !== undefined) row.user_name = patch.userName;
  if (patch.username !== undefined) row.username = patch.username || null;
  if (patch.currency !== undefined) row.currency = patch.currency;
  if (patch.theme !== undefined) row.theme = patch.theme;
  if (patch.isDemo !== undefined) row.is_demo = patch.isDemo;
  if (patch.savingsGoal !== undefined) row.savings_goal = patch.savingsGoal;
  if (patch.lastSeenVersion !== undefined) row.last_seen_version = patch.lastSeenVersion;
  row.updated_at = new Date().toISOString();
  ok(await supabase.from("settings").update(row).eq("user_id", userId), "atualizar configurações");
}

export async function addCategory(userId, name) {
  ok(await supabase.from("categories").insert({ user_id: userId, name }), "criar categoria");
}

export async function insertTransactions(userId, txs) {
  ok(await supabase.from("transactions").insert(txs.map(t => txToRow(t, userId))), "salvar lançamento");
}
export async function updateTransaction(userId, id, patch) {
  const row = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.receivedDate !== undefined) row.received_date = patch.receivedDate;
  ok(await supabase.from("transactions").update(row).eq("id", id).eq("user_id", userId), "atualizar lançamento");
}
export async function deleteRow(table, userId, id) {
  ok(await supabase.from(table).delete().eq("id", id).eq("user_id", userId), "excluir registro");
}

export async function insertCard(userId, c) {
  ok(await supabase.from("cards").insert(cardToRow(c, userId)), "criar cartão");
}
export async function updateCard(userId, id, c) {
  ok(await supabase.from("cards").update({
    name: c.name, bank: c.bank, limit_amount: c.limit, due_day: c.dueDay,
    closing_day: c.closingDay, color: c.color
  }).eq("id", id).eq("user_id", userId), "atualizar cartão");
}

export async function insertPayable(userId, p) {
  ok(await supabase.from("payables").insert(payableToRow(p, userId)), "criar conta a pagar");
}
export async function insertPayables(userId, rows) {
  ok(await supabase.from("payables").insert(rows.map(p => payableToRow(p, userId))), "criar contas a pagar");
}
export async function updatePayable(userId, id, patch) {
  ok(await supabase.from("payables").update(patch).eq("id", id).eq("user_id", userId), "atualizar conta a pagar");
}
export async function updatePayableFull(userId, id, p) {
  ok(await supabase.from("payables").update({
    description: p.description, amount: parseFloat(p.amount) || 0, due_date: p.dueDate,
    category: p.category, recurring: p.recurring === true, periodicity: p.periodicity, note: p.note || null
  }).eq("id", id).eq("user_id", userId), "editar conta a pagar");
}

export async function insertReceivable(userId, r) {
  ok(await supabase.from("receivables").insert(receivableToRow(r, userId)), "criar recebível");
}
export async function insertReceivables(userId, rows) {
  ok(await supabase.from("receivables").insert(rows.map(r => receivableToRow(r, userId))), "criar recebíveis");
}
export async function updateReceivable(userId, id, patch) {
  ok(await supabase.from("receivables").update(patch).eq("id", id).eq("user_id", userId), "atualizar recebível");
}
export async function updateReceivableFull(userId, id, r) {
  ok(await supabase.from("receivables").update({
    who: r.who, description: r.description, amount: parseFloat(r.amount) || 0,
    due_date: r.dueDate, category: r.category, note: r.note || null
  }).eq("id", id).eq("user_id", userId), "editar recebível");
}

export async function insertSavings(userId, s) {
  ok(await supabase.from("savings").insert(savingsToRow(s, userId)), "criar local guardado");
}
export async function updateSavingsBalance(userId, id, balance) {
  ok(await supabase.from("savings").update({ balance }).eq("id", id).eq("user_id", userId), "atualizar saldo guardado");
}
export async function updateSavingsFull(userId, id, s) {
  ok(await supabase.from("savings").update({
    name: s.name, type: s.type, balance: parseFloat(s.balance) || 0, note: s.note || null
  }).eq("id", id).eq("user_id", userId), "editar local guardado");
}

export async function insertTransfer(userId, t) {
  ok(await supabase.from("transfers").insert(transferToRow(t, userId)), "registrar transferência");
}

export async function markInvoicePaid(userId, cardId, fatura) {
  ok(await supabase.from("paid_invoices").insert({ user_id: userId, card_id: cardId, fatura }), "marcar fatura como paga");
}
export async function unmarkInvoicePaid(userId, cardId, fatura) {
  ok(await supabase.from("paid_invoices").delete().eq("user_id", userId).eq("card_id", cardId).eq("fatura", fatura), "desmarcar fatura paga");
}

export async function wipeAllData(userId) {
  const results = await Promise.all([
    supabase.from("transactions").delete().eq("user_id", userId),
    supabase.from("payables").delete().eq("user_id", userId),
    supabase.from("receivables").delete().eq("user_id", userId),
    supabase.from("savings").delete().eq("user_id", userId),
    supabase.from("transfers").delete().eq("user_id", userId),
    supabase.from("paid_invoices").delete().eq("user_id", userId),
    supabase.from("cards").delete().eq("user_id", userId)
  ]);
  results.forEach(r => ok(r, "apagar dados"));
  await updateSettings(userId, { isDemo: false });
}
