import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  AlertTriangle,
  Activity,
  BadgeCheck,
  BarChart3,
  Bell,
  BookOpenCheck,
  BriefcaseBusiness,
  FolderPlus,
  CalendarDays,
  CalendarClock,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Factory,
  FileText,
  Flame,
  History,
  LineChart,
  PackageCheck,
  Percent,
  Target,
  RefreshCw,
  Search,
  ShieldCheck,
  Signature,
  Store,
  TrendingUp,
  Truck,
  Trophy,
  UserRound,
  Users,
  WalletCards,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { checkClientRateLimit, rateLimitMessage } from "@/lib/rateLimit";
import { agendaEventSchema, firstZodMessage, sanitizePlainText } from "@/lib/validation";
import { buildNewProjectPayload } from "@/lib/projectDefaults";

type CrmStatus =
  | "novo_atendimento"
  | "briefing_visita"
  | "curadoria_produtos"
  | "proposta_orcamento"
  | "followup_negociacao"
  | "pedido_fechado"
  | "perdido";

type CrmOrderStatus =
  | "sem_pedido"
  | "revisao_tecnica"
  | "pedido_faturado"
  | "producao"
  | "transporte"
  | "recebido_loja"
  | "entrega_agendada"
  | "entregue";

type SectionKey = "visao" | "clientes" | "funil" | "pedidos" | "aprovacoes" | "posvenda" | "agenda" | "arquitetos";
type PeriodFilter = "today" | "week" | "month" | "custom";

interface CrmProject {
  id: string;
  user_id: string;
  seller_user_id?: string | null;
  name: string;
  created_at: string;
  client_name: string | null;
  architect_name: string | null;
  consultant_name: string | null;
  crm_customer_id?: string | null;
  crm_tags?: string[] | null;
  initial_notes?: string | null;
  crm_status?: CrmStatus | null;
  crm_expected_close_date?: string | null;
  crm_last_contact_at?: string | null;
  crm_next_followup_at?: string | null;
  crm_notes?: string | null;
  crm_expected_value?: number | null;
  crm_sold_value?: number | null;
  crm_quote_status?: string | null;
  crm_order_status?: CrmOrderStatus | string | null;
  crm_delivery_status?: string | null;
  crm_approval_status?: string | null;
  crm_margin_percent?: number | null;
  crm_risk_level?: "baixo" | "medio" | "alto" | null;
  crm_architect_profile_id?: string | null;
  sale_completed_at?: string | null;
  technical_notebook_signed_at?: string | null;
  ownerName?: string;
  sellerUserId?: string | null;
  sellerName?: string;
  nextAction?: string | null;
  latestInteractionAt?: string | null;
  itemCount?: number;
  totalValue?: number;
  brandCount?: number;
  categoryCount?: number;
  isLead?: boolean;
  leadId?: string;
  leadPhone?: string | null;
  leadSource?: string | null;
}

interface CrmLead {
  id: string;
  seller_user_id: string;
  customer_id: string | null;
  architect_profile_id: string | null;
  project_id: string | null;
  lead_name: string;
  phone: string | null;
  lead_source: string | null;
  notes: string | null;
  crm_status: CrmStatus;
  status: string;
  crm_tags: string[] | null;
  next_action: string | null;
  next_followup_at: string | null;
  converted_project_id: string | null;
  created_at: string;
  updated_at?: string | null;
  sellerName?: string;
  architectName?: string | null;
}

interface ProjectItem {
  id?: string;
  project_id: string;
  quantity: number | null;
  price: number | null;
  discount_price: number | null;
  product_id: string;
  selected_finish_id?: string | null;
  selected_finish_id_2?: string | null;
  environment_label?: string | null;
  presentation_dimensions?: string | null;
  notes?: string | null;
  productName?: string;
  productCategory?: string;
  brandId?: string;
  brandName?: string;
  techSheet?: string | null;
  file3d?: string | null;
  file2d?: string | null;
  finishName?: string | null;
  finishName2?: string | null;
}

interface CrmCustomer {
  id: string;
  seller_user_id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  address: string | null;
  lead_source: string | null;
  architect_name: string | null;
  store_name: string | null;
  architect_profile_id?: string | null;
  customer_type: string;
  desired_style: string | null;
  investment_range: string | null;
  desired_rooms: string[] | null;
  purchase_deadline: string | null;
  construction_address?: string | null;
  construction_status?: string | null;
  construction_deadline?: string | null;
  move_in_deadline?: string | null;
  birth_date?: string | null;
  urgency_level: string;
  purchase_reason: string | null;
  status: string;
  notes: string | null;
  created_at?: string;
  source?: "crm" | "project";
  sellerName?: string;
  projectCount?: number;
  totalValue?: number;
}

interface CrmInteraction {
  id: string;
  customer_id: string | null;
  project_id: string | null;
  user_id: string;
  interaction_type: string;
  description: string;
  next_action: string | null;
  next_followup_at: string | null;
  created_at: string;
}

interface CrmQuote {
  id: string;
  project_id: string;
  customer_id: string | null;
  seller_user_id: string;
  final_value: number;
  status: string;
  valid_until: string | null;
}

interface CrmOrder {
  id: string;
  project_id: string;
  customer_id: string | null;
  seller_user_id: string;
  brand_id: string | null;
  status: string;
  risk_level: string;
  expected_deadline: string | null;
  delivered_at: string | null;
}

interface CrmTicket {
  id: string;
  customer_id: string | null;
  project_id: string | null;
  order_id: string | null;
  issue_type: string;
  description: string;
  status: string;
  due_date: string | null;
}

interface CrmAgendaEvent {
  id: string;
  project_id: string | null;
  customer_id: string | null;
  seller_user_id: string;
  architect_profile_id: string | null;
  title: string;
  event_type: string;
  scheduled_at: string;
  notify_at: string | null;
  completed_at: string | null;
  status: string;
  location: string | null;
  notes: string | null;
}

interface CrmBrandDeliveryTerm {
  id: string;
  brand_id: string;
  delivery_days: number;
  followup_days_before: number;
  notes: string | null;
}

interface BrandOption {
  id: string;
  name: string;
}

interface ArchitectProfile {
  user_id: string;
  full_name: string | null;
  phone?: string | null;
  email?: string | null;
  birth_date: string | null;
  seller_id: string | null;
}

interface CrmSalesTarget {
  id: string;
  seller_user_id: string | null;
  period_month: string;
  target_value: number;
  notes: string | null;
}

interface SellerPerformanceRow {
  sellerId: string;
  seller: string;
  active: number;
  projects: number;
  sold: number;
  value: number;
  target: number;
  progress: number;
  attention: number;
}

const commercialStatuses: Array<{ key: CrmStatus; label: string; tone: string }> = [
  { key: "novo_atendimento", label: "Novo atendimento", tone: "bg-slate-100 text-slate-700" },
  { key: "briefing_visita", label: "Briefing / Visita a loja", tone: "bg-zinc-100 text-zinc-700" },
  { key: "curadoria_produtos", label: "Curadoria de produtos", tone: "bg-stone-100 text-stone-700" },
  { key: "proposta_orcamento", label: "Proposta / Orcamento", tone: "bg-amber-50 text-amber-700" },
  { key: "followup_negociacao", label: "Follow-up / Negociacao", tone: "bg-orange-50 text-orange-700" },
  { key: "pedido_fechado", label: "Pedido fechado", tone: "bg-emerald-50 text-emerald-700" },
  { key: "perdido", label: "Perdido", tone: "bg-red-50 text-red-700" },
];

const legacyStatusMap: Record<string, CrmStatus> = {
  briefing: "briefing_visita",
  briefing_iniciado: "briefing_visita",
  curadoria: "curadoria_produtos",
  apresentacao: "proposta_orcamento",
  apresentacao_enviada: "proposta_orcamento",
  orcamento: "proposta_orcamento",
  orcamento_montagem: "proposta_orcamento",
  orcamento_enviado: "proposta_orcamento",
  followup_agendado: "followup_negociacao",
  negociacao: "followup_negociacao",
  aguardando_aprovacao: "followup_negociacao",
  revisao_tecnica: "pedido_fechado",
  pedido_aprovado: "pedido_fechado",
  pedido_assinado: "pedido_fechado",
  pedido_faturado: "pedido_fechado",
  producao: "pedido_fechado",
  transporte: "pedido_fechado",
  recebido_loja: "pedido_fechado",
  entrega: "pedido_fechado",
  entrega_agendada: "pedido_fechado",
  entregue: "pedido_fechado",
  pos_venda: "pedido_fechado",
  venda_concluida: "pedido_fechado",
  concluido: "pedido_fechado",
};

const commercialKanbanStatuses = commercialStatuses.filter(status => status.key !== "perdido");
const orderStatuses: Array<{ key: CrmOrderStatus; label: string; tone: string }> = [
  { key: "revisao_tecnica", label: "Revisao tecnica", tone: "bg-purple-50 text-purple-700" },
  { key: "pedido_faturado", label: "Pedido faturado", tone: "bg-green-50 text-green-700" },
  { key: "producao", label: "Em producao", tone: "bg-cyan-50 text-cyan-700" },
  { key: "transporte", label: "Em transporte", tone: "bg-indigo-50 text-indigo-700" },
  { key: "recebido_loja", label: "Recebido na loja", tone: "bg-teal-50 text-teal-700" },
  { key: "entrega_agendada", label: "Entrega agendada", tone: "bg-sky-50 text-sky-700" },
  { key: "entregue", label: "Entregue", tone: "bg-green-100 text-green-800" },
];

const legacyOrderStatusMap: Record<string, CrmOrderStatus> = {
  montagem: "revisao_tecnica",
  revisao: "revisao_tecnica",
  aprovado: "revisao_tecnica",
  assinado: "revisao_tecnica",
  enviado_marca: "revisao_tecnica",
  confirmado: "revisao_tecnica",
  faturado: "pedido_faturado",
  recebido: "recebido_loja",
  recebido_parcial: "recebido_loja",
  recebido_completo: "recebido_loja",
  recebido_ocorrencia: "recebido_loja",
  montagem_agendada: "entrega_agendada",
  montagem_concluida: "entregue",
  finalizado: "entregue",
  ocorrencia: "revisao_tecnica",
};

const legacyCommercialPersistMap: Record<CrmStatus, string> = {
  novo_atendimento: "novo_atendimento",
  briefing_visita: "briefing_iniciado",
  curadoria_produtos: "curadoria_produtos",
  proposta_orcamento: "orcamento_enviado",
  followup_negociacao: "negociacao",
  pedido_fechado: "pedido_assinado",
  perdido: "perdido",
};

const legacyOrderPersistMap: Record<CrmOrderStatus, string> = {
  sem_pedido: "sem_pedido",
  revisao_tecnica: "revisao",
  pedido_faturado: "faturado",
  producao: "producao",
  transporte: "transporte",
  recebido_loja: "recebido",
  entrega_agendada: "entrega_agendada",
  entregue: "entregue",
};

function legacyProjectUpdates<T extends Partial<CrmProject>>(updates: T): T {
  return {
    ...updates,
    ...(updates.crm_status ? { crm_status: legacyCommercialPersistMap[normalizeStatus(updates.crm_status)] } : {}),
    ...(updates.crm_order_status ? { crm_order_status: legacyOrderPersistMap[normalizeOrderStatus(updates.crm_order_status)] } : {}),
  } as T;
}

function legacyOrderStatus(status: string | null | undefined) {
  return legacyOrderPersistMap[normalizeOrderStatus(status)];
}

function isStatusConstraintError(error: unknown) {
  const text = JSON.stringify(error || {}).toLowerCase();
  return text.includes("check constraint") || text.includes("23514") || text.includes("crm_status") || text.includes("crm_order_status") || text.includes("crm_orders_status");
}
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const sections: Array<{ key: SectionKey; label: string }> = [
  { key: "visao", label: "Visao geral" },
  { key: "clientes", label: "Carteira de clientes" },
  { key: "funil", label: "Kanban Comercial" },
  { key: "pedidos", label: "Orcamento e pedido tecnico" },
  { key: "aprovacoes", label: "Aprovacoes internas" },
  { key: "posvenda", label: "Gestao de Pedido" },
  { key: "agenda", label: "Agenda e prazos" },
  { key: "arquitetos", label: "Arquitetos" },
];

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function parseTags(value: string | string[] | null | undefined) {
  const tags = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(tags
    .map(tag => sanitizePlainText(tag, 40).trim())
    .filter(Boolean)
    .slice(0, 10))];
}

function statusLabel(status: string | null | undefined) {
  return commercialStatuses.find(item => item.key === normalizeStatus(status))?.label || "Novo atendimento";
}

function normalizeStatus(status: string | null | undefined): CrmStatus {
  if (status && legacyStatusMap[status]) return legacyStatusMap[status];
  return commercialStatuses.some(item => item.key === status) ? status as CrmStatus : "novo_atendimento";
}

function orderStatusLabel(status: string | null | undefined) {
  return orderStatuses.find(item => item.key === normalizeOrderStatus(status))?.label || "Sem pedido";
}

function normalizeOrderStatus(status: string | null | undefined): CrmOrderStatus {
  if (!status || status === "sem_pedido") return "sem_pedido";
  if (legacyOrderStatusMap[status]) return legacyOrderStatusMap[status];
  return orderStatuses.some(item => item.key === status) ? status as CrmOrderStatus : "revisao_tecnica";
}

function projectValue(project: CrmProject) {
  return Number(project.crm_sold_value ?? project.crm_expected_value ?? project.totalValue ?? 0);
}

function projectActivityDate(project: CrmProject) {
  return new Date(project.crm_last_contact_at || project.created_at);
}

function daysSince(date: Date) {
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

function shortDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(value));
}

function longDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function isClosedStatus(status: string | null | undefined) {
  return normalizeStatus(status) === "perdido";
}

function isSoldStatus(status: string | null | undefined) {
  return normalizeStatus(status) === "pedido_fechado";
}

function hasOperationalOrder(project: CrmProject) {
  return normalizeOrderStatus(project.crm_order_status) !== "sem_pedido";
}

function addDays(value: string, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function monthStart(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayStart(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayEnd(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function weekStart(date = new Date()) {
  const start = dayStart(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  return start;
}

function periodRange(period: PeriodFilter, customStart: string, customEnd: string) {
  const now = new Date();
  if (period === "today") return { start: dayStart(now), end: dayEnd(now) };
  if (period === "week") {
    const start = weekStart(now);
    const end = dayEnd(addDays(start.toISOString(), 6));
    return { start, end };
  }
  if (period === "custom" && customStart && customEnd) {
    return { start: dayStart(new Date(customStart)), end: dayEnd(new Date(customEnd)) };
  }
  return { start: monthStart(now), end: dayEnd(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
}

function isWithinRange(value: string | null | undefined, range: { start: Date; end: Date }) {
  if (!value) return false;
  const date = new Date(value);
  return date >= range.start && date <= range.end;
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", "");
}

function escapeHtml(value: string | null | undefined) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatCurrency(value: number) {
  return currency.format(value || 0);
}

function customerKey(name: string | null | undefined) {
  return normalizeText(name || "");
}

const CRM_PROJECT_SELECT = [
  "id", "user_id", "seller_user_id", "name", "created_at", "client_name",
  "architect_name", "consultant_name", "crm_customer_id", "crm_tags",
  "initial_notes", "crm_status", "crm_expected_close_date", "crm_last_contact_at",
  "crm_next_followup_at", "crm_notes", "crm_expected_value", "crm_sold_value",
  "crm_quote_status", "crm_order_status", "crm_delivery_status", "crm_approval_status",
  "crm_margin_percent", "crm_risk_level", "crm_architect_profile_id",
  "sale_completed_at", "technical_notebook_signed_at",
].join(", ");
const CRM_CUSTOMER_SELECT = [
  "id", "seller_user_id", "name", "phone", "whatsapp", "email", "city", "address",
  "lead_source", "architect_name", "store_name", "architect_profile_id",
  "customer_type", "desired_style", "investment_range", "desired_rooms",
  "purchase_deadline", "construction_address", "construction_status",
  "construction_deadline", "move_in_deadline", "birth_date", "urgency_level",
  "purchase_reason", "status", "notes", "created_at",
].join(", ");
const CRM_LEAD_SELECT = [
  "id", "seller_user_id", "customer_id", "architect_profile_id", "project_id",
  "lead_name", "phone", "lead_source", "notes", "crm_status", "status",
  "crm_tags", "next_action", "next_followup_at", "converted_project_id",
  "created_at", "updated_at",
].join(", ");
const CRM_INTERACTION_SELECT = "id, customer_id, project_id, user_id, interaction_type, description, next_action, next_followup_at, created_at";
const CRM_QUOTE_SELECT = "id, project_id, customer_id, seller_user_id, final_value, status, valid_until";
const CRM_ORDER_SELECT = "id, project_id, customer_id, seller_user_id, brand_id, status, risk_level, expected_deadline, delivered_at";
const CRM_TICKET_SELECT = "id, customer_id, project_id, order_id, issue_type, description, status, due_date";
const CRM_AGENDA_SELECT = "id, project_id, customer_id, seller_user_id, architect_profile_id, title, event_type, scheduled_at, notify_at, completed_at, status, location, notes";
const CRM_TARGET_SELECT = "id, seller_user_id, period_month, target_value, notes";

export default function OperationsPage() {
  const { user, isAdmin, isManager, isSeller } = useAuth();
  const location = useLocation();
  const [activeSection, setActiveSection] = useState<SectionKey>("visao");
  const [projects, setProjects] = useState<CrmProject[]>([]);
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [customers, setCustomers] = useState<CrmCustomer[]>([]);
  const [interactions, setInteractions] = useState<CrmInteraction[]>([]);
  const [quotes, setQuotes] = useState<CrmQuote[]>([]);
  const [orders, setOrders] = useState<CrmOrder[]>([]);
  const [tickets, setTickets] = useState<CrmTicket[]>([]);
  const [agendaEvents, setAgendaEvents] = useState<CrmAgendaEvent[]>([]);
  const [brandTerms, setBrandTerms] = useState<CrmBrandDeliveryTerm[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [technicalItems, setTechnicalItems] = useState<ProjectItem[]>([]);
  const [architects, setArchitects] = useState<ArchitectProfile[]>([]);
  const [salesTargets, setSalesTargets] = useState<CrmSalesTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedSellerId, setSelectedSellerId] = useState("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("month");
  const [customPeriodStart, setCustomPeriodStart] = useState("");
  const [customPeriodEnd, setCustomPeriodEnd] = useState("");
  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const [leadDraft, setLeadDraft] = useState({
    sellerUserId: "",
    leadName: "",
    phone: "",
    leadSource: "",
    architectProfileId: "",
    notes: "",
    crmStatus: "novo_atendimento" as CrmStatus,
    tags: "",
  });
  const [selectedKanbanItem, setSelectedKanbanItem] = useState<CrmProject | null>(null);
  const [kanbanDraft, setKanbanDraft] = useState({ crmStatus: "novo_atendimento" as CrmStatus, tags: "", notes: "", nextAction: "", nextFollowupAt: "" });
  const canManageOrders = isAdmin || isManager;
  const isRoutinePage = location.pathname.startsWith("/rotina") || !canManageOrders;
  const visibleSections = useMemo(() => {
    if (canManageOrders) return sections;
    const sellerKeys: SectionKey[] = ["visao", "clientes", "funil", "pedidos", "agenda", "arquitetos"];
    return sections.filter(section => sellerKeys.includes(section.key));
  }, [canManageOrders]);

  useEffect(() => {
    if (!visibleSections.some(section => section.key === activeSection)) {
      setActiveSection("visao");
    }
  }, [activeSection, visibleSections]);

  const loadCrm = async () => {
    if (!user) return;
    setLoading(true);

    let projectQuery = supabase
      .from("projects")
      .select(CRM_PROJECT_SELECT)
      .order("created_at", { ascending: false });

    if (!canManageOrders && isSeller) projectQuery = projectQuery.or(`seller_user_id.eq.${user.id},user_id.eq.${user.id}`);
    if (!canManageOrders && !isSeller) projectQuery = projectQuery.eq("user_id", user.id);

    const { data: projectRows, error } = await projectQuery;
    if (error) {
      console.error("CRM project load error:", error);
      toast({ title: "Erro ao carregar gestao", description: "Tente novamente.", variant: "destructive" });
      setLoading(false);
      return;
    }

    const rawProjects = (projectRows || []) as unknown as CrmProject[];
    const projectIds = rawProjects.map(project => project.id);
    const ownerIds = [...new Set(rawProjects.flatMap(project => [project.user_id, project.seller_user_id]).filter((id): id is string => Boolean(id)))];

    let customersQuery = (supabase as any).from("crm_customers").select(CRM_CUSTOMER_SELECT).order("created_at", { ascending: false });
    if (!canManageOrders) customersQuery = customersQuery.eq("seller_user_id", user.id);

    let leadsQuery = (supabase as any).from("crm_leads").select(CRM_LEAD_SELECT).order("created_at", { ascending: false });
    if (!canManageOrders) leadsQuery = leadsQuery.eq("seller_user_id", user.id);

    const [
      { data: itemRows },
      { data: profileRows },
      { data: allProfilesRows },
      { data: sellerRowsData },
      customersRes,
      leadsRes,
      interactionsRes,
      quotesRes,
      ordersRes,
      ticketsRes,
      agendaRes,
      brandTermsRes,
      brandsRes,
      targetsRes,
    ] = await Promise.all([
      projectIds.length
        ? supabase
          .from("project_items")
          .select("id, project_id, product_id, quantity, price, discount_price, selected_finish_id, selected_finish_id_2, environment_label, presentation_dimensions, notes")
          .in("project_id", projectIds)
        : Promise.resolve({ data: [] as ProjectItem[] }),
      ownerIds.length
        ? supabase
          .from("profiles")
          .select("user_id, full_name, phone, email, birth_date, seller_id")
          .in("user_id", ownerIds)
        : Promise.resolve({ data: [] as ArchitectProfile[] }),
      supabase.from("profiles").select("user_id, full_name, phone, email, birth_date, seller_id").order("full_name"),
      supabase.rpc("list_sellers"),
      customersQuery,
      leadsQuery,
      (supabase as any).from("crm_interactions").select(CRM_INTERACTION_SELECT).order("created_at", { ascending: false }).limit(200),
      (supabase as any).from("crm_quotes").select(CRM_QUOTE_SELECT).order("created_at", { ascending: false }).limit(200),
      (supabase as any).from("crm_orders").select(CRM_ORDER_SELECT).order("created_at", { ascending: false }).limit(200),
      (supabase as any).from("crm_support_tickets").select(CRM_TICKET_SELECT).order("created_at", { ascending: false }).limit(200),
      (supabase as any).from("crm_agenda_events").select(CRM_AGENDA_SELECT).order("scheduled_at", { ascending: true }).limit(300),
      (supabase as any).from("crm_brand_delivery_terms").select("id, brand_id, delivery_days, followup_days_before, notes"),
      supabase.from("brands").select("id, name").order("name"),
      (supabase as any).from("crm_sales_targets").select(CRM_TARGET_SELECT).gte("period_month", monthKey(monthStart(new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1)))),
    ]);

    const totals = new Map<string, { count: number; value: number; brands: Set<string>; categories: Set<string> }>();
    const productIds = [...new Set(((itemRows || []) as ProjectItem[]).map(item => item.product_id))];
    const finishIds = [...new Set(((itemRows || []) as ProjectItem[])
      .flatMap(item => [item.selected_finish_id, item.selected_finish_id_2])
      .filter((id): id is string => Boolean(id)))];
    const [{ data: productRows }, { data: finishRows }] = await Promise.all([
      productIds.length
        ? supabase.from("products").select("id, name, brand_id, category, tech_sheet, file_3d, file_2d, description").in("id", productIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string; brand_id: string; category: string; tech_sheet: string | null; file_3d: string | null; file_2d: string | null; description: string | null }> }),
      finishIds.length
        ? supabase.from("finishes").select("id, name").in("id", finishIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    ]);
    const productMap = new Map((productRows || []).map(product => [product.id, product]));
    const brandMap = new Map(((brandsRes.data || []) as BrandOption[]).map(brand => [brand.id, brand.name]));
    const finishMap = new Map((finishRows || []).map(finish => [finish.id, finish.name]));
    const enrichedItems = ((itemRows || []) as ProjectItem[]).map(item => {
      const product = productMap.get(item.product_id);
      return {
        ...item,
        productName: product?.name || "Produto",
        productCategory: product?.category || "-",
        brandId: product?.brand_id || "",
        brandName: product?.brand_id ? brandMap.get(product.brand_id) || "Marca" : "Marca",
        techSheet: product?.tech_sheet || null,
        file3d: product?.file_3d || null,
        file2d: product?.file_2d || null,
        finishName: item.selected_finish_id ? finishMap.get(item.selected_finish_id) || null : null,
        finishName2: item.selected_finish_id_2 ? finishMap.get(item.selected_finish_id_2) || null : null,
      };
    });

    for (const item of enrichedItems) {
      const quantity = Number(item.quantity || 1);
      const unit = Number(item.discount_price ?? item.price ?? 0);
      const current = totals.get(item.project_id) || { count: 0, value: 0, brands: new Set<string>(), categories: new Set<string>() };
      current.count += quantity;
      current.value += unit * quantity;
      if (item.brandId) current.brands.add(item.brandId);
      if (item.productCategory) current.categories.add(item.productCategory);
      totals.set(item.project_id, current);
    }

    const ownerProfiles = new Map((profileRows || []).map(profile => [profile.user_id, profile]));
    const allProfiles = new Map((allProfilesRows || []).map(profile => [profile.user_id, profile.full_name || "Sem nome"]));
    const sellerOptions = ((sellerRowsData || []) as Array<{ user_id: string; full_name: string }>).map(seller => ({
      user_id: seller.user_id,
      full_name: seller.full_name || "Vendedor",
    }));
    const sellerIds = new Set(sellerOptions.map(seller => seller.user_id));
    const sellerNames = new Map(sellerOptions.map(seller => [seller.user_id, seller.full_name]));
    const interactionsByProject = new Map<string, CrmInteraction>();
    for (const interaction of ((interactionsRes.data || []) as CrmInteraction[])) {
      if (interaction.project_id && !interactionsByProject.has(interaction.project_id)) {
        interactionsByProject.set(interaction.project_id, interaction);
      }
    }
    const enrichedProjects = rawProjects.map(project => {
      const total = totals.get(project.id);
      const ownerProfile = ownerProfiles.get(project.user_id);
      const sellerUserId = project.seller_user_id || ownerProfile?.seller_id || (sellerIds.has(project.user_id) ? project.user_id : null);
      const latestInteraction = interactionsByProject.get(project.id);
      return {
        ...project,
        crm_status: normalizeStatus(project.crm_status),
        crm_order_status: normalizeOrderStatus(project.crm_order_status),
        ownerName: ownerProfile?.full_name || "Sem nome",
        sellerUserId,
        sellerName: sellerUserId ? sellerNames.get(sellerUserId) || allProfiles.get(sellerUserId) || "Vendedor" : "Sem vendedor",
        nextAction: latestInteraction?.next_action || null,
        latestInteractionAt: latestInteraction?.created_at || null,
        itemCount: total?.count || 0,
        totalValue: total?.value || 0,
        brandCount: total?.brands.size || 0,
        categoryCount: total?.categories.size || 0,
      };
    });

    const enrichedLeads = ((leadsRes.data || []) as CrmLead[]).map(lead => {
      const architect = lead.architect_profile_id ? (allProfilesRows || []).find(profile => profile.user_id === lead.architect_profile_id) as ArchitectProfile | undefined : undefined;
      return {
        ...lead,
        crm_status: normalizeStatus(lead.crm_status),
        sellerName: sellerNames.get(lead.seller_user_id) || allProfiles.get(lead.seller_user_id) || "Vendedor",
        architectName: architect?.full_name || null,
      };
    });

    const realCustomers = ((customersRes.data || []) as CrmCustomer[]).map(customer => ({
      ...customer,
      source: "crm" as const,
      sellerName: allProfiles.get(customer.seller_user_id) || sellerNames.get(customer.seller_user_id) || "Sem nome",
    }));

    const customerByName = new Map(realCustomers.map(customer => [customerKey(customer.name), customer]));
    const derivedCustomers: CrmCustomer[] = [];
    for (const project of enrichedProjects) {
      const name = project.client_name || project.name;
      const key = customerKey(name);
      if (!key || customerByName.has(key)) continue;
      const synthetic: CrmCustomer = {
        id: `project:${project.id}`,
        seller_user_id: project.sellerUserId || project.user_id,
        name,
        phone: null,
        whatsapp: null,
        email: null,
        city: null,
        address: null,
        lead_source: "Projeto",
        architect_name: project.architect_name,
        store_name: null,
        customer_type: "residencial",
        desired_style: null,
        investment_range: projectValue(project) ? formatCurrency(projectValue(project)) : null,
        desired_rooms: null,
        purchase_deadline: null,
        urgency_level: project.crm_risk_level === "alto" ? "alta" : "media",
        purchase_reason: null,
        status: normalizeStatus(project.crm_status) === "pedido_fechado" ? "venda_concluida" : normalizeStatus(project.crm_status) === "perdido" ? "perdido" : "ativo",
        notes: "Cliente gerado automaticamente a partir da aba Projetos.",
        source: "project",
        sellerName: project.sellerName,
      };
      customerByName.set(key, synthetic);
      derivedCustomers.push(synthetic);
    }

    const allCustomers = [...realCustomers, ...derivedCustomers].map(customer => {
      const relatedProjects = enrichedProjects.filter(project =>
        project.crm_customer_id === customer.id || customerKey(project.client_name || project.name) === customerKey(customer.name)
      );
      return {
        ...customer,
        projectCount: relatedProjects.length,
        totalValue: relatedProjects.reduce((sum, project) => sum + projectValue(project), 0),
      };
    });

    setProjects(enrichedProjects);
    setLeads(enrichedLeads);
    setCustomers(allCustomers);
    setInteractions((interactionsRes.data || []) as CrmInteraction[]);
    setQuotes((quotesRes.data || []) as CrmQuote[]);
    setOrders((ordersRes.data || []) as CrmOrder[]);
    setTickets((ticketsRes.data || []) as CrmTicket[]);
    setAgendaEvents((agendaRes.data || []) as CrmAgendaEvent[]);
    setBrandTerms((brandTermsRes.data || []) as CrmBrandDeliveryTerm[]);
    setBrands((brandsRes.data || []) as BrandOption[]);
    setTechnicalItems(enrichedItems);
    setArchitects(((allProfilesRows || []) as ArchitectProfile[]).filter(profile => Boolean(profile.full_name)));
    setSalesTargets((targetsRes.data || []) as CrmSalesTarget[]);
    setLoading(false);
  };

  useEffect(() => {
    void loadCrm();
  }, [user, canManageOrders, isSeller]);

  const sellerFilterOptions = useMemo(() => {
    const grouped = new Map<string, { id: string; name: string; projects: number; value: number }>();
    for (const project of projects) {
      if (!project.sellerUserId) continue;
      const current = grouped.get(project.sellerUserId) || {
        id: project.sellerUserId,
        name: project.sellerName || "Vendedor",
        projects: 0,
        value: 0,
      };
      current.projects += 1;
      current.value += projectValue(project);
      grouped.set(project.sellerUserId, current);
    }
    for (const lead of leads) {
      const current = grouped.get(lead.seller_user_id) || {
        id: lead.seller_user_id,
        name: lead.sellerName || "Vendedor",
        projects: 0,
        value: 0,
      };
      grouped.set(lead.seller_user_id, current);
    }
    return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [projects, leads]);

  useEffect(() => {
    if (selectedSellerId !== "all" && !sellerFilterOptions.some(seller => seller.id === selectedSellerId)) {
      setSelectedSellerId("all");
    }
  }, [selectedSellerId, sellerFilterOptions]);

  const selectedSeller = sellerFilterOptions.find(seller => seller.id === selectedSellerId) || null;
  useEffect(() => {
    if (!selectedKanbanItem) return;
    setKanbanDraft({
      crmStatus: normalizeStatus(selectedKanbanItem.crm_status),
      tags: (selectedKanbanItem.crm_tags || []).join(", "),
      notes: selectedKanbanItem.crm_notes || selectedKanbanItem.initial_notes || "",
      nextAction: selectedKanbanItem.nextAction || "",
      nextFollowupAt: selectedKanbanItem.crm_next_followup_at ? selectedKanbanItem.crm_next_followup_at.slice(0, 10) : "",
    });
  }, [selectedKanbanItem]);

  const scopedProjects = useMemo(() => (
    selectedSellerId === "all"
      ? projects
      : projects.filter(project => project.sellerUserId === selectedSellerId)
  ), [projects, selectedSellerId]);
  const scopedLeads = useMemo(() => (
    selectedSellerId === "all"
      ? leads
      : leads.filter(lead => lead.seller_user_id === selectedSellerId)
  ), [leads, selectedSellerId]);
  const kanbanItems = useMemo(() => {
    const openLeads = scopedLeads
      .filter(lead => lead.status !== "convertido" && !lead.converted_project_id)
      .map<CrmProject>(lead => ({
        id: `lead:${lead.id}`,
        user_id: lead.seller_user_id,
        seller_user_id: lead.seller_user_id,
        name: lead.lead_name,
        created_at: lead.created_at,
        client_name: lead.lead_name,
        architect_name: lead.architectName || null,
        consultant_name: null,
        crm_customer_id: lead.customer_id,
        crm_status: normalizeStatus(lead.crm_status),
        crm_tags: lead.crm_tags || [],
        crm_notes: lead.notes,
        crm_next_followup_at: lead.next_followup_at,
        crm_last_contact_at: lead.updated_at || lead.created_at,
        ownerName: lead.architectName || "Sem arquiteto",
        sellerUserId: lead.seller_user_id,
        sellerName: lead.sellerName,
        nextAction: lead.next_action,
        itemCount: 0,
        totalValue: 0,
        isLead: true,
        leadId: lead.id,
        leadPhone: lead.phone,
        leadSource: lead.lead_source,
      }));
    return [...scopedProjects, ...openLeads];
  }, [scopedProjects, scopedLeads]);
  const scopedProjectIds = useMemo(() => new Set(scopedProjects.map(project => project.id)), [scopedProjects]);
  const scopedCustomers = useMemo(() => {
    if (selectedSellerId === "all") return customers;
    return customers.filter(customer => customer.seller_user_id === selectedSellerId);
  }, [customers, selectedSellerId]);
  const scopedInteractions = useMemo(() => {
    if (selectedSellerId === "all") return interactions;
    const customerIds = new Set(scopedCustomers.filter(customer => customer.source === "crm").map(customer => customer.id));
    return interactions.filter(interaction =>
      (interaction.project_id && scopedProjectIds.has(interaction.project_id))
      || (interaction.customer_id && customerIds.has(interaction.customer_id))
    );
  }, [interactions, scopedCustomers, scopedProjectIds, selectedSellerId]);
  const scopedQuotes = useMemo(() => (
    selectedSellerId === "all" ? quotes : quotes.filter(quote => scopedProjectIds.has(quote.project_id) || quote.seller_user_id === selectedSellerId)
  ), [quotes, scopedProjectIds, selectedSellerId]);
  const scopedOrders = useMemo(() => (
    selectedSellerId === "all" ? orders : orders.filter(order => scopedProjectIds.has(order.project_id) || order.seller_user_id === selectedSellerId)
  ), [orders, scopedProjectIds, selectedSellerId]);
  const scopedTickets = useMemo(() => (
    selectedSellerId === "all" ? tickets : tickets.filter(ticket => Boolean(ticket.project_id && scopedProjectIds.has(ticket.project_id)))
  ), [tickets, scopedProjectIds, selectedSellerId]);
  const scopedAgendaEvents = useMemo(() => (
    selectedSellerId === "all" ? agendaEvents : agendaEvents.filter(event => (event.project_id && scopedProjectIds.has(event.project_id)) || event.seller_user_id === selectedSellerId)
  ), [agendaEvents, scopedProjectIds, selectedSellerId]);
  const scopedTechnicalItems = useMemo(() => (
    selectedSellerId === "all" ? technicalItems : technicalItems.filter(item => scopedProjectIds.has(item.project_id))
  ), [technicalItems, scopedProjectIds, selectedSellerId]);
  const scopedSalesTargets = useMemo(() => (
    selectedSellerId === "all" ? salesTargets : salesTargets.filter(target => target.seller_user_id === selectedSellerId)
  ), [salesTargets, selectedSellerId]);
  const activePeriodRange = useMemo(
    () => periodRange(periodFilter, customPeriodStart, customPeriodEnd),
    [periodFilter, customPeriodStart, customPeriodEnd]
  );
  const overviewProjects = useMemo(() => (
    scopedProjects.filter(project =>
      isWithinRange(project.sale_completed_at || project.crm_last_contact_at || project.created_at, activePeriodRange)
    )
  ), [activePeriodRange, scopedProjects]);

  const dashboard = useMemo(() => {
    const activeProjects = scopedProjects.filter(project => !isClosedStatus(project.crm_status));
    const quoteStatuses: CrmStatus[] = ["proposta_orcamento", "followup_negociacao"];
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const overdueFollowups = activeProjects.filter(project => project.crm_next_followup_at && new Date(project.crm_next_followup_at) < new Date());
    const stalledProjects = activeProjects.filter(project => daysSince(projectActivityDate(project)) >= 9);
    const overdueAgenda = scopedAgendaEvents.filter(event => event.status === "agendado" && new Date(event.scheduled_at) < new Date());
    const soldThisMonth = scopedProjects
      .filter(project => isSoldStatus(project.crm_status))
      .filter(project => {
        const createdAt = new Date(project.sale_completed_at || project.created_at);
        return createdAt.getMonth() === currentMonth && createdAt.getFullYear() === currentYear;
      })
      .reduce((sum, project) => sum + projectValue(project), 0);
    const soldProjects = scopedProjects.filter(project => isSoldStatus(project.crm_status) && projectValue(project) > 0);
    const conversionBase = scopedProjects.filter(project => !["novo_atendimento", "briefing_visita"].includes(normalizeStatus(project.crm_status))).length;
    const converted = scopedProjects.filter(project => isSoldStatus(project.crm_status)).length;
    const marginProjects = scopedProjects
      .map(project => Number(project.crm_margin_percent || 0))
      .filter(margin => margin > 0);

    return {
      activeClients: scopedCustomers.filter(customer => customer.status !== "inativo").length,
      activeProjects: activeProjects.length,
      openQuotes: activeProjects.filter(project => quoteStatuses.includes(normalizeStatus(project.crm_status))).length,
      technicalReview: activeProjects.filter(project => normalizeOrderStatus(project.crm_order_status) === "revisao_tecnica").length,
      production: activeProjects.filter(project => normalizeOrderStatus(project.crm_order_status) === "producao").length,
      deliveries: activeProjects.filter(project => ["transporte", "recebido_loja", "entrega_agendada"].includes(normalizeOrderStatus(project.crm_order_status))).length,
      stalled: stalledProjects.length,
      overdueFollowups: overdueFollowups.length,
      overdueAgenda: overdueAgenda.length,
      totalNegotiation: activeProjects
        .filter(project => ["proposta_orcamento", "followup_negociacao"].includes(normalizeStatus(project.crm_status)))
        .reduce((sum, project) => sum + projectValue(project), 0),
      soldThisMonth,
      averageTicket: soldProjects.length ? soldProjects.reduce((sum, project) => sum + projectValue(project), 0) / soldProjects.length : 0,
      conversionRate: conversionBase ? Math.round((converted / conversionBase) * 100) : 0,
      averageMargin: marginProjects.length ? Math.round(marginProjects.reduce((sum, margin) => sum + margin, 0) / marginProjects.length) : 0,
      noItems: activeProjects.filter(project => !project.itemCount).length,
      supportOpen: scopedTickets.filter(ticket => !["resolvida", "finalizada", "reprovada"].includes(ticket.status)).length,
    };
  }, [scopedAgendaEvents, scopedCustomers, scopedProjects, scopedTickets]);

  const sellerRows = useMemo(() => {
    const currentMonth = monthKey(monthStart());
    const targetBySeller = new Map(scopedSalesTargets.filter(target => target.period_month === currentMonth).map(target => [target.seller_user_id || "loja", Number(target.target_value || 0)]));
    const grouped = new Map<string, SellerPerformanceRow>();
    for (const project of scopedProjects) {
      if (!project.sellerUserId) continue;
      const key = project.sellerUserId;
      const status = normalizeStatus(project.crm_status);
      const row = grouped.get(key) || { sellerId: key, seller: project.sellerName || "Vendedor", projects: 0, active: 0, sold: 0, value: 0, target: targetBySeller.get(key) || 0, progress: 0, attention: 0 };
      row.projects += 1;
      if (!isClosedStatus(status)) row.active += 1;
      row.value += projectValue(project);
      if (isSoldStatus(status)) row.sold += 1;
      if (projectNeedsAttention(project)) row.attention += 1;
      row.progress = row.target ? Math.min(999, Math.round((row.value / row.target) * 100)) : 0;
      grouped.set(key, row);
    }
    return [...grouped.values()].sort((a, b) => b.active - a.active || b.value - a.value);
  }, [scopedProjects, scopedSalesTargets]);

  const currentMonthProjects = useMemo(() => {
    const start = monthStart();
    return scopedProjects.filter(project => new Date(project.created_at) >= start);
  }, [scopedProjects]);

  const hotProjects = useMemo(() => {
    const now = new Date();
    const limit = addDays(now.toISOString(), 30);
    return scopedProjects
      .filter(project => !isClosedStatus(project.crm_status))
      .filter(project => {
        const status = normalizeStatus(project.crm_status);
        const closeDate = project.crm_expected_close_date ? new Date(project.crm_expected_close_date) : null;
        return (
          ["proposta_orcamento", "followup_negociacao"].includes(status)
          || (closeDate && closeDate >= now && closeDate <= limit)
          || project.crm_risk_level === "alto"
        );
      })
      .sort((a, b) => projectValue(b) - projectValue(a))
      .slice(0, 6);
  }, [scopedProjects]);

  const futurePipeline = useMemo(() => {
    const limit = addDays(new Date().toISOString(), 45);
    return scopedProjects
      .filter(project => !isClosedStatus(project.crm_status))
      .filter(project => project.crm_expected_close_date && new Date(project.crm_expected_close_date) > limit)
      .sort((a, b) => new Date(a.crm_expected_close_date || 0).getTime() - new Date(b.crm_expected_close_date || 0).getTime())
      .slice(0, 6);
  }, [scopedProjects]);

  const salesProgressData = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, index) => monthStart(new Date(new Date().getFullYear(), new Date().getMonth() - (5 - index), 1)));
    return months.map(month => {
      const key = monthKey(month);
      const next = new Date(month.getFullYear(), month.getMonth() + 1, 1);
      const sold = scopedProjects.filter(project => {
        const saleDate = new Date(project.sale_completed_at || project.created_at);
        return isSoldStatus(project.crm_status) && saleDate >= month && saleDate < next;
      });
      const target = scopedSalesTargets
        .filter(item => item.period_month === key)
        .reduce((sum, item) => sum + Number(item.target_value || 0), 0);
      return {
        month: monthLabel(month),
        vendas: sold.reduce((sum, project) => sum + projectValue(project), 0),
        meta: target,
        projetos: sold.length,
      };
    });
  }, [scopedProjects, scopedSalesTargets]);

  const environmentRows = useMemo(() => {
    const grouped = new Map<string, { environment: string; value: number; count: number }>();
    for (const item of scopedTechnicalItems) {
      const environment = item.environment_label || "Sem ambiente";
      const current = grouped.get(environment) || { environment, value: 0, count: 0 };
      current.count += Number(item.quantity || 1);
      current.value += Number(item.discount_price ?? item.price ?? 0) * Number(item.quantity || 1);
      grouped.set(environment, current);
    }
    return [...grouped.values()]
      .map(row => ({ ...row, average: row.count ? row.value / row.count : 0 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [scopedTechnicalItems]);

  const brandOrderRows = useMemo(() => {
    const grouped = new Map<string, { brand: string; count: number; value: number; projects: Set<string> }>();
    for (const item of scopedTechnicalItems) {
      const brand = item.brandName || "Sem marca";
      const current = grouped.get(brand) || { brand, count: 0, value: 0, projects: new Set<string>() };
      current.count += Number(item.quantity || 1);
      current.value += Number(item.discount_price ?? item.price ?? 0) * Number(item.quantity || 1);
      current.projects.add(item.project_id);
      grouped.set(brand, current);
    }
    return [...grouped.values()]
      .map(row => ({ brand: row.brand, count: row.count, value: row.value, projects: row.projects.size }))
      .sort((a, b) => b.value - a.value || b.count - a.count)
      .slice(0, 6);
  }, [scopedTechnicalItems]);

  const originRows = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const customer of scopedCustomers) {
      const origin = customer.lead_source || "Nao informado";
      grouped.set(origin, (grouped.get(origin) || 0) + 1);
    }
    return [...grouped.entries()].map(([origin, count]) => ({ origin, count })).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [scopedCustomers]);

  const attentionProjects = useMemo(() => {
    return scopedProjects
      .filter(project => !isClosedStatus(project.crm_status))
      .map(project => ({ ...project, reasons: attentionReasons(project) }))
      .filter(project => project.reasons.length)
      .slice(0, 8);
  }, [scopedProjects]);

  const projectsByStatus = useMemo(() => {
    return commercialKanbanStatuses.reduce((acc, status) => {
      acc[status.key] = kanbanItems.filter(project => normalizeStatus(project.crm_status) === status.key);
      return acc;
    }, {} as Record<CrmStatus, CrmProject[]>);
  }, [kanbanItems]);

  const filteredCustomers = useMemo(() => {
    const search = normalizeText(customerSearch);
    if (!search) return scopedCustomers;
    return scopedCustomers.filter(customer =>
      normalizeText(`${customer.name} ${customer.phone || ""} ${customer.whatsapp || ""} ${customer.email || ""} ${customer.city || ""} ${customer.sellerName || ""}`).includes(search)
    );
  }, [customerSearch, scopedCustomers]);

  const delayedOrders = useMemo(() => {
    const termByBrand = new Map(brandTerms.map(term => [term.brand_id, term]));
    return scopedProjects
      .filter(project => isSoldStatus(project.crm_status) && hasOperationalOrder(project) && normalizeOrderStatus(project.crm_order_status) !== "entregue")
      .map(project => {
        const items = scopedTechnicalItems.filter(item => item.project_id === project.id);
        const brandIds = [...new Set(items.map(item => item.brandId).filter(Boolean))] as string[];
        const longestTerm = brandIds.reduce((max, brandId) => Math.max(max, termByBrand.get(brandId)?.delivery_days || 60), 60);
        const dueDate = addDays(project.sale_completed_at || project.created_at, longestTerm);
        return {
          project,
          dueDate,
          daysLate: daysSince(dueDate),
          brands: brandIds.map(id => brands.find(brand => brand.id === id)?.name || "Marca").join(", ") || "Sem marca",
        };
      })
      .filter(row => row.daysLate > 0)
      .sort((a, b) => b.daysLate - a.daysLate);
  }, [brandTerms, brands, scopedProjects, scopedTechnicalItems]);

  const architectRows = useMemo(() => {
    const grouped = new Map<string, { userId: string | null; name: string; phone: string | null; email: string | null; birthDate: string | null; projects: number; active: number; value: number; clients: Set<string>; nextDeadline: string | null; status: string }>();
    const visibleArchitects = selectedSellerId === "all"
      ? architects
      : architects.filter(architect => architect.seller_id === selectedSellerId);
    for (const architect of visibleArchitects) {
      const name = architect.full_name || "Arquiteto sem nome";
      grouped.set(architect.user_id, {
        userId: architect.user_id,
        name,
        phone: architect.phone || null,
        email: architect.email || null,
        birthDate: architect.birth_date || null,
        projects: 0,
        active: 0,
        value: 0,
        clients: new Set<string>(),
        nextDeadline: null,
        status: "Carteira ativa",
      });
    }
    for (const project of scopedProjects.filter(project => project.architect_name || project.crm_architect_profile_id)) {
      const architect = architects.find(item => item.user_id === project.crm_architect_profile_id);
      const name = architect?.full_name || project.architect_name || "Arquiteto nao informado";
      const key = architect?.user_id || normalizeText(name);
      const row = grouped.get(key) || {
        userId: architect?.user_id || null,
        name,
        phone: architect?.phone || null,
        email: architect?.email || null,
        birthDate: architect?.birth_date || null,
        projects: 0,
        active: 0,
        value: 0,
        clients: new Set<string>(),
        nextDeadline: null,
        status: "Com projetos",
      };
      row.projects += 1;
      if (!isClosedStatus(project.crm_status)) row.active += 1;
      row.value += projectValue(project);
      if (project.client_name) row.clients.add(project.client_name);
      if (project.crm_expected_close_date && (!row.nextDeadline || new Date(project.crm_expected_close_date) < new Date(row.nextDeadline))) {
        row.nextDeadline = project.crm_expected_close_date;
      }
      grouped.set(key, row);
    }
    return [...grouped.values()].sort((a, b) => b.active - a.active || b.value - a.value);
  }, [architects, scopedProjects, selectedSellerId]);

  const createOperationalOrders = async (project: CrmProject) => {
    const existingOrders = orders.filter(order => order.project_id === project.id);
    if (existingOrders.length) {
      const updatePayload = { status: "revisao_tecnica", updated_at: new Date().toISOString() };
      let { error } = await (supabase as any)
        .from("crm_orders")
        .update(updatePayload)
        .eq("project_id", project.id)
        .eq("status", "montagem");
      if (error && isStatusConstraintError(error)) {
        const retry = await (supabase as any)
          .from("crm_orders")
          .update({ ...updatePayload, status: legacyOrderStatus("revisao_tecnica") })
          .eq("project_id", project.id)
          .eq("status", "montagem");
        error = retry.error;
      }
      if (!error) {
        setOrders(current => current.map(order => order.project_id === project.id && order.status === "montagem"
          ? { ...order, status: "revisao_tecnica" }
          : order
        ));
      }
      return;
    }

    const projectItems = technicalItems.filter(item => item.project_id === project.id);
    const brandIds = [...new Set(projectItems.map(item => item.brandId).filter(Boolean))] as string[];
    const rows = (brandIds.length ? brandIds : [null]).map(brandId => ({
      project_id: project.id,
      customer_id: project.crm_customer_id || null,
      seller_user_id: project.sellerUserId || project.user_id || user?.id,
      brand_id: brandId,
      status: "revisao_tecnica",
      risk_level: project.crm_risk_level || "baixo",
      notes: "Pedido operacional criado ao fechar o pedido comercial.",
    }));

    let { data, error } = await (supabase as any).from("crm_orders").insert(rows).select(CRM_ORDER_SELECT);
    if (error && isStatusConstraintError(error)) {
      const legacyRows = rows.map(row => ({ ...row, status: legacyOrderStatus(row.status) }));
      const retry = await (supabase as any).from("crm_orders").insert(legacyRows).select(CRM_ORDER_SELECT);
      data = retry.data;
      error = retry.error;
    }
    if (error) {
      toast({ title: "Pedido fechado", description: "Revise a criacao do pedido operacional na Gestao de Pedido.", variant: "destructive" });
      return;
    }
    setOrders(current => [...(data as CrmOrder[]), ...current]);
  };

  const moveProject = async (projectId: string, nextStatus: CrmStatus) => {
    const rate = checkClientRateLimit('crm:update-status', projectId);
    if (!rate.allowed) {
      toast({ title: "Muitas alteracoes", description: rateLimitMessage(rate), variant: "destructive" });
      return;
    }
    if (projectId.startsWith("lead:")) {
      const leadId = projectId.replace("lead:", "");
      const previousLeads = leads;
      setLeads(current => current.map(lead => lead.id === leadId ? {
        ...lead,
        crm_status: nextStatus,
        updated_at: new Date().toISOString(),
      } : lead));
      setDraggedProjectId(null);
      const { error } = await (supabase as any)
        .from("crm_leads")
        .update({ crm_status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", leadId);
      if (error) {
        setLeads(previousLeads);
        toast({ title: "Erro ao mover atendimento", description: "Nao foi possivel salvar a etapa.", variant: "destructive" });
      }
      return;
    }
    const previous = projects;
    const project = projects.find(item => item.id === projectId);
    const saleCompletedAt = nextStatus === "pedido_fechado" ? new Date().toISOString() : undefined;
    const orderStatus = saleCompletedAt && project && !hasOperationalOrder(project) ? "revisao_tecnica" : undefined;
    setProjects(current => current.map(item => item.id === projectId ? {
      ...item,
      crm_status: nextStatus,
      ...(saleCompletedAt ? { sale_completed_at: saleCompletedAt, crm_quote_status: "aprovado" } : {}),
      ...(orderStatus ? { crm_order_status: orderStatus } : {}),
    } : item));
    setDraggedProjectId(null);

    const updatePayload = {
      crm_status: nextStatus,
      crm_last_contact_at: new Date().toISOString(),
      ...(saleCompletedAt ? { sale_completed_at: saleCompletedAt, crm_quote_status: "aprovado" } : {}),
      ...(orderStatus ? { crm_order_status: orderStatus } : {}),
    };

    let { error } = await (supabase as any)
      .from("projects")
      .update(updatePayload)
      .eq("id", projectId);

    if (error && isStatusConstraintError(error)) {
      const retry = await (supabase as any)
        .from("projects")
        .update(legacyProjectUpdates(updatePayload))
        .eq("id", projectId);
      error = retry.error;
    }

    if (error) {
      setProjects(previous);
      toast({ title: "Erro ao mover projeto", description: "Nao foi possivel salvar o status.", variant: "destructive" });
      return;
    }
    if (saleCompletedAt && project) await createOperationalOrders({ ...project, crm_order_status: orderStatus || project.crm_order_status });
  };

  const updateProjectCrm = async (projectId: string, updates: Partial<CrmProject>, successTitle: string) => {
    const rate = checkClientRateLimit('crm:update-status', projectId);
    if (!rate.allowed) {
      toast({ title: "Muitas alteracoes", description: rateLimitMessage(rate), variant: "destructive" });
      return;
    }
    const previous = projects;
    setProjects(current => current.map(project => project.id === projectId ? { ...project, ...updates } : project));
    let { error } = await (supabase as any).from("projects").update(updates).eq("id", projectId);
    if (error && isStatusConstraintError(error)) {
      const retry = await (supabase as any).from("projects").update(legacyProjectUpdates(updates)).eq("id", projectId);
      error = retry.error;
    }
    if (error) {
      setProjects(previous);
      toast({ title: "Erro ao salvar", description: "Tente novamente.", variant: "destructive" });
      return;
    }
    if (updates.crm_order_status && updates.crm_order_status !== "sem_pedido") {
      let orderUpdate = await (supabase as any)
        .from("crm_orders")
        .update({ status: normalizeOrderStatus(updates.crm_order_status), updated_at: new Date().toISOString() })
        .eq("project_id", projectId);
      if (orderUpdate.error && isStatusConstraintError(orderUpdate.error)) {
        orderUpdate = await (supabase as any)
          .from("crm_orders")
          .update({ status: legacyOrderStatus(updates.crm_order_status), updated_at: new Date().toISOString() })
          .eq("project_id", projectId);
      }
      setOrders(current => current.map(order => order.project_id === projectId
        ? { ...order, status: normalizeOrderStatus(updates.crm_order_status) }
        : order
      ));
    }
    toast({ title: successTitle });
  };

  const addInteraction = async (
    customer: CrmCustomer,
    projectId: string | null,
    description: string,
    nextAction: string,
    nextFollowupAt: string
  ) => {
    const cleanDescription = description.trim();
    if (!cleanDescription || !user?.id) return false;

    const relatedProject = projects.find(project => project.id === projectId)
      || projects.find(project => project.crm_customer_id === customer.id || customerKey(project.client_name || project.name) === customerKey(customer.name));

    const payload = {
      customer_id: customer.source === "crm" ? customer.id : null,
      project_id: relatedProject?.id || null,
      user_id: user.id,
      interaction_type: "Atendimento",
      description: cleanDescription,
      next_action: nextAction.trim() || null,
      next_followup_at: nextFollowupAt || null,
    };

    const { data, error } = await (supabase as any)
      .from("crm_interactions")
      .insert(payload)
      .select(CRM_INTERACTION_SELECT)
      .single();

    if (error) {
      toast({ title: "Erro ao registrar atendimento", description: "Nao foi possivel salvar a linha do tempo.", variant: "destructive" });
      return false;
    }

    if (data) setInteractions(current => [data as CrmInteraction, ...current]);

    if (relatedProject?.id) {
      const projectUpdates: Partial<CrmProject> = {
        crm_last_contact_at: new Date().toISOString(),
        crm_next_followup_at: nextFollowupAt || relatedProject.crm_next_followup_at || null,
      };
      if (nextFollowupAt) projectUpdates.crm_status = "followup_negociacao";

      setProjects(current => current.map(project => project.id === relatedProject.id ? { ...project, ...projectUpdates } : project));
      await (supabase as any).from("projects").update(projectUpdates).eq("id", relatedProject.id);
    }

    toast({ title: "Atendimento registrado" });
    return true;
  };

  const openNewLeadModal = () => {
    const sellerUserId = !canManageOrders
      ? user?.id || ""
      : selectedSellerId !== "all"
        ? selectedSellerId
        : sellerFilterOptions[0]?.id || user?.id || "";
    setLeadDraft({
      sellerUserId,
      leadName: "",
      phone: "",
      leadSource: "",
      architectProfileId: "",
      notes: "",
      crmStatus: "novo_atendimento",
      tags: "",
    });
    setLeadModalOpen(true);
  };

  const createLead = async () => {
    if (!user?.id) return;
    const sellerUserId = leadDraft.sellerUserId || user.id;
    const leadName = sanitizePlainText(leadDraft.leadName, 160);
    if (!leadName) {
      toast({ title: "Informe o lead", description: "Digite o nome do lead ou cliente.", variant: "destructive" });
      return;
    }
    const rate = checkClientRateLimit("crm:lead:create", sellerUserId);
    if (!rate.allowed) {
      toast({ title: "Muitas tentativas", description: rateLimitMessage(rate), variant: "destructive" });
      return;
    }

    const payload = {
      seller_user_id: sellerUserId,
      lead_name: leadName,
      phone: sanitizePlainText(leadDraft.phone, 40) || null,
      lead_source: sanitizePlainText(leadDraft.leadSource, 120) || null,
      architect_profile_id: leadDraft.architectProfileId || null,
      notes: sanitizePlainText(leadDraft.notes, 1200) || null,
      crm_status: leadDraft.crmStatus,
      crm_tags: parseTags(leadDraft.tags),
      next_action: "Primeiro contato",
    };

    const { data, error } = await (supabase as any)
      .from("crm_leads")
      .insert(payload)
      .select(CRM_LEAD_SELECT)
      .single();
    if (error) {
      toast({ title: "Erro ao criar atendimento", description: "Nao foi possivel salvar o lead.", variant: "destructive" });
      return;
    }

    const architect = architects.find(item => item.user_id === payload.architect_profile_id);
    const seller = sellerFilterOptions.find(item => item.id === sellerUserId);
    setLeads(current => [{
      ...(data as CrmLead),
      sellerName: seller?.name || "Vendedor",
      architectName: architect?.full_name || null,
    }, ...current]);
    setLeadModalOpen(false);
    toast({ title: "Novo atendimento criado" });
  };

  const saveKanbanDetails = async () => {
    if (!selectedKanbanItem) return;
    const updates = {
      crm_status: kanbanDraft.crmStatus,
      crm_tags: parseTags(kanbanDraft.tags),
      crm_notes: sanitizePlainText(kanbanDraft.notes, 1200) || null,
      crm_next_followup_at: kanbanDraft.nextFollowupAt || null,
      crm_last_contact_at: new Date().toISOString(),
    };

    if (selectedKanbanItem.isLead && selectedKanbanItem.leadId) {
      const { error } = await (supabase as any)
        .from("crm_leads")
        .update({
          crm_status: updates.crm_status,
          crm_tags: updates.crm_tags,
          notes: updates.crm_notes,
          next_action: sanitizePlainText(kanbanDraft.nextAction, 160) || null,
          next_followup_at: updates.crm_next_followup_at,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedKanbanItem.leadId);
      if (error) {
        toast({ title: "Erro ao salvar atendimento", variant: "destructive" });
        return;
      }
      setLeads(current => current.map(lead => lead.id === selectedKanbanItem.leadId ? {
        ...lead,
        crm_status: updates.crm_status,
        crm_tags: updates.crm_tags,
        notes: updates.crm_notes,
        next_action: sanitizePlainText(kanbanDraft.nextAction, 160) || null,
        next_followup_at: updates.crm_next_followup_at,
        updated_at: new Date().toISOString(),
      } : lead));
      setSelectedKanbanItem(null);
      toast({ title: "Atendimento atualizado" });
      return;
    }

    await updateProjectCrm(selectedKanbanItem.id, {
      crm_status: updates.crm_status,
      crm_tags: updates.crm_tags,
      crm_notes: updates.crm_notes,
      crm_next_followup_at: updates.crm_next_followup_at,
      crm_last_contact_at: updates.crm_last_contact_at,
    }, "Projeto atualizado");
    setSelectedKanbanItem(null);
  };

  const convertLeadToProject = async () => {
    if (!selectedKanbanItem?.isLead || !selectedKanbanItem.leadId || !user?.id) return;
    const lead = leads.find(item => item.id === selectedKanbanItem.leadId);
    if (!lead) return;
    const projectName = window.prompt("Nome do projeto", `Projeto ${lead.lead_name}`)?.trim();
    if (!projectName) return;
    const clientName = window.prompt("Nome do cliente final", lead.lead_name)?.trim();
    if (!clientName) return;

    const payload = buildNewProjectPayload(user.id, projectName, {
      clientName,
      sellerUserId: lead.seller_user_id,
      architectProfileId: lead.architect_profile_id,
      architectName: lead.architectName || null,
      initialNotes: lead.notes || null,
      tags: lead.crm_tags || [],
    });

    const { data, error } = await (supabase as any)
      .from("projects")
      .insert(payload)
      .select(CRM_PROJECT_SELECT)
      .single();
    if (error) {
      toast({ title: "Erro ao converter", description: "Nao foi possivel criar o projeto.", variant: "destructive" });
      return;
    }

    await (supabase as any)
      .from("crm_leads")
      .update({ status: "convertido", converted_project_id: data.id, project_id: data.id, updated_at: new Date().toISOString() })
      .eq("id", lead.id);

    setLeads(current => current.map(item => item.id === lead.id ? { ...item, status: "convertido", converted_project_id: data.id, project_id: data.id } : item));
    setProjects(current => [{
      ...(data as CrmProject),
      crm_status: normalizeStatus((data as CrmProject).crm_status),
      sellerUserId: lead.seller_user_id,
      sellerName: lead.sellerName,
      ownerName: lead.architectName || "Sem arquiteto",
      itemCount: 0,
      totalValue: 0,
    }, ...current]);
    setSelectedKanbanItem(null);
    toast({ title: "Atendimento convertido em projeto" });
  };

  const archiveCustomer = async (customer: CrmCustomer) => {
    if (customer.source !== "crm") {
      toast({ title: "Cliente vindo de projeto", description: "Abra o projeto para ajustar este cliente.", variant: "destructive" });
      return;
    }
    const { error } = await (supabase as any)
      .from("crm_customers")
      .update({
        status: "arquivado",
        archived_at: new Date().toISOString(),
        archived_by: user?.id || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", customer.id);
    if (error) {
      toast({ title: "Erro ao arquivar cliente", variant: "destructive" });
      return;
    }
    setCustomers(current => current.map(item => item.id === customer.id ? { ...item, status: "arquivado" } : item));
    toast({ title: "Cliente arquivado" });
  };

  const deleteCustomer = async (customer: CrmCustomer) => {
    if (customer.source !== "crm") {
      toast({ title: "Cliente gerado por projeto", description: "Use arquivar ou edite o projeto vinculado.", variant: "destructive" });
      return;
    }
    const relatedProjects = projects.filter(project =>
      project.crm_customer_id === customer.id || customerKey(project.client_name || project.name) === customerKey(customer.name)
    );
    if (relatedProjects.length) {
      if (window.confirm("Este cliente possui projetos vinculados. Deseja arquivar para preservar o historico comercial?")) {
        await archiveCustomer(customer);
      }
      return;
    } else if (!window.confirm("Tem certeza que deseja excluir este cliente?")) {
      return;
    }

    const { error } = canManageOrders
      ? await (supabase as any).from("crm_customers").delete().eq("id", customer.id)
      : await (supabase as any)
        .from("crm_customers")
        .update({
          status: "arquivado",
          archived_at: new Date().toISOString(),
          archived_by: user?.id || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", customer.id);
    if (error) {
      toast({ title: "Erro ao remover cliente", description: "Se houver historico, arquive o cliente.", variant: "destructive" });
      return;
    }
    setCustomers(current => current.filter(item => item.id !== customer.id));
    toast({ title: canManageOrders ? "Cliente excluido" : "Cliente arquivado" });
  };

  const createProjectForArchitect = async (architect: { userId?: string | null; name: string }) => {
    if (!user?.id) return;
    const projectName = window.prompt("Nome do projeto")?.trim();
    if (!projectName) return;
    const clientName = window.prompt("Nome do cliente final")?.trim();
    if (!clientName) return;
    const sellerUserId = !canManageOrders ? user.id : selectedSellerId !== "all" ? selectedSellerId : user.id;
    const { data, error } = await (supabase as any)
      .from("projects")
      .insert(buildNewProjectPayload(user.id, projectName, {
        clientName,
        sellerUserId,
        architectProfileId: architect.userId || null,
        architectName: architect.name,
      }))
      .select(CRM_PROJECT_SELECT)
      .single();
    if (error) {
      toast({ title: "Erro ao criar projeto", description: "Confira os dados e suas permissoes.", variant: "destructive" });
      return;
    }
    setProjects(current => [{
      ...(data as CrmProject),
      crm_status: normalizeStatus((data as CrmProject).crm_status),
      sellerUserId,
      sellerName: sellerFilterOptions.find(item => item.id === sellerUserId)?.name || "Vendedor",
      ownerName: architect.name,
      itemCount: 0,
      totalValue: 0,
    }, ...current]);
    toast({ title: "Projeto criado" });
  };

  const saveBrandTerm = async (brandId: string, deliveryDays: number, followupDaysBefore: number, notes: string) => {
    const payload = {
      brand_id: brandId,
      delivery_days: Math.min(365, Math.max(1, deliveryDays || 60)),
      followup_days_before: Math.min(120, Math.max(0, followupDaysBefore || 10)),
      notes: sanitizePlainText(notes, 500) || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await (supabase as any)
      .from("crm_brand_delivery_terms")
      .upsert(payload, { onConflict: "brand_id" })
      .select("id, brand_id, delivery_days, followup_days_before, notes")
      .single();

    if (error) {
      toast({ title: "Erro ao salvar prazo", description: "Tente novamente.", variant: "destructive" });
      return;
    }

    setBrandTerms(current => {
      const next = current.filter(term => term.brand_id !== brandId);
      return [...next, data as CrmBrandDeliveryTerm];
    });
    toast({ title: "Prazo da marca salvo" });
  };

  const saveSalesTarget = async (sellerUserId: string, targetValue: number) => {
    const rate = checkClientRateLimit('crm:update-status', sellerUserId);
    if (!rate.allowed) {
      toast({ title: "Muitas alteracoes", description: rateLimitMessage(rate), variant: "destructive" });
      return;
    }
    const periodMonth = monthKey(monthStart());
    const existing = salesTargets.find(target => target.period_month === periodMonth && target.seller_user_id === sellerUserId);
    const payload = {
      seller_user_id: sellerUserId,
      period_month: periodMonth,
      target_value: Math.max(0, targetValue || 0),
      updated_at: new Date().toISOString(),
    };

    const request = existing
      ? (supabase as any).from("crm_sales_targets").update(payload).eq("id", existing.id).select(CRM_TARGET_SELECT).single()
      : (supabase as any).from("crm_sales_targets").insert(payload).select(CRM_TARGET_SELECT).single();

    const { data, error } = await request;
    if (error) {
      toast({ title: "Erro ao salvar meta", description: "Tente novamente.", variant: "destructive" });
      return;
    }

    setSalesTargets(current => {
      const next = current.filter(target => target.id !== existing?.id);
      return [...next, data as CrmSalesTarget];
    });
    toast({ title: "Meta atualizada" });
  };

  const addAgendaEvent = async (draft: { projectId: string; title: string; eventType: string; scheduledAt: string; location: string; notes: string }) => {
    if (!user?.id) return false;
    const parsed = agendaEventSchema.safeParse(draft);
    if (!parsed.success) {
      toast({ title: "Confira a agenda", description: firstZodMessage(parsed.error), variant: "destructive" });
      return false;
    }
    const rate = checkClientRateLimit('crm:agenda', user.id);
    if (!rate.allowed) {
      toast({ title: "Muitos agendamentos", description: rateLimitMessage(rate), variant: "destructive" });
      return false;
    }
    const safeDraft = parsed.data;
    const project = projects.find(item => item.id === safeDraft.projectId);
    const customer = project ? customers.find(item =>
      project.crm_customer_id === item.id || customerKey(project.client_name || project.name) === customerKey(item.name)
    ) : null;

    const payload = {
      project_id: project?.id || null,
      customer_id: customer?.source === "crm" ? customer.id : null,
      seller_user_id: project?.sellerUserId || user.id,
      architect_profile_id: project?.crm_architect_profile_id || null,
      title: sanitizePlainText(safeDraft.title, 120),
      event_type: safeDraft.eventType,
      scheduled_at: safeDraft.scheduledAt,
      notify_at: safeDraft.scheduledAt,
      location: sanitizePlainText(safeDraft.location || "", 160) || null,
      notes: sanitizePlainText(safeDraft.notes || "", 1000) || null,
    };

    const { data, error } = await (supabase as any).from("crm_agenda_events").insert(payload).select(CRM_AGENDA_SELECT).single();
    if (error) {
      toast({ title: "Erro ao agendar", description: "Nao foi possivel salvar o compromisso.", variant: "destructive" });
      return false;
    }

    setAgendaEvents(current => [...current, data as CrmAgendaEvent].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()));
    toast({ title: "Agenda atualizada" });
    return true;
  };

  const completeAgendaEvent = async (eventId: string) => {
    const updates = { status: "feito", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    const { error } = await (supabase as any).from("crm_agenda_events").update(updates).eq("id", eventId);
    if (error) {
      toast({ title: "Erro ao concluir agenda", variant: "destructive" });
      return;
    }
    setAgendaEvents(current => current.map(event => event.id === eventId ? { ...event, ...updates } : event));
  };

  const completeSale = async (project: CrmProject) => {
    await updateProjectCrm(project.id, {
      crm_status: "pedido_fechado",
      crm_quote_status: "aprovado",
      crm_order_status: hasOperationalOrder(project) ? normalizeOrderStatus(project.crm_order_status) : "revisao_tecnica",
      crm_approval_status: "aprovado",
      sale_completed_at: new Date().toISOString(),
      crm_sold_value: projectValue(project),
    }, "Pedido fechado");
    await createOperationalOrders({ ...project, crm_order_status: hasOperationalOrder(project) ? project.crm_order_status : "revisao_tecnica" });
  };

  const generateTechnicalNotebook = async (project: CrmProject) => {
    const items = technicalItems.filter(item => item.project_id === project.id);
    if (!items.length) {
      toast({ title: "Caderno sem itens", description: "Adicione produtos ao projeto antes de gerar.", variant: "destructive" });
      return;
    }

    await (supabase as any).from("crm_technical_notebooks").insert({
      project_id: project.id,
      generated_by: user?.id,
      status: "enviado",
      snapshot: {
        project: { id: project.id, name: project.name, client_name: project.client_name, architect_name: project.architect_name },
        generated_at: new Date().toISOString(),
        items,
      },
    });

    const groups = items.reduce<Record<string, ProjectItem[]>>((acc, item) => {
      const brand = item.brandName || "Sem marca";
      if (!acc[brand]) acc[brand] = [];
      acc[brand].push(item);
      return acc;
    }, {});

    const itemRows = Object.entries(groups).map(([brandName, brandItems]) => `
      <section>
        <h2>${escapeHtml(brandName)}</h2>
        ${brandItems.map(item => `
          <article>
            <div class="row">
              <strong>${escapeHtml(item.productName)}</strong>
              <span>${escapeHtml(item.productCategory)} | Qtd. ${item.quantity || 1}</span>
            </div>
            <p><b>Medidas:</b> ${escapeHtml(item.presentation_dimensions || "Conferir medida final")}</p>
            <p><b>Acabamentos:</b> ${escapeHtml([item.finishName, item.finishName2].filter(Boolean).join(" / ") || "Nao informado")}</p>
            <p><b>Observacoes tecnicas:</b> ${escapeHtml(item.notes || "Sem observacoes")}</p>
            <p><b>Arquivos:</b> ${item.techSheet ? `<a href="${escapeHtml(item.techSheet)}">Ficha tecnica</a>` : "Ficha nao anexada"} ${item.file3d ? ` | <a href="${escapeHtml(item.file3d)}">Bloco 3D</a>` : ""} ${item.file2d ? ` | <a href="${escapeHtml(item.file2d)}">Bloco 2D</a>` : ""}</p>
          </article>
        `).join("")}
      </section>
    `).join("");

    const html = `<!doctype html>
      <html>
        <head>
          <title>Caderno tecnico - ${escapeHtml(project.name)}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #27231f; margin: 32px; }
            header { border-bottom: 2px solid #766c63; margin-bottom: 24px; padding-bottom: 16px; }
            h1 { font-family: Georgia, serif; font-size: 28px; margin: 0 0 8px; }
            h2 { margin-top: 28px; padding: 10px 12px; background: #766c63; color: white; font-size: 16px; }
            article { border: 1px solid #ddd8d0; border-radius: 8px; padding: 14px; margin: 10px 0; page-break-inside: avoid; }
            .row { display: flex; justify-content: space-between; gap: 16px; }
            p { font-size: 12px; line-height: 1.5; }
            .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 48px; }
            .signature { border-top: 1px solid #27231f; padding-top: 8px; font-size: 12px; text-align: center; }
            @media print { button { display: none; } body { margin: 18mm; } }
          </style>
        </head>
        <body>
          <button onclick="window.print()">Imprimir / salvar PDF</button>
          <header>
            <h1>Caderno tecnico assinavel</h1>
            <p><b>Projeto:</b> ${escapeHtml(project.name)} | <b>Cliente:</b> ${escapeHtml(project.client_name || "Nao informado")} | <b>Arquiteto:</b> ${escapeHtml(project.architect_name || "Nao informado")}</p>
            <p><b>Vendedor:</b> ${escapeHtml(project.sellerName)} | <b>Gerado em:</b> ${longDate(new Date().toISOString())}</p>
          </header>
          ${itemRows}
          <div class="signatures">
            <div class="signature">Vendedor responsavel</div>
            <div class="signature">Revisao tecnica</div>
            <div class="signature">Cliente / responsavel</div>
          </div>
        </body>
      </html>`;

    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-background px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-4">
          <Skeleton className="h-24 w-full rounded-lg" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-lg" />)}
          </div>
          <Skeleton className="h-96 w-full rounded-lg" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#F7F6F3]">
      <section className="border-b border-[#E5E2DC] bg-[#F7F6F3]/95">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-5 px-3 py-5 sm:px-5 lg:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <Badge variant="outline" className="mb-3 border-[#D4AF7A]/40 bg-[#D4AF7A]/10 uppercase tracking-[0.18em] text-[#9A6B2F]">
                {isRoutinePage ? "Rotina comercial" : "Painel executivo"}
              </Badge>
              <h1 className="font-serif text-2xl text-[#1F1F1F] md:text-4xl">
                {canManageOrders ? "Gestão da Loja" : "Rotina do Vendedor"}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#77736B]">
                {canManageOrders
                  ? "Resumo da operação comercial, pedidos e performance da equipe."
                  : "Agenda do dia, follow-ups, carteira de clientes, projetos quentes e próximas ações para vender com mais ritmo."}
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 md:w-auto md:min-w-[560px]">
              {canManageOrders && (
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <label className="grid gap-1 text-xs uppercase tracking-[0.14em] text-[#77736B]">
                    Período
                    <select
                      value={periodFilter}
                      onChange={event => setPeriodFilter(event.target.value as PeriodFilter)}
                      className="h-10 rounded-full border border-[#E5E2DC] bg-white px-4 text-sm normal-case tracking-normal text-[#1F1F1F] shadow-sm"
                    >
                      <option value="today">Hoje</option>
                      <option value="week">Esta semana</option>
                      <option value="month">Este mês</option>
                      <option value="custom">Personalizado</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs uppercase tracking-[0.14em] text-[#77736B]">
                    Vendedor
                    <select
                      value={selectedSellerId}
                      onChange={event => setSelectedSellerId(event.target.value)}
                      className="h-10 rounded-full border border-[#E5E2DC] bg-white px-4 text-sm normal-case tracking-normal text-[#1F1F1F] shadow-sm"
                    >
                      <option value="all">Todos os vendedores</option>
                      {sellerFilterOptions.map(seller => (
                        <option key={seller.id} value={seller.id}>
                          {seller.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button size="sm" variant="outline" onClick={() => void loadCrm()} className="mt-auto h-10 rounded-full border-[#E5E2DC] bg-white px-4 text-[#1F1F1F] shadow-sm">
                    <RefreshCw size={14} className="mr-2" />
                    Atualizar
                  </Button>
                </div>
              )}
              {canManageOrders && periodFilter === "custom" && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input type="date" value={customPeriodStart} onChange={event => setCustomPeriodStart(event.target.value)} className="rounded-full border-[#E5E2DC] bg-white" />
                  <Input type="date" value={customPeriodEnd} onChange={event => setCustomPeriodEnd(event.target.value)} className="rounded-full border-[#E5E2DC] bg-white" />
                </div>
              )}
              {!canManageOrders && (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="w-fit border-accent/30 text-accent">Minha rotina comercial</Badge>
                  <Button size="sm" variant="outline" onClick={() => void loadCrm()} className="h-10 rounded-full border-[#E5E2DC] bg-white px-4 text-[#1F1F1F] shadow-sm">
                    <RefreshCw size={14} className="mr-2" />
                    Atualizar
                  </Button>
                </div>
              )}
            </div>
          </div>
          {canManageOrders && selectedSeller && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{selectedSeller.name}</span>
              <span>{selectedSeller.projects} projeto(s)</span>
              <span>{formatCurrency(selectedSeller.value)}</span>
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto grid max-w-[1600px] gap-5 px-3 py-5 sm:px-5 lg:grid-cols-[250px_minmax(0,1fr)] lg:px-6">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <nav className="grid gap-2 rounded-lg border border-border/80 bg-card p-2 shadow-sm">
            <div className="px-2 py-2">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                {isRoutinePage ? "Rotina" : "Gestao"}
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {selectedSeller ? selectedSeller.name : canManageOrders ? "Todos os vendedores" : "Minha carteira"}
              </p>
            </div>
            {visibleSections.map(section => (
              <Button
                key={section.key}
                size="sm"
                variant={activeSection === section.key ? "default" : "ghost"}
                onClick={() => setActiveSection(section.key)}
                className="h-auto min-h-10 justify-start whitespace-normal px-3 py-2 text-left text-xs leading-tight"
              >
                {section.label}
              </Button>
            ))}
          </nav>
        </aside>

        <div className="grid min-w-0 gap-5">
        {activeSection === "visao" && (
          <OverviewSection
            dashboard={dashboard}
            projects={overviewProjects}
            customers={scopedCustomers}
            attentionProjects={attentionProjects}
            sellerRows={sellerRows}
            isAdmin={canManageOrders}
            projectsByStatus={projectsByStatus}
            draggedProjectId={draggedProjectId}
            setDraggedProjectId={setDraggedProjectId}
            moveProject={moveProject}
            delayedOrders={delayedOrders}
            agendaEvents={agendaEvents}
            currentMonthProjects={currentMonthProjects}
            hotProjects={hotProjects}
            futurePipeline={futurePipeline}
          />
        )}

        {activeSection === "clientes" && (
          <CustomersSection
            customers={filteredCustomers}
            projects={scopedProjects}
            interactions={scopedInteractions}
            customerSearch={customerSearch}
            setCustomerSearch={setCustomerSearch}
            onAddInteraction={addInteraction}
            onArchiveCustomer={archiveCustomer}
            onDeleteCustomer={deleteCustomer}
          />
        )}

        {activeSection === "funil" && (
          <KanbanSection
            projectsByStatus={projectsByStatus}
            draggedProjectId={draggedProjectId}
            setDraggedProjectId={setDraggedProjectId}
            moveProject={moveProject}
            onNewLead={openNewLeadModal}
            onOpenDetails={setSelectedKanbanItem}
          />
        )}

        {activeSection === "pedidos" && (
          <TechnicalOrdersSection
            projects={scopedProjects}
            quotes={scopedQuotes}
            orders={scopedOrders}
            updateProjectCrm={updateProjectCrm}
            technicalItems={scopedTechnicalItems}
            completeSale={completeSale}
            generateTechnicalNotebook={generateTechnicalNotebook}
          />
        )}

        {activeSection === "aprovacoes" && (
          <ApprovalsSection projects={scopedProjects} updateProjectCrm={updateProjectCrm} />
        )}

        {activeSection === "posvenda" && (
          <AfterSalesSection projects={scopedProjects} orders={scopedOrders} tickets={scopedTickets} updateProjectCrm={updateProjectCrm} />
        )}

        {activeSection === "agenda" && (
          <AgendaCalendarSection
            projects={scopedProjects}
            agendaEvents={scopedAgendaEvents}
            brands={brands}
            brandTerms={brandTerms}
            delayedOrders={delayedOrders}
            isAdmin={canManageOrders}
            saveBrandTerm={saveBrandTerm}
            addAgendaEvent={addAgendaEvent}
            completeAgendaEvent={completeAgendaEvent}
          />
        )}

        {activeSection === "arquitetos" && (
          <ArchitectsSection rows={architectRows} projects={scopedProjects} customers={scopedCustomers} onCreateProject={createProjectForArchitect} />
        )}
        </div>
      </section>

      <Dialog open={leadModalOpen} onOpenChange={setLeadModalOpen}>
        <DialogContent className="max-w-xl border-border bg-card">
          <DialogHeader>
            <DialogTitle>Novo Atendimento</DialogTitle>
            <DialogDescription>Cadastre um lead sem projeto formal e acompanhe no Kanban Comercial.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {canManageOrders && (
              <select
                value={leadDraft.sellerUserId}
                onChange={event => setLeadDraft(current => ({ ...current, sellerUserId: event.target.value }))}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                {sellerFilterOptions.map(seller => (
                  <option key={seller.id} value={seller.id}>{seller.name}</option>
                ))}
              </select>
            )}
            <Input value={leadDraft.leadName} onChange={event => setLeadDraft(current => ({ ...current, leadName: event.target.value }))} placeholder="Nome do lead/cliente" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input value={leadDraft.phone} onChange={event => setLeadDraft(current => ({ ...current, phone: event.target.value }))} placeholder="Telefone / WhatsApp" />
              <Input value={leadDraft.leadSource} onChange={event => setLeadDraft(current => ({ ...current, leadSource: event.target.value }))} placeholder="Origem do lead" />
            </div>
            <select
              value={leadDraft.architectProfileId}
              onChange={event => setLeadDraft(current => ({ ...current, architectProfileId: event.target.value }))}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Arquiteto vinculado opcional</option>
              {architects
                .filter(architect => !leadDraft.sellerUserId || !architect.seller_id || architect.seller_id === leadDraft.sellerUserId)
                .map(architect => (
                  <option key={architect.user_id} value={architect.user_id}>{architect.full_name || "Arquiteto"}</option>
                ))}
            </select>
            <select
              value={leadDraft.crmStatus}
              onChange={event => setLeadDraft(current => ({ ...current, crmStatus: event.target.value as CrmStatus }))}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              {commercialKanbanStatuses.map(status => (
                <option key={status.key} value={status.key}>{status.label}</option>
              ))}
            </select>
            <Input value={leadDraft.tags} onChange={event => setLeadDraft(current => ({ ...current, tags: event.target.value }))} placeholder="Tags separadas por virgula" />
            <Textarea value={leadDraft.notes} onChange={event => setLeadDraft(current => ({ ...current, notes: event.target.value }))} placeholder="Observacao inicial" className="min-h-24 resize-none" />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setLeadModalOpen(false)}>Cancelar</Button>
              <Button type="button" onClick={() => void createLead()} disabled={!leadDraft.leadName.trim()}>Criar atendimento</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedKanbanItem)} onOpenChange={open => !open && setSelectedKanbanItem(null)}>
        <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto border-border bg-card">
          <DialogHeader>
            <DialogTitle>{selectedKanbanItem?.name || "Detalhes"}</DialogTitle>
            <DialogDescription>{selectedKanbanItem?.isLead ? "Atendimento comercial sem projeto formal." : "Projeto comercial vinculado ao Kanban."}</DialogDescription>
          </DialogHeader>
          {selectedKanbanItem && (
            <div className="grid gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Info label="Cliente" value={selectedKanbanItem.client_name || "-"} />
                <Info label="Arquiteto" value={selectedKanbanItem.architect_name || selectedKanbanItem.ownerName || "-"} />
                <Info label="Vendedor" value={selectedKanbanItem.sellerName || "-"} />
                <Info label="Criado em" value={longDate(selectedKanbanItem.created_at)} />
                <Info label="Ultima atualizacao" value={longDate(selectedKanbanItem.crm_last_contact_at || selectedKanbanItem.created_at)} />
                <Info label="Valor estimado" value={formatCurrency(projectValue(selectedKanbanItem))} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Etapa atual</span>
                  <select
                    value={kanbanDraft.crmStatus}
                    onChange={event => setKanbanDraft(current => ({ ...current, crmStatus: event.target.value as CrmStatus }))}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {commercialKanbanStatuses.map(status => (
                      <option key={status.key} value={status.key}>{status.label}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Proxima acao</span>
                  <Input value={kanbanDraft.nextAction} onChange={event => setKanbanDraft(current => ({ ...current, nextAction: event.target.value }))} placeholder="Ex: enviar proposta" />
                </label>
              </div>
              <label className="grid gap-1 text-sm">
                <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Tags</span>
                <Input value={kanbanDraft.tags} onChange={event => setKanbanDraft(current => ({ ...current, tags: event.target.value }))} placeholder="Urgente, cliente quente, visita na loja..." />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Follow-up</span>
                <Input type="date" value={kanbanDraft.nextFollowupAt} onChange={event => setKanbanDraft(current => ({ ...current, nextFollowupAt: event.target.value }))} />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Observacoes</span>
                <Textarea value={kanbanDraft.notes} onChange={event => setKanbanDraft(current => ({ ...current, notes: event.target.value }))} className="min-h-28 resize-none" />
              </label>
              <div className="rounded-md border border-border bg-muted/20 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Produtos selecionados</p>
                <p className="mt-1 text-sm text-foreground">{selectedKanbanItem.itemCount || 0} item(ns) no projeto</p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {selectedKanbanItem.isLead ? (
                  <Button type="button" variant="outline" onClick={() => void convertLeadToProject()}>
                    Converter em projeto
                  </Button>
                ) : (
                  <Button type="button" variant="outline" asChild>
                    <Link to={`/projects?project=${selectedKanbanItem.id}`}>Abrir projeto completo</Link>
                  </Button>
                )}
                <Button type="button" onClick={() => void saveKanbanDetails()}>Salvar detalhes</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}

function projectNeedsAttention(project: CrmProject) {
  return attentionReasons(project).length > 0;
}

function attentionReasons(project: CrmProject) {
  const reasons: string[] = [];
  if (!project.itemCount) reasons.push("sem produtos");
  if (!project.client_name) reasons.push("sem cliente");
  if (project.crm_next_followup_at && new Date(project.crm_next_followup_at) < new Date()) reasons.push("follow-up atrasado");
  if (daysSince(projectActivityDate(project)) >= 9) reasons.push("sem contato ha 9+ dias");
  if (project.crm_risk_level === "alto") reasons.push("risco alto");
  return reasons;
}

function OverviewSection({
  dashboard,
  projects,
  customers,
  attentionProjects,
  sellerRows,
  isAdmin,
  projectsByStatus,
  draggedProjectId,
  setDraggedProjectId,
  moveProject,
  delayedOrders,
  agendaEvents,
  currentMonthProjects,
  hotProjects,
  futurePipeline,
}: {
  dashboard: Record<string, number>;
  projects: CrmProject[];
  customers: CrmCustomer[];
  attentionProjects: Array<CrmProject & { reasons: string[] }>;
  sellerRows: SellerPerformanceRow[];
  isAdmin: boolean;
  projectsByStatus: Record<CrmStatus, CrmProject[]>;
  draggedProjectId: string | null;
  setDraggedProjectId: (id: string | null) => void;
  moveProject: (projectId: string, nextStatus: CrmStatus) => Promise<void>;
  delayedOrders: Array<{ project: CrmProject; dueDate: Date; daysLate: number; brands: string }>;
  agendaEvents: CrmAgendaEvent[];
  currentMonthProjects: CrmProject[];
  hotProjects: CrmProject[];
  futurePipeline: CrmProject[];
}) {
  if (isAdmin) {
    return (
      <AdminExecutiveDashboard
        dashboard={dashboard}
        projects={projects}
        attentionProjects={attentionProjects}
        sellerRows={sellerRows}
        projectsByStatus={projectsByStatus}
        delayedOrders={delayedOrders}
        agendaEvents={agendaEvents}
        currentMonthProjects={currentMonthProjects}
      />
    );
  }

  return (
    <SellerRoutineDashboard
      dashboard={dashboard}
      projects={projects}
      customers={customers}
      attentionProjects={attentionProjects}
      projectsByStatus={projectsByStatus}
      draggedProjectId={draggedProjectId}
      setDraggedProjectId={setDraggedProjectId}
      moveProject={moveProject}
      agendaEvents={agendaEvents}
      currentMonthProjects={currentMonthProjects}
      hotProjects={hotProjects}
      futurePipeline={futurePipeline}
    />
  );
}

type ExecutivePriority = {
  title: string;
  description: string;
  priority: "Alta" | "Média" | "Baixa";
  action: "Ver pedido" | "Ver projeto" | "Agendar follow-up";
};

type ExecutiveOrderSignal = {
  title: string;
  description: string;
  status: string;
  tone: "danger" | "warning" | "neutral";
};

function AdminExecutiveDashboard({
  dashboard,
  projects,
  attentionProjects,
  sellerRows,
  projectsByStatus,
  delayedOrders,
  agendaEvents,
  currentMonthProjects,
}: {
  dashboard: Record<string, number>;
  projects: CrmProject[];
  attentionProjects: Array<CrmProject & { reasons: string[] }>;
  sellerRows: SellerPerformanceRow[];
  projectsByStatus: Record<CrmStatus, CrmProject[]>;
  delayedOrders: Array<{ project: CrmProject; dueDate: Date; daysLate: number; brands: string }>;
  agendaEvents: CrmAgendaEvent[];
  currentMonthProjects: CrmProject[];
}) {
  const monthValue = currentMonthProjects.reduce((sum, project) => sum + projectValue(project), 0);
  const activeProjects = projects.filter(project => !isClosedStatus(project.crm_status) && !isSoldStatus(project.crm_status));
  const operationalOrders = projects.filter(project => hasOperationalOrder(project) && normalizeOrderStatus(project.crm_order_status) !== "entregue");
  const overdueAgenda = agendaEvents.filter(event => event.status === "agendado" && new Date(event.scheduled_at) < new Date());
  const attentionCount = delayedOrders.length + overdueAgenda.length + attentionProjects.length;
  const soldProjects = projects.filter(project => isSoldStatus(project.crm_status));
  const totalSoldValue = soldProjects.reduce((sum, project) => sum + projectValue(project), 0);
  const conversionBase = projects.filter(project => !["novo_atendimento", "briefing_visita"].includes(normalizeStatus(project.crm_status))).length;
  const conversionRate = conversionBase ? Math.round((soldProjects.length / conversionBase) * 100) : dashboard.conversionRate;
  const averageTicket = soldProjects.length ? totalSoldValue / soldProjects.length : dashboard.averageTicket;
  const bestSeller = [...sellerRows].sort((a, b) => b.value - a.value)[0];
  const closedWithDates = soldProjects.filter(project => project.sale_completed_at || project.created_at);
  const leadTime = closedWithDates.length
    ? Math.round(closedWithDates.reduce((sum, project) => {
      const start = new Date(project.created_at).getTime();
      const end = new Date(project.sale_completed_at || project.created_at).getTime();
      return sum + Math.max(0, Math.round((end - start) / 86_400_000));
    }, 0) / closedWithDates.length)
    : 0;
  const recentProjects = [...projects]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);
  const priorities = buildExecutivePriorities(attentionProjects, delayedOrders, agendaEvents);
  const orderSignals = buildExecutiveOrderSignals(projects, delayedOrders, agendaEvents);

  return (
    <div className="grid gap-6 text-[#1F1F1F]">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ExecutiveOverviewCard
          label="Vendas do mês"
          value={formatCurrency(monthValue || dashboard.soldThisMonth)}
          helper={`${currentMonthProjects.length} projeto(s) fechado(s)`}
          icon={CircleDollarSign}
        />
        <ExecutiveOverviewCard
          label="Projetos ativos"
          value={activeProjects.length}
          helper="Oportunidades em atendimento"
          icon={BriefcaseBusiness}
        />
        <ExecutiveOverviewCard
          label="Pedidos em andamento"
          value={operationalOrders.length}
          helper="Da revisão técnica à entrega"
          icon={PackageCheck}
        />
        <ExecutiveOverviewCard
          label="Atenção necessária"
          value={attentionCount}
          helper={attentionCount ? "Ações para resolver hoje" : "Operação sem alerta crítico"}
          icon={AlertTriangle}
          danger={attentionCount > 0}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <ExecutivePanel className="xl:col-span-8" title="Prioridades de hoje" description="Ações que merecem decisão rápida.">
          <div className="grid gap-3">
            {priorities.length ? priorities.map(item => (
              <ExecutivePriorityRow key={`${item.title}-${item.description}`} item={item} />
            )) : (
              <div className="rounded-[18px] border border-[#E5E2DC] bg-[#F7F6F3] px-4 py-5 text-sm text-[#77736B]">
                Nenhuma prioridade crítica para hoje.
              </div>
            )}
          </div>
        </ExecutivePanel>

        <ExecutivePanel className="xl:col-span-4" title="Performance do mês" description="Indicadores essenciais.">
          <div className="grid gap-3">
            <ExecutivePerformanceItem label="Conversão" value={`${conversionRate}%`} />
            <ExecutivePerformanceItem label="Ticket médio" value={formatCurrency(averageTicket)} />
            <ExecutivePerformanceItem label="Projetos fechados" value={soldProjects.length} />
            <ExecutivePerformanceItem label="Melhor vendedor" value={bestSeller?.seller || "Sem dados"} />
            <ExecutivePerformanceItem label="Lead time médio" value={leadTime ? `${leadTime} dias` : "-"} />
          </div>
        </ExecutivePanel>
      </div>

      <ExecutivePanel title="Pipeline comercial" description="Resumo do funil. O Kanban completo fica na aba Kanban Comercial.">
        <ExecutivePipeline projectsByStatus={projectsByStatus} />
      </ExecutivePanel>

      <div className="grid gap-6 xl:grid-cols-12">
        <ExecutivePanel className="xl:col-span-7" title="Últimos projetos" description="Até cinco projetos recentes.">
          <ExecutiveRecentProjects projects={recentProjects} />
        </ExecutivePanel>
        <ExecutivePanel className="xl:col-span-5" title="Próximas entregas e pedidos" description="Pedidos relevantes para acompanhamento.">
          <ExecutiveOrderSignals items={orderSignals} />
        </ExecutivePanel>
      </div>

      {!projects.length && (
        <div className="rounded-[22px] border border-[#E5E2DC] bg-white px-5 py-6 text-sm text-[#77736B]">
          Quando vendedores criarem projetos na aba Projetos, eles entram automaticamente nesta visão executiva.
        </div>
      )}
    </div>
  );
}

function buildExecutivePriorities(
  attentionProjects: Array<CrmProject & { reasons: string[] }>,
  delayedOrders: Array<{ project: CrmProject; dueDate: Date; daysLate: number; brands: string }>,
  agendaEvents: CrmAgendaEvent[]
): ExecutivePriority[] {
  const now = new Date();
  const deliveryEvents = agendaEvents
    .filter(event => event.status === "agendado" && normalizeText(event.event_type).includes("entrega") && new Date(event.scheduled_at) >= now)
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    .slice(0, 2);
  const staleProjects = attentionProjects
    .filter(project => project.reasons.some(reason => reason.includes("contato") || reason.includes("follow")))
    .slice(0, 2);
  const proposalProjects = attentionProjects
    .filter(project => ["proposta_orcamento", "followup_negociacao"].includes(normalizeStatus(project.crm_status)))
    .slice(0, 2);

  return [
    ...delayedOrders.slice(0, 2).map(row => ({
      title: "Pedido atrasado",
      description: `${row.project.name} · ${row.brands} · ${row.daysLate} dia(s)`,
      priority: "Alta" as const,
      action: "Ver pedido" as const,
    })),
    ...staleProjects.map(project => ({
      title: "Projeto sem follow-up",
      description: `${project.name} · ${project.client_name || "Cliente não informado"}`,
      priority: "Alta" as const,
      action: "Agendar follow-up" as const,
    })),
    ...proposalProjects.map(project => ({
      title: normalizeStatus(project.crm_status) === "proposta_orcamento" ? "Cliente aguardando proposta" : "Proposta parada",
      description: `${project.name} · ${formatCurrency(projectValue(project))}`,
      priority: normalizeStatus(project.crm_status) === "proposta_orcamento" ? "Média" as const : "Alta" as const,
      action: "Ver projeto" as const,
    })),
    ...deliveryEvents.map(event => ({
      title: "Entrega próxima",
      description: `${event.title} · ${longDate(event.scheduled_at)}`,
      priority: "Baixa" as const,
      action: "Ver pedido" as const,
    })),
  ].slice(0, 5);
}

function buildExecutiveOrderSignals(
  projects: CrmProject[],
  delayedOrders: Array<{ project: CrmProject; dueDate: Date; daysLate: number; brands: string }>,
  agendaEvents: CrmAgendaEvent[]
): ExecutiveOrderSignal[] {
  const delayed = delayedOrders.slice(0, 2).map(row => ({
    title: row.project.name,
    description: `${row.brands} · vencido em ${longDate(row.dueDate.toISOString())}`,
    status: "Pedido atrasado",
    tone: "danger" as const,
  }));
  const operational = projects
    .filter(project => ["producao", "pedido_faturado", "entrega_agendada"].includes(normalizeOrderStatus(project.crm_order_status)))
    .slice(0, 4)
    .map(project => ({
      title: project.name,
      description: `${project.client_name || "Cliente não informado"} · ${project.sellerName || "Sem vendedor"}`,
      status: orderStatusLabel(project.crm_order_status),
      tone: normalizeOrderStatus(project.crm_order_status) === "entrega_agendada" ? "warning" as const : "neutral" as const,
    }));
  const deliveries = agendaEvents
    .filter(event => event.status === "agendado" && normalizeText(event.event_type).includes("entrega") && new Date(event.scheduled_at) >= new Date())
    .slice(0, 2)
    .map(event => ({
      title: event.title,
      description: longDate(event.scheduled_at),
      status: "Entrega agendada",
      tone: "warning" as const,
    }));
  return [...delayed, ...operational, ...deliveries].slice(0, 5);
}

function ExecutiveOverviewCard({
  label,
  value,
  helper,
  icon: Icon,
  danger = false,
}: {
  label: string;
  value: string | number;
  helper: string;
  icon: typeof Users;
  danger?: boolean;
}) {
  return (
    <div className="rounded-[24px] border border-[#E5E2DC] bg-white p-5 shadow-[0_18px_45px_rgba(31,31,31,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div className={danger ? "grid h-9 w-9 place-items-center rounded-full bg-red-50 text-red-600" : "grid h-9 w-9 place-items-center rounded-full bg-[#F3E9D8] text-[#9A6B2F]"}>
          <Icon size={17} />
        </div>
      </div>
      <p className="mt-6 text-sm text-[#77736B]">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-normal text-[#1F1F1F]">{value}</p>
      <p className="mt-2 text-sm text-[#77736B]">{helper}</p>
    </div>
  );
}

function ExecutivePanel({
  title,
  description,
  className = "",
  children,
}: {
  title: string;
  description?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`rounded-[24px] border border-[#E5E2DC] bg-white p-5 shadow-[0_18px_45px_rgba(31,31,31,0.04)] ${className}`}>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-[#1F1F1F]">{title}</h2>
        {description && <p className="mt-1 text-sm text-[#77736B]">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function ExecutivePriorityRow({ item }: { item: ExecutivePriority }) {
  const tone = item.priority === "Alta"
    ? "border-red-200 bg-red-50 text-red-700"
    : item.priority === "Média"
      ? "border-[#E7D2A8] bg-[#FFF8EA] text-[#9A6B2F]"
      : "border-[#E5E2DC] bg-[#F7F6F3] text-[#77736B]";

  return (
    <div className="grid gap-3 rounded-[18px] border border-[#E5E2DC] bg-white px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#1F1F1F]">{item.title}</p>
        <p className="mt-1 truncate text-sm text-[#77736B]">{item.description}</p>
      </div>
      <span className={`w-fit rounded-full border px-3 py-1 text-xs font-medium ${tone}`}>{item.priority}</span>
      <Link to="/projects" className="w-fit rounded-full border border-[#E5E2DC] px-3 py-1.5 text-xs font-medium text-[#1F1F1F] transition-colors hover:bg-[#F7F6F3]">
        {item.action}
      </Link>
    </div>
  );
}

function ExecutivePipeline({ projectsByStatus }: { projectsByStatus: Record<CrmStatus, CrmProject[]> }) {
  const steps = [
    { label: "Atendimento", statuses: ["novo_atendimento"] as CrmStatus[] },
    { label: "Briefing / Visita", statuses: ["briefing_visita"] as CrmStatus[] },
    { label: "Curadoria", statuses: ["curadoria_produtos"] as CrmStatus[] },
    { label: "Proposta", statuses: ["proposta_orcamento"] as CrmStatus[] },
    { label: "Negociação", statuses: ["followup_negociacao"] as CrmStatus[] },
    { label: "Fechado", statuses: ["pedido_fechado"] as CrmStatus[] },
  ].map(step => ({
    ...step,
    count: step.statuses.reduce((sum, status) => sum + (projectsByStatus[status]?.length || 0), 0),
  }));
  const max = Math.max(1, ...steps.map(step => step.count));

  return (
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
      {steps.map(step => (
        <div key={step.label} className="rounded-[18px] border border-[#E5E2DC] bg-[#F7F6F3] p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-[#1F1F1F]">{step.label}</p>
            <span className="text-xl font-semibold text-[#1F1F1F]">{step.count}</span>
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full bg-[#C8A46D]" style={{ width: `${Math.max(8, (step.count / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ExecutivePerformanceItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[16px] border border-[#E5E2DC] bg-[#F7F6F3] px-4 py-3">
      <span className="text-sm text-[#77736B]">{label}</span>
      <span className="max-w-[55%] truncate text-right text-sm font-semibold text-[#1F1F1F]">{value}</span>
    </div>
  );
}

function ExecutiveRecentProjects({ projects }: { projects: CrmProject[] }) {
  if (!projects.length) {
    return <p className="rounded-[18px] border border-[#E5E2DC] bg-[#F7F6F3] px-4 py-5 text-sm text-[#77736B]">Nenhum projeto no período selecionado.</p>;
  }

  return (
    <>
      <div className="hidden overflow-hidden rounded-[18px] border border-[#E5E2DC] md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#F7F6F3] text-xs uppercase tracking-[0.12em] text-[#77736B]">
            <tr>
              <th className="px-4 py-3 font-medium">Projeto</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Vendedor</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E2DC]">
            {projects.map(project => (
              <tr key={project.id}>
                <td className="px-4 py-3 font-medium text-[#1F1F1F]">{project.name}</td>
                <td className="px-4 py-3 text-[#77736B]">{project.client_name || "-"}</td>
                <td className="px-4 py-3 text-[#77736B]">{project.sellerName || "-"}</td>
                <td className="px-4 py-3 text-[#77736B]">{statusLabel(project.crm_status)}</td>
                <td className="px-4 py-3 text-right font-medium text-[#1F1F1F]">{formatCurrency(projectValue(project))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 md:hidden">
        {projects.map(project => (
          <div key={project.id} className="rounded-[18px] border border-[#E5E2DC] bg-[#F7F6F3] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#1F1F1F]">{project.name}</p>
                <p className="mt-1 text-sm text-[#77736B]">{project.client_name || "Cliente não informado"}</p>
              </div>
              <p className="text-right text-sm font-semibold text-[#1F1F1F]">{formatCurrency(projectValue(project))}</p>
            </div>
            <p className="mt-3 text-xs text-[#77736B]">{project.sellerName || "Sem vendedor"} · {statusLabel(project.crm_status)}</p>
          </div>
        ))}
      </div>
    </>
  );
}

function ExecutiveOrderSignals({ items }: { items: ExecutiveOrderSignal[] }) {
  if (!items.length) {
    return <p className="rounded-[18px] border border-[#E5E2DC] bg-[#F7F6F3] px-4 py-5 text-sm text-[#77736B]">Nenhum pedido relevante para acompanhar agora.</p>;
  }

  return (
    <div className="grid gap-3">
      {items.map(item => (
        <div key={`${item.title}-${item.status}`} className="rounded-[18px] border border-[#E5E2DC] bg-[#F7F6F3] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#1F1F1F]">{item.title}</p>
              <p className="mt-1 text-sm text-[#77736B]">{item.description}</p>
            </div>
            <span className={item.tone === "danger" ? "rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700" : item.tone === "warning" ? "rounded-full bg-[#FFF8EA] px-3 py-1 text-xs font-medium text-[#9A6B2F]" : "rounded-full bg-white px-3 py-1 text-xs font-medium text-[#77736B]"}>
              {item.status}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function AdminManagementDashboard({
  dashboard,
  projects,
  attentionProjects,
  sellerRows,
  projectsByStatus,
  draggedProjectId,
  setDraggedProjectId,
  moveProject,
  delayedOrders,
  agendaEvents,
  currentMonthProjects,
  hotProjects,
  futurePipeline,
  salesProgressData,
  environmentRows,
  brandOrderRows,
  originRows,
  architectRows,
  saveSalesTarget,
}: {
  dashboard: Record<string, number>;
  projects: CrmProject[];
  attentionProjects: Array<CrmProject & { reasons: string[] }>;
  sellerRows: SellerPerformanceRow[];
  projectsByStatus: Record<CrmStatus, CrmProject[]>;
  draggedProjectId: string | null;
  setDraggedProjectId: (id: string | null) => void;
  moveProject: (projectId: string, nextStatus: CrmStatus) => Promise<void>;
  delayedOrders: Array<{ project: CrmProject; dueDate: Date; daysLate: number; brands: string }>;
  agendaEvents: CrmAgendaEvent[];
  currentMonthProjects: CrmProject[];
  hotProjects: CrmProject[];
  futurePipeline: CrmProject[];
  salesProgressData: Array<{ month: string; vendas: number; meta: number; projetos: number }>;
  environmentRows: Array<{ environment: string; value: number; count: number; average: number }>;
  brandOrderRows: Array<{ brand: string; count: number; value: number; projects: number }>;
  originRows: Array<{ origin: string; count: number }>;
  architectRows: Array<{ name: string; birthDate: string | null; projects: number; active: number; value: number; clients: Set<string>; nextDeadline: string | null }>;
  saveSalesTarget: (sellerUserId: string, targetValue: number) => Promise<void>;
}) {
  const upcomingAgenda = agendaEvents.filter(event => event.status === "agendado" && new Date(event.scheduled_at) >= new Date()).slice(0, 4);
  const monthValue = currentMonthProjects.reduce((sum, project) => sum + projectValue(project), 0);
  const hotValue = hotProjects.reduce((sum, project) => sum + projectValue(project), 0);
  const futureValue = futurePipeline.reduce((sum, project) => sum + projectValue(project), 0);
  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
        <Card className="overflow-hidden rounded-lg border-border/80 bg-[#fffefa] shadow-sm">
          <CardContent className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:p-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-foreground text-background">Painel do Admin</Badge>
                <Badge variant="outline" className="border-accent/30 text-accent">Operacao em tempo real</Badge>
              </div>
              <h2 className="mt-4 font-serif text-2xl text-foreground md:text-3xl">Visao geral da loja</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Tudo que precisa de decisao fica junto: volume de projetos, pedidos em producao, entregas, atrasos, metas e alertas do time comercial.
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
                <ExecutiveMetricCard label="Projetos ativos" value={dashboard.activeProjects} icon={BriefcaseBusiness} />
                <ExecutiveMetricCard label="Pedidos em producao" value={dashboard.production} icon={PackageCheck} />
                <ExecutiveMetricCard label="Entregas" value={dashboard.deliveries} icon={Truck} />
                <ExecutiveMetricCard label="Atrasos" value={delayedOrders.length + dashboard.overdueFollowups + dashboard.overdueAgenda} icon={AlertTriangle} danger />
                <ExecutiveMetricCard label="Em aberto" value={formatCurrency(dashboard.totalNegotiation)} icon={CircleDollarSign} />
              </div>
            </div>
            <AdminAgendaPreview events={upcomingAgenda} delayedOrders={delayedOrders} />
          </CardContent>
        </Card>

        <Card className="rounded-lg border-border/80 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell size={16} className="text-accent" />
              Alertas inteligentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <NextActionsPanel attentionProjects={attentionProjects} delayedOrders={delayedOrders} agendaEvents={agendaEvents} />
          </CardContent>
        </Card>
      </div>

      <PipelineOverview projectsByStatus={projectsByStatus} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <BusinessIntelligencePanel
          monthCount={currentMonthProjects.length}
          monthValue={monthValue}
          hotProjects={hotProjects}
          hotValue={hotValue}
          futureProjects={futurePipeline}
          futureValue={futureValue}
        />
        <SalesProgressPanel data={salesProgressData} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <GoalsPanel sellerRows={sellerRows} isAdmin={true} saveSalesTarget={saveSalesTarget} />
        <PerformanceReportsPanel
          dashboard={dashboard}
          sellerRows={sellerRows}
          environmentRows={environmentRows}
          originRows={originRows}
          architectRows={architectRows}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <BrandOrdersPanel rows={brandOrderRows} />
        <RecentProjectsTable projects={projects} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <Card className="rounded-lg border-border/80 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">Quadro Kanban Comercial</CardTitle>
              <span className="text-xs text-muted-foreground">{projects.length} oportunidade(s)</span>
            </div>
          </CardHeader>
          <CardContent>
            <KanbanBoard
              projectsByStatus={projectsByStatus}
              draggedProjectId={draggedProjectId}
              setDraggedProjectId={setDraggedProjectId}
              moveProject={moveProject}
              compact
            />
          </CardContent>
        </Card>

        <div className="grid gap-5">
          <AttentionCard projects={attentionProjects} />
          <DelayedOrdersCard rows={delayedOrders} />
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="text-base">Proximos compromissos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {upcomingAgenda.length ? upcomingAgenda.map(event => (
                <div key={event.id} className="rounded-md border border-border p-3">
                  <p className="text-sm font-medium text-foreground">{event.title}</p>
                  <p className="text-xs text-muted-foreground">{longDate(event.scheduled_at)} · {event.event_type}</p>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground">Nenhum compromisso proximo.</p>
              )}
            </CardContent>
          </Card>
          <TeamCard sellerRows={sellerRows} />
          {!projects.length && (
            <Card className="rounded-lg">
              <CardContent className="p-6 text-sm text-muted-foreground">
                Quando vendedores criarem projetos na aba Projetos, eles entram automaticamente nesta visao de CRM.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function SellerRoutineDashboard({
  dashboard,
  projects,
  customers,
  attentionProjects,
  projectsByStatus,
  draggedProjectId,
  setDraggedProjectId,
  moveProject,
  agendaEvents,
  currentMonthProjects,
  hotProjects,
  futurePipeline,
}: {
  dashboard: Record<string, number>;
  projects: CrmProject[];
  customers: CrmCustomer[];
  attentionProjects: Array<CrmProject & { reasons: string[] }>;
  projectsByStatus: Record<CrmStatus, CrmProject[]>;
  draggedProjectId: string | null;
  setDraggedProjectId: (id: string | null) => void;
  moveProject: (projectId: string, nextStatus: CrmStatus) => Promise<void>;
  agendaEvents: CrmAgendaEvent[];
  currentMonthProjects: CrmProject[];
  hotProjects: CrmProject[];
  futurePipeline: CrmProject[];
}) {
  const todayKey = localDateKey(new Date());
  const todayEvents = agendaEvents
    .filter(event => event.status === "agendado" && localDateKey(new Date(event.scheduled_at)) === todayKey)
    .slice(0, 5);
  const nextEvents = agendaEvents
    .filter(event => event.status === "agendado" && new Date(event.scheduled_at) > new Date())
    .slice(0, 5);
  const activeCustomers = customers.filter(customer => customer.status !== "inativo").slice(0, 5);

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <Card className="rounded-lg border-border/80 bg-[#fffefa] shadow-sm">
          <CardContent className="p-4 lg:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-foreground text-background">Rotina do vendedor</Badge>
              <Badge variant="outline" className="border-accent/30 text-accent">Prioridade do dia</Badge>
            </div>
            <h2 className="mt-4 font-serif text-2xl text-foreground md:text-3xl">O que precisa acontecer hoje</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Acompanhe contatos atrasados, projetos com maior chance de fechamento, clientes ativos e compromissos antes que a oportunidade esfrie.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2.5 md:grid-cols-4">
              <ExecutiveMetricCard label="Agenda hoje" value={todayEvents.length} icon={CalendarDays} />
              <ExecutiveMetricCard label="Follow-ups atrasados" value={dashboard.overdueFollowups} icon={CalendarClock} danger />
              <ExecutiveMetricCard label="Projetos quentes" value={hotProjects.length} icon={Flame} />
              <ExecutiveMetricCard label="Carteira ativa" value={dashboard.activeClients} icon={Users} />
            </div>
          </CardContent>
        </Card>

        <RoutineAgendaCard title="Agenda de hoje" events={todayEvents.length ? todayEvents : nextEvents} empty="Sem compromisso para hoje." />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card className="rounded-lg border-border/80 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Flame size={16} className="text-accent" />
              Projetos quentes e proximas acoes
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <OpportunityList title="Fechamento iminente" projects={hotProjects} empty="Nenhum projeto quente agora." />
            <OpportunityList title="Carteira futura" projects={futurePipeline} empty="Sem oportunidades futuras preenchidas." />
          </CardContent>
        </Card>

        <Card className="rounded-lg border-border/80 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users size={16} className="text-accent" />
              Carteira em movimento
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {activeCustomers.length ? activeCustomers.map(customer => (
              <div key={customer.id} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{customer.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {customer.city || "Cidade nao informada"} · {customer.desired_style || "Estilo nao informado"} · {customer.projectCount || 0} projeto(s)
                  </p>
                </div>
                <Badge variant="secondary">{customer.urgency_level || "media"}</Badge>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">Nenhum cliente ativo na carteira.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <Card className="rounded-lg border-border/80 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">Kanban da minha rotina</CardTitle>
              <span className="text-xs text-muted-foreground">{projects.length} oportunidade(s)</span>
            </div>
          </CardHeader>
          <CardContent>
            <KanbanBoard
              projectsByStatus={projectsByStatus}
              draggedProjectId={draggedProjectId}
              setDraggedProjectId={setDraggedProjectId}
              moveProject={moveProject}
              compact
            />
          </CardContent>
        </Card>
        <div className="grid gap-5">
          <AttentionCard projects={attentionProjects} />
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="text-base">Projetos do mes</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {currentMonthProjects.slice(0, 5).map(project => (
                <Link key={project.id} to="/projects" className="rounded-md border border-border px-3 py-2 transition-colors hover:bg-muted/40">
                  <p className="text-sm font-medium text-foreground">{project.name}</p>
                  <p className="text-xs text-muted-foreground">{project.client_name || "Cliente nao informado"} · {statusLabel(project.crm_status)}</p>
                </Link>
              ))}
              {!currentMonthProjects.length && <p className="text-sm text-muted-foreground">Nenhum projeto novo neste mes.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function ExecutiveMetricCard({
  label,
  value,
  icon: Icon,
  danger = false,
}: {
  label: string;
  value: string | number;
  icon: typeof Users;
  danger?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className={danger ? "grid h-9 w-9 shrink-0 place-items-center rounded-md bg-destructive/10 text-destructive" : "grid h-9 w-9 shrink-0 place-items-center rounded-md bg-accent/10 text-accent"}>
          <Icon size={17} />
        </span>
        <span className="min-w-0 text-right text-lg font-semibold text-foreground">{value}</span>
      </div>
      <p className="mt-3 text-[10px] uppercase leading-snug tracking-[0.12em] text-muted-foreground">{label}</p>
    </div>
  );
}

function AdminAgendaPreview({
  events,
  delayedOrders,
}: {
  events: CrmAgendaEvent[];
  delayedOrders: Array<{ project: CrmProject; dueDate: Date; daysLate: number; brands: string }>;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Agenda operacional</p>
          <p className="mt-1 text-sm font-semibold text-foreground">Proximos compromissos</p>
        </div>
        <CalendarDays size={18} className="text-accent" />
      </div>
      <div className="mt-4 space-y-2">
        {events.length ? events.map(event => (
          <div key={event.id} className="rounded-md bg-muted/35 px-3 py-2">
            <p className="text-sm font-medium text-foreground">{event.title}</p>
            <p className="text-xs text-muted-foreground">{shortDate(event.scheduled_at)} · {event.event_type}</p>
          </div>
        )) : (
          <p className="text-sm text-muted-foreground">Nenhum compromisso proximo.</p>
        )}
      </div>
      <div className="mt-4 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2">
        <p className="text-xs font-medium text-destructive">{delayedOrders.length} pedido(s) atrasado(s)</p>
        <p className="mt-1 text-xs text-muted-foreground">Use a agenda para cobrar fabrica antes do cliente reclamar.</p>
      </div>
    </div>
  );
}

function PipelineOverview({ projectsByStatus }: { projectsByStatus: Record<CrmStatus, CrmProject[]> }) {
  const pipeline = [
    { label: "Atendimento", statuses: ["novo_atendimento", "briefing_visita"] as CrmStatus[], icon: Users },
    { label: "Curadoria", statuses: ["curadoria_produtos"] as CrmStatus[], icon: FileText },
    { label: "Proposta", statuses: ["proposta_orcamento"] as CrmStatus[], icon: ClipboardList },
    { label: "Negociacao", statuses: ["followup_negociacao"] as CrmStatus[], icon: TrendingUp },
    { label: "Fechados", statuses: ["pedido_fechado"] as CrmStatus[], icon: ShieldCheck },
  ].map(stage => ({
    ...stage,
    count: stage.statuses.reduce((sum, status) => sum + (projectsByStatus[status]?.length || 0), 0),
  }));
  const max = Math.max(1, ...pipeline.map(stage => stage.count));

  return (
    <Card className="rounded-lg border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Store size={16} className="text-accent" />
          Pipeline comercial
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {pipeline.map(stage => {
          const Icon = stage.icon;
          return (
            <div key={stage.label} className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <Icon size={16} className="text-accent" />
                <span className="text-lg font-semibold text-foreground">{stage.count}</span>
              </div>
              <p className="mt-2 text-xs font-medium text-foreground">{stage.label}</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-background">
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(8, (stage.count / max) * 100)}%` }} />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function NextActionsPanel({
  attentionProjects,
  delayedOrders,
  agendaEvents,
}: {
  attentionProjects: Array<CrmProject & { reasons: string[] }>;
  delayedOrders: Array<{ project: CrmProject; dueDate: Date; daysLate: number; brands: string }>;
  agendaEvents: CrmAgendaEvent[];
}) {
  const overdueAgenda = agendaEvents.filter(event => event.status === "agendado" && new Date(event.scheduled_at) < new Date()).slice(0, 2);
  const actions = [
    ...delayedOrders.slice(0, 2).map(row => ({ title: row.project.name, detail: `Cobrar ${row.brands} · ${row.daysLate}d atrasado`, tone: "destructive" as const })),
    ...overdueAgenda.map(event => ({ title: event.title, detail: `Agenda vencida · ${longDate(event.scheduled_at)}`, tone: "warning" as const })),
    ...attentionProjects.slice(0, 3).map(project => ({ title: project.name, detail: project.reasons.join(", "), tone: "default" as const })),
  ].slice(0, 5);

  return (
    <div className="space-y-2">
      {actions.length ? actions.map(action => (
        <div key={`${action.title}-${action.detail}`} className={action.tone === "destructive" ? "rounded-md border border-destructive/25 bg-destructive/5 p-3" : "rounded-md border border-border p-3"}>
          <p className="text-sm font-medium text-foreground">{action.title}</p>
          <p className={action.tone === "destructive" ? "mt-1 text-xs text-destructive" : "mt-1 text-xs text-muted-foreground"}>{action.detail}</p>
        </div>
      )) : (
        <p className="text-sm text-muted-foreground">Sem alerta critico no momento.</p>
      )}
    </div>
  );
}

function BrandOrdersPanel({ rows }: { rows: Array<{ brand: string; count: number; value: number; projects: number }> }) {
  return (
    <Card className="rounded-lg border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BoxIconFallback />
          Pedidos por marca
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length ? rows.map(row => (
          <div key={row.brand} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border border-border p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{row.brand}</p>
              <p className="text-xs text-muted-foreground">{row.projects} projeto(s) · {row.count} item(ns)</p>
            </div>
            <p className="text-right text-sm font-semibold text-foreground">{formatCurrency(row.value)}</p>
          </div>
        )) : (
          <p className="text-sm text-muted-foreground">Sem itens tecnicos vinculados ainda.</p>
        )}
      </CardContent>
    </Card>
  );
}

function BoxIconFallback() {
  return <PackageCheck size={16} className="text-accent" />;
}

function RecentProjectsTable({ projects }: { projects: CrmProject[] }) {
  return (
    <Card className="rounded-lg border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History size={16} className="text-accent" />
          Projetos recentes
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Projeto</th>
                <th className="py-2 pr-3 font-medium">Cliente</th>
                <th className="py-2 pr-3 font-medium">Vendedor</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 text-right font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {projects.slice(0, 6).map(project => (
                <tr key={project.id} className="border-b border-border/60 last:border-0">
                  <td className="py-3 pr-3 font-medium text-foreground">{project.name}</td>
                  <td className="py-3 pr-3 text-muted-foreground">{project.client_name || "Nao informado"}</td>
                  <td className="py-3 pr-3 text-muted-foreground">{project.sellerName || "Sem vendedor"}</td>
                  <td className="py-3 pr-3"><Badge variant="secondary">{statusLabel(project.crm_status)}</Badge></td>
                  <td className="py-3 text-right font-semibold text-foreground">{formatCurrency(projectValue(project))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!projects.length && <p className="text-sm text-muted-foreground">Nenhum projeto encontrado.</p>}
      </CardContent>
    </Card>
  );
}

function RoutineAgendaCard({ title, events, empty }: { title: string; events: CrmAgendaEvent[]; empty: string }) {
  return (
    <Card className="rounded-lg border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock size={16} className="text-accent" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {events.length ? events.map(event => (
          <div key={event.id} className="rounded-md border border-border p-3">
            <p className="text-sm font-medium text-foreground">{event.title}</p>
            <p className="text-xs text-muted-foreground">{longDate(event.scheduled_at)} · {event.event_type} {event.location ? `· ${event.location}` : ""}</p>
          </div>
        )) : (
          <p className="text-sm text-muted-foreground">{empty}</p>
        )}
      </CardContent>
    </Card>
  );
}

function BusinessIntelligencePanel({
  monthCount,
  monthValue,
  hotProjects,
  hotValue,
  futureProjects,
  futureValue,
}: {
  monthCount: number;
  monthValue: number;
  hotProjects: CrmProject[];
  hotValue: number;
  futureProjects: CrmProject[];
  futureValue: number;
}) {
  return (
    <Card className="rounded-lg border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity size={16} className="text-accent" />
          Inteligencia do mes
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid grid-cols-3 gap-2">
          <InsightTile icon={BriefcaseBusiness} label="Projetos do mes" value={String(monthCount)} detail={formatCurrency(monthValue)} />
          <InsightTile icon={Flame} label="Projetos quentes" value={String(hotProjects.length)} detail={formatCurrency(hotValue)} danger />
          <InsightTile icon={CalendarRange} label="Carteira futura" value={String(futureProjects.length)} detail={formatCurrency(futureValue)} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <OpportunityList title="Fechamento iminente" projects={hotProjects} empty="Nenhum projeto quente agora." />
          <OpportunityList title="Previsao futura" projects={futureProjects} empty="Sem carteira futura preenchida." />
        </div>
      </CardContent>
    </Card>
  );
}

function SalesProgressPanel({ data }: { data: Array<{ month: string; vendas: number; meta: number; projetos: number }> }) {
  return (
    <Card className="rounded-lg border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <LineChart size={16} className="text-accent" />
          Progresso de vendas - 6 meses
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          className="h-[240px] w-full"
          config={{
            vendas: { label: "Vendas", color: "hsl(var(--accent))" },
            meta: { label: "Meta", color: "hsl(var(--muted-foreground))" },
          }}
        >
          <AreaChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.35} />
                <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} />
            <YAxis hide domain={[0, "dataMax"]} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area type="monotone" dataKey="meta" stroke="hsl(var(--muted-foreground))" fill="transparent" strokeDasharray="4 4" strokeWidth={2} />
            <Area type="monotone" dataKey="vendas" stroke="hsl(var(--accent))" fill="url(#salesFill)" strokeWidth={2.5} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function GoalsPanel({
  sellerRows,
  isAdmin,
  saveSalesTarget,
}: {
  sellerRows: SellerPerformanceRow[];
  isAdmin: boolean;
  saveSalesTarget: (sellerUserId: string, targetValue: number) => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const totalTarget = sellerRows.reduce((sum, row) => sum + row.target, 0);
  const totalSold = sellerRows.reduce((sum, row) => sum + row.value, 0);
  const totalProgress = totalTarget ? Math.round((totalSold / totalTarget) * 100) : 0;

  return (
    <Card className="rounded-lg border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target size={16} className="text-accent" />
          Gestao de metas
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Meta coletiva</p>
              <p className="mt-1 text-xl font-semibold text-foreground">{formatCurrency(totalTarget)}</p>
            </div>
            <Badge variant={totalProgress >= 100 ? "default" : "secondary"}>{totalProgress}%</Badge>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-background">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, totalProgress)}%` }} />
          </div>
        </div>
        <div className="space-y-2">
          {sellerRows.length ? sellerRows.map(row => {
            const draft = drafts[row.sellerId] ?? String(row.target || "");
            return (
              <div key={row.sellerId} className="grid gap-2 rounded-md border border-border p-3 lg:grid-cols-[minmax(0,1fr)_110px_110px]">
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-foreground">{row.seller}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(row.value)} vendidos · {row.progress}% da meta</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, row.progress)}%` }} />
                  </div>
                </div>
                <Input
                  type="number"
                  value={draft}
                  onChange={event => setDrafts(current => ({ ...current, [row.sellerId]: event.target.value }))}
                  disabled={!isAdmin}
                  placeholder="Meta"
                />
                <Button size="sm" disabled={!isAdmin} onClick={() => void saveSalesTarget(row.sellerId, Number(draft))}>
                  Salvar meta
                </Button>
              </div>
            );
          }) : (
            <p className="text-sm text-muted-foreground">Sem consultores com projetos ainda.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PerformanceReportsPanel({
  dashboard,
  sellerRows,
  environmentRows,
  originRows,
  architectRows,
}: {
  dashboard: Record<string, number>;
  sellerRows: SellerPerformanceRow[];
  environmentRows: Array<{ environment: string; value: number; count: number; average: number }>;
  originRows: Array<{ origin: string; count: number }>;
  architectRows: Array<{ name: string; projects: number; active: number; value: number }>;
}) {
  const sellerRanking = [...sellerRows].sort((a, b) => b.value - a.value).slice(0, 4);
  const architectRanking = [...architectRows].sort((a, b) => b.value - a.value).slice(0, 4);

  return (
    <Card className="rounded-lg border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy size={16} className="text-accent" />
          Performance e rankings
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <MiniStat icon={Percent} label="Conversao" value={`${dashboard.conversionRate}%`} />
          <MiniStat icon={CircleDollarSign} label="Ticket medio" value={formatCurrency(dashboard.averageTicket)} />
          <MiniStat icon={Clock} label="Lead time" value={`${dashboard.stalled} parados`} />
          <MiniStat icon={BarChart3} label="Lucratividade" value={dashboard.averageMargin ? `${dashboard.averageMargin}% margem` : "Sem margem"} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <RankList title="Ranking vendedores" rows={sellerRanking.map(row => ({ name: row.seller, value: formatCurrency(row.value), detail: `${row.sold} venda(s)` }))} />
          <RankList title="Ranking especificadores" rows={architectRanking.map(row => ({ name: row.name, value: formatCurrency(row.value), detail: `${row.active} ativo(s)` }))} />
          <RankList title="Ticket por ambiente" rows={environmentRows.map(row => ({ name: row.environment, value: formatCurrency(row.average), detail: `${row.count} item(ns)` }))} />
          <RankList title="Procedencia dos clientes" rows={originRows.map(row => ({ name: row.origin, value: String(row.count), detail: "cliente(s)" }))} />
        </div>
      </CardContent>
    </Card>
  );
}

function InsightTile({ icon: Icon, label, value, detail, danger = false }: { icon: typeof Users; label: string; value: string; detail: string; danger?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <Icon size={16} className={danger ? "text-destructive" : "text-accent"} />
        <span className="text-lg font-semibold text-foreground">{value}</span>
      </div>
      <p className="mt-2 text-[10px] uppercase leading-tight tracking-[0.1em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-xs font-medium text-foreground">{detail}</p>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <Icon size={15} className="mb-2 text-accent" />
      <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function OpportunityList({ title, projects, empty }: { title: string; projects: CrmProject[]; empty: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="mb-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">{title}</p>
      <div className="space-y-2">
        {projects.length ? projects.slice(0, 4).map(project => (
          <div key={project.id} className="rounded-md bg-muted/30 px-3 py-2">
            <p className="text-sm font-medium text-foreground">{project.name}</p>
            <p className="text-xs text-muted-foreground">{project.client_name || "Cliente nao informado"} · {formatCurrency(projectValue(project))}</p>
          </div>
        )) : (
          <p className="text-sm text-muted-foreground">{empty}</p>
        )}
      </div>
    </div>
  );
}

function RankList({ title, rows }: { title: string; rows: Array<{ name: string; value: string; detail: string }> }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="mb-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">{title}</p>
      <div className="space-y-2">
        {rows.length ? rows.map((row, index) => (
          <div key={`${title}-${row.name}`} className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-accent/10 text-xs font-semibold text-accent">{index + 1}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{row.name}</p>
              <p className="text-xs text-muted-foreground">{row.detail}</p>
            </div>
            <span className="text-right text-sm font-semibold text-foreground">{row.value}</span>
          </div>
        )) : (
          <p className="text-sm text-muted-foreground">Sem dados suficientes.</p>
        )}
      </div>
    </div>
  );
}

function CustomersSection({
  customers,
  projects,
  interactions,
  customerSearch,
  setCustomerSearch,
  onAddInteraction,
  onArchiveCustomer,
  onDeleteCustomer,
}: {
  customers: CrmCustomer[];
  projects: CrmProject[];
  interactions: CrmInteraction[];
  customerSearch: string;
  setCustomerSearch: (value: string) => void;
  onAddInteraction: (customer: CrmCustomer, projectId: string | null, description: string, nextAction: string, nextFollowupAt: string) => Promise<boolean>;
  onArchiveCustomer: (customer: CrmCustomer) => Promise<void>;
  onDeleteCustomer: (customer: CrmCustomer) => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Record<string, { description: string; nextAction: string; nextFollowupAt: string; projectId: string }>>({});

  const updateDraft = (customerId: string, patch: Partial<{ description: string; nextAction: string; nextFollowupAt: string; projectId: string }>) => {
    setDrafts(current => ({
      ...current,
      [customerId]: {
        description: "",
        nextAction: "",
        nextFollowupAt: "",
        projectId: "",
        ...(current[customerId] || {}),
        ...patch,
      },
    }));
  };

  return (
    <div className="grid gap-6">
      <Card className="rounded-lg">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-base">Carteira de Clientes</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Cada vendedor ve sua carteira. O admin acompanha todas as carteiras da loja.</p>
            </div>
            <div className="relative w-full md:w-80">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={customerSearch} onChange={event => setCustomerSearch(event.target.value)} placeholder="Buscar cliente, cidade, vendedor..." />
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {customers.map(customer => {
          const relatedProjects = projects.filter(project =>
            project.crm_customer_id === customer.id || customerKey(project.client_name || project.name) === customerKey(customer.name)
          );
          const relatedInteractions = interactions.filter(interaction =>
            interaction.customer_id === customer.id || relatedProjects.some(project => project.id === interaction.project_id)
          );
          const draft = drafts[customer.id] || { description: "", nextAction: "", nextFollowupAt: "", projectId: relatedProjects[0]?.id || "" };
          const timeline = [
            ...relatedInteractions.map(item => ({ date: item.created_at, title: item.interaction_type, detail: item.description })),
            ...relatedProjects.map(project => ({ date: project.created_at, title: "Projeto criado", detail: project.name })),
          ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);

          const submitInteraction = async () => {
            const saved = await onAddInteraction(customer, draft.projectId || relatedProjects[0]?.id || null, draft.description, draft.nextAction, draft.nextFollowupAt);
            if (saved) {
              setDrafts(current => ({
                ...current,
                [customer.id]: { description: "", nextAction: "", nextFollowupAt: "", projectId: draft.projectId || relatedProjects[0]?.id || "" },
              }));
            }
          };

          return (
            <Card key={customer.id} className="rounded-lg">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{customer.name}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">{customer.sellerName} · {customer.customer_type}</p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Badge variant={customer.status === "arquivado" ? "secondary" : customer.source === "project" ? "secondary" : "default"}>
                      {customer.status === "arquivado" ? "Arquivado" : customer.source === "project" ? "Projeto" : "CRM"}
                    </Badge>
                    {customer.source === "crm" && (
                      <>
                        <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => void onArchiveCustomer(customer)}>
                          Arquivar
                        </Button>
                        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-destructive hover:text-destructive" onClick={() => void onDeleteCustomer(customer)}>
                          Excluir
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <Info label="Telefone" value={customer.whatsapp || customer.phone || "-"} />
                  <Info label="E-mail" value={customer.email || "-"} />
                  <Info label="Cidade" value={customer.city || "-"} />
                  <Info label="Origem" value={customer.lead_source || "-"} />
                  <Info label="Arquiteto" value={customer.architect_name || "-"} />
                  <Info label="Investimento" value={customer.investment_range || formatCurrency(customer.totalValue || 0)} />
                  <Info label="Estilo" value={customer.desired_style || "-"} />
                  <Info label="Urgencia" value={customer.urgency_level || "-"} />
                  <Info label="Obra" value={customer.construction_status || "-"} />
                  <Info label="Prazo obra" value={longDate(customer.construction_deadline)} />
                  <Info label="Mudanca" value={longDate(customer.move_in_deadline)} />
                </div>

                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <p className="mb-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">Registrar atendimento</p>
                  {relatedProjects.length > 1 && (
                    <select
                      value={draft.projectId || relatedProjects[0]?.id || ""}
                      onChange={event => updateDraft(customer.id, { projectId: event.target.value })}
                      className="mb-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {relatedProjects.map(project => (
                        <option key={project.id} value={project.id}>{project.name}</option>
                      ))}
                    </select>
                  )}
                  <Textarea
                    value={draft.description}
                    onChange={event => updateDraft(customer.id, { description: event.target.value })}
                    placeholder="Resumo do atendimento, reuniao, negociacao ou combinados..."
                    className="min-h-20 resize-none text-sm"
                  />
                  <div className="mt-2 grid gap-2 md:grid-cols-[minmax(0,1fr)_150px_auto]">
                    <Input
                      value={draft.nextAction}
                      onChange={event => updateDraft(customer.id, { nextAction: event.target.value })}
                      placeholder="Proxima acao"
                    />
                    <Input
                      type="date"
                      value={draft.nextFollowupAt}
                      onChange={event => updateDraft(customer.id, { nextFollowupAt: event.target.value })}
                    />
                    <Button type="button" onClick={() => void submitInteraction()} disabled={!draft.description.trim()}>
                      Registrar
                    </Button>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">Linha do tempo comercial</p>
                  <div className="space-y-2">
                    {timeline.length ? timeline.map(item => (
                      <div key={`${item.date}-${item.title}`} className="rounded-md border border-border px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-foreground">{item.title}</span>
                          <span className="text-xs text-muted-foreground">{shortDate(item.date)}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                      </div>
                    )) : (
                      <p className="text-sm text-muted-foreground">Sem historico registrado ainda.</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function KanbanSection({
  projectsByStatus,
  draggedProjectId,
  setDraggedProjectId,
  moveProject,
  onNewLead,
  onOpenDetails,
}: {
  projectsByStatus: Record<CrmStatus, CrmProject[]>;
  draggedProjectId: string | null;
  setDraggedProjectId: (id: string | null) => void;
  moveProject: (projectId: string, nextStatus: CrmStatus) => Promise<void>;
  onNewLead: () => void;
  onOpenDetails: (project: CrmProject) => void;
}) {
  return (
    <Card className="rounded-lg">
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle className="text-base">Kanban Comercial</CardTitle>
          <p className="text-sm text-muted-foreground">Do novo atendimento ate o pedido fechado. Producao e entrega ficam na Gestao de Pedido.</p>
        </div>
        <Button type="button" size="sm" onClick={onNewLead} className="w-fit rounded-full">
          <FolderPlus size={15} className="mr-2" />
          Novo Atendimento
        </Button>
      </CardHeader>
      <CardContent>
        <KanbanBoard
          projectsByStatus={projectsByStatus}
          draggedProjectId={draggedProjectId}
          setDraggedProjectId={setDraggedProjectId}
          moveProject={moveProject}
          onOpenDetails={onOpenDetails}
        />
      </CardContent>
    </Card>
  );
}

function TechnicalOrdersSection({
  projects,
  quotes,
  orders,
  updateProjectCrm,
  technicalItems,
  completeSale,
  generateTechnicalNotebook,
}: {
  projects: CrmProject[];
  quotes: CrmQuote[];
  orders: CrmOrder[];
  updateProjectCrm: (projectId: string, updates: Partial<CrmProject>, successTitle: string) => Promise<void>;
  technicalItems: ProjectItem[];
  completeSale: (project: CrmProject) => Promise<void>;
  generateTechnicalNotebook: (project: CrmProject) => Promise<void>;
}) {
  const activeProjects = projects.filter(project => normalizeStatus(project.crm_status) !== "perdido");

  return (
    <div className="grid gap-6">
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="text-base">Orcamento e Pedido Tecnico</CardTitle>
          <p className="text-sm text-muted-foreground">Cada projeto pode virar apresentacao, orcamento, pedido tecnico e caderno tecnico.</p>
        </CardHeader>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {activeProjects.map(project => {
          const projectQuotes = quotes.filter(quote => quote.project_id === project.id);
          const projectOrders = orders.filter(order => order.project_id === project.id);
          const projectItems = technicalItems.filter(item => item.project_id === project.id);
          const isOrderClosed = normalizeStatus(project.crm_status) === "pedido_fechado";
          return (
            <Card key={project.id} className="rounded-lg">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{project.name}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">{project.client_name || "Cliente nao informado"} · {project.sellerName}</p>
                  </div>
                  <Badge>{statusLabel(project.crm_status)}</Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2 sm:grid-cols-3">
                  <Info label="Itens" value={String(project.itemCount || 0)} />
                  <Info label="Marcas" value={String(project.brandCount || 0)} />
                  <Info label="Valor" value={formatCurrency(projectValue(project))} />
                </div>
                {isOrderClosed && (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    Pedido fechado. Gere o caderno tecnico por marca para conferencia de acabamentos, medidas e arquivos.
                  </div>
                )}
                <div className="grid gap-2 rounded-md border border-border p-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Resumo tecnico por marca</p>
                  {projectItems.length ? (
                    [...new Set(projectItems.map(item => item.brandName || "Sem marca"))].map(brandName => {
                      const brandItems = projectItems.filter(item => (item.brandName || "Sem marca") === brandName);
                      return (
                        <div key={brandName} className="text-sm">
                          <span className="font-medium text-foreground">{brandName}</span>
                          <span className="text-muted-foreground"> · {brandItems.length} item(ns)</span>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-muted-foreground">Sem itens tecnicos carregados.</p>
                  )}
                </div>
                <div className="grid gap-2 text-sm">
                  <ChecklistRow done={(project.itemCount || 0) > 0} label="Curadoria com produtos do catalogo" />
                  <ChecklistRow done={["em_montagem", "enviado", "aprovado"].includes(project.crm_quote_status || "") || projectQuotes.length > 0} label="Orcamento preparado/enviado" />
                  <ChecklistRow done={hasOperationalOrder(project) || projectOrders.length > 0} label="Pedido operacional criado" />
                  <ChecklistRow done={isOrderClosed} label="Pedido fechado no comercial" />
                  <ChecklistRow done={Boolean(project.technical_notebook_signed_at)} label="Caderno tecnico assinado" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => updateProjectCrm(project.id, { crm_quote_status: "em_montagem", crm_status: "proposta_orcamento" }, "Orcamento marcado em montagem")}>
                    <FileText size={14} className="mr-2" />
                    Montar orcamento
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void completeSale(project)}>
                    <ClipboardCheck size={14} className="mr-2" />
                    Enviar revisao
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void completeSale(project)}>
                    <BadgeCheck size={14} className="mr-2" />
                    Pedido fechado
                  </Button>
                  {isOrderClosed && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => void generateTechnicalNotebook(project)}>
                        <BookOpenCheck size={14} className="mr-2" />
                        Gerar caderno tecnico
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => updateProjectCrm(project.id, { technical_notebook_signed_at: new Date().toISOString() }, "Caderno tecnico assinado")}>
                        <Signature size={14} className="mr-2" />
                        Marcar assinado
                      </Button>
                    </>
                  )}
                  <Link to="/projects">
                    <Button size="sm">Abrir projeto</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function ApprovalsSection({
  projects,
  updateProjectCrm,
}: {
  projects: CrmProject[];
  updateProjectCrm: (projectId: string, updates: Partial<CrmProject>, successTitle: string) => Promise<void>;
}) {
  const approvalProjects = projects.filter(project =>
    ["proposta_orcamento", "followup_negociacao", "pedido_fechado"].includes(normalizeStatus(project.crm_status))
  );

  return (
    <div className="grid gap-6">
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="text-base">Modulo de aprovacao interna</CardTitle>
          <p className="text-sm text-muted-foreground">Controle de desconto, margem, revisao tecnica, financeira e assinatura final.</p>
        </CardHeader>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {approvalProjects.map(project => {
          const discountRisk = Number(project.crm_margin_percent || 0) < 20 && projectValue(project) > 0;
          return (
            <Card key={project.id} className="rounded-lg">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{project.name}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">{project.sellerName} · {formatCurrency(projectValue(project))}</p>
                  </div>
                  <Badge variant={project.crm_risk_level === "alto" ? "destructive" : "secondary"}>
                    risco {project.crm_risk_level || "baixo"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2 text-sm">
                  <ChecklistRow done={project.crm_approval_status !== "pendente"} label="Revisao comercial" />
                  <ChecklistRow done={["tecnico_aprovado", "financeiro_aprovado", "aprovado"].includes(project.crm_approval_status || "")} label="Revisao tecnica" />
                  <ChecklistRow done={["financeiro_aprovado", "aprovado"].includes(project.crm_approval_status || "")} label="Revisao financeira" />
                  <ChecklistRow done={project.crm_approval_status === "aprovado"} label="Assinatura final" />
                </div>
                {discountRisk && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Margem baixa ou nao informada. Requer aprovacao do gestor.
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => updateProjectCrm(project.id, { crm_approval_status: "comercial_aprovado" }, "Aprovacao comercial registrada")}>Comercial OK</Button>
                  <Button size="sm" variant="outline" onClick={() => updateProjectCrm(project.id, { crm_approval_status: "tecnico_aprovado" }, "Aprovacao tecnica registrada")}>Tecnico OK</Button>
                  <Button size="sm" onClick={() => updateProjectCrm(project.id, { crm_approval_status: "aprovado", crm_status: "pedido_fechado", crm_order_status: "revisao_tecnica" }, "Pedido aprovado e fechado")}>Aprovar pedido</Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function AfterSalesSection({
  projects,
  orders,
  tickets,
  updateProjectCrm,
}: {
  projects: CrmProject[];
  orders: CrmOrder[];
  tickets: CrmTicket[];
  updateProjectCrm: (projectId: string, updates: Partial<CrmProject>, successTitle: string) => Promise<void>;
}) {
  const deliveryProjects = projects.filter(project => isSoldStatus(project.crm_status) && hasOperationalOrder(project));

  return (
    <div className="grid gap-6">
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="text-base">Gestao de Pedido</CardTitle>
          <p className="text-sm text-muted-foreground">Controle revisao tecnica, faturamento, producao, transporte, recebimento e entrega sem poluir o Kanban Comercial.</p>
        </CardHeader>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        {orderStatuses.map(status => {
          const statusProjects = deliveryProjects.filter(project => normalizeOrderStatus(project.crm_order_status) === status.key);
          return (
            <div key={status.key} className="rounded-lg border border-border/80 bg-muted/20 p-3">
              <div className="mb-3 flex min-h-8 items-center justify-between gap-2">
                <Badge className={`${status.tone} max-w-[calc(100%-2rem)] whitespace-normal text-[10px] leading-tight`}>
                  {status.label}
                </Badge>
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-background text-xs font-semibold text-foreground">
                  {statusProjects.length}
                </span>
              </div>
              <div className="space-y-2">
                {statusProjects.slice(0, 4).map(project => (
                  <div key={project.id} className="rounded-md border border-border bg-card p-3 text-xs">
                    <p className="font-medium text-foreground">{project.name}</p>
                    <p className="mt-1 text-muted-foreground">{project.client_name || "Cliente nao informado"}</p>
                    <p className="mt-1 text-muted-foreground">{project.sellerName || "Sem vendedor"}</p>
                  </div>
                ))}
                {!statusProjects.length && (
                  <div className="rounded-md border border-dashed border-border bg-background/50 px-3 py-4 text-center text-xs text-muted-foreground">
                    Sem pedidos
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">Detalhes operacionais</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {deliveryProjects.map(project => {
          const projectOrders = orders.filter(order => order.project_id === project.id);
          const projectTickets = tickets.filter(ticket => ticket.project_id === project.id);
          return (
            <Card key={project.id} className="rounded-lg">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{project.name}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">{project.client_name || "Cliente nao informado"} · {project.sellerName}</p>
                  </div>
                  <Badge>{orderStatusLabel(project.crm_order_status)}</Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2 sm:grid-cols-3">
                  <Info label="Pedido" value={orderStatusLabel(project.crm_order_status || projectOrders[0]?.status)} />
                  <Info label="Entrega" value={project.crm_delivery_status || "sem_entrega"} />
                  <Info label="Ocorrencias" value={String(projectTickets.length)} />
                </div>
                <div className="grid gap-2 text-sm">
                  <ChecklistRow done={["pedido_faturado", "producao", "transporte", "recebido_loja", "entrega_agendada", "entregue"].includes(normalizeOrderStatus(project.crm_order_status))} label="Pedido faturado" />
                  <ChecklistRow done={["producao", "transporte", "recebido_loja", "entrega_agendada", "entregue"].includes(normalizeOrderStatus(project.crm_order_status))} label="Pedido em producao" />
                  <ChecklistRow done={["recebido_loja", "entrega_agendada", "entregue"].includes(normalizeOrderStatus(project.crm_order_status))} label="Recebimento conferido" />
                  <ChecklistRow done={["entrega_agendada", "entregue"].includes(normalizeOrderStatus(project.crm_order_status))} label="Entrega agendada" />
                  <ChecklistRow done={normalizeOrderStatus(project.crm_order_status) === "entregue"} label="Entregue" />
                  <ChecklistRow done={project.crm_delivery_status === "assistencia"} label="Pos-venda/checklist opcional" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => updateProjectCrm(project.id, { crm_order_status: "pedido_faturado" }, "Pedido faturado")}>Faturado</Button>
                  <Button size="sm" variant="outline" onClick={() => updateProjectCrm(project.id, { crm_order_status: "producao" }, "Pedido em producao")}>Producao</Button>
                  <Button size="sm" variant="outline" onClick={() => updateProjectCrm(project.id, { crm_order_status: "transporte" }, "Pedido em transporte")}>Transporte</Button>
                  <Button size="sm" variant="outline" onClick={() => updateProjectCrm(project.id, { crm_order_status: "recebido_loja", crm_delivery_status: "recebido_completo" }, "Recebimento registrado")}>Recebido</Button>
                  <Button size="sm" variant="outline" onClick={() => updateProjectCrm(project.id, { crm_order_status: "entrega_agendada", crm_delivery_status: "agendada" }, "Entrega agendada")}>Agendar entrega</Button>
                  <Button size="sm" onClick={() => updateProjectCrm(project.id, { crm_order_status: "entregue", crm_delivery_status: "entregue" }, "Pedido entregue")}>Entregue</Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function AgendaCalendarSection({
  projects,
  agendaEvents,
  brands,
  brandTerms,
  delayedOrders,
  isAdmin,
  saveBrandTerm,
  addAgendaEvent,
  completeAgendaEvent,
}: {
  projects: CrmProject[];
  agendaEvents: CrmAgendaEvent[];
  brands: BrandOption[];
  brandTerms: CrmBrandDeliveryTerm[];
  delayedOrders: Array<{ project: CrmProject; dueDate: Date; daysLate: number; brands: string }>;
  isAdmin: boolean;
  saveBrandTerm: (brandId: string, deliveryDays: number, followupDaysBefore: number, notes: string) => Promise<void>;
  addAgendaEvent: (draft: { projectId: string; title: string; eventType: string; scheduledAt: string; location: string; notes: string }) => Promise<boolean>;
  completeAgendaEvent: (eventId: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState({ projectId: projects[0]?.id || "", title: "", eventType: "atendimento", scheduledAt: "", location: "", notes: "" });
  const [termDrafts, setTermDrafts] = useState<Record<string, { deliveryDays: string; followupDays: string; notes: string }>>({});
  const [calendarDate, setCalendarDate] = useState(monthStart());
  const [selectedDayKey, setSelectedDayKey] = useState(localDateKey(new Date()));
  const openEvents = agendaEvents.filter(event => event.status === "agendado");
  const overdueEvents = openEvents.filter(event => new Date(event.scheduled_at) < new Date());
  const eventsByDay = useMemo(() => {
    const grouped = new Map<string, CrmAgendaEvent[]>();
    for (const event of openEvents) {
      const key = localDateKey(new Date(event.scheduled_at));
      grouped.set(key, [...(grouped.get(key) || []), event]);
    }
    return grouped;
  }, [openEvents]);
  const calendarDays = useMemo(() => {
    const first = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, [calendarDate]);
  const selectedDayEvents = eventsByDay.get(selectedDayKey) || [];
  const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(calendarDate);

  const submitAgenda = async () => {
    const saved = await addAgendaEvent(draft);
    if (saved) setDraft(current => ({ ...current, title: "", scheduledAt: "", location: "", notes: "" }));
  };

  const termFor = (brand: BrandOption) => {
    const saved = brandTerms.find(term => term.brand_id === brand.id);
    return termDrafts[brand.id] || {
      deliveryDays: String(saved?.delivery_days || 60),
      followupDays: String(saved?.followup_days_before || 10),
      notes: saved?.notes || "",
    };
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
      <div className="grid gap-6">
        <Card className="rounded-lg border-border/80 bg-[#fffefa] shadow-sm">
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-base">Agenda comercial e operacional</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Reunioes, visitas, atendimentos, entregas, follow-ups e cobrancas de fabrica.</p>
              </div>
              <Badge variant="outline" className="w-fit border-accent/30 text-accent">{openEvents.length} aberto(s)</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                value={draft.projectId}
                onChange={event => setDraft(current => ({ ...current, projectId: event.target.value }))}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Sem projeto vinculado</option>
                {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
              <select
                value={draft.eventType}
                onChange={event => setDraft(current => ({ ...current, eventType: event.target.value }))}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="atendimento">Atendimento</option>
                <option value="reuniao">Reuniao</option>
                <option value="visita">Visita</option>
                <option value="entrega">Entrega</option>
                <option value="followup">Follow-up</option>
                <option value="cobranca_fabrica">Cobranca fabrica</option>
                <option value="pos_venda">Pos-venda</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            <Input value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} placeholder="Titulo do compromisso" />
            <div className="grid gap-2 sm:grid-cols-2">
              <Input type="datetime-local" value={draft.scheduledAt} onChange={event => setDraft(current => ({ ...current, scheduledAt: event.target.value }))} />
              <Input value={draft.location} onChange={event => setDraft(current => ({ ...current, location: event.target.value }))} placeholder="Local / endereco" />
            </div>
            <Textarea value={draft.notes} onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))} placeholder="Observacoes, combinados e pontos de atencao" className="min-h-20" />
            <Button onClick={() => void submitAgenda()} disabled={!draft.title.trim() || !draft.scheduledAt}>
              <CalendarDays size={14} className="mr-2" />
              Agendar
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-lg border-border/80 shadow-sm">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">Calendario da operacao</CardTitle>
                <p className="mt-1 text-sm capitalize text-muted-foreground">{monthName}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="icon" variant="outline" onClick={() => setCalendarDate(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))} aria-label="Mes anterior">
                  <ChevronLeft size={16} />
                </Button>
                <Button size="sm" variant="outline" onClick={() => {
                  const today = new Date();
                  setCalendarDate(monthStart(today));
                  setSelectedDayKey(localDateKey(today));
                }}>
                  Hoje
                </Button>
                <Button size="icon" variant="outline" onClick={() => setCalendarDate(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))} aria-label="Proximo mes">
                  <ChevronRight size={16} />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {overdueEvents.length > 0 && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {overdueEvents.length} compromisso(s) vencido(s). Resolva antes de virar reclamacao.
              </div>
            )}
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"].map(day => <span key={day}>{day}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map(day => {
                const key = localDateKey(day);
                const dayEvents = eventsByDay.get(key) || [];
                const isCurrentMonth = day.getMonth() === calendarDate.getMonth();
                const isToday = key === localDateKey(new Date());
                const isSelected = key === selectedDayKey;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDayKey(key)}
                    className={[
                      "min-h-20 rounded-md border p-2 text-left transition-colors",
                      isSelected ? "border-accent bg-accent/10" : "border-border bg-card hover:bg-muted/40",
                      isCurrentMonth ? "text-foreground" : "text-muted-foreground/60",
                    ].join(" ")}
                  >
                    <span className={isToday ? "grid h-6 w-6 place-items-center rounded-full bg-foreground text-xs font-semibold text-background" : "text-xs font-semibold"}>
                      {day.getDate()}
                    </span>
                    <div className="mt-2 space-y-1">
                      {dayEvents.slice(0, 2).map(event => (
                        <span key={event.id} className="block truncate rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
                          {event.title}
                        </span>
                      ))}
                      {dayEvents.length > 2 && <span className="block text-[10px] text-muted-foreground">+{dayEvents.length - 2}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6">
        <Card className="rounded-lg border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Dia selecionado</CardTitle>
            <p className="text-sm text-muted-foreground">{longDate(selectedDayKey)}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedDayEvents.length ? selectedDayEvents.map(event => (
              <div key={event.id} className="grid gap-2 rounded-md border border-border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{event.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(event.scheduled_at))}
                    {" · "}
                    {event.event_type}
                    {event.location ? ` · ${event.location}` : ""}
                  </p>
                  {event.notes && <p className="mt-1 text-xs text-muted-foreground">{event.notes}</p>}
                </div>
                <Button size="sm" variant="outline" onClick={() => void completeAgendaEvent(event.id)}>Feito</Button>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">Nenhum compromisso neste dia.</p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Compromissos abertos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {openEvents.length ? openEvents.slice(0, 8).map(event => (
              <div key={event.id} className="rounded-md border border-border p-3">
                <p className="text-sm font-medium text-foreground">{event.title}</p>
                <p className="text-xs text-muted-foreground">{longDate(event.scheduled_at)} · {event.event_type}</p>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">Nenhum compromisso aberto.</p>
            )}
          </CardContent>
        </Card>

        <DelayedOrdersCard rows={delayedOrders} />
        {isAdmin && (
          <Card className="rounded-lg border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Prazos de entrega por marca</CardTitle>
              <p className="text-sm text-muted-foreground">Use estes prazos para cobrar a fabrica antes do atraso.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {brands.slice(0, 12).map(brand => {
                const draftTerm = termFor(brand);
                return (
                  <div key={brand.id} className="rounded-md border border-border p-3">
                    <p className="mb-2 text-sm font-medium text-foreground">{brand.name}</p>
                    <div className="grid gap-2 lg:grid-cols-[90px_90px_minmax(0,1fr)_auto]">
                      <Input
                        type="number"
                        min="1"
                        value={draftTerm.deliveryDays}
                        onChange={event => setTermDrafts(current => ({ ...current, [brand.id]: { ...draftTerm, deliveryDays: event.target.value } }))}
                        title="Prazo em dias"
                      />
                      <Input
                        type="number"
                        min="0"
                        value={draftTerm.followupDays}
                        onChange={event => setTermDrafts(current => ({ ...current, [brand.id]: { ...draftTerm, followupDays: event.target.value } }))}
                        title="Avisar antes"
                      />
                      <Input
                        value={draftTerm.notes}
                        onChange={event => setTermDrafts(current => ({ ...current, [brand.id]: { ...draftTerm, notes: event.target.value } }))}
                        placeholder="Observacao"
                      />
                      <Button size="sm" onClick={() => void saveBrandTerm(brand.id, Number(draftTerm.deliveryDays), Number(draftTerm.followupDays), draftTerm.notes)}>
                        Salvar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function AgendaSection({
  projects,
  agendaEvents,
  brands,
  brandTerms,
  delayedOrders,
  isAdmin,
  saveBrandTerm,
  addAgendaEvent,
  completeAgendaEvent,
}: {
  projects: CrmProject[];
  agendaEvents: CrmAgendaEvent[];
  brands: BrandOption[];
  brandTerms: CrmBrandDeliveryTerm[];
  delayedOrders: Array<{ project: CrmProject; dueDate: Date; daysLate: number; brands: string }>;
  isAdmin: boolean;
  saveBrandTerm: (brandId: string, deliveryDays: number, followupDaysBefore: number, notes: string) => Promise<void>;
  addAgendaEvent: (draft: { projectId: string; title: string; eventType: string; scheduledAt: string; location: string; notes: string }) => Promise<boolean>;
  completeAgendaEvent: (eventId: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState({ projectId: projects[0]?.id || "", title: "", eventType: "atendimento", scheduledAt: "", location: "", notes: "" });
  const [termDrafts, setTermDrafts] = useState<Record<string, { deliveryDays: string; followupDays: string; notes: string }>>({});
  const openEvents = agendaEvents.filter(event => event.status === "agendado");
  const overdueEvents = openEvents.filter(event => new Date(event.scheduled_at) < new Date());

  const submitAgenda = async () => {
    const saved = await addAgendaEvent(draft);
    if (saved) setDraft(current => ({ ...current, title: "", scheduledAt: "", location: "", notes: "" }));
  };

  const termFor = (brand: BrandOption) => {
    const saved = brandTerms.find(term => term.brand_id === brand.id);
    return termDrafts[brand.id] || {
      deliveryDays: String(saved?.delivery_days || 60),
      followupDays: String(saved?.followup_days_before || 10),
      notes: saved?.notes || "",
    };
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
      <div className="grid gap-6">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-base">Agenda comercial e operacional</CardTitle>
            <p className="text-sm text-muted-foreground">Reunioes, visitas, atendimentos, entregas, follow-ups e cobrancas de fabrica.</p>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                value={draft.projectId}
                onChange={event => setDraft(current => ({ ...current, projectId: event.target.value }))}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Sem projeto vinculado</option>
                {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
              <select
                value={draft.eventType}
                onChange={event => setDraft(current => ({ ...current, eventType: event.target.value }))}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="atendimento">Atendimento</option>
                <option value="reuniao">Reuniao</option>
                <option value="visita">Visita</option>
                <option value="entrega">Entrega</option>
                <option value="followup">Follow-up</option>
                <option value="cobranca_fabrica">Cobranca fabrica</option>
                <option value="pos_venda">Pos-venda</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            <Input value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} placeholder="Titulo do compromisso" />
            <div className="grid gap-2 sm:grid-cols-2">
              <Input type="datetime-local" value={draft.scheduledAt} onChange={event => setDraft(current => ({ ...current, scheduledAt: event.target.value }))} />
              <Input value={draft.location} onChange={event => setDraft(current => ({ ...current, location: event.target.value }))} placeholder="Local / endereco" />
            </div>
            <Textarea value={draft.notes} onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))} placeholder="Observacoes, combinados e pontos de atencao" className="min-h-20" />
            <Button onClick={() => void submitAgenda()} disabled={!draft.title.trim() || !draft.scheduledAt}>
              <CalendarDays size={14} className="mr-2" />
              Agendar
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-base">Compromissos e notificacoes de prazo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {overdueEvents.length > 0 && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {overdueEvents.length} compromisso(s) vencido(s). Resolva antes de virar reclamacao.
              </div>
            )}
            {openEvents.length ? openEvents.slice(0, 12).map(event => (
              <div key={event.id} className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{event.title}</p>
                  <p className="text-xs text-muted-foreground">{longDate(event.scheduled_at)} · {event.event_type} {event.location ? `· ${event.location}` : ""}</p>
                  {event.notes && <p className="mt-1 text-xs text-muted-foreground">{event.notes}</p>}
                </div>
                <Button size="sm" variant="outline" onClick={() => void completeAgendaEvent(event.id)}>Feito</Button>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">Nenhum compromisso aberto.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6">
        <DelayedOrdersCard rows={delayedOrders} />
        {isAdmin && (
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="text-base">Prazos de entrega por marca</CardTitle>
              <p className="text-sm text-muted-foreground">Use estes prazos para cobrar a fabrica antes do atraso.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {brands.slice(0, 12).map(brand => {
                const draftTerm = termFor(brand);
                return (
                  <div key={brand.id} className="rounded-md border border-border p-3">
                    <p className="mb-2 text-sm font-medium text-foreground">{brand.name}</p>
                    <div className="grid gap-2 lg:grid-cols-[90px_90px_minmax(0,1fr)_auto]">
                      <Input
                        type="number"
                        min="1"
                        value={draftTerm.deliveryDays}
                        onChange={event => setTermDrafts(current => ({ ...current, [brand.id]: { ...draftTerm, deliveryDays: event.target.value } }))}
                        title="Prazo em dias"
                      />
                      <Input
                        type="number"
                        min="0"
                        value={draftTerm.followupDays}
                        onChange={event => setTermDrafts(current => ({ ...current, [brand.id]: { ...draftTerm, followupDays: event.target.value } }))}
                        title="Avisar antes"
                      />
                      <Input
                        value={draftTerm.notes}
                        onChange={event => setTermDrafts(current => ({ ...current, [brand.id]: { ...draftTerm, notes: event.target.value } }))}
                        placeholder="Observacao"
                      />
                      <Button size="sm" onClick={() => void saveBrandTerm(brand.id, Number(draftTerm.deliveryDays), Number(draftTerm.followupDays), draftTerm.notes)}>
                        Salvar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function ArchitectsSection({
  rows,
  projects,
  customers,
  onCreateProject,
}: {
  rows: Array<{ userId: string | null; name: string; phone: string | null; email: string | null; birthDate: string | null; projects: number; active: number; value: number; clients: Set<string>; nextDeadline: string | null; status: string }>;
  projects: CrmProject[];
  customers: CrmCustomer[];
  onCreateProject: (architect: { userId?: string | null; name: string }) => Promise<void>;
}) {
  return (
    <div className="grid gap-6">
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="text-base">Historico por arquiteto</CardTitle>
          <p className="text-sm text-muted-foreground">Projetos em andamento, clientes vinculados, aniversarios e potenciais de relacionamento.</p>
        </CardHeader>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {rows.length ? rows.map(row => {
          const architectProjects = projects.filter(project => normalizeText(project.architect_name || "") === normalizeText(row.name));
          const architectCustomers = customers.filter(customer => normalizeText(customer.architect_name || "") === normalizeText(row.name));
          return (
            <Card key={row.name} className="rounded-lg">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{row.name}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.birthDate ? `Aniversario: ${longDate(row.birthDate)}` : "Aniversario nao informado"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge variant="secondary">{row.active} ativos</Badge>
                    <Button type="button" size="sm" variant="outline" className="h-8 rounded-full px-3 text-xs" onClick={() => void onCreateProject({ userId: row.userId, name: row.name })}>
                      Criar projeto
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2 sm:grid-cols-3">
                  <Info label="Projetos" value={String(row.projects)} />
                  <Info label="Clientes" value={String(row.clients.size || architectCustomers.length)} />
                  <Info label="Volume" value={formatCurrency(row.value)} />
                  <Info label="Telefone" value={row.phone || "-"} />
                  <Info label="E-mail" value={row.email || "-"} />
                  <Info label="Relacionamento" value={row.status} />
                </div>
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Em andamento</p>
                  {architectProjects.slice(0, 4).map(project => (
                    <div key={project.id} className="rounded-md border border-border px-3 py-2">
                      <p className="text-sm font-medium text-foreground">{project.name}</p>
                      <p className="text-xs text-muted-foreground">{project.client_name || "Cliente nao informado"} · {statusLabel(project.crm_status)}</p>
                    </div>
                  ))}
                  {architectProjects.length === 0 && <p className="text-sm text-muted-foreground">Sem projetos vinculados.</p>}
                </div>
              </CardContent>
            </Card>
          );
        }) : (
          <Card className="rounded-lg">
            <CardContent className="p-6 text-sm text-muted-foreground">Nenhum arquiteto vinculado aos projetos ainda.</CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function DelayedOrdersCard({ rows }: { rows: Array<{ project: CrmProject; dueDate: Date; daysLate: number; brands: string }> }) {
  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Factory size={16} className="text-destructive" />
          Pedidos atrasados
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length ? rows.slice(0, 6).map(row => (
          <div key={row.project.id} className="rounded-md border border-destructive/25 bg-destructive/5 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">{row.project.name}</p>
                <p className="text-xs text-muted-foreground">{row.brands}</p>
              </div>
              <Badge variant="destructive">{row.daysLate}d</Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Previsao: {longDate(row.dueDate.toISOString())}. Cobrar fabrica e registrar retorno na agenda.</p>
          </div>
        )) : (
          <p className="text-sm text-muted-foreground">Nenhum pedido atrasado agora.</p>
        )}
      </CardContent>
    </Card>
  );
}

function KanbanBoard({
  projectsByStatus,
  draggedProjectId,
  setDraggedProjectId,
  moveProject,
  onOpenDetails,
  compact = false,
}: {
  projectsByStatus: Record<CrmStatus, CrmProject[]>;
  draggedProjectId: string | null;
  setDraggedProjectId: (id: string | null) => void;
  moveProject: (projectId: string, nextStatus: CrmStatus) => Promise<void>;
  onOpenDetails?: (project: CrmProject) => void;
  compact?: boolean;
}) {
  const columns = commercialKanbanStatuses;
  return (
    <div className={compact
      ? "grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5"
      : "grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
    }>
      {columns.map(status => (
        <div
          key={status.key}
          onDragOver={event => event.preventDefault()}
          onDrop={() => draggedProjectId && void moveProject(draggedProjectId, status.key)}
          className="min-w-0 rounded-lg border border-border/80 bg-muted/25 p-3 shadow-sm transition-colors hover:border-accent/30"
        >
          <div className="mb-3 flex min-h-8 items-center justify-between gap-2">
            <Badge className={`${status.tone} max-w-[calc(100%-2rem)] whitespace-normal text-[10px] leading-tight`}>
              {status.label}
            </Badge>
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-background text-xs font-semibold text-foreground">
              {projectsByStatus[status.key]?.length || 0}
            </span>
          </div>
          <div className="space-y-2">
            {(projectsByStatus[status.key] || []).map(project => (
              <ProjectKanbanCard
                key={project.id}
                project={project}
                onDragStart={() => setDraggedProjectId(project.id)}
                onOpenDetails={onOpenDetails}
              />
            ))}
            {(projectsByStatus[status.key] || []).length === 0 && (
              <div className="rounded-md border border-dashed border-border/80 bg-background/50 px-3 py-4 text-center text-xs text-muted-foreground">
                Sem projetos
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  danger = false,
}: {
  label: string;
  value: string | number;
  icon: typeof Users;
  danger?: boolean;
}) {
  return (
    <Card className="rounded-lg border-border/80 bg-card shadow-sm">
      <CardContent className="flex h-full flex-col justify-between gap-2.5 p-3.5">
        <div className="flex items-center justify-between">
          <span className={danger ? "grid h-8 w-8 place-items-center rounded-md bg-destructive/10 text-destructive" : "grid h-8 w-8 place-items-center rounded-md bg-accent/10 text-accent"}>
            <Icon size={16} />
          </span>
          <span className="min-w-0 text-right text-lg font-semibold leading-none text-foreground sm:text-xl">{value}</span>
        </div>
        <p className="text-[10px] uppercase leading-snug tracking-[0.1em] text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function ProjectKanbanCard({ project, onDragStart, onOpenDetails }: { project: CrmProject; onDragStart: () => void; onOpenDetails?: (project: CrmProject) => void }) {
  const reasons = attentionReasons(project);
  const lastContact = project.crm_last_contact_at || project.latestInteractionAt || project.created_at;
  const isOverdue = Boolean(project.crm_next_followup_at && new Date(project.crm_next_followup_at) < new Date()) || daysSince(projectActivityDate(project)) >= 9;
  return (
    <article
      draggable
      onDragStart={onDragStart}
      onClick={() => onOpenDetails?.(project)}
      className="min-w-0 cursor-grab rounded-lg border border-border bg-card p-3 shadow-sm transition-colors active:cursor-grabbing hover:border-accent/40"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-sm font-medium leading-snug text-foreground">{project.name}</h3>
        {isOverdue ? (
          <Badge variant="destructive" className="shrink-0 px-1.5 py-0 text-[10px]">Atraso</Badge>
        ) : reasons.length > 0 ? (
          <AlertTriangle size={15} className="shrink-0 text-amber-600" />
        ) : null}
      </div>
      {project.isLead && (
        <Badge variant="secondary" className="mt-2 w-fit text-[10px]">Atendimento</Badge>
      )}
      {!!project.crm_tags?.length && (
        <div className="mt-2 flex flex-wrap gap-1">
          {project.crm_tags.slice(0, 3).map(tag => (
            <span key={tag} className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] text-accent">{tag}</span>
          ))}
        </div>
      )}
      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
        <p>Cliente: <span className="text-foreground">{project.client_name || "Nao informado"}</span></p>
        <p>Vendedor: <span className="text-foreground">{project.sellerName || "Sem vendedor"}</span></p>
        <p>Arquiteto: <span className="text-foreground">{project.architect_name || project.ownerName || "Sem nome"}</span></p>
        {project.isLead && <p>Origem: <span className="text-foreground">{project.leadSource || "-"}</span></p>}
        <p>Valor estimado: <span className="text-foreground">{formatCurrency(projectValue(project))}</span></p>
        <p>Proxima acao: <span className="text-foreground">{project.nextAction || project.crm_notes || "Definir acao"}</span></p>
        <p>{project.itemCount || 0} itens · {formatCurrency(projectValue(project))}</p>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>Ultimo contato: {shortDate(lastContact)}</span>
        <span>Follow-up: {shortDate(project.crm_next_followup_at)}</span>
      </div>
    </article>
  );
}

function AttentionCard({ projects }: { projects: Array<CrmProject & { reasons: string[] }> }) {
  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle className="text-base">Projetos com atencao</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum projeto critico agora.</p>
        ) : (
          projects.map(project => (
            <Link key={project.id} to="/projects" className="block rounded-md border border-border p-3 transition-colors hover:bg-muted/50">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{project.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{project.sellerName} · {statusLabel(project.crm_status)}</p>
                </div>
                <Badge variant="secondary">{project.reasons.length}</Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{project.reasons.join(", ")}</p>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function TeamCard({ sellerRows }: { sellerRows: SellerPerformanceRow[] }) {
  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle className="text-base">Time comercial</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sellerRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum projeto encontrado.</p>
        ) : (
          sellerRows.map(row => (
            <div key={row.seller} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border border-border p-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-medium text-foreground">{row.seller}</p>
                <p className="text-xs text-muted-foreground">{row.active} ativos · {row.projects} total</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-foreground">{formatCurrency(row.value)}</p>
                <p className="text-xs text-muted-foreground">{row.attention} atencao</p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function ChecklistRow({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <CheckCircle2 size={15} className={done ? "text-emerald-600" : "text-muted-foreground"} />
      <span className={done ? "text-foreground" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/40 px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm leading-snug text-foreground">{value}</p>
    </div>
  );
}
