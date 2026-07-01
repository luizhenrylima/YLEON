import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, ChevronRight, Sparkles, Rocket, Home as HomeIcon,
  CheckCircle2, Circle, Filter, Search, X, Plus, Trash2, CalendarDays, Download, Pencil, FileDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import logoYleon from "@/assets/logo-yleon.png";

/* ============================================================
   /marketing — Tema claro · Logo YLEON · Eventos persistidos
   Senha: acervo10552026
============================================================ */

const PROGRESS_KEY = "acervo_mkt_progress_v1";

const WEEKLY_TEMPLATE: Record<number, { label: string; tag: string; color: string }> = {
  1: { label: "Post para Arquitetos", tag: "Arquitetos", color: "#7C6A4D" },
  2: { label: "Post de Produto", tag: "Produto", color: "#A88454" },
  3: { label: "Aberto · Vídeo entrega / Programas", tag: "Aberto", color: "#5A6B7A" },
  4: { label: "Post de Produto", tag: "Produto", color: "#A88454" },
  5: { label: "Post focado em Cliente", tag: "Cliente", color: "#9C5A5A" },
  6: { label: "Estamos Atendendo · Venha visitar", tag: "Loja", color: "#4A7C59" },
};

type Marker = { date: string; title: string; type: "comemorativa" | "marco" | "casacor" | "lancamento" | "custom"; emoji?: string; id?: string; description?: string | null; previewImageUrl?: string | null };

const today = new Date();
const launchDate = new Date(today);
launchDate.setDate(today.getDate() + 45);
const launchISO = launchDate.toISOString().slice(0, 10);

const FIXED_MARKERS: Marker[] = [
  { date: launchISO, title: "Lançamento Plataforma YLEON", type: "lancamento", emoji: "🚀" },
  { date: "2026-06-26", title: "Abertura Casa Cor", type: "casacor", emoji: "🏠" },
  { date: "2026-08-30", title: "Encerramento Casa Cor", type: "casacor", emoji: "🏠" },
  
  { date: "2026-05-06", title: "Salone del Mobile · Milão (início)", type: "marco", emoji: "🌍" },
  { date: "2026-05-10", title: "Dia das Mães", type: "comemorativa", emoji: "🌸" },
  { date: "2026-05-11", title: "Salone del Mobile · Milão (fim)", type: "marco", emoji: "🌍" },
  { date: "2026-06-12", title: "Dia dos Namorados", type: "comemorativa", emoji: "💞" },
  { date: "2026-06-27", title: "Dia Mundial do Design", type: "comemorativa", emoji: "📐" },
  { date: "2026-07-20", title: "Dia do Amigo", type: "comemorativa", emoji: "🤝" },
  { date: "2026-08-09", title: "Dia dos Pais", type: "comemorativa", emoji: "👔" },
  { date: "2026-08-25", title: "Dia do Soldado", type: "comemorativa", emoji: "🇧🇷" },
  { date: "2026-09-07", title: "Independência do Brasil", type: "comemorativa", emoji: "🇧🇷" },
  { date: "2026-09-22", title: "Início da Primavera", type: "comemorativa", emoji: "🌸" },
  { date: "2026-10-12", title: "Dia das Crianças", type: "comemorativa", emoji: "🎈" },
  { date: "2026-10-15", title: "Dia do Professor", type: "comemorativa", emoji: "📚" },
  { date: "2026-10-31", title: "Halloween", type: "comemorativa", emoji: "🎃" },
  { date: "2026-11-15", title: "Proclamação da República", type: "comemorativa", emoji: "🇧🇷" },
  { date: "2026-11-27", title: "Black Friday", type: "marco", emoji: "🛍" },
  { date: "2026-11-30", title: "Cyber Monday", type: "marco", emoji: "💻" },
  { date: "2026-12-15", title: "Dia do Arquiteto", type: "comemorativa", emoji: "📐" },
  { date: "2026-12-25", title: "Natal", type: "comemorativa", emoji: "🎄" },
  { date: "2026-12-31", title: "Réveillon", type: "comemorativa", emoji: "🎆" },
];

const MONTHLY_THEME: Record<number, { theme: string; focus: string; priority: string }> = {
  4: { theme: "Dia das Mães + Salone Milão", focus: "Emocional + Aspiracional", priority: "MÁXIMA" },
  5: { theme: "Início Casa Cor + Inverno Design", focus: "Antecipação Casa Cor", priority: "ALTA" },
  6: { theme: "Casa Cor em alta", focus: "Peças favoritas Casa Cor", priority: "ALTA" },
  7: { theme: "Encerramento Casa Cor", focus: "Retrospectiva e brand love", priority: "MÉDIA-ALTA" },
  8: { theme: "Primavera + Semana do Design BR", focus: "Renovação dos ambientes", priority: "MÉDIA" },
  9: { theme: "Mês do Design + Prep Black Friday", focus: "Brand awareness", priority: "MÉDIA" },
  10: { theme: "Black Friday + Preview Natal", focus: "Conversão e coleção", priority: "ALTA" },
  11: { theme: "Natal + Dia do Arquiteto + Retrospectiva", focus: "Presentes + Brand love", priority: "ALTA" },
};

/* ============================================================
   HELPERS
============================================================ */
const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DOW_NAMES = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

function isoOf(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function buildMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDow = first.getDay();
  const days: { day: number | null; iso: string | null; dow: number }[] = [];
  for (let i = 0; i < startDow; i++) days.push({ day: null, iso: null, dow: i });
  for (let d = 1; d <= last.getDate(); d++) {
    days.push({ day: d, iso: isoOf(year, month, d), dow: new Date(year, month, d).getDay() });
  }
  while (days.length % 7 !== 0) days.push({ day: null, iso: null, dow: days.length % 7 });
  return days;
}
const isCasaCor = (iso: string) => iso >= "2026-06-26" && iso <= "2026-08-30";

/* ============================================================
   CONTENT
============================================================ */
function MarketingContent() {
  const { signOut } = useAuth();
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(4);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "Arquitetos" | "Produto" | "Aberto" | "Cliente" | "Loja" | "Eventos">("all");
  const [search, setSearch] = useState("");
  const [progress, setProgress] = useState<Record<string, boolean>>({});
  const [customEvents, setCustomEvents] = useState<Marker[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newEmoji, setNewEmoji] = useState("📌");
  const [newPreviewUrl, setNewPreviewUrl] = useState<string | null>(null);
  const [uploadingPreview, setUploadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFrom, setExportFrom] = useState("2026-05-01");
  const [exportTo, setExportTo] = useState("2026-12-31");
  const [exportPerSlide, setExportPerSlide] = useState<2 | 4>(2);

  useEffect(() => {
    try { const raw = localStorage.getItem(PROGRESS_KEY); if (raw) setProgress(JSON.parse(raw)); } catch {}
    loadCustom();
  }, []);

  async function loadCustom() {
    const { data, error } = await supabase
      .from("marketing_events")
      .select("id, event_date, title, description, event_type, preview_image_url")
      .order("event_date", { ascending: true });
    if (error) { console.error(error); return; }
    setCustomEvents(
      (data || []).map((r: any) => ({
        id: r.id, date: r.event_date, title: r.title,
        description: r.description, type: "custom" as const, emoji: r.event_type || "📌",
        previewImageUrl: r.preview_image_url || null,
      }))
    );
  }

  const toggleDone = (iso: string) => {
    setProgress((prev) => {
      const next = { ...prev, [iso]: !prev[iso] };
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
      return next;
    });
  };

  function openAdd() {
    if (!selected) setSelected(new Date().toISOString().slice(0, 10));
    setEditingId(null);
    setNewTitle(""); setNewDesc(""); setNewEmoji("📌"); setNewPreviewUrl(null);
    setShowAddModal(true);
  }

  function openEdit(m: Marker) {
    if (!m.id) return;
    setEditingId(m.id);
    setSelected(m.date);
    setNewTitle(m.title);
    setNewDesc(m.description || "");
    setNewEmoji(m.emoji || "📌");
    setNewPreviewUrl(m.previewImageUrl || null);
    setShowAddModal(true);
  }

  async function uploadPreviewImage(file: File) {
    if (!file.type.startsWith("image/")) { toast.error("Selecione uma imagem"); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error("Imagem muito grande (máx 8MB)"); return; }
    setUploadingPreview(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `previews/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await supabase.storage.from("marketing-previews").upload(path, file, {
      contentType: file.type, upsert: false,
    });
    setUploadingPreview(false);
    if (upErr) { toast.error("Falha no upload"); console.error(upErr); return; }
    const { data } = supabase.storage.from("marketing-previews").getPublicUrl(path);
    setNewPreviewUrl(data.publicUrl);
    toast.success("Imagem carregada");
  }

  async function saveEvent() {
    if (!selected || !newTitle.trim()) return;
    setSaving(true);
    let error;
    const payload = {
      event_date: selected, title: newTitle.trim(),
      description: newDesc.trim() || null, event_type: newEmoji || "📌",
      preview_image_url: newPreviewUrl || null,
    };
    if (editingId) {
      ({ error } = await supabase.from("marketing_events").update(payload).eq("id", editingId));
    } else {
      ({ error } = await supabase.from("marketing_events").insert(payload));
    }
    setSaving(false);
    if (error) { toast.error("Erro ao salvar"); return; }
    toast.success(editingId ? "Evento atualizado" : "Evento adicionado");
    setNewTitle(""); setNewDesc(""); setNewEmoji("📌"); setNewPreviewUrl(null);
    setEditingId(null); setShowAddModal(false);
    loadCustom();
  }

  async function deleteEvent(id: string) {
    const { error } = await supabase.from("marketing_events").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Evento removido");
    loadCustom();
  }

  function buildScheduleRows(from?: string, to?: string) {
    const startISO = from || "2026-05-01";
    const endISO = to || "2026-12-31";
    const rows: { date: string; dow: string; tipo: string; titulo: string; descricao: string; status: string; previewImageUrl?: string | null }[] = [];
    const start = new Date(startISO + "T12:00:00");
    const end = new Date(endISO + "T12:00:00");
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      const dow = d.getDay();
      const tpl = WEEKLY_TEMPLATE[dow];
      const marks = (markersByDate[iso] || []);
      const dowName = DOW_NAMES[dow];
      const status = progress[iso] ? "Publicado" : "Pendente";
      const preview = marks.find((m) => m.previewImageUrl)?.previewImageUrl || null;
      if (tpl) {
        rows.push({
          date: iso, dow: dowName, tipo: tpl.tag,
          titulo: tpl.label,
          descricao: marks.map((m) => `${m.title}${m.description ? ` — ${m.description}` : ""}`).join(" | "),
          status,
          previewImageUrl: preview,
        });
      }
      if (!tpl && marks.length) {
        rows.push({
          date: iso, dow: dowName, tipo: "Evento",
          titulo: marks.map((m) => m.title).join(" + "),
          descricao: marks.map((m) => m.description || "").filter(Boolean).join(" | "),
          status: "—",
          previewImageUrl: preview,
        });
      }
    }
    return rows;
  }

  function downloadFile(name: string, content: string, mime: string) {
    const blob = new Blob([content], { type: mime + ";charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function exportPDF(from?: string, to?: string, perSlide: 2 | 4 = 2) {
    const { default: jsPDF } = await import("jspdf");
    const rows = buildScheduleRows(from, to);
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    // Sanitiza texto: remove emojis/símbolos fora do WinAnsi (jsPDF helvetica)
    // Mantém letras latinas acentuadas, dígitos, pontuação comum.
    const T = (s: string) =>
      (s || "")
        .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{1F900}-\u{1F9FF}\uFE0F]/gu, "")
        .replace(/[\u2022\u25cf\u25aa]/g, "-")
        .replace(/[\u201c\u201d]/g, '"')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/\s+/g, " ")
        .trim();

    // Paleta
    const ink: [number, number, number] = [42, 37, 32];
    const cream: [number, number, number] = [245, 239, 230];
    const gold: [number, number, number] = [184, 153, 104];
    const muted: [number, number, number] = [120, 105, 85];
    const soft: [number, number, number] = [250, 247, 242];
    const border: [number, number, number] = [217, 205, 182];

    const totalPosts = rows.filter((r) => r.tipo !== "Evento").length;
    const publicados = rows.filter((r) => r.status === "Publicado").length;

    // ===== CAPA =====
    doc.setFillColor(...ink);
    doc.rect(0, 0, pageW, pageH, "F");
    doc.setTextColor(...gold);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(T("ACERVO 10.55 - MARKETING"), pageW / 2, pageH / 2 - 70, { align: "center" });
    doc.setTextColor(...cream);
    doc.setFontSize(36);
    doc.setFont("helvetica", "bold");
    doc.text(T("Cronograma 2026"), pageW / 2, pageH / 2 - 20, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(13);
    doc.text(T("Apresentacao de posts e eventos"), pageW / 2, pageH / 2 + 10, { align: "center" });
    doc.setDrawColor(...gold);
    doc.setLineWidth(0.8);
    doc.line(pageW / 2 - 60, pageH / 2 + 30, pageW / 2 + 60, pageH / 2 + 30);
    doc.setFontSize(10);
    doc.setTextColor(...gold);
    const fromLabel = from ? new Date(from + "T12:00:00").toLocaleDateString("pt-BR") : "01/05/2026";
    const toLabel = to ? new Date(to + "T12:00:00").toLocaleDateString("pt-BR") : "31/12/2026";
    doc.text(T(`${fromLabel} - ${toLabel}`), pageW / 2, pageH / 2 + 55, { align: "center" });
    doc.setFontSize(9);
    doc.text(T(`${rows.length} datas - ${totalPosts} posts - ${publicados} publicados`), pageW / 2, pageH / 2 + 75, { align: "center" });
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text(T(`Gerado em ${new Date().toLocaleDateString("pt-BR")}`), pageW / 2, pageH - 30, { align: "center" });

    // Pré-carrega imagens prévias
    const previewMap = new Map<string, { data: string; w: number; h: number; fmt: string }>();
    const uniqueUrls = Array.from(new Set(rows.map((r) => r.previewImageUrl).filter(Boolean) as string[]));
    await Promise.all(uniqueUrls.map(async (url) => {
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        const dataUrl: string = await new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result as string);
          fr.onerror = reject;
          fr.readAsDataURL(blob);
        });
        const dims: { w: number; h: number } = await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = reject;
          img.src = dataUrl;
        });
        const fmt = blob.type.includes("png") ? "PNG" : blob.type.includes("webp") ? "WEBP" : "JPEG";
        previewMap.set(url, { data: dataUrl, w: dims.w, h: dims.h, fmt });
      } catch (e) {
        console.warn("Falha ao carregar imagem prévia", url, e);
      }
    }));

    // ===== SLIDES (2 datas por slide) =====
    const M = 32;
    const totalSlides = Math.ceil(rows.length / perSlide);

    // Layout adaptativo conforme perSlide (2 = 1×2 lado a lado; 4 = 2×2 grid)
    const isCompact = perSlide === 4;
    const DATE_BLOCK_TOP = 14;
    const DATE_FONT = isCompact ? 32 : 48;
    const DATE_BLOCK_BOTTOM = isCompact ? 60 : 86;
    const TITLE_TOP = isCompact ? 74 : 100;
    const TITLE_FONT = isCompact ? 10 : 12;
    const TITLE_LH = isCompact ? 12 : 14;
    const TITLE_MAX_LINES = isCompact ? 1 : 2;
    const TITLE_HEIGHT = TITLE_LH * TITLE_MAX_LINES + 6;
    const DESC_TOP = TITLE_TOP + TITLE_HEIGHT;
    const CARD_HEIGHT = isCompact ? 130 : 220;

    const drawHalf = (r: typeof rows[number], x: number, w: number, contentY: number, contentH: number) => {
      const d = new Date(r.date + "T12:00:00");
      const dayNum = d.toLocaleDateString("pt-BR", { day: "2-digit" });
      const monthName = d.toLocaleDateString("pt-BR", { month: "long" });

      // Cabeçalho
      doc.setTextColor(...gold);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(isCompact ? 7.5 : 8.5);
      doc.text(T(r.dow.toUpperCase()), x, contentY);
      const statusColor: [number, number, number] = r.status === "Publicado" ? [4, 120, 87] : r.status === "Pendente" ? [160, 110, 40] : [120, 105, 85];
      doc.setTextColor(...statusColor);
      doc.text(T(r.status.toUpperCase()), x + w, contentY, { align: "right" });

      // Bloco data
      doc.setTextColor(...ink);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(DATE_FONT);
      doc.text(dayNum, x, contentY + DATE_BLOCK_TOP + (isCompact ? 20 : 28));
      doc.setFont("helvetica", "normal");
      doc.setFontSize(isCompact ? 9 : 11);
      doc.setTextColor(...muted);
      doc.text(T(`${monthName} - 2026`), x, contentY + DATE_BLOCK_TOP + (isCompact ? 32 : 44));
      doc.setTextColor(...gold);
      doc.setFontSize(isCompact ? 7.5 : 9);
      doc.text(T(r.tipo.toUpperCase()), x, contentY + DATE_BLOCK_TOP + (isCompact ? 44 : 58));

      // Linha divisora
      doc.setDrawColor(...gold);
      doc.setLineWidth(0.5);
      doc.line(x, contentY + DATE_BLOCK_BOTTOM, x + w, contentY + DATE_BLOCK_BOTTOM);

      // Título
      doc.setTextColor(...ink);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(TITLE_FONT);
      const titleLines = doc.splitTextToSize(T(r.titulo), w).slice(0, TITLE_MAX_LINES);
      doc.text(titleLines, x, contentY + TITLE_TOP);

      // Descrição com SHRINK-TO-FIT (nunca corta)
      const descBoxY = contentY + DESC_TOP;
      const descBoxH = contentH - DESC_TOP - CARD_HEIGHT - 8;
      const descText = T(r.descricao || "");
      if (descText && descBoxH > 12) {
        doc.setTextColor(...muted);
        doc.setFont("helvetica", "normal");
        const sizes = isCompact ? [8, 7.5, 7, 6.5, 6, 5.5] : [10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6];
        let chosen = sizes[sizes.length - 1];
        let chosenLines: string[] = [];
        let chosenLh = 7 * 1.25;
        for (const fs of sizes) {
          doc.setFontSize(fs);
          const lh = fs * 1.25;
          const lines = doc.splitTextToSize(descText, w);
          if (lines.length * lh <= descBoxH) {
            chosen = fs; chosenLines = lines; chosenLh = lh;
            break;
          }
          chosen = fs; chosenLines = lines; chosenLh = lh;
        }
        if (chosenLines.length * chosenLh > descBoxH) {
          const maxLines = Math.max(1, Math.floor(descBoxH / chosenLh));
          chosenLines = chosenLines.slice(0, maxLines);
          const last = chosenLines[chosenLines.length - 1] || "";
          chosenLines[chosenLines.length - 1] = last.replace(/\s+\S*$/, "") + "...";
        }
        doc.setFontSize(chosen);
        doc.text(chosenLines, x, descBoxY + chosenLh);
      }

      // Card de imagem - tamanho fixo e consistente por slide
      const cardY = contentY + contentH - CARD_HEIGHT;
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(...border);
      doc.setLineWidth(0.7);
      doc.roundedRect(x, cardY, w, CARD_HEIGHT, 5, 5, "FD");

      const preview = r.previewImageUrl ? previewMap.get(r.previewImageUrl) : null;
      if (preview) {
        const pad = 6;
        const innerW = w - pad * 2;
        const innerH = CARD_HEIGHT - pad * 2;
        const ratio = preview.w / preview.h;
        let drawW = innerW;
        let drawH = drawW / ratio;
        if (drawH > innerH) { drawH = innerH; drawW = drawH * ratio; }
        const dx = x + (w - drawW) / 2;
        const dy = cardY + (CARD_HEIGHT - drawH) / 2;
        try {
          doc.addImage(preview.data, preview.fmt, dx, dy, drawW, drawH, undefined, "FAST");
        } catch (e) {
          console.warn("addImage falhou", e);
        }
      } else {
        doc.setTextColor(...border);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(isCompact ? 8 : 9.5);
        doc.text(T("[ Previa do post ]"), x + w / 2, cardY + CARD_HEIGHT / 2, { align: "center" });
      }
    };

    for (let s = 0; s < totalSlides; s++) {
      const slideRows = rows.slice(s * perSlide, s * perSlide + perSlide);
      doc.addPage("a4", "landscape");

      doc.setFillColor(...soft);
      doc.rect(0, 0, pageW, pageH, "F");

      doc.setFillColor(...ink);
      doc.rect(0, 0, pageW, 44, "F");
      doc.setTextColor(...gold);
      doc.setFontSize(9);
      doc.text(T("ACERVO 10.55 - CRONOGRAMA 2026"), M, 18);
      doc.setTextColor(...cream);
      doc.setFontSize(10);
      doc.text(T("Apresentacao de posts"), M, 33);
      doc.setTextColor(...gold);
      doc.setFontSize(9);
      doc.text(T(`Slide ${s + 1} / ${totalSlides}`), pageW - M, 18, { align: "right" });

      const contentY = 44 + 22;
      const contentH = pageH - contentY - 28;
      const gap = 24;
      const cols = 2;
      const rowsPerSlide = perSlide === 4 ? 2 : 1;
      const colW = (pageW - M * 2 - gap * (cols - 1)) / cols;
      const cellH = (contentH - gap * (rowsPerSlide - 1)) / rowsPerSlide;

      slideRows.forEach((r, idx) => {
        const ci = idx % cols;
        const ri = Math.floor(idx / cols);
        const cx = M + ci * (colW + gap);
        const cy = contentY + ri * (cellH + gap);
        drawHalf(r, cx, colW, cy, cellH);
      });

      // Divisórias
      doc.setDrawColor(...border);
      doc.setLineWidth(0.4);
      // vertical
      doc.line(M + colW + gap / 2, contentY - 4, M + colW + gap / 2, contentY + contentH);
      // horizontal (apenas se 2 linhas)
      if (rowsPerSlide === 2) {
        doc.line(M, contentY + cellH + gap / 2, pageW - M, contentY + cellH + gap / 2);
      }

      doc.setTextColor(...muted);
      doc.setFontSize(8);
      doc.text(T("YLEON - Marketing"), M, pageH - 14);
      doc.text(T(`Pagina ${s + 2}`), pageW - M, pageH - 14, { align: "right" });
    }

    doc.save(`cronograma-marketing-acervo-${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success("PDF exportado");
  }

  const allMarkers = useMemo(() => [...FIXED_MARKERS, ...customEvents], [customEvents]);
  const markersByDate = useMemo(() => {
    const m: Record<string, Marker[]> = {};
    allMarkers.forEach((mk) => { m[mk.date] = m[mk.date] ? [...m[mk.date], mk] : [mk]; });
    return m;
  }, [allMarkers]);

  const grid = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const canPrev = !(year === 2026 && month <= 4);
  const canNext = !(year === 2026 && month >= 11);
  const goPrev = () => { if (!canPrev) return; if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); setSelected(null); };
  const goNext = () => { if (!canNext) return; if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); setSelected(null); };

  const selectedInfo = useMemo(() => {
    if (!selected) return null;
    const d = new Date(selected + "T12:00:00");
    return { date: d, dow: d.getDay(), tpl: WEEKLY_TEMPLATE[d.getDay()], marks: markersByDate[selected] || [], casaCor: isCasaCor(selected) };
  }, [selected, markersByDate]);

  const monthStats = useMemo(() => {
    let posts = 0, done = 0;
    grid.forEach((c) => { if (!c.iso) return; if (c.dow !== 0) posts++; if (progress[c.iso]) done++; });
    return { posts, done };
  }, [grid, progress]);

  const daysToLaunch = Math.max(0, Math.ceil((launchDate.getTime() - Date.now()) / 86400000));
  const theme = MONTHLY_THEME[month];

  const upcomingMarkers = useMemo(() => {
    const todayISO = new Date().toISOString().slice(0, 10);
    return allMarkers
      .filter((m) => m.date >= todayISO && m.date <= "2026-12-31")
      .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  }, [allMarkers]);

  const matchesFilter = (iso: string) => {
    const d = new Date(iso + "T12:00:00").getDay();
    const tpl = WEEKLY_TEMPLATE[d];
    const marks = markersByDate[iso] || [];
    if (filter === "Eventos") return marks.length > 0;
    if (filter === "all") return true;
    return tpl?.tag === filter;
  };
  const matchesSearch = (iso: string) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const d = new Date(iso + "T12:00:00").getDay();
    const tpl = WEEKLY_TEMPLATE[d];
    const marks = markersByDate[iso] || [];
    return tpl?.label.toLowerCase().includes(q) || marks.some((m) => m.title.toLowerCase().includes(q));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#faf7f2] via-[#f5efe6] to-[#ede4d3] text-[#2a2520]">
      {/* Header */}
      <header className="border-b border-[#d9cdb6]/60 backdrop-blur-md sticky top-0 z-30 bg-[#faf7f2]/85">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4">
            <img src={logoYleon} alt="YLEON" className="h-12 sm:h-14 w-auto object-contain" />
            <div className="hidden sm:block w-px h-8 bg-[#d9cdb6]" />
            <div className="hidden sm:block">
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#8a7350]">Painel interno</div>
              <div className="text-sm font-medium text-[#2a2520]" style={{ fontFamily: "var(--font-display)" }}>
                Cronograma de Marketing 2026
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowExportModal(true)}
              className="inline-flex items-center gap-1.5 text-xs px-3 h-8 rounded-md bg-[#2a2520] text-[#f5efe6] hover:bg-[#3a3530] transition-colors">
              <FileDown className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Exportar</span>
            </button>
            <button onClick={() => { void signOut(); }}
              className="text-xs text-[#8a7350] hover:text-[#2a2520] transition-colors">Sair</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Hero cards */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {[
            { icon: <Rocket className="w-3.5 h-3.5" />, label: "Lançamento Plataforma", main: <><span className="text-4xl font-light">{daysToLaunch}</span><span className="text-base text-[#8a7350] ml-2">dias</span></>, sub: launchDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) },
            { icon: <HomeIcon className="w-3.5 h-3.5" />, label: "Casa Cor", main: <span className="text-lg font-light">26/Jun → 30/Ago</span>, sub: "Janela estratégica · oportunidade máxima" },
            { icon: <Sparkles className="w-3.5 h-3.5" />, label: "Mês atual", main: <><span className="text-2xl font-light">{monthStats.done}/{monthStats.posts}</span><span className="text-xs text-[#8a7350] ml-2">posts publicados</span></>, sub: "" },
          ].map((c, i) => (
            <motion.div key={i}
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              className="rounded-xl border border-[#d9cdb6]/80 bg-white shadow-sm p-5"
            >
              <div className="flex items-center gap-2 text-[#8a7350] text-xs uppercase tracking-[0.2em] mb-2">
                {c.icon} {c.label}
              </div>
              <div className="mb-2">{c.main}</div>
              {i === 2 ? (
                <div className="w-full bg-[#ede4d3] h-1.5 rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }}
                    animate={{ width: `${monthStats.posts ? (monthStats.done / monthStats.posts) * 100 : 0}%` }}
                    transition={{ duration: 0.8 }} className="h-full bg-[#b89968]" />
                </div>
              ) : <div className="text-xs text-[#8a7350]">{c.sub}</div>}
            </motion.div>
          ))}
        </section>

        {/* Próximos marcos */}
        {upcomingMarkers.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs uppercase tracking-[0.25em] text-[#8a7350] mb-3">Próximos marcos</h2>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
              {upcomingMarkers.map((m, i) => (
                <motion.button key={(m.id || "") + m.date + m.title}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => { const d = new Date(m.date + "T12:00:00"); setYear(d.getFullYear()); setMonth(d.getMonth()); setSelected(m.date); }}
                  className="shrink-0 min-w-[200px] text-left rounded-lg border border-[#d9cdb6] bg-white hover:border-[#b89968] hover:shadow-md transition-all p-3"
                >
                  <div className="text-xl mb-1">{m.emoji}</div>
                  <div className="text-sm font-medium leading-tight text-[#2a2520]">{m.title}</div>
                  <div className="text-xs text-[#8a7350] mt-1">
                    {new Date(m.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                    {m.type === "custom" && <span className="ml-2 text-[#b89968]">· Custom</span>}
                  </div>
                </motion.button>
              ))}
            </div>
          </section>
        )}

        {/* Calendário */}
        <section className="rounded-2xl border border-[#d9cdb6] bg-white shadow-sm p-4 sm:p-6 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <button onClick={goPrev} disabled={!canPrev}
                className="w-9 h-9 rounded-md border border-[#d9cdb6] hover:bg-[#f5efe6] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="min-w-[180px] text-center">
                <div className="text-xl font-light tracking-wide" style={{ fontFamily: "var(--font-display)" }}>
                  {MONTH_NAMES[month]} <span className="text-[#8a7350]">{year}</span>
                </div>
                {theme && <div className="text-[10px] sm:text-xs text-[#8a7350] uppercase tracking-[0.2em] mt-0.5">{theme.theme}</div>}
              </div>
              <button onClick={goNext} disabled={!canNext}
                className="w-9 h-9 rounded-md border border-[#d9cdb6] hover:bg-[#f5efe6] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#a89878]" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..."
                  className="h-9 w-44 pl-8 bg-[#faf7f2] border-[#d9cdb6] text-[#2a2520] placeholder:text-[#a89878] text-sm" />
              </div>
              <Filter className="w-3.5 h-3.5 text-[#8a7350]" />
              <select value={filter} onChange={(e) => setFilter(e.target.value as any)}
                className="h-9 bg-[#faf7f2] border border-[#d9cdb6] text-[#2a2520] text-sm rounded-md px-2 focus:outline-none focus:ring-1 focus:ring-[#b89968]">
                <option value="all">Todos</option>
                <option value="Arquitetos">Arquitetos (Seg)</option>
                <option value="Produto">Produto (Ter/Qui)</option>
                <option value="Aberto">Aberto (Qua)</option>
                <option value="Cliente">Cliente (Sex)</option>
                <option value="Loja">Loja (Sáb)</option>
                <option value="Eventos">Marcos / Eventos</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
            {DOW_NAMES.map((d, i) => (
              <div key={d} className={`text-center text-[10px] sm:text-xs uppercase tracking-[0.2em] py-2 ${i === 0 ? "text-[#b8a888]" : "text-[#8a7350]"}`}>{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {grid.map((cell, idx) => {
              if (!cell.day || !cell.iso) return <div key={`e-${idx}`} className="aspect-square" />;
              const iso = cell.iso;
              const tpl = WEEKLY_TEMPLATE[cell.dow];
              const marks = markersByDate[iso] || [];
              const isSelected = selected === iso;
              const isDone = !!progress[iso];
              const casaCor = isCasaCor(iso);
              const isLaunch = iso === launchISO;
              const todayStr = new Date().toISOString().slice(0, 10);
              const isToday = iso === todayStr;
              const dim = !matchesFilter(iso) || !matchesSearch(iso);
              const isSunday = cell.dow === 0;

              return (
                <motion.button key={iso}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: dim ? 0.3 : 1, scale: 1 }}
                  transition={{ duration: 0.25, delay: idx * 0.004 }}
                  whileHover={{ scale: 1.03 }}
                  onClick={() => setSelected(iso)}
                  className={`relative aspect-square rounded-lg border text-left p-1.5 sm:p-2 transition-all overflow-hidden
                    ${isSelected
                      ? "border-[#b89968] bg-[#f5efe6] shadow-[0_0_0_2px_rgba(184,153,104,0.25)]"
                      : "border-[#e6dcc7] bg-white hover:border-[#b89968] hover:bg-[#faf7f2]"}
                    ${isSunday ? "opacity-70" : ""}
                  `}
                >
                  {casaCor && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-[#7C9C6A] to-[#4A7C59]" />}
                  {isLaunch && <div className="absolute inset-0 ring-2 ring-[#b89968] rounded-lg pointer-events-none animate-pulse" />}

                  <div className="flex items-start justify-between">
                    <span className={`text-xs sm:text-sm font-medium ${isToday ? "text-[#b89968] underline underline-offset-2" : "text-[#2a2520]"}`}>{cell.day}</span>
                    {isDone && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                  </div>

                  {tpl && !isSunday && (
                    <div className="hidden sm:block mt-1">
                      <span className="text-[9px] uppercase tracking-wider text-[#8a7350] line-clamp-1">{tpl.tag}</span>
                      <div className="h-0.5 mt-0.5 rounded-full" style={{ background: tpl.color, opacity: 0.85 }} />
                    </div>
                  )}

                  {marks.length > 0 && (
                    <div className="absolute bottom-1 right-1 flex gap-0.5 text-[10px] sm:text-xs">
                      {marks.slice(0, 3).map((m, i) => <span key={i}>{m.emoji}</span>)}
                    </div>
                  )}
                </motion.button>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[10px] sm:text-xs text-[#8a7350]">
            {Object.entries(WEEKLY_TEMPLATE).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: v.color }} />
                <span>{DOW_NAMES[Number(k)]} · {v.tag}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <span className="w-1 h-3 rounded bg-gradient-to-b from-[#7C9C6A] to-[#4A7C59]" />
              <span>Casa Cor</span>
            </div>
          </div>
        </section>

        {/* Detalhe do dia */}
        <AnimatePresence mode="wait">
          {selectedInfo && (
            <motion.section key={selected}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35 }}
              className="rounded-2xl border border-[#d9cdb6] bg-white shadow-sm p-5 sm:p-7 mb-8"
            >
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <div className="text-[#8a7350] text-xs uppercase tracking-[0.25em] mb-1">
                    {DOW_NAMES[selectedInfo.dow]} · {selectedInfo.date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-light text-[#2a2520]" style={{ fontFamily: "var(--font-display)" }}>
                    {selectedInfo.tpl?.label || "Domingo · Descanso"}
                  </h3>
                </div>
                <button onClick={() => setSelected(null)} className="text-[#8a7350] hover:text-[#2a2520] p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                {selectedInfo.tpl && (
                  <div className="rounded-lg border border-[#e6dcc7] p-4 bg-[#faf7f2]">
                    <div className="text-xs uppercase tracking-[0.2em] text-[#8a7350] mb-1">Tipo de post</div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: selectedInfo.tpl.color }} />
                      <span className="text-sm">{selectedInfo.tpl.tag}</span>
                    </div>
                  </div>
                )}
                {selectedInfo.casaCor && (
                  <div className="rounded-lg border border-emerald-300 p-4 bg-emerald-50">
                    <div className="text-xs uppercase tracking-[0.2em] text-emerald-700 mb-1">Casa Cor ativa</div>
                    <div className="text-sm text-emerald-900">Aproveite — faça referência ao evento.</div>
                  </div>
                )}
                {selected === launchISO && (
                  <div className="rounded-lg border border-[#b89968] p-4 bg-[#f5efe6]">
                    <div className="text-xs uppercase tracking-[0.2em] text-[#8a7350] mb-1">🚀 Lançamento</div>
                    <div className="text-sm">Plataforma YLEON vai ao ar hoje.</div>
                  </div>
                )}
              </div>

              {selectedInfo.marks.length > 0 && (
                <div className="mb-5">
                  <div className="text-xs uppercase tracking-[0.2em] text-[#8a7350] mb-2">Eventos do dia</div>
                  <div className="flex flex-col gap-2">
                    {selectedInfo.marks.map((m, i) => (
                      <div key={i} className="flex items-start justify-between gap-3 p-3 rounded-lg border border-[#e6dcc7] bg-[#faf7f2]">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-[#2a2520]">
                            <span className="mr-2">{m.emoji}</span>{m.title}
                            {m.type === "custom" && <span className="ml-2 text-[10px] uppercase tracking-wider text-[#b89968]">custom</span>}
                          </div>
                          {m.description && <div className="text-xs text-[#8a7350] mt-1">{m.description}</div>}
                        </div>
                        {m.type === "custom" && m.id && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => openEdit(m)} className="text-[#8a7350] hover:text-[#2a2520] p-1" title="Editar">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => deleteEvent(m.id!)} className="text-[#b89968] hover:text-red-500 p-1" title="Excluir">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-[#e6dcc7]">
                <Button onClick={() => selected && toggleDone(selected)}
                  className={`h-10 ${
                    progress[selected!]
                      ? "bg-emerald-50 border border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                      : "bg-[#2a2520] text-[#f5efe6] hover:bg-[#3a3530]"
                  }`}>
                  {progress[selected!] ? <><CheckCircle2 className="w-4 h-4 mr-2" />Publicado</> : <><Circle className="w-4 h-4 mr-2" />Marcar como publicado</>}
                </Button>
                <Button onClick={openAdd} variant="outline"
                  className="h-10 border-[#b89968] text-[#8a7350] hover:bg-[#f5efe6] hover:text-[#2a2520]">
                  <Plus className="w-4 h-4 mr-2" />Adicionar à agenda
                </Button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Tema mensal */}
        {theme && (
          <section className="rounded-2xl border border-[#d9cdb6] bg-white shadow-sm p-5 sm:p-7 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-[#8a7350] mb-1">Tema do mês</div>
                <div className="text-lg font-light text-[#2a2520]" style={{ fontFamily: "var(--font-display)" }}>{theme.theme}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-[#8a7350] mb-1">Foco</div>
                <div className="text-sm text-[#3a3530]">{theme.focus}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-[#8a7350] mb-1">Prioridade</div>
                <span className="inline-block px-2.5 py-1 rounded-full border border-[#b89968] bg-[#f5efe6] text-sm">{theme.priority}</span>
              </div>
            </div>
          </section>
        )}

        {/* Formação semanal */}
        <section className="rounded-2xl border border-[#d9cdb6] bg-white shadow-sm p-5 sm:p-7 mb-10">
          <h3 className="text-lg font-light mb-4 text-[#2a2520]" style={{ fontFamily: "var(--font-display)" }}>Formação semanal padrão</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {Object.entries(WEEKLY_TEMPLATE).map(([k, v]) => (
              <div key={k} className="rounded-lg border border-[#e6dcc7] p-3 bg-[#faf7f2]">
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#8a7350] mb-1">{DOW_NAMES[Number(k)]}</div>
                <div className="text-sm leading-snug text-[#2a2520]">{v.label}</div>
                <div className="h-0.5 mt-2 rounded-full" style={{ background: v.color }} />
              </div>
            ))}
          </div>
        </section>

        <footer className="text-center text-[#8a7350] text-xs pt-6 border-t border-[#d9cdb6]">
          YLEON · Cronograma de Marketing 2026 · Uso interno
        </footer>
      </main>

      {/* Botão flutuante adicionar */}
      <AnimatePresence>
        {!showAddModal && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
            onClick={openAdd}
            className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-[#2a2520] text-[#f5efe6] shadow-xl hover:bg-[#3a3530] flex items-center justify-center z-40"
            title="Adicionar evento"
          >
            <Plus className="w-6 h-6" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Modal adicionar */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#2a2520]/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            onClick={() => setShowAddModal(false)}
          >
            <motion.div
              initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-white rounded-2xl border border-[#d9cdb6] shadow-2xl p-6"
            >
              <div className="flex items-center justify-between mb-5">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.25em] text-[#8a7350] mb-1">{editingId ? "Editar evento" : "Novo evento"}</div>
                  <h3 className="text-xl font-light text-[#2a2520]" style={{ fontFamily: "var(--font-display)" }}>{editingId ? "Atualizar agenda" : "Adicionar à agenda"}</h3>
                </div>
                <button onClick={() => { setShowAddModal(false); setEditingId(null); }} className="p-1 text-[#8a7350] hover:text-[#2a2520]"><X className="w-5 h-5" /></button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs uppercase tracking-[0.2em] text-[#8a7350] mb-2">Data</label>
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-md border border-[#d9cdb6] bg-[#faf7f2]">
                    <CalendarDays className="w-4 h-4 text-[#8a7350]" />
                    <input
                      type="date" value={selected || ""} onChange={(e) => setSelected(e.target.value)}
                      min="2026-05-01" max="2026-12-31"
                      className="flex-1 bg-transparent text-sm text-[#2a2520] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-[0.2em] text-[#8a7350] mb-2">Ícone</label>
                  <div className="flex flex-wrap gap-2">
                    {["📌","🎯","📷","🎬","💡","⭐","🔥","🛋","🌿","🎉"].map((e) => (
                      <button key={e} type="button" onClick={() => setNewEmoji(e)}
                        className={`w-10 h-10 rounded-md border text-lg ${newEmoji === e ? "border-[#b89968] bg-[#f5efe6]" : "border-[#e6dcc7] bg-white hover:border-[#b89968]"}`}>{e}</button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-[0.2em] text-[#8a7350] mb-2">Título</label>
                  <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Ex.: Sessão de fotos Folio"
                    className="bg-[#faf7f2] border-[#d9cdb6] text-[#2a2520]" />
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-[0.2em] text-[#8a7350] mb-2">Descrição (opcional)</label>
                  <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={3}
                    placeholder="Notas, briefing, links..."
                    className="w-full bg-[#faf7f2] border border-[#d9cdb6] rounded-md p-3 text-sm text-[#2a2520] placeholder:text-[#a89878] focus:outline-none focus:ring-1 focus:ring-[#b89968] resize-none" />
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-[0.2em] text-[#8a7350] mb-2">Prévia do post (imagem)</label>
                  {newPreviewUrl ? (
                    <div className="relative inline-block">
                      <img src={newPreviewUrl} alt="Prévia" className="max-h-40 rounded-md border border-[#d9cdb6]" />
                      <button type="button" onClick={() => setNewPreviewUrl(null)}
                        className="absolute -top-2 -right-2 bg-white border border-[#d9cdb6] rounded-full p-1 shadow hover:bg-[#faf7f2]"
                        title="Remover">
                        <X className="w-3.5 h-3.5 text-[#8a7350]" />
                      </button>
                    </div>
                  ) : (
                    <label className={`flex items-center justify-center gap-2 px-3 py-3 rounded-md border border-dashed border-[#d9cdb6] bg-[#faf7f2] text-sm text-[#8a7350] cursor-pointer hover:border-[#b89968] ${uploadingPreview ? "opacity-60 pointer-events-none" : ""}`}>
                      <Plus className="w-4 h-4" />
                      {uploadingPreview ? "Enviando..." : "Enviar imagem da prévia"}
                      <input type="file" accept="image/*" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPreviewImage(f); e.target.value = ""; }} />
                    </label>
                  )}
                  <p className="text-[10px] text-[#a89878] mt-1.5">Aparece no PDF de apresentação no espaço da prévia.</p>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button onClick={() => { setShowAddModal(false); setEditingId(null); }} variant="outline"
                    className="flex-1 border-[#d9cdb6] text-[#8a7350] hover:bg-[#faf7f2]">Cancelar</Button>
                  <Button onClick={saveEvent} disabled={!newTitle.trim() || !selected || saving}
                    className="flex-1 bg-[#2a2520] text-[#f5efe6] hover:bg-[#3a3530]">
                    {saving ? "Salvando..." : editingId ? "Atualizar" : "Salvar"}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal exportar com período */}
      <AnimatePresence>
        {showExportModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#2a2520]/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            onClick={() => setShowExportModal(false)}
          >
            <motion.div
              initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-white rounded-2xl border border-[#d9cdb6] shadow-2xl p-6"
            >
              <div className="flex items-center justify-between mb-5">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.25em] text-[#8a7350] mb-1">Cronograma</div>
                  <h3 className="text-xl font-light text-[#2a2520]" style={{ fontFamily: "var(--font-display)" }}>Exportar período</h3>
                </div>
                <button onClick={() => setShowExportModal(false)} className="p-1 text-[#8a7350] hover:text-[#2a2520]"><X className="w-5 h-5" /></button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs uppercase tracking-[0.2em] text-[#8a7350] mb-2">De</label>
                    <input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)}
                      min="2026-01-01" max="2026-12-31"
                      className="w-full bg-[#faf7f2] border border-[#d9cdb6] rounded-md px-3 py-2.5 text-sm text-[#2a2520] focus:outline-none focus:ring-1 focus:ring-[#b89968]" />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-[0.2em] text-[#8a7350] mb-2">Até</label>
                    <input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)}
                      min="2026-01-01" max="2026-12-31"
                      className="w-full bg-[#faf7f2] border border-[#d9cdb6] rounded-md px-3 py-2.5 text-sm text-[#2a2520] focus:outline-none focus:ring-1 focus:ring-[#b89968]" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-[0.2em] text-[#8a7350] mb-2">Atalhos</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { l: "Mês atual", from: isoOf(year, month, 1), to: isoOf(year, month, new Date(year, month + 1, 0).getDate()) },
                      { l: "Maio", from: "2026-05-01", to: "2026-05-31" },
                      { l: "Casa Cor", from: "2026-06-26", to: "2026-08-30" },
                      { l: "Tudo", from: "2026-05-01", to: "2026-12-31" },
                    ].map((p) => (
                      <button key={p.l} onClick={() => { setExportFrom(p.from); setExportTo(p.to); }}
                        className="text-xs px-3 py-1.5 rounded-md border border-[#d9cdb6] bg-[#faf7f2] hover:bg-[#f5efe6] text-[#2a2520]">{p.l}</button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-[0.2em] text-[#8a7350] mb-2">Datas por slide</label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { v: 2 as const, l: "2 por slide", sub: "1 × 2" },
                      { v: 4 as const, l: "4 por slide", sub: "2 × 2" },
                    ]).map((opt) => (
                      <button key={opt.v} onClick={() => setExportPerSlide(opt.v)}
                        className={`flex flex-col items-center justify-center h-14 rounded-md border text-sm transition-colors ${
                          exportPerSlide === opt.v
                            ? "border-[#b89968] bg-[#f5efe6] text-[#2a2520]"
                            : "border-[#e6dcc7] bg-white text-[#8a7350] hover:bg-[#faf7f2]"
                        }`}>
                        <span className="font-medium">{opt.l}</span>
                        <span className="text-[10px] uppercase tracking-[0.2em] opacity-70">{opt.sub}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button onClick={() => setShowExportModal(false)} variant="outline"
                    className="flex-1 border-[#d9cdb6] text-[#8a7350] hover:bg-[#faf7f2]">Cancelar</Button>
                  <Button
                    onClick={() => {
                      if (exportFrom > exportTo) { toast.error("Data inicial maior que final"); return; }
                      exportPDF(exportFrom, exportTo, exportPerSlide);
                      setShowExportModal(false);
                    }}
                    className="flex-1 bg-[#2a2520] text-[#f5efe6] hover:bg-[#3a3530]">
                    <FileDown className="w-4 h-4 mr-2" /> Exportar PDF
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ============================================================
   PAGE
============================================================ */
export default function MarketingPage() {
  const { isAdmin, loading } = useAuth();

  useEffect(() => {
    document.title = "Marketing | YLEON";
  }, []);

  if (loading) return <div className="min-h-screen bg-[#faf7f2]" />;
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#faf7f2] px-4">
        <div className="text-center">
          <img src={logoYleon} alt="YLEON" className="h-24 w-auto mx-auto mb-6 object-contain" />
          <p className="text-sm uppercase tracking-[0.25em] text-[#8a7350] mb-2">Acesso restrito</p>
          <h1 className="text-2xl font-light text-[#2a2520]" style={{ fontFamily: "var(--font-display)" }}>Marketing</h1>
        </div>
      </div>
    );
  }

  return <MarketingContent />;
}
