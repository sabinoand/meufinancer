import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  LayoutDashboard, Wallet, CreditCard, ShoppingCart, CalendarClock, HandCoins,
  PiggyBank, BarChart3, Settings, Plus, X, ArrowUpRight, ArrowDownRight,
  ChevronRight, Check, Trash2, Bell, TrendingUp, TrendingDown, Wallet2, LogOut, Pencil, Layers
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend
} from "recharts";
import { supabase } from "./supabaseClient.js";
import Auth from "./Auth.jsx";
import * as db from "./db.js";

/* ---------------------------------------------------------------------
   MEUFINANCER — controle financeiro pessoal (Supabase-backed)
--------------------------------------------------------------------- */

const PAYMENT_METHODS = ["Dinheiro", "Pix", "Débito", "Cartão de crédito", "Transferência", "Outros"];

const COLORS = {
  bg: "#0A0C0B", surface: "#141714", ink: "#000000", inkSoft: "#101210",
  accent: "#22C55E", accentSoft: "rgba(34,197,94,0.14)", negative: "#EF5350",
  negativeSoft: "rgba(239,83,80,0.14)", gold: "#D8AE5C", goldSoft: "rgba(216,174,92,0.14)",
  text: "#F4F5F3", textSoft: "#8F938C", border: "#242824"
};

const CHART_PALETTE = ["#2E7A57", "#B08A52", "#4E7A9E", "#B34A30", "#7A6E9E", "#C99A3C", "#5E8F6E", "#9E5E4E"];

const money = (v) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (iso) => { if (!iso) return "—"; const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
const todayISO = () => new Date().toISOString().slice(0, 10);
const monthKey = (iso) => (iso || "").slice(0, 7);
const shiftMonth = (mk, delta) => {
  const d = new Date(mk + "-15");
  d.setMonth(d.getMonth() + delta);
  return d.toISOString().slice(0, 7);
};
const monthLabel = (mk) => new Date(mk + "-15").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
const monthNavBtn = { width: 30, height: 30, borderRadius: 8, border: `1px solid #242824`, background: "#141714", color: "#F4F5F3", cursor: "pointer", fontSize: 16 };
function groupByMonth(items, dateKey, order = "desc") {
  const map = {};
  items.forEach(it => {
    const mk = monthKey(it[dateKey]);
    if (!map[mk]) map[mk] = [];
    map[mk].push(it);
  });
  const keys = Object.keys(map).sort((a, b) => order === "asc" ? a.localeCompare(b) : b.localeCompare(a));
  return keys.map(mk => ({ month: mk, label: monthLabel(mk), items: map[mk] }));
}
function MonthGroupHeader({ label }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: "#8F938C", textTransform: "capitalize", margin: "14px 0 8px", letterSpacing: 0.3 }}>{label}</div>;
}
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function emptyData() {
  return {
    isDemo: false,
    settings: { userName: "Usuário", currency: "BRL", theme: "light", alertLimits: [80, 90, 95] },
    categories: [], cards: [], transactions: [], payables: [], receivables: [], savings: [],
    transfers: [], paidInvoices: {}
  };
}

function closingDayEstimate(dueDay) { let c = dueDay - 7; if (c < 1) c += 30; return c; }

function invoiceMonthFor(dateISO, closingDay) {
  const d = new Date(dateISO + "T00:00:00");
  const day = d.getDate();
  let target = new Date(d.getFullYear(), d.getMonth(), 1);
  if (day > closingDay) target = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return target.toISOString().slice(0, 7);
}

function useCalculations(data, selectedMonth) {
  return useMemo(() => {
    const { transactions, payables, receivables, savings, transfers, cards, paidInvoices } = data;

    const receitasRecebidas = transactions.filter(t => t.type === "receita" && t.status === "recebida");
    const despesasNaoCartaoPagas = transactions.filter(t => t.type === "despesa" && t.status === "pago" && t.paymentMethod !== "Cartão de crédito");
    const faturasPagasTotal = transactions
      .filter(t => t.type === "despesa" && t.paymentMethod === "Cartão de crédito" && paidInvoices[`${t.cardId}|${t.fatura}`])
      .reduce((s, t) => s + t.amount, 0);

    const transferToSavings = transfers.filter(t => t.direction === "toSavings").reduce((s, t) => s + t.amount, 0);
    const transferFromSavings = transfers.filter(t => t.direction === "fromSavings").reduce((s, t) => s + t.amount, 0);

    const saldo =
      receitasRecebidas.reduce((s, t) => s + t.amount, 0) -
      despesasNaoCartaoPagas.reduce((s, t) => s + t.amount, 0) -
      faturasPagasTotal - transferToSavings + transferFromSavings;

    const realCurrentMonth = todayISO().slice(0, 7);
    const currentMonth = selectedMonth || realCurrentMonth;
    const lastMonthDate = new Date(currentMonth + "-15"); lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
    const lastMonth = lastMonthDate.toISOString().slice(0, 7);

    const sumMonth = (arr, type, mKey) => arr.filter(t => t.type === type && monthKey(t.date) === mKey).reduce((s, t) => s + t.amount, 0);

    const receitasMes = sumMonth(transactions, "receita", currentMonth);
    const receitasMesAnterior = sumMonth(transactions, "receita", lastMonth);
    const despesasMes = transactions.filter(t => t.type === "despesa" && monthKey(t.date) === currentMonth).reduce((s, t) => s + t.amount, 0);
    const despesasMesAnterior = transactions.filter(t => t.type === "despesa" && monthKey(t.date) === lastMonth).reduce((s, t) => s + t.amount, 0);
    const resultadoMes = receitasMes - despesasMes;

    const totalGuardado = savings.reduce((s, a) => s + a.balance, 0);
    const totalAReceber = receivables.filter(r => r.status === "a_receber" || r.status === "atrasado").reduce((s, r) => s + r.amount, 0);
    const totalAPagar = payables.filter(p => p.status === "a_vencer" || p.status === "vencido").reduce((s, p) => s + p.amount, 0);

    const invoicesByCard = {};
    cards.forEach(c => { invoicesByCard[c.id] = {}; });
    transactions.filter(t => t.type === "despesa" && t.paymentMethod === "Cartão de crédito" && t.cardId).forEach(t => {
      const card = cards.find(c => c.id === t.cardId);
      if (!card) return;
      const fk = t.fatura || invoiceMonthFor(t.date, card.closingDay);
      if (!invoicesByCard[t.cardId][fk]) invoicesByCard[t.cardId][fk] = { items: [], total: 0 };
      invoicesByCard[t.cardId][fk].items.push(t);
      invoicesByCard[t.cardId][fk].total += t.amount;
    });

    const cardUsage = cards.map(c => {
      const invMonth = currentMonth;
      const open = invoicesByCard[c.id]?.[invMonth]?.total || 0;
      const usedTotal = Object.entries(invoicesByCard[c.id] || {})
        .filter(([fk]) => !paidInvoices[`${c.id}|${fk}`])
        .reduce((s, [, v]) => s + v.total, 0);
      return { ...c, open, used: usedTotal, pct: c.limit ? Math.min(100, Math.round((usedTotal / c.limit) * 100)) : 0 };
    });

    const totalFaturasAbertas = cardUsage.reduce((s, c) => s + c.used, 0);

    const catTotals = {};
    transactions.filter(t => t.type === "despesa" && monthKey(t.date) === currentMonth).forEach(t => {
      catTotals[t.category] = (catTotals[t.category] || 0) + t.amount;
    });
    const despesasPorCategoria = Object.entries(catTotals).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    const taxaEconomia = receitasMes > 0 ? Math.round(((receitasMes - despesasMes) / receitasMes) * 100) : 0;

    const receitasPrevistas = receitasMes + receivables.filter(r => r.status === "a_receber" && monthKey(r.dueDate) === currentMonth).reduce((s, r) => s + r.amount, 0);
    const despesasProgramadas = despesasMes + payables.filter(p => p.status !== "pago" && monthKey(p.dueDate) === currentMonth).reduce((s, p) => s + p.amount, 0);
    const resultadoProgramado = receitasPrevistas - despesasProgramadas;
    const transferToSavingsMes = transfers.filter(t => t.direction === "toSavings" && monthKey(t.date) === currentMonth).reduce((s, t) => s + t.amount, 0);

    const months = [];
    for (let i = 5; i >= 0; i--) {
      const dt = new Date(currentMonth + "-15"); dt.setMonth(dt.getMonth() - i);
      const mk = dt.toISOString().slice(0, 7);
      months.push({
        label: dt.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
        key: mk,
        receitas: sumMonth(transactions, "receita", mk),
        despesas: transactions.filter(t => t.type === "despesa" && monthKey(t.date) === mk).reduce((s, t) => s + t.amount, 0)
      });
    }

    return {
      saldo, receitasMes, receitasMesAnterior, despesasMes, despesasMesAnterior, resultadoMes,
      totalGuardado, totalAReceber, totalAPagar, invoicesByCard, cardUsage, totalFaturasAbertas,
      despesasPorCategoria, taxaEconomia, months, currentMonth, realCurrentMonth,
      receitasPrevistas, despesasProgramadas, resultadoProgramado, transferToSavingsMes
    };
  }, [data]);
}

/* ---------------- generic UI bits ---------------- */

function Field({ f, value, onChange }) {
  const base = { width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${COLORS.border}`, fontSize: 14, fontFamily: "Inter, sans-serif", background: "#0F1210", color: COLORS.text, outline: "none" };
  if (f.type === "select") {
    return (
      <div style={{ display: "flex", gap: 6 }}>
        <select style={base} value={value ?? ""} onChange={e => onChange(f.key, e.target.value)}>
          <option value="" disabled>Selecione…</option>
          {f.options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
        </select>
        {f.allowAddNew && (
          <button type="button" onClick={() => f.onAddNew(f.key, onChange)} title="Nova categoria" style={{ flexShrink: 0, width: 38, borderRadius: 10, border: `1px solid ${COLORS.border}`, background: COLORS.surface, color: COLORS.accent, cursor: "pointer", fontSize: 18, fontWeight: 700 }}>+</button>
        )}
      </div>
    );
  }
  if (f.type === "toggle") {
    return (
      <div style={{ display: "flex", gap: 8 }}>
        {["Sim", "Não"].map(opt => (
          <button key={opt} type="button" onClick={() => onChange(f.key, opt === "Sim")}
            style={{
              flex: 1, padding: "9px 0", borderRadius: 10, cursor: "pointer", fontSize: 13.5, fontWeight: 600,
              border: `1px solid ${(value === (opt === "Sim")) ? COLORS.accent : COLORS.border}`,
              background: (value === (opt === "Sim")) ? COLORS.accentSoft : COLORS.surface,
              color: (value === (opt === "Sim")) ? COLORS.accent : COLORS.textSoft
            }}>{opt}</button>
        ))}
      </div>
    );
  }
  return (
    <input style={base} type={f.type || "text"} step={f.type === "number" ? "0.01" : undefined}
      placeholder={f.placeholder} value={value ?? ""} onChange={e => onChange(f.key, e.target.value)} />
  );
}

function ModalShell({ title, onClose, children, wide }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(19,33,25,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100, backdropFilter: "blur(2px)" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: COLORS.surface, width: "100%", maxWidth: wide ? 560 : 440, borderRadius: "20px 20px 0 0", maxHeight: "88vh", overflowY: "auto", padding: 24, boxShadow: "0 -8px 40px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h3 style={{ fontFamily: "Fraunces, serif", fontSize: 21, fontWeight: 600, color: COLORS.text, margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ background: COLORS.bg, border: "none", borderRadius: 8, padding: 6, cursor: "pointer" }}>
            <X size={18} color={COLORS.textSoft} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SimpleFormModal({ title, fields, initial, onSubmit, onClose }) {
  const [values, setValues] = useState(initial || {});
  const [saving, setSaving] = useState(false);
  const onChange = (k, v) => setValues(prev => ({ ...prev, [k]: v }));
  const submit = async () => {
    if (fields.some(f => f.required && !values[f.key] && values[f.key] !== false)) return;
    setSaving(true);
    await onSubmit(values);
    setSaving(false);
  };
  return (
    <ModalShell title={title} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {fields.map(f => (
          <div key={f.key}>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.textSoft, display: "block", marginBottom: 6 }}>{f.label}</label>
            <Field f={f} value={values[f.key]} onChange={onChange} />
          </div>
        ))}
        <button disabled={saving} onClick={submit} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>{saving ? "Salvando…" : "Salvar"}</button>
      </div>
    </ModalShell>
  );
}

const btnPrimary = { marginTop: 6, background: COLORS.accent, color: "#fff", border: "none", borderRadius: 12, padding: "13px 0", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "Inter, sans-serif" };

function StatCard({ label, value, icon: Icon, tone = "default", sub }) {
  const toneMap = {
    default: { bg: COLORS.surface, fg: COLORS.text, iconBg: COLORS.bg },
    accent: { bg: COLORS.inkSoft, fg: "#fff", iconBg: "rgba(255,255,255,0.12)" },
    positive: { bg: COLORS.surface, fg: COLORS.accent, iconBg: COLORS.accentSoft },
    negative: { bg: COLORS.surface, fg: COLORS.negative, iconBg: COLORS.negativeSoft },
    gold: { bg: COLORS.surface, fg: COLORS.gold, iconBg: COLORS.goldSoft }
  };
  const t = toneMap[tone];
  return (
    <div style={{ background: t.bg, borderRadius: 18, padding: "20px 20px", border: tone === "accent" ? "none" : `1px solid ${COLORS.border}`, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: tone === "accent" ? "rgba(255,255,255,0.7)" : COLORS.textSoft }}>{label}</span>
        <div style={{ background: t.iconBg, borderRadius: 10, padding: 7 }}><Icon size={15} color={tone === "accent" ? "#fff" : t.fg} /></div>
      </div>
      <div style={{ fontFamily: "Fraunces, serif", fontSize: 25, fontWeight: 600, color: tone === "accent" ? "#fff" : COLORS.text, lineHeight: 1.1, wordBreak: "break-word" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: tone === "accent" ? "rgba(255,255,255,0.65)" : COLORS.textSoft }}>{sub}</div>}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    recebida: { bg: COLORS.accentSoft, fg: COLORS.accent, label: "Recebida" },
    prevista: { bg: COLORS.goldSoft, fg: COLORS.gold, label: "Prevista" },
    atrasada: { bg: COLORS.negativeSoft, fg: COLORS.negative, label: "Atrasada" },
    pago: { bg: COLORS.accentSoft, fg: COLORS.accent, label: "Pago" },
    a_vencer: { bg: COLORS.goldSoft, fg: COLORS.gold, label: "A vencer" },
    vencido: { bg: COLORS.negativeSoft, fg: COLORS.negative, label: "Vencido" },
    a_receber: { bg: COLORS.goldSoft, fg: COLORS.gold, label: "A receber" },
    recebido: { bg: COLORS.accentSoft, fg: COLORS.accent, label: "Recebido" },
    atrasado: { bg: COLORS.negativeSoft, fg: COLORS.negative, label: "Atrasado" },
    aberta: { bg: COLORS.goldSoft, fg: COLORS.gold, label: "Em aberto" },
    fechada: { bg: "#EDEBE3", fg: COLORS.textSoft, label: "Fechada" },
    paga: { bg: COLORS.accentSoft, fg: COLORS.accent, label: "Paga" }
  };
  const s = map[status] || { bg: COLORS.bg, fg: COLORS.textSoft, label: status };
  return <span style={{ background: s.bg, color: s.fg, fontSize: 11.5, fontWeight: 700, padding: "4px 9px", borderRadius: 999 }}>{s.label}</span>;
}

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "receitas", label: "Receitas", icon: Wallet },
  { key: "cartoes", label: "Cartões", icon: CreditCard },
  { key: "lancamentos", label: "Lançamentos", icon: ShoppingCart },
  { key: "pagar", label: "Contas a pagar", icon: CalendarClock },
  { key: "receber", label: "A receber", icon: HandCoins },
  { key: "guardado", label: "Guardado", icon: PiggyBank },
  { key: "relatorios", label: "Relatórios", icon: BarChart3 },
  { key: "config", label: "Configurações", icon: Settings }
];

/* ============================== APP ============================== */

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = logged out
  const [data, setData] = useState(null);
  const [view, setView] = useState("dashboard");
  const [modal, setModal] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [toast, setToast] = useState(null);
  const [passkeys, setPasskeys] = useState([]);
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameStatus, setUsernameStatus] = useState("");
  const [dashboardMonth, setDashboardMonth] = useState(todayISO().slice(0, 7));
  const [goalInput, setGoalInput] = useState("");
  const passkeySupported = typeof window !== "undefined" && !!window.PublicKeyCredential;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;

  const refresh = useCallback(async () => {
    if (!userId) return;
    const fresh = await db.loadAllData(userId);
    setData(fresh);
  }, [userId]);

  useEffect(() => {
    if (userId) refresh(); else setData(null);
  }, [userId, refresh]);

  useEffect(() => {
    if (!userId || !passkeySupported) return;
    supabase.auth.passkey.list().then(({ data }) => setPasskeys(data || [])).catch(() => {});
  }, [userId, passkeySupported]);

  useEffect(() => {
    setUsernameInput(data?.settings?.username || "");
    setGoalInput(data?.settings?.savingsGoal ? String(data.settings.savingsGoal) : "");
  }, [data?.settings?.username, data?.settings?.savingsGoal]);

  const registerPasskeyAction = async () => {
    try {
      const { data: pk, error } = await supabase.auth.registerPasskey();
      if (error) throw error;
      showToast("Face ID / Touch ID ativado neste dispositivo.");
      const { data: list } = await supabase.auth.passkey.list();
      setPasskeys(list || []);
    } catch (err) {
      showToast(err.message || "Não foi possível ativar. Confirme se o Passkey está habilitado no Supabase.");
    }
  };

  const deletePasskeyAction = async (passkeyId) => {
    await supabase.auth.passkey.delete({ passkeyId });
    const { data: list } = await supabase.auth.passkey.list();
    setPasskeys(list || []);
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2400); };
  const calc = useCalculations(data || emptyData(), dashboardMonth);

  if (session === undefined) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif", color: COLORS.textSoft }}>Carregando…</div>;
  }
  if (!session) return <Auth />;
  if (!data) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif", color: COLORS.textSoft }}>Carregando Meufinancer…</div>;
  }

  const logout = () => supabase.auth.signOut();

  /* ---------- actions (write to Supabase, then refresh) ---------- */

  const addTransaction = async (vals) => {
    const amount = parseFloat(vals.amount) || 0;
    const base = { type: vals.type, description: vals.description, amount, date: vals.date || todayISO(), category: vals.category, status: vals.status, paymentMethod: vals.paymentMethod, account: vals.account };
    let rows = [base];
    if (vals.type === "despesa" && vals.paymentMethod === "Cartão de crédito" && vals.cardId) {
      const card = data.cards.find(c => c.id === vals.cardId);
      const closing = card?.closingDay ?? closingDayEstimate(card?.dueDay ?? 10);
      const parcelas = vals.parcelado ? Math.max(1, parseInt(vals.numParcelas) || 1) : 1;
      const groupId = uid();
      const per = Math.round((amount / parcelas) * 100) / 100;
      rows = [];
      for (let i = 0; i < parcelas; i++) {
        const dt = new Date(base.date + "T00:00:00");
        dt.setMonth(dt.getMonth() + i);
        const iso = dt.toISOString().slice(0, 10);
        rows.push({
          ...base, amount: per,
          description: parcelas > 1 ? `${base.description} (${i + 1}/${parcelas})` : base.description,
          date: iso, cardId: vals.cardId, status: "aberta",
          installment: parcelas > 1 ? { number: i + 1, total: parcelas, groupId } : undefined,
          fatura: invoiceMonthFor(iso, closing)
        });
      }
    }
    await db.insertTransactions(userId, rows);
    await refresh();
    setModal(null);
    showToast("Lançamento salvo.");
  };

  const addIncome = async (vals) => {
    await db.insertTransactions(userId, [{
      type: "receita", description: vals.description, amount: parseFloat(vals.amount) || 0,
      date: vals.expectedDate || todayISO(), receivedDate: vals.receivedDate || undefined,
      category: vals.category, account: vals.account, recurring: vals.recurring === true, note: vals.note,
      status: vals.receivedDate ? "recebida" : "prevista"
    }]);
    await refresh();
    setModal(null);
    showToast("Receita adicionada.");
  };

  const markIncomeReceived = async (id) => { await db.updateTransaction(userId, id, { status: "recebida", receivedDate: todayISO() }); await refresh(); };

  const addCard = async (vals) => {
    const dueDay = parseInt(vals.dueDay) || 10;
    await db.insertCard(userId, { name: vals.name, bank: vals.bank, limit: parseFloat(vals.limit) || 0, dueDay, closingDay: vals.closingDay ? parseInt(vals.closingDay) : closingDayEstimate(dueDay), color: vals.color || CHART_PALETTE[data.cards.length % CHART_PALETTE.length], active: true });
    await refresh();
    setModal(null);
    showToast("Cartão cadastrado.");
  };

  const openEditCard = (card) => setModal({ type: "editCard", id: card.id, initial: { name: card.name, bank: card.bank, limit: card.limit, dueDay: card.dueDay, closingDay: card.closingDay, color: card.color } });

  const editCard = async (vals) => {
    const dueDay = parseInt(vals.dueDay) || 10;
    await db.updateCard(userId, modal.id, { name: vals.name, bank: vals.bank, limit: parseFloat(vals.limit) || 0, dueDay, closingDay: vals.closingDay ? parseInt(vals.closingDay) : closingDayEstimate(dueDay), color: vals.color });
    await refresh();
    setModal(null);
    showToast("Cartão atualizado.");
  };

  const addPayable = async (vals) => {
    await db.insertPayable(userId, { description: vals.description, amount: parseFloat(vals.amount) || 0, dueDate: vals.dueDate || todayISO(), category: vals.category, recurring: vals.recurring === true, periodicity: vals.periodicity || "Mensal", status: "a_vencer", note: vals.note });
    await refresh();
    setModal(null);
    showToast("Conta a pagar adicionada.");
  };

  const openEditPayable = (p) => setModal({ type: "editPayable", id: p.id, initial: { description: p.description, amount: p.amount, dueDate: p.dueDate, category: p.category, recurring: p.recurring, periodicity: p.periodicity, note: p.note } });
  const editPayable = async (vals) => {
    await db.updatePayableFull(userId, modal.id, { description: vals.description, amount: vals.amount, dueDate: vals.dueDate, category: vals.category, recurring: vals.recurring === true, periodicity: vals.periodicity, note: vals.note });
    await refresh();
    setModal(null);
    showToast("Conta atualizada.");
  };

  const markPayablePaid = async (id) => {
    const p = data.payables.find(x => x.id === id);
    await db.updatePayable(userId, id, { status: "pago" });
    await db.insertTransactions(userId, [{ type: "despesa", description: p.description, amount: p.amount, date: todayISO(), category: p.category, paymentMethod: "Transferência", status: "pago" }]);
    await refresh();
  };

  const addReceivable = async (vals) => {
    await db.insertReceivable(userId, { who: vals.who, description: vals.description, amount: parseFloat(vals.amount) || 0, dueDate: vals.dueDate || todayISO(), category: vals.category, status: "a_receber", note: vals.note });
    await refresh();
    setModal(null);
    showToast("Recebível adicionado.");
  };

  const openEditReceivable = (r) => setModal({ type: "editReceivable", id: r.id, initial: { who: r.who, description: r.description, amount: r.amount, dueDate: r.dueDate, category: r.category, note: r.note } });
  const editReceivable = async (vals) => {
    await db.updateReceivableFull(userId, modal.id, { who: vals.who, description: vals.description, amount: vals.amount, dueDate: vals.dueDate, category: vals.category, note: vals.note });
    await refresh();
    setModal(null);
    showToast("Recebível atualizado.");
  };

  const markReceivableReceived = async (id) => {
    const r = data.receivables.find(x => x.id === id);
    await db.updateReceivable(userId, id, { status: "recebido" });
    await db.insertTransactions(userId, [{ type: "receita", description: `${r.description} (${r.who})`, amount: r.amount, date: todayISO(), category: r.category, status: "recebida", account: "Conta corrente" }]);
    await refresh();
  };

  const addSavings = async (vals) => {
    await db.insertSavings(userId, { name: vals.name, type: vals.type, balance: parseFloat(vals.balance) || 0, note: vals.note });
    await refresh();
    setModal(null);
    showToast("Local adicionado.");
  };

  const openEditSavings = (s) => setModal({ type: "editSavings", id: s.id, initial: { name: s.name, type: s.type, balance: s.balance, note: s.note } });
  const editSavings = async (vals) => {
    await db.updateSavingsFull(userId, modal.id, { name: vals.name, type: vals.type, balance: vals.balance, note: vals.note });
    await refresh();
    setModal(null);
    showToast("Local atualizado.");
  };

  const doTransfer = async (vals) => {
    const amount = parseFloat(vals.amount) || 0;
    const savingsAcc = data.savings.find(s => s.id === vals.savingsId);
    if (!savingsAcc) return;
    const newBalance = vals.direction === "toSavings" ? savingsAcc.balance + amount : savingsAcc.balance - amount;
    await db.updateSavingsBalance(userId, savingsAcc.id, newBalance);
    await db.insertTransfer(userId, { date: todayISO(), amount, direction: vals.direction, savingsId: vals.savingsId });
    await refresh();
    setModal(null);
    showToast("Transferência realizada.");
  };

  const importCardPurchases = async (cardId, rows) => {
    const card = data.cards.find(c => c.id === cardId);
    const closing = card?.closingDay ?? closingDayEstimate(card?.dueDay ?? 10);
    const allRows = [];
    rows.forEach(row => {
      const amount = parseFloat(row.amount) || 0;
      const parcelas = Math.max(1, parseInt(row.parcelas) || 1);
      const per = Math.round((amount / parcelas) * 100) / 100;
      const groupId = uid();
      const baseDate = row.date || todayISO();
      for (let i = 0; i < parcelas; i++) {
        const dt = new Date(baseDate + "T00:00:00");
        dt.setMonth(dt.getMonth() + i);
        const iso = dt.toISOString().slice(0, 10);
        allRows.push({
          type: "despesa", description: parcelas > 1 ? `${row.description} (${i + 1}/${parcelas})` : row.description,
          amount: per, date: iso, category: row.category || "Outros", paymentMethod: "Cartão de crédito",
          cardId, status: "aberta",
          installment: parcelas > 1 ? { number: i + 1, total: parcelas, groupId } : undefined,
          fatura: invoiceMonthFor(iso, closing)
        });
      }
    });
    await db.insertTransactions(userId, allRows);
    await refresh();
    setModal(null);
    showToast("Compras importadas.");
  };

  const addBulkTransactions = async (rows, type) => {
    const clean = rows.filter(r => r.description && r.amount).map(r => ({
      type, description: r.description, amount: parseFloat(r.amount) || 0, date: r.date || todayISO(),
      category: r.category || "Outros", paymentMethod: type === "despesa" ? (r.paymentMethod || "Pix") : undefined,
      status: type === "despesa" ? "pago" : "recebida", account: type === "receita" ? "Conta corrente" : undefined
    }));
    if (clean.length === 0) return;
    await db.insertTransactions(userId, clean);
    await refresh();
    setModal(null);
    showToast(`${clean.length} lançamentos salvos.`);
  };

  const payInvoice = async (cardId, faturaKey) => { await db.markInvoicePaid(userId, cardId, faturaKey); await refresh(); };

  const removeItem = async (table, id) => { await db.deleteRow(table, userId, id); await refresh(); };

  const updateUserName = async (name) => {
    setData(d => ({ ...d, settings: { ...d.settings, userName: name } }));
    await db.updateSettings(userId, { userName: name });
  };

  const saveUsername = async () => {
    setUsernameStatus("");
    try {
      await db.updateSettings(userId, { username: usernameInput.trim() || null });
      setData(d => ({ ...d, settings: { ...d.settings, username: usernameInput.trim() } }));
      setUsernameStatus("ok");
    } catch (err) {
      setUsernameStatus(err.message?.includes("duplicate") ? "Esse nome de usuário já está em uso." : "Não foi possível salvar.");
    }
  };

  const addCategoryAction = async () => {
    const name = prompt("Nome da nova categoria:");
    if (name) { await db.addCategory(userId, name); await refresh(); }
  };

  const promptNewCategory = async (fieldKey, onChange) => {
    const name = prompt("Nome da nova categoria:");
    if (!name) return;
    await db.addCategory(userId, name);
    await refresh();
    onChange(fieldKey, name);
  };

  const saveGoal = async () => {
    const val = parseFloat(goalInput) || 0;
    await db.updateSettings(userId, { savingsGoal: val });
    setData(d => ({ ...d, settings: { ...d.settings, savingsGoal: val } }));
    showToast("Meta salva.");
  };

  const clearDemo = async () => { await db.wipeAllData(userId); await refresh(); showToast("Dados de exemplo removidos."); };
  const wipeAll = async () => { if (confirm("Apagar todos os dados?")) { await db.wipeAllData(userId); await refresh(); } };

  /* ---------- render views ---------- */

  const renderDashboard = () => {
    const resultPositive = calc.resultadoMes >= 0;
    const receitaDelta = calc.receitasMesAnterior ? Math.round(((calc.receitasMes - calc.receitasMesAnterior) / calc.receitasMesAnterior) * 100) : null;
    const despesaDelta = calc.despesasMesAnterior ? Math.round(((calc.despesasMes - calc.despesasMesAnterior) / calc.despesasMesAnterior) * 100) : null;
    const upcomingPayables = [...data.payables].filter(p => p.status !== "pago").sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 4);
    const upcomingReceivables = [...data.receivables].filter(r => r.status === "a_receber").sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 4);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div>
          <div style={{ fontSize: 13, color: COLORS.textSoft, fontWeight: 600 }}>Olá, {data.settings.userName}</div>
          <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 26, fontWeight: 600, margin: "2px 0 0", color: COLORS.text }}>Este é o seu resumo financeiro</h1>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setDashboardMonth(shiftMonth(dashboardMonth, -1))} style={monthNavBtn}>‹</button>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: 15, fontWeight: 600, color: COLORS.text, minWidth: 150, textAlign: "center", textTransform: "capitalize" }}>
            {monthLabel(dashboardMonth)}
          </div>
          <button onClick={() => setDashboardMonth(shiftMonth(dashboardMonth, 1))} style={monthNavBtn}>›</button>
          {dashboardMonth !== todayISO().slice(0, 7) && (
            <button onClick={() => setDashboardMonth(todayISO().slice(0, 7))} style={{ ...monthNavBtn, width: "auto", padding: "0 12px", fontSize: 12 }}>Hoje</button>
          )}
        </div>

        {data.cards.length === 0 && data.transactions.length === 0 && (
          <div style={{ background: COLORS.goldSoft, border: `1px solid ${COLORS.gold}`, borderRadius: 14, padding: "14px 16px", fontSize: 13.5, color: "#6b5326" }}>
            Sua conta está vazia — comece cadastrando um cartão, uma receita ou um lançamento pelo botão "+ Lançamento".
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
          <StatCard label="Saldo disponível" value={money(calc.saldo)} icon={Wallet2} tone="accent" sub="Disponível para gastar" />
          <StatCard label="Receitas do mês" value={money(calc.receitasMes)} icon={TrendingUp} tone="positive" sub={receitaDelta !== null ? `${receitaDelta >= 0 ? "+" : ""}${receitaDelta}% vs mês anterior` : "Sem comparação"} />
          <StatCard label="Despesas do mês" value={money(calc.despesasMes)} icon={TrendingDown} tone="negative" sub={despesaDelta !== null ? `${despesaDelta >= 0 ? "+" : ""}${despesaDelta}% vs mês anterior` : "Sem comparação"} />
          <StatCard label="Resultado do mês" value={money(calc.resultadoMes)} icon={resultPositive ? ArrowUpRight : ArrowDownRight} tone={resultPositive ? "positive" : "negative"} sub={resultPositive ? "Positivo" : "Negativo"} />
          <StatCard label="Dinheiro guardado" value={money(calc.totalGuardado)} icon={PiggyBank} tone="gold" sub={`${data.savings.length} locais`} />
        </div>

        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, marginBottom: 14 }}>Resumo do mês</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: COLORS.textSoft }}>Vai receber (previsto)</div>
              <div style={{ fontFamily: "Fraunces, serif", fontSize: 19, color: COLORS.accent, fontWeight: 600 }}>{money(calc.receitasPrevistas)}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: COLORS.textSoft }}>Despesas programadas</div>
              <div style={{ fontFamily: "Fraunces, serif", fontSize: 19, color: COLORS.negative, fontWeight: 600 }}>{money(calc.despesasProgramadas)}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: COLORS.textSoft }}>Resultado projetado</div>
              <div style={{ fontFamily: "Fraunces, serif", fontSize: 19, color: calc.resultadoProgramado >= 0 ? COLORS.accent : COLORS.negative, fontWeight: 600 }}>{money(calc.resultadoProgramado)}</div>
            </div>
          </div>

          {(() => {
            const tips = [];
            if (calc.resultadoProgramado < 0) {
              tips.push("Esse mês está projetado para fechar no vermelho — vale rever alguns gastos.");
            } else if (calc.taxaEconomia >= 20) {
              tips.push(`Boa! Você está guardando ${calc.taxaEconomia}% do que ganha esse mês.`);
            } else {
              tips.push("Dá pra melhorar um pouco a economia desse mês — toda sobra ajuda.");
            }
            if (calc.despesasPorCategoria[0]) {
              tips.push(`Sua maior categoria de gasto é "${calc.despesasPorCategoria[0].name}" (${money(calc.despesasPorCategoria[0].value)}). Vale olhar se dá pra reduzir aí.`);
            }
            return (
              <div style={{ background: COLORS.accentSoft, borderRadius: 12, padding: 14, marginBottom: 16 }}>
                {tips.map((t, i) => <div key={i} style={{ fontSize: 13, color: COLORS.text, marginBottom: i < tips.length - 1 ? 6 : 0 }}>💡 {t}</div>)}
              </div>
            );
          })()}

          <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 14 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.textSoft, marginBottom: 8 }}>Meta de guardar por mês</div>
            <div style={{ display: "flex", gap: 8, marginBottom: data.settings.savingsGoal ? 10 : 0 }}>
              <input value={goalInput} onChange={e => setGoalInput(e.target.value)} type="number" placeholder="Ex: 500" style={{ flex: 1, maxWidth: 200, padding: "9px 12px", borderRadius: 10, border: `1px solid ${COLORS.border}`, fontSize: 13, background: "#0F1210", color: COLORS.text }} />
              <button onClick={saveGoal} style={{ background: COLORS.accent, color: "#0A0C0B", border: "none", borderRadius: 10, padding: "0 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Salvar</button>
            </div>
            {data.settings.savingsGoal > 0 && (
              <div>
                <div style={{ fontSize: 12.5, color: COLORS.textSoft, marginBottom: 6 }}>
                  Guardado esse mês: {money(calc.transferToSavingsMes)} de {money(data.settings.savingsGoal)}
                  {calc.transferToSavingsMes >= data.settings.savingsGoal ? " 🎉 meta batida!" : ""}
                </div>
                <div style={{ height: 7, background: COLORS.bg, borderRadius: 4 }}>
                  <div style={{ height: 7, width: `${Math.min(100, Math.round((calc.transferToSavingsMes / data.settings.savingsGoal) * 100))}%`, background: COLORS.accent, borderRadius: 4 }} />
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16 }} className="mf-grid-2">
          <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, marginBottom: 12 }}>Receitas x Despesas — últimos 6 meses</div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={calc.months}>
                <defs>
                  <linearGradient id="gRec" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.accent} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={COLORS.accent} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gDes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.negative} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={COLORS.negative} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: COLORS.textSoft }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: COLORS.textSoft }} axisLine={false} tickLine={false} tickFormatter={v => `${v / 1000}k`} />
                <Tooltip formatter={v => money(v)} contentStyle={{ borderRadius: 10, border: `1px solid ${COLORS.border}`, fontSize: 12.5 }} />
                <Area type="monotone" dataKey="receitas" stroke={COLORS.accent} fill="url(#gRec)" strokeWidth={2} name="Receitas" />
                <Area type="monotone" dataKey="despesas" stroke={COLORS.negative} fill="url(#gDes)" strokeWidth={2} name="Despesas" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, marginBottom: 12 }}>Despesas por categoria</div>
            {calc.despesasPorCategoria.length === 0 ? (
              <div style={{ fontSize: 13, color: COLORS.textSoft, padding: "30px 0", textAlign: "center" }}>Sem despesas este mês.</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={calc.despesasPorCategoria} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {calc.despesasPorCategoria.map((_, i) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => money(v)} contentStyle={{ borderRadius: 10, border: `1px solid ${COLORS.border}`, fontSize: 12.5 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }} className="mf-grid-3">
          <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: COLORS.text }}>Cartões</div>
            {calc.cardUsage.length === 0 ? <div style={{ fontSize: 13, color: COLORS.textSoft }}>Nenhum cartão cadastrado.</div> :
              calc.cardUsage.map(c => (
                <div key={c.id} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 5 }}>
                    <span style={{ fontWeight: 600, color: COLORS.text }}>{c.name}</span>
                    <span style={{ color: COLORS.textSoft }}>{money(c.used)} / {money(c.limit)}</span>
                  </div>
                  <div style={{ height: 6, background: COLORS.bg, borderRadius: 4 }}>
                    <div style={{ height: 6, width: `${c.pct}%`, background: c.pct >= 90 ? COLORS.negative : c.pct >= 80 ? COLORS.gold : COLORS.accent, borderRadius: 4 }} />
                  </div>
                </div>
              ))}
          </div>

          <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: COLORS.text }}>Contas próximas do vencimento</div>
            {upcomingPayables.length === 0 ? <div style={{ fontSize: 13, color: COLORS.textSoft }}>Nada por aqui.</div> :
              upcomingPayables.map(p => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.8, padding: "7px 0", borderBottom: `1px solid ${COLORS.border}` }}>
                  <span style={{ color: COLORS.text }}>{p.description}</span>
                  <span style={{ color: COLORS.textSoft }}>{money(p.amount)} · {fmtDate(p.dueDate)}</span>
                </div>
              ))}
          </div>

          <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: COLORS.text }}>Dinheiro a receber</div>
            {upcomingReceivables.length === 0 ? <div style={{ fontSize: 13, color: COLORS.textSoft }}>Nada por aqui.</div> :
              upcomingReceivables.map(r => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.8, padding: "7px 0", borderBottom: `1px solid ${COLORS.border}` }}>
                  <span style={{ color: COLORS.text }}>{r.who}</span>
                  <span style={{ color: COLORS.textSoft }}>{money(r.amount)} · {fmtDate(r.dueDate)}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    );
  };

  const renderReceitas = () => {
    const incomes = [...data.transactions].filter(t => t.type === "receita");
    const pending = incomes.filter(t => t.status !== "recebida").sort((a, b) => a.date.localeCompare(b.date));
    const received = incomes.filter(t => t.status === "recebida").sort((a, b) => b.date.localeCompare(a.date));
    const pendingGroups = groupByMonth(pending, "date", "asc");
    const receivedGroups = groupByMonth(received, "date", "desc");
    const row = (t) => (
      <RowCard key={t.id}
        left={<><div style={{ fontWeight: 600, color: COLORS.text, fontSize: 14 }}>{t.description}</div><div style={{ fontSize: 12, color: COLORS.textSoft }}>{t.category} · {fmtDate(t.date)}</div></>}
        right={<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontWeight: 700, color: COLORS.accent, fontSize: 14.5 }}>{money(t.amount)}</span>
          <StatusBadge status={t.status} />
          {t.status !== "recebida" && <button onClick={() => markIncomeReceived(t.id)} style={iconBtn} title="Marcar como recebida"><Check size={14} /></button>}
          <button onClick={() => removeItem("transactions", t.id)} style={iconBtnDanger}><Trash2 size={14} /></button>
        </div>}
      />
    );
    return (
      <ListPage title="Receitas" actionLabel="+ Nova receita" onAction={() => setModal({ type: "income" })}>
        {incomes.length === 0 ? <EmptyState text="Nenhuma receita cadastrada ainda." /> : (
          <>
            {pendingGroups.map(g => (
              <div key={g.month}><MonthGroupHeader label={g.label} />{g.items.map(row)}</div>
            ))}
            {receivedGroups.length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, marginTop: 22, borderTop: `1px solid ${COLORS.border}`, paddingTop: 16 }}>Recebidas</div>
                {receivedGroups.map(g => (
                  <div key={g.month}><MonthGroupHeader label={g.label} />{g.items.map(row)}</div>
                ))}
              </>
            )}
          </>
        )}
      </ListPage>
    );
  };

  const renderCartoes = () => {
    if (selectedCard) {
      const card = data.cards.find(c => c.id === selectedCard);
      const invoices = calc.invoicesByCard[selectedCard] || {};
      const keys = Object.keys(invoices).sort();
      return (
        <div>
          <button onClick={() => setSelectedCard(null)} style={{ background: "none", border: "none", color: COLORS.textSoft, fontSize: 13, cursor: "pointer", marginBottom: 14, display: "flex", alignItems: "center", gap: 4 }}>← Voltar para cartões</button>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 4 }}>
            <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 22, margin: 0, color: COLORS.text }}>{card.name} · Faturas</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => openEditCard(card)} style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", color: COLORS.text, display: "flex", alignItems: "center", gap: 6 }}><Pencil size={13} /> Editar cartão</button>
              <button onClick={() => setModal({ type: "importCard", cardId: selectedCard })} style={{ background: COLORS.accent, border: "none", borderRadius: 10, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", color: "#0A0C0B", display: "flex", alignItems: "center", gap: 6 }}><Layers size={13} /> Lançar compras existentes</button>
            </div>
          </div>
          <div style={{ fontSize: 13, color: COLORS.textSoft, marginBottom: 18 }}>Fechamento estimado dia {card.closingDay} · Vencimento dia {card.dueDay}</div>
          {keys.length === 0 ? <EmptyState text="Nenhuma fatura ainda." /> : keys.map(fk => {
            const inv = invoices[fk];
            const paid = !!data.paidInvoices[`${selectedCard}|${fk}`];
            const isCurrent = fk === calc.realCurrentMonth;
            const status = paid ? "paga" : isCurrent ? "aberta" : "fechada";
            return (
              <div key={fk} style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 18, marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 13, color: COLORS.textSoft, fontWeight: 600 }}>Fatura {new Date(fk + "-01").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</div>
                    <div style={{ fontFamily: "Fraunces, serif", fontSize: 24, fontWeight: 600, color: COLORS.text }}>{money(inv.total)}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                    <StatusBadge status={status} />
                    {!paid && <button onClick={() => payInvoice(selectedCard, fk)} style={{ ...btnPrimary, padding: "8px 14px", fontSize: 12.5, marginTop: 0 }}>Marcar como paga</button>}
                  </div>
                </div>
                <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  {inv.items.map(it => (
                    <div key={it.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.8 }}>
                      <span style={{ color: COLORS.text }}>{it.description} <span style={{ color: COLORS.textSoft }}>· {it.category}</span></span>
                      <span style={{ color: COLORS.textSoft }}>{money(it.amount)} · {fmtDate(it.date)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    return (
      <ListPage title="Cartões" actionLabel="+ Novo cartão" onAction={() => setModal({ type: "card" })}>
        {data.cards.length === 0 ? <EmptyState text="Nenhum cartão cadastrado." /> :
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
            {calc.cardUsage.map(c => (
              <div key={c.id} onClick={() => setSelectedCard(c.id)} style={{ cursor: "pointer", borderRadius: 16, padding: 18, color: "#fff", background: `linear-gradient(135deg, ${c.color}, ${c.color}CC)`, position: "relative", minHeight: 130, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ fontWeight: 700, fontSize: 15.5 }}>{c.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button onClick={e => { e.stopPropagation(); openEditCard(c); }} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 7, padding: 5, cursor: "pointer", display: "flex" }}><Pencil size={12} color="#fff" /></button>
                    <ChevronRight size={16} />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.85 }}>{c.bank}</div>
                  <div style={{ fontFamily: "Fraunces, serif", fontSize: 19, fontWeight: 600, margin: "4px 0" }}>{money(c.used)} <span style={{ fontSize: 12.5, opacity: 0.8, fontFamily: "Inter, sans-serif" }}>/ {money(c.limit)}</span></div>
                  <div style={{ height: 5, background: "rgba(255,255,255,0.3)", borderRadius: 4 }}>
                    <div style={{ height: 5, width: `${c.pct}%`, background: "#fff", borderRadius: 4 }} />
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.9, marginTop: 6, fontWeight: 600 }}>Disponível: {money(Math.max(0, c.limit - c.used))}</div>
                  <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>Fecha dia {c.closingDay} · Vence dia {c.dueDay}</div>
                </div>
              </div>
            ))}
          </div>}
      </ListPage>
    );
  };

  const renderLancamentos = () => {
    const items = [...data.transactions].sort((a, b) => b.date.localeCompare(a.date));
    return (
      <ListPage title="Lançamentos" actionLabel="+ Novo lançamento" onAction={() => setModal({ type: "transaction" })} extraAction={{ label: "+ Vários de uma vez", onClick: () => setModal({ type: "bulkTransaction" }) }}>
        {items.length === 0 ? <EmptyState text="Nenhum lançamento ainda." /> : items.map(t => (
          <RowCard key={t.id}
            left={<><div style={{ fontWeight: 600, color: COLORS.text, fontSize: 14 }}>{t.description}</div><div style={{ fontSize: 12, color: COLORS.textSoft }}>{t.category} · {fmtDate(t.date)}{t.paymentMethod ? ` · ${t.paymentMethod}` : ""}</div></>}
            right={<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 14.5, color: t.type === "receita" ? COLORS.accent : COLORS.negative }}>{t.type === "receita" ? "+" : "−"}{money(t.amount)}</span>
              <button onClick={() => removeItem("transactions", t.id)} style={iconBtnDanger}><Trash2 size={14} /></button>
            </div>}
          />
        ))}
      </ListPage>
    );
  };

  const renderPagar = () => {
    const all = data.payables;
    const pending = all.filter(p => p.status !== "pago").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const paid = all.filter(p => p.status === "pago").sort((a, b) => b.dueDate.localeCompare(a.dueDate));
    const pendingGroups = groupByMonth(pending, "dueDate", "asc");
    const paidGroups = groupByMonth(paid, "dueDate", "desc");
    const row = (p) => (
      <RowCard key={p.id}
        left={<><div style={{ fontWeight: 600, color: COLORS.text, fontSize: 14 }}>{p.description}</div><div style={{ fontSize: 12, color: COLORS.textSoft }}>{p.category} · vence {fmtDate(p.dueDate)}{p.recurring ? ` · ${p.periodicity}` : ""}</div></>}
        right={<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 14.5, color: COLORS.text }}>{money(p.amount)}</span>
          <StatusBadge status={p.status} />
          {p.status !== "pago" && <button onClick={() => markPayablePaid(p.id)} style={iconBtn} title="Marcar como paga"><Check size={14} /></button>}
          <button onClick={() => openEditPayable(p)} style={iconBtn}><Pencil size={13} /></button>
          <button onClick={() => removeItem("payables", p.id)} style={iconBtnDanger}><Trash2 size={14} /></button>
        </div>}
      />
    );
    return (
      <ListPage title="Contas a pagar" actionLabel="+ Nova conta" onAction={() => setModal({ type: "payable" })}>
        {all.length === 0 ? <EmptyState text="Nenhuma conta cadastrada." /> : (
          <>
            {pendingGroups.map(g => (
              <div key={g.month}><MonthGroupHeader label={g.label} />{g.items.map(row)}</div>
            ))}
            {paidGroups.length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, marginTop: 22, borderTop: `1px solid ${COLORS.border}`, paddingTop: 16 }}>Pagas</div>
                {paidGroups.map(g => (
                  <div key={g.month}><MonthGroupHeader label={g.label} />{g.items.map(row)}</div>
                ))}
              </>
            )}
          </>
        )}
      </ListPage>
    );
  };

  const renderReceber = () => {
    const all = data.receivables;
    const pending = all.filter(r => r.status !== "recebido").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const received = all.filter(r => r.status === "recebido").sort((a, b) => b.dueDate.localeCompare(a.dueDate));
    const pendingGroups = groupByMonth(pending, "dueDate", "asc");
    const receivedGroups = groupByMonth(received, "dueDate", "desc");
    const row = (r) => (
      <RowCard key={r.id}
        left={<><div style={{ fontWeight: 600, color: COLORS.text, fontSize: 14 }}>{r.who} — {r.description}</div><div style={{ fontSize: 12, color: COLORS.textSoft }}>{r.category} · previsto {fmtDate(r.dueDate)}</div></>}
        right={<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 14.5, color: COLORS.text }}>{money(r.amount)}</span>
          <StatusBadge status={r.status} />
          {r.status === "a_receber" && <button onClick={() => markReceivableReceived(r.id)} style={iconBtn} title="Marcar como recebido"><Check size={14} /></button>}
          <button onClick={() => openEditReceivable(r)} style={iconBtn}><Pencil size={13} /></button>
          <button onClick={() => removeItem("receivables", r.id)} style={iconBtnDanger}><Trash2 size={14} /></button>
        </div>}
      />
    );
    return (
      <ListPage title="Dinheiro a receber" actionLabel="+ Novo recebível" onAction={() => setModal({ type: "receivable" })}>
        {all.length === 0 ? <EmptyState text="Nada por aqui." /> : (
          <>
            {pendingGroups.map(g => (
              <div key={g.month}><MonthGroupHeader label={g.label} />{g.items.map(row)}</div>
            ))}
            {receivedGroups.length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, marginTop: 22, borderTop: `1px solid ${COLORS.border}`, paddingTop: 16 }}>Recebidos</div>
                {receivedGroups.map(g => (
                  <div key={g.month}><MonthGroupHeader label={g.label} />{g.items.map(row)}</div>
                ))}
              </>
            )}
          </>
        )}
      </ListPage>
    );
  };

  const renderGuardado = () => (
    <ListPage title="Dinheiro guardado" actionLabel="+ Novo local" onAction={() => setModal({ type: "savings" })} extraAction={{ label: "Transferir", onClick: () => setModal({ type: "transfer" }) }}>
      <div style={{ background: COLORS.inkSoft, borderRadius: 16, padding: 20, color: "#fff", marginBottom: 16 }}>
        <div style={{ fontSize: 12.5, opacity: 0.75, fontWeight: 600 }}>Patrimônio guardado total</div>
        <div style={{ fontFamily: "Fraunces, serif", fontSize: 28, fontWeight: 600 }}>{money(calc.totalGuardado)}</div>
      </div>
      {data.savings.length === 0 ? <EmptyState text="Nenhum local cadastrado." /> : data.savings.map(s => (
        <RowCard key={s.id}
          left={<><div style={{ fontWeight: 600, color: COLORS.text, fontSize: 14 }}>{s.name}</div><div style={{ fontSize: 12, color: COLORS.textSoft }}>{s.type}</div></>}
          right={<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 14.5, color: COLORS.gold }}>{money(s.balance)}</span>
            <button onClick={() => openEditSavings(s)} style={iconBtn}><Pencil size={13} /></button>
            <button onClick={() => removeItem("savings", s.id)} style={iconBtnDanger}><Trash2 size={14} /></button>
          </div>}
        />
      ))}
    </ListPage>
  );

  const renderRelatorios = () => {
    const cardTotals = {};
    data.transactions.filter(t => t.type === "despesa" && t.cardId).forEach(t => {
      const c = data.cards.find(x => x.id === t.cardId);
      const name = c?.name || "—";
      cardTotals[name] = (cardTotals[name] || 0) + t.amount;
    });
    const cardData = Object.entries(cardTotals).map(([name, value]) => ({ name, value }));
    const totalReceitas = data.transactions.filter(t => t.type === "receita").reduce((s, t) => s + t.amount, 0);
    const totalDespesas = data.transactions.filter(t => t.type === "despesa").reduce((s, t) => s + t.amount, 0);
    const totalCartoes = data.transactions.filter(t => t.type === "despesa" && t.paymentMethod === "Cartão de crédito").reduce((s, t) => s + t.amount, 0);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 22, color: COLORS.text, margin: 0 }}>Relatórios</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
          <StatCard label="Receita total" value={money(totalReceitas)} icon={TrendingUp} tone="positive" />
          <StatCard label="Despesa total" value={money(totalDespesas)} icon={TrendingDown} tone="negative" />
          <StatCard label="Resultado" value={money(totalReceitas - totalDespesas)} icon={ArrowUpRight} />
          <StatCard label="Gasto em cartões" value={money(totalCartoes)} icon={CreditCard} tone="gold" />
          <StatCard label="Taxa de economia" value={`${calc.taxaEconomia}%`} icon={PiggyBank} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="mf-grid-2">
          <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: COLORS.text }}>Gastos por categoria (mês atual)</div>
            {calc.despesasPorCategoria.length === 0 ? <EmptyState text="Sem dados." /> : calc.despesasPorCategoria.map((c, i) => (
              <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: CHART_PALETTE[i % CHART_PALETTE.length] }} />
                <div style={{ flex: 1, fontSize: 13, color: COLORS.text }}>{c.name}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>{money(c.value)}</div>
              </div>
            ))}
          </div>
          <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: COLORS.text }}>Gastos por cartão</div>
            {cardData.length === 0 ? <EmptyState text="Sem dados." /> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={cardData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: COLORS.textSoft }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: COLORS.textSoft }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={v => money(v)} contentStyle={{ borderRadius: 10, border: `1px solid ${COLORS.border}`, fontSize: 12.5 }} />
                  <Bar dataKey="value" fill={COLORS.accent} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: COLORS.text }}>Evolução — receitas x despesas</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={calc.months}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: COLORS.textSoft }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: COLORS.textSoft }} axisLine={false} tickLine={false} tickFormatter={v => `${v / 1000}k`} />
              <Tooltip formatter={v => money(v)} contentStyle={{ borderRadius: 10, border: `1px solid ${COLORS.border}`, fontSize: 12.5 }} />
              <Legend wrapperStyle={{ fontSize: 12.5 }} />
              <Bar dataKey="receitas" fill={COLORS.accent} name="Receitas" radius={[6, 6, 0, 0]} />
              <Bar dataKey="despesas" fill={COLORS.negative} name="Despesas" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  const renderConfig = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 480 }}>
      <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 22, color: COLORS.text, margin: 0 }}>Configurações</h2>
      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 18 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.textSoft, marginBottom: 6 }}>Conta</div>
        <div style={{ fontSize: 13.5, color: COLORS.text, marginBottom: 12 }}>{session.user.email}</div>
        <button onClick={logout} style={{ display: "flex", alignItems: "center", gap: 7, background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "8px 14px", fontSize: 12.8, cursor: "pointer", color: COLORS.text, fontWeight: 600 }}><LogOut size={14} /> Sair</button>
      </div>

      {passkeySupported && (
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 18 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.textSoft, marginBottom: 10 }}>Login com Face ID / Touch ID</div>
          {passkeys.length === 0 ? (
            <div style={{ fontSize: 13, color: COLORS.textSoft, marginBottom: 12 }}>Nenhum dispositivo cadastrado ainda. Ative para entrar sem senha neste aparelho.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              {passkeys.map(pk => (
                <div key={pk.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                  <span style={{ color: COLORS.text }}>{pk.friendly_name || "Dispositivo"}</span>
                  <button onClick={() => deletePasskeyAction(pk.id)} style={iconBtnDanger}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
          <button onClick={registerPasskeyAction} style={{ background: COLORS.accentSoft, border: "none", color: COLORS.accent, borderRadius: 10, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>+ Ativar neste dispositivo</button>
        </div>
      )}

      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 18 }}>
        <label style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.textSoft, display: "block", marginBottom: 6 }}>Nome de exibição</label>
        <input value={data.settings.userName} onChange={e => updateUserName(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${COLORS.border}`, fontSize: 14 }} />
      </div>

      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 18 }}>
        <label style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.textSoft, display: "block", marginBottom: 6 }}>Nome de usuário para login (sem precisar de e-mail)</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={usernameInput} onChange={e => setUsernameInput(e.target.value.replace(/\s/g, "").toLowerCase())} placeholder="ex: joao.silva" style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: `1px solid ${COLORS.border}`, fontSize: 14 }} />
          <button onClick={saveUsername} style={{ background: COLORS.accent, color: "#fff", border: "none", borderRadius: 10, padding: "0 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Salvar</button>
        </div>
        {usernameStatus === "ok" && <div style={{ fontSize: 12, color: COLORS.accent, marginTop: 8 }}>Salvo! Agora dá pra entrar só com esse nome + senha.</div>}
        {usernameStatus && usernameStatus !== "ok" && <div style={{ fontSize: 12, color: COLORS.negative, marginTop: 8 }}>{usernameStatus}</div>}
      </div>

      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 18 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.textSoft, marginBottom: 10 }}>Categorias</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {data.categories.map(c => <span key={c} style={{ background: COLORS.bg, borderRadius: 999, padding: "6px 12px", fontSize: 12.5, color: COLORS.text }}>{c}</span>)}
        </div>
        <button onClick={addCategoryAction} style={{ marginTop: 12, background: "none", border: `1px dashed ${COLORS.border}`, borderRadius: 10, padding: "8px 12px", fontSize: 12.5, cursor: "pointer", color: COLORS.textSoft }}>+ Nova categoria</button>
      </div>

      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 18 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.textSoft, marginBottom: 10 }}>Exportar dados</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["CSV", "Excel", "PDF"].map(fmt => (
            <button key={fmt} onClick={() => showToast(`Exportação em ${fmt} em breve.`)} style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "8px 14px", fontSize: 12.5, cursor: "pointer", color: COLORS.text }}>{fmt}</button>
          ))}
        </div>
      </div>

      <div style={{ background: COLORS.negativeSoft, border: `1px solid ${COLORS.negative}`, borderRadius: 16, padding: 18 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.negative, marginBottom: 8 }}>Zona de risco</div>
        <button onClick={wipeAll} style={{ background: COLORS.surface, border: `1px solid ${COLORS.negative}`, color: COLORS.negative, borderRadius: 10, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Apagar todos os dados</button>
      </div>

      <div style={{ fontSize: 11.5, color: COLORS.textSoft, lineHeight: 1.6 }}>
        O Meufinancer não solicita número de cartão, CVV ou dados bancários sensíveis — apenas as informações necessárias para o seu controle financeiro pessoal. Seus dados ficam isolados por conta, protegidos por regras de acesso no banco de dados.
      </div>
    </div>
  );

  const views = { dashboard: renderDashboard, receitas: renderReceitas, cartoes: renderCartoes, lancamentos: renderLancamentos, pagar: renderPagar, receber: renderReceber, guardado: renderGuardado, relatorios: renderRelatorios, config: renderConfig };

  return (
    <div style={{ fontFamily: "Inter, sans-serif", background: COLORS.bg, minHeight: "100vh", color: COLORS.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        button { font-family: inherit; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: ${COLORS.border}; border-radius: 8px; }
        @media (max-width: 860px) {
          .mf-sidebar { display: none !important; }
          .mf-main { margin-left: 0 !important; padding-bottom: 90px !important; }
          .mf-grid-2 { grid-template-columns: 1fr !important; }
          .mf-grid-3 { grid-template-columns: 1fr !important; }
        }
        @media (min-width: 861px) { .mf-bottomnav { display: none !important; } }
      `}</style>

      <div className="mf-sidebar" style={{ position: "fixed", left: 0, top: 0, bottom: 0, width: 232, background: COLORS.ink, padding: "26px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 10px 26px" }}>
          <img src="/logo.png" alt="Meufinancer" style={{ width: 30, height: 30, objectFit: "contain" }} />
          <span style={{ fontFamily: "Fraunces, serif", fontSize: 18.5, fontWeight: 600, color: "#fff" }}>Meufinancer</span>
        </div>
        {NAV_ITEMS.map(item => {
          const active = view === item.key;
          return (
            <button key={item.key} onClick={() => { setView(item.key); setSelectedCard(null); }}
              style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 10, border: "none", cursor: "pointer", background: active ? "rgba(255,255,255,0.1)" : "transparent", color: active ? "#fff" : "rgba(255,255,255,0.62)", fontSize: 13.6, fontWeight: 600, textAlign: "left" }}>
              <item.icon size={16} />{item.label}
            </button>
          );
        })}
        <div style={{ marginTop: "auto", padding: "14px 12px 0", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.45)" }}>Saldo disponível</div>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: 18, color: "#fff", fontWeight: 600 }}>{money(calc.saldo)}</div>
          <button onClick={logout} style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 12, cursor: "pointer", padding: 0 }}><LogOut size={13} /> Sair</button>
          <div style={{ marginTop: 14, fontSize: 10.5, color: "rgba(255,255,255,0.3)" }}>Elaborado por Sabino</div>
        </div>
      </div>

      <div className="mf-main" style={{ marginLeft: 232, padding: "28px 30px 60px", minHeight: "100vh", position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
          <button onClick={() => showToast("Sem novos alertas.")} style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 9, cursor: "pointer" }}><Bell size={15} color={COLORS.textSoft} /></button>
        </div>

        {views[view]()}

        <button onClick={() => setModal({ type: "transaction" })} style={{ position: "fixed", right: 30, bottom: 30, background: COLORS.accent, color: "#fff", border: "none", borderRadius: 999, padding: "14px 20px", display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 14, cursor: "pointer", boxShadow: "0 10px 26px rgba(46,122,87,0.4)", zIndex: 40 }}>
          <Plus size={17} /> Lançamento
        </button>
      </div>

      <div className="mf-bottomnav" style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: COLORS.surface, borderTop: `1px solid ${COLORS.border}`, display: "flex", overflowX: "auto", padding: "8px 6px", zIndex: 45 }}>
        {NAV_ITEMS.map(item => {
          const active = view === item.key;
          return (
            <button key={item.key} onClick={() => { setView(item.key); setSelectedCard(null); }} style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, border: "none", background: "none", padding: "4px 12px", cursor: "pointer", color: active ? COLORS.accent : COLORS.textSoft }}>
              <item.icon size={17} /><span style={{ fontSize: 9.5, fontWeight: 600 }}>{item.label}</span>
            </button>
          );
        })}
      </div>

      {toast && <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: COLORS.ink, color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13, zIndex: 200 }}>{toast}</div>}

      {modal?.type === "income" && (
        <SimpleFormModal title="Nova receita" onClose={() => setModal(null)} onSubmit={addIncome}
          initial={{ category: data.categories[0], account: "Conta corrente" }}
          fields={[
            { key: "description", label: "Descrição", required: true, placeholder: "Ex: Salário" },
            { key: "amount", label: "Valor", type: "number", required: true, placeholder: "0,00" },
            { key: "expectedDate", label: "Data prevista", type: "date" },
            { key: "receivedDate", label: "Data recebida (deixe vazio se prevista)", type: "date" },
            { key: "category", label: "Categoria", type: "select", options: data.categories, allowAddNew: true, onAddNew: promptNewCategory },
            { key: "account", label: "Conta onde entrou", placeholder: "Ex: Conta corrente" },
            { key: "recurring", label: "Recorrente?", type: "toggle" },
            { key: "note", label: "Observação" }
          ]} />
      )}

      {modal?.type === "card" && (
        <SimpleFormModal title="Novo cartão" onClose={() => setModal(null)} onSubmit={addCard}
          fields={[
            { key: "name", label: "Nome do cartão", required: true, placeholder: "Ex: Nubank" },
            { key: "bank", label: "Banco/instituição", placeholder: "Ex: Nu Pagamentos" },
            { key: "limit", label: "Limite", type: "number", required: true, placeholder: "0,00" },
            { key: "dueDay", label: "Dia do vencimento", type: "number", required: true, placeholder: "Ex: 10" },
            { key: "closingDay", label: "Dia do fechamento (opcional)", type: "number" },
            { key: "color", label: "Cor (hex)", placeholder: "#7A3FE0" }
          ]} />
      )}

      {modal?.type === "editCard" && (
        <SimpleFormModal title="Editar cartão" onClose={() => setModal(null)} onSubmit={editCard}
          initial={modal.initial}
          fields={[
            { key: "name", label: "Nome do cartão", required: true },
            { key: "bank", label: "Banco/instituição" },
            { key: "limit", label: "Limite", type: "number", required: true },
            { key: "dueDay", label: "Dia do vencimento", type: "number", required: true },
            { key: "closingDay", label: "Dia do fechamento", type: "number" },
            { key: "color", label: "Cor (hex)" }
          ]} />
      )}

      {modal?.type === "payable" && (
        <SimpleFormModal title="Nova conta a pagar" onClose={() => setModal(null)} onSubmit={addPayable}
          initial={{ category: data.categories[0], periodicity: "Mensal" }}
          fields={[
            { key: "description", label: "Descrição", required: true, placeholder: "Ex: Aluguel" },
            { key: "amount", label: "Valor", type: "number", required: true },
            { key: "dueDate", label: "Data de vencimento", type: "date", required: true },
            { key: "category", label: "Categoria", type: "select", options: data.categories, allowAddNew: true, onAddNew: promptNewCategory },
            { key: "recurring", label: "Recorrente?", type: "toggle" },
            { key: "periodicity", label: "Periodicidade", type: "select", options: ["Mensal", "Semanal", "Anual"] },
            { key: "note", label: "Observação" }
          ]} />
      )}

      {modal?.type === "editPayable" && (
        <SimpleFormModal title="Editar conta a pagar" onClose={() => setModal(null)} onSubmit={editPayable}
          initial={modal.initial}
          fields={[
            { key: "description", label: "Descrição", required: true },
            { key: "amount", label: "Valor", type: "number", required: true },
            { key: "dueDate", label: "Data de vencimento", type: "date", required: true },
            { key: "category", label: "Categoria", type: "select", options: data.categories, allowAddNew: true, onAddNew: promptNewCategory },
            { key: "recurring", label: "Recorrente?", type: "toggle" },
            { key: "periodicity", label: "Periodicidade", type: "select", options: ["Mensal", "Semanal", "Anual"] },
            { key: "note", label: "Observação" }
          ]} />
      )}

      {modal?.type === "receivable" && (
        <SimpleFormModal title="Novo dinheiro a receber" onClose={() => setModal(null)} onSubmit={addReceivable}
          initial={{ category: data.categories[0] }}
          fields={[
            { key: "who", label: "Quem deve", required: true },
            { key: "description", label: "Descrição", required: true },
            { key: "amount", label: "Valor", type: "number", required: true },
            { key: "dueDate", label: "Data prevista", type: "date", required: true },
            { key: "category", label: "Categoria", type: "select", options: data.categories, allowAddNew: true, onAddNew: promptNewCategory },
            { key: "note", label: "Observação" }
          ]} />
      )}

      {modal?.type === "editReceivable" && (
        <SimpleFormModal title="Editar dinheiro a receber" onClose={() => setModal(null)} onSubmit={editReceivable}
          initial={modal.initial}
          fields={[
            { key: "who", label: "Quem deve", required: true },
            { key: "description", label: "Descrição", required: true },
            { key: "amount", label: "Valor", type: "number", required: true },
            { key: "dueDate", label: "Data prevista", type: "date", required: true },
            { key: "category", label: "Categoria", type: "select", options: data.categories, allowAddNew: true, onAddNew: promptNewCategory },
            { key: "note", label: "Observação" }
          ]} />
      )}

      {modal?.type === "savings" && (
        <SimpleFormModal title="Novo local de dinheiro guardado" onClose={() => setModal(null)} onSubmit={addSavings}
          initial={{ type: "Poupança" }}
          fields={[
            { key: "name", label: "Nome", required: true, placeholder: "Ex: Reserva de emergência" },
            { key: "type", label: "Tipo", type: "select", options: ["Poupança", "Investimentos", "Conta digital", "Espécie", "Outros"] },
            { key: "balance", label: "Saldo atual", type: "number", required: true },
            { key: "note", label: "Observação" }
          ]} />
      )}

      {modal?.type === "editSavings" && (
        <SimpleFormModal title="Editar local de dinheiro guardado" onClose={() => setModal(null)} onSubmit={editSavings}
          initial={modal.initial}
          fields={[
            { key: "name", label: "Nome", required: true },
            { key: "type", label: "Tipo", type: "select", options: ["Poupança", "Investimentos", "Conta digital", "Espécie", "Outros"] },
            { key: "balance", label: "Saldo atual", type: "number", required: true },
            { key: "note", label: "Observação" }
          ]} />
      )}

      {modal?.type === "transfer" && (
        <SimpleFormModal title="Transferência" onClose={() => setModal(null)} onSubmit={doTransfer}
          initial={{ direction: "toSavings" }}
          fields={[
            { key: "direction", label: "Direção", type: "select", options: [{ value: "toSavings", label: "Saldo → Dinheiro guardado" }, { value: "fromSavings", label: "Dinheiro guardado → Saldo" }] },
            { key: "savingsId", label: "Local", type: "select", options: data.savings.map(s => ({ value: s.id, label: s.name })) },
            { key: "amount", label: "Valor", type: "number", required: true }
          ]} />
      )}

      {modal?.type === "transaction" && <TransactionModal data={data} onClose={() => setModal(null)} onSubmit={addTransaction} onAddCategory={async () => { const name = prompt("Nome da nova categoria:"); if (!name) return null; await db.addCategory(userId, name); await refresh(); return name; }} />}

      {modal?.type === "bulkTransaction" && <BulkTransactionModal data={data} onClose={() => setModal(null)} onSubmit={addBulkTransactions} />}

      {modal?.type === "importCard" && <ImportCardPurchasesModal data={data} cardId={modal.cardId} onClose={() => setModal(null)} onSubmit={(rows) => importCardPurchases(modal.cardId, rows)} />}
    </div>
  );
}

/* ---------------- reusable page bits ---------------- */

function ListPage({ title, actionLabel, onAction, extraAction, children }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 22, color: COLORS.text, margin: 0 }}>{title}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          {extraAction && <button onClick={extraAction.onClick} style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 15px", fontSize: 13, fontWeight: 700, cursor: "pointer", color: COLORS.text }}>{extraAction.label}</button>}
          <button onClick={onAction} style={{ background: COLORS.accent, color: "#fff", border: "none", borderRadius: 10, padding: "9px 15px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{actionLabel}</button>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </div>
  );
}

function RowCard({ left, right }) {
  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <div>{left}</div>
      {right}
    </div>
  );
}

function EmptyState({ text }) {
  return <div style={{ textAlign: "center", padding: "40px 0", color: COLORS.textSoft, fontSize: 13.5, background: COLORS.surface, border: `1px dashed ${COLORS.border}`, borderRadius: 14 }}>{text}</div>;
}

const iconBtn = { background: COLORS.accentSoft, border: "none", color: COLORS.accent, borderRadius: 8, padding: 7, cursor: "pointer", display: "flex" };
const iconBtnDanger = { background: COLORS.negativeSoft, border: "none", color: COLORS.negative, borderRadius: 8, padding: 7, cursor: "pointer", display: "flex" };

/* ---------------- transaction modal (with parcelas) ---------------- */

function TransactionModal({ data, onClose, onSubmit, onAddCategory }) {
  const [type, setType] = useState("despesa");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [paymentMethod, setPaymentMethod] = useState("Pix");
  const [category, setCategory] = useState(data.categories[0]);
  const [cardId, setCardId] = useState(data.cards[0]?.id || "");
  const [parcelado, setParcelado] = useState(false);
  const [numParcelas, setNumParcelas] = useState(2);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!description || !amount) return;
    setSaving(true);
    await onSubmit({ type, description, amount, date, paymentMethod, category, cardId, parcelado, numParcelas, status: type === "despesa" ? "pago" : "recebida" });
    setSaving(false);
  };

  const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${COLORS.border}`, fontSize: 14 };
  const label = { fontSize: 12.5, fontWeight: 600, color: COLORS.textSoft, display: "block", marginBottom: 6 };

  return (
    <ModalShell title="Novo lançamento" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={label}>Tipo</label>
          <div style={{ display: "flex", gap: 8 }}>
            {[{ v: "despesa", l: "Despesa" }, { v: "receita", l: "Receita" }, { v: "transferencia", l: "Transferência" }].map(o => (
              <button key={o.v} onClick={() => setType(o.v)} style={{ flex: 1, padding: "9px 0", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600, border: `1px solid ${type === o.v ? COLORS.accent : COLORS.border}`, background: type === o.v ? COLORS.accentSoft : COLORS.surface, color: type === o.v ? COLORS.accent : COLORS.textSoft }}>{o.l}</button>
            ))}
          </div>
        </div>

        <div>
          <label style={label}>Descrição</label>
          <input style={inputStyle} value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex: Compra supermercado" />
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={label}>Valor</label>
            <input style={inputStyle} type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>Data</label>
            <input style={inputStyle} type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>

        <div>
          <label style={label}>Categoria</label>
          <div style={{ display: "flex", gap: 6 }}>
            <select style={inputStyle} value={category} onChange={e => setCategory(e.target.value)}>
              {data.categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button type="button" onClick={async () => { const name = await onAddCategory(); if (name) setCategory(name); }} title="Nova categoria" style={{ flexShrink: 0, width: 38, borderRadius: 10, border: `1px solid ${COLORS.border}`, background: COLORS.surface, color: COLORS.accent, cursor: "pointer", fontSize: 18, fontWeight: 700 }}>+</button>
          </div>
        </div>

        {type !== "transferencia" && (
          <div>
            <label style={label}>Forma de pagamento</label>
            <select style={inputStyle} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        )}

        {type === "despesa" && paymentMethod === "Cartão de crédito" && (
          <>
            <div>
              <label style={label}>Qual cartão?</label>
              <select style={inputStyle} value={cardId} onChange={e => setCardId(e.target.value)}>
                {data.cards.length === 0 && <option value="">Cadastre um cartão primeiro</option>}
                {data.cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={label}>Compra parcelada?</label>
              <div style={{ display: "flex", gap: 8 }}>
                {["Sim", "Não"].map(opt => (
                  <button key={opt} type="button" onClick={() => setParcelado(opt === "Sim")}
                    style={{ flex: 1, padding: "9px 0", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600, border: `1px solid ${(parcelado === (opt === "Sim")) ? COLORS.accent : COLORS.border}`, background: (parcelado === (opt === "Sim")) ? COLORS.accentSoft : COLORS.surface, color: (parcelado === (opt === "Sim")) ? COLORS.accent : COLORS.textSoft }}>{opt}</button>
                ))}
              </div>
            </div>
            {parcelado && (
              <div>
                <label style={label}>Quantidade de parcelas</label>
                <input style={inputStyle} type="number" min="2" value={numParcelas} onChange={e => setNumParcelas(e.target.value)} />
                {amount > 0 && <div style={{ fontSize: 12, color: COLORS.textSoft, marginTop: 6 }}>{numParcelas}x de {money((parseFloat(amount) || 0) / (parseInt(numParcelas) || 1))}</div>}
              </div>
            )}
          </>
        )}

        <button disabled={saving} onClick={submit} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>{saving ? "Salvando…" : "Salvar lançamento"}</button>
      </div>
    </ModalShell>
  );
}

/* ---------------- bulk quick-add lançamentos ---------------- */

function BulkTransactionModal({ data, onClose, onSubmit }) {
  const [type, setType] = useState("despesa");
  const [rows, setRows] = useState([{ description: "", amount: "", category: data.categories[0], date: todayISO() }]);
  const [saving, setSaving] = useState(false);

  const updateRow = (i, key, value) => setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: value } : r));
  const addRow = () => setRows(prev => [...prev, { description: "", amount: "", category: data.categories[0], date: todayISO() }]);
  const removeRow = (i) => setRows(prev => prev.filter((_, idx) => idx !== i));

  const submit = async () => {
    setSaving(true);
    await onSubmit(rows, type);
    setSaving(false);
  };

  const inputStyle = { padding: "8px 10px", borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 13, background: "#0F1210", color: COLORS.text };

  return (
    <ModalShell title="Vários lançamentos de uma vez" onClose={onClose} wide>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[{ v: "despesa", l: "Despesas" }, { v: "receita", l: "Receitas" }].map(o => (
          <button key={o.v} onClick={() => setType(o.v)} style={{ flex: 1, padding: "9px 0", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600, border: `1px solid ${type === o.v ? COLORS.accent : COLORS.border}`, background: type === o.v ? COLORS.accentSoft : COLORS.surface, color: type === o.v ? COLORS.accent : COLORS.textSoft }}>{o.l}</button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input style={{ ...inputStyle, flex: 2 }} placeholder="Descrição" value={r.description} onChange={e => updateRow(i, "description", e.target.value)} />
            <input style={{ ...inputStyle, flex: 1 }} type="number" step="0.01" placeholder="Valor" value={r.amount} onChange={e => updateRow(i, "amount", e.target.value)} />
            <select style={{ ...inputStyle, flex: 1 }} value={r.category} onChange={e => updateRow(i, "category", e.target.value)}>
              {data.categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input style={{ ...inputStyle, flex: 1 }} type="date" value={r.date} onChange={e => updateRow(i, "date", e.target.value)} />
            <button onClick={() => removeRow(i)} style={{ ...iconBtnDanger, flexShrink: 0 }}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>

      <button onClick={addRow} style={{ background: "none", border: `1px dashed ${COLORS.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, cursor: "pointer", color: COLORS.textSoft, marginBottom: 14, width: "100%" }}>+ Adicionar linha</button>

      <button disabled={saving} onClick={submit} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>{saving ? "Salvando…" : `Salvar ${rows.length} lançamento(s)`}</button>
    </ModalShell>
  );
}

/* ---------------- bulk import of existing card purchases ---------------- */

function ImportCardPurchasesModal({ data, cardId, onClose, onSubmit }) {
  const [rows, setRows] = useState([{ description: "", amount: "", parcelas: 1, category: data.categories[0], date: todayISO() }]);
  const [saving, setSaving] = useState(false);

  const updateRow = (i, key, value) => setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: value } : r));
  const addRow = () => setRows(prev => [...prev, { description: "", amount: "", parcelas: 1, category: data.categories[0], date: todayISO() }]);
  const removeRow = (i) => setRows(prev => prev.filter((_, idx) => idx !== i));

  const submit = async () => {
    setSaving(true);
    await onSubmit(rows.filter(r => r.description && r.amount));
    setSaving(false);
  };

  const inputStyle = { padding: "8px 10px", borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 13, background: "#0F1210", color: COLORS.text };

  return (
    <ModalShell title="Lançar compras existentes do cartão" onClose={onClose} wide>
      <div style={{ fontSize: 12.5, color: COLORS.textSoft, marginBottom: 14 }}>
        Coloque cada compra que já existe no cartão, o valor total e em quantas parcelas está. O sistema já cria as parcelas futuras e organiza nas faturas certas.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <input style={{ ...inputStyle, flex: 2, minWidth: 120 }} placeholder="Descrição (ex: Notebook)" value={r.description} onChange={e => updateRow(i, "description", e.target.value)} />
            <input style={{ ...inputStyle, flex: 1, minWidth: 90 }} type="number" step="0.01" placeholder="Valor total" value={r.amount} onChange={e => updateRow(i, "amount", e.target.value)} />
            <input style={{ ...inputStyle, width: 70 }} type="number" min="1" placeholder="Parc." value={r.parcelas} onChange={e => updateRow(i, "parcelas", e.target.value)} />
            <select style={{ ...inputStyle, flex: 1, minWidth: 100 }} value={r.category} onChange={e => updateRow(i, "category", e.target.value)}>
              {data.categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input style={{ ...inputStyle, minWidth: 130 }} type="date" value={r.date} onChange={e => updateRow(i, "date", e.target.value)} />
            <button onClick={() => removeRow(i)} style={{ ...iconBtnDanger, flexShrink: 0 }}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      <button onClick={addRow} style={{ background: "none", border: `1px dashed ${COLORS.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, cursor: "pointer", color: COLORS.textSoft, marginBottom: 14, width: "100%" }}>+ Adicionar compra</button>
      <button disabled={saving} onClick={submit} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>{saving ? "Salvando…" : "Salvar compras"}</button>
    </ModalShell>
  );
}
