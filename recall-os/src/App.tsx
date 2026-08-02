import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentType,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import {
  ArrowRight,
  BarChart3,
  Bold,
  BookOpen,
  Brain,
  CalendarCheck2,
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Code2,
  Database,
  Download,
  Eye,
  Flame,
  ImagePlus,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Layers3,
  List,
  ListOrdered,
  Palette,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sigma,
  StickyNote,
  Trash2,
  Trophy,
  Underline,
  Upload,
  X,
  Zap,
} from "lucide-react";
import katex from "katex";
import "katex/dist/katex.min.css";

type CourseCode = string;
type NavigationId = "practice" | "questions" | "calendar" | "analytics" | "settings";
type RecallLevel = 1 | 2 | 3 | 4 | 5;
type ThemeId =
  | "midnight"
  | "daylight"
  | "dark-note"
  | "ember"
  | "nordic"
  | "lavender"
  | "forest"
  | "rosewood";

export interface ReviewAttempt {
  reviewedAt: string;
  level: RecallLevel;
  nextReviewDate: string;
}

export interface Question {
  id: string;
  course: CourseCode;
  chapter: string;
  subchapter: string;
  question: string;
  answer: string;
  note: string;
  level: RecallLevel;
  addedAt: string;
  lastReviewed: string;
  nextReviewDate: string;
  reviewCount: number;
  reviewHistory: ReviewAttempt[];
  contentVersion: 1;
}

const STORAGE_KEY = "active-recall.questions.v1";
const ACTIVITY_STORAGE_KEY = "active-recall.activity-dates.v1";
const COURSES_STORAGE_KEY = "active-recall.courses.v1";
const THEME_STORAGE_KEY = "active-recall.theme.v1";
const APP_VERSION = "1.6.0";
const COPYRIGHT_OWNER = "Karabo Goodwill Nkambule";
const LEGACY_DEFAULT_COURSES: CourseCode[] = ["CSC3003S", "INF3012S", "AST1000S"];
const REVIEW_LEVELS = [
  { level: 1, label: "Blackout", days: 0, color: "rose" },
  { level: 2, label: "Hard", days: 1, color: "orange" },
  { level: 3, label: "Good", days: 3, color: "amber" },
  { level: 4, label: "Great", days: 7, color: "emerald" },
  { level: 5, label: "Flawless", days: 14, color: "cyan" },
] as const;

const THEMES: Array<{
  id: ThemeId;
  name: string;
  description: string;
  colors: [string, string, string, string];
}> = [
  {
    id: "midnight",
    name: "Midnight Slate",
    description: "Your original Recall OS theme",
    colors: ["#090d16", "#0f172a", "#1e293b", "#22d3ee"],
  },
  {
    id: "daylight",
    name: "Daylight",
    description: "Maximum contrast at low screen brightness",
    colors: ["#f8fafc", "#ffffff", "#d6dee8", "#0369a1"],
  },
  {
    id: "dark-note",
    name: "Dark Note",
    description: "Charcoal, muted teal, and warm gold",
    colors: ["#181a1b", "#202425", "#334044", "#d5a85a"],
  },
  {
    id: "ember",
    name: "Ember Study",
    description: "Deep cocoa with a calm amber glow",
    colors: ["#16110f", "#211815", "#44302a", "#f2a65a"],
  },
  {
    id: "nordic",
    name: "Nordic Focus",
    description: "Blue slate with a crisp orange accent",
    colors: ["#243044", "#31415b", "#4b607b", "#ff9b50"],
  },
  {
    id: "lavender",
    name: "Lavender Night",
    description: "Ink purple with soft lavender",
    colors: ["#11101c", "#1c1930", "#393354", "#b8a5ff"],
  },
  {
    id: "forest",
    name: "Forest Recall",
    description: "Evergreen surfaces with mint accents",
    colors: ["#0c1512", "#13221d", "#294239", "#70d6a8"],
  },
  {
    id: "rosewood",
    name: "Rosewood",
    description: "Burgundy shadows with dusty rose",
    colors: ["#190f15", "#281720", "#4a2b38", "#f08da9"],
  },
];

const NAVIGATION: Array<{
  id: NavigationId;
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
}> = [
  { id: "practice", label: "Daily Practice", icon: Zap },
  { id: "questions", label: "Question Bank", icon: BookOpen },
  { id: "calendar", label: "Recall Calendar", icon: CalendarDays },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
];

function normalizeReviewAttempt(value: unknown): ReviewAttempt | null {
  if (!value || typeof value !== "object") return null;
  const attempt = value as Partial<ReviewAttempt>;
  if (
    typeof attempt.reviewedAt !== "string" ||
    !Number.isInteger(attempt.level) ||
    Number(attempt.level) < 1 ||
    Number(attempt.level) > 5 ||
    typeof attempt.nextReviewDate !== "string"
  ) {
    return null;
  }
  return {
    reviewedAt: attempt.reviewedAt,
    level: attempt.level as RecallLevel,
    nextReviewDate: attempt.nextReviewDate,
  };
}

function normalizeQuestion(value: unknown): Question | null {
  if (!value || typeof value !== "object") return null;

  const question = value as Partial<Question>;
  const hasRequiredFields =
    typeof question.id === "string" &&
    typeof question.course === "string" &&
    question.course.trim().length > 0 &&
    typeof question.chapter === "string" &&
    typeof question.subchapter === "string" &&
    typeof question.question === "string" &&
    typeof question.answer === "string" &&
    Number.isInteger(question.level) &&
    Number(question.level) >= 1 &&
    Number(question.level) <= 5 &&
    typeof question.nextReviewDate === "string";

  if (!hasRequiredFields) return null;

  const lastReviewed =
    typeof question.lastReviewed === "string"
      ? question.lastReviewed
      : question.nextReviewDate!;
  const reviewCount =
    typeof question.reviewCount === "number" && question.reviewCount >= 0
      ? question.reviewCount
      : 0;
  const storedReviewHistory = Array.isArray(question.reviewHistory)
    ? question.reviewHistory
        .map(normalizeReviewAttempt)
        .filter((attempt): attempt is ReviewAttempt => attempt !== null)
    : [];
  const reviewHistory =
    storedReviewHistory.length || reviewCount === 0
      ? storedReviewHistory
      : [
          {
            reviewedAt: lastReviewed,
            level: question.level as RecallLevel,
            nextReviewDate: question.nextReviewDate!,
          },
        ];
  const richContent = question.contentVersion === 1;

  return {
    id: question.id!,
    course: question.course!.trim(),
    chapter: question.chapter!,
    subchapter: question.subchapter!,
    question: richContent
      ? sanitizeRichHtml(question.question!)
      : plainTextToRichHtml(question.question!),
    answer: richContent
      ? sanitizeRichHtml(question.answer!)
      : plainTextToRichHtml(question.answer!),
    note:
      typeof question.note === "string"
        ? richContent
          ? sanitizeRichHtml(question.note)
          : plainTextToRichHtml(question.note)
        : "",
    level: question.level as Question["level"],
    addedAt:
      typeof question.addedAt === "string"
        ? question.addedAt
        : typeof question.lastReviewed === "string"
          ? question.lastReviewed
          : question.nextReviewDate!,
    lastReviewed,
    nextReviewDate: question.nextReviewDate!,
    reviewCount,
    reviewHistory,
    contentVersion: 1,
  };
}

function loadStoredQuestions(): Question[] {
  if (typeof window === "undefined") return [];

  try {
    const storedValue = window.localStorage.getItem(STORAGE_KEY);
    if (!storedValue) return [];

    const parsedValue: unknown = JSON.parse(storedValue);
    if (!Array.isArray(parsedValue)) return [];

    return parsedValue
      .map(normalizeQuestion)
      .filter((question): question is Question => question !== null);
  } catch {
    return [];
  }
}

function useStoredQuestions() {
  const [questions, setQuestions] = useState<Question[]>(loadStoredQuestions);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(questions));
  }, [questions]);

  return [questions, setQuestions] as const;
}

function uniqueCourseNames(values: unknown[]): CourseCode[] {
  const seenNames = new Set<string>();
  const courses: CourseCode[] = [];

  values.forEach((value) => {
    if (typeof value !== "string") return;
    const cleanName = value.trim().replace(/\s+/g, " ");
    const lookupName = cleanName.toLocaleLowerCase();
    if (!cleanName || seenNames.has(lookupName)) return;
    seenNames.add(lookupName);
    courses.push(cleanName);
  });

  return courses;
}

function loadStoredCourses(questions: Question[]): CourseCode[] {
  if (typeof window === "undefined") return [];
  const questionCourses = questions.map((question) => question.course);

  try {
    const storedCourses = window.localStorage.getItem(COURSES_STORAGE_KEY);
    if (storedCourses) {
      const parsedCourses: unknown = JSON.parse(storedCourses);
      if (Array.isArray(parsedCourses)) {
        return uniqueCourseNames([...parsedCourses, ...questionCourses]);
      }
    }
  } catch {
    // A damaged course list should never hide otherwise valid questions.
  }

  const isExistingInstallation = window.localStorage.getItem(STORAGE_KEY) !== null;
  return uniqueCourseNames([
    ...(isExistingInstallation ? LEGACY_DEFAULT_COURSES : []),
    ...questionCourses,
  ]);
}

function useStoredCourses(questions: Question[]) {
  const [courses, setCourses] = useState<CourseCode[]>(() =>
    loadStoredCourses(questions),
  );

  useEffect(() => {
    setCourses((currentCourses) => {
      const mergedCourses = uniqueCourseNames([
        ...currentCourses,
        ...questions.map((question) => question.course),
      ]);
      return mergedCourses.length === currentCourses.length &&
        mergedCourses.every((course, index) => course === currentCourses[index])
        ? currentCourses
        : mergedCourses;
    });
  }, [questions]);

  useEffect(() => {
    window.localStorage.setItem(COURSES_STORAGE_KEY, JSON.stringify(courses));
  }, [courses]);

  return [courses, setCourses] as const;
}

function loadStoredActivityDates(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsedValue: unknown = JSON.parse(
      window.localStorage.getItem(ACTIVITY_STORAGE_KEY) ?? "[]",
    );
    if (!Array.isArray(parsedValue)) return [];
    return Array.from(
      new Set(
        parsedValue.filter(
          (value): value is string =>
            typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value),
        ),
      ),
    ).sort();
  } catch {
    return [];
  }
}

function useStoredActivityDates(questions: Question[]) {
  const [activityDates, setActivityDates] = useState<string[]>(() => {
    const storedDates = loadStoredActivityDates();
    if (storedDates.length) return storedDates;
    return Array.from(
      new Set(
        questions
          .filter((question) => question.reviewCount > 0)
          .map((question) => question.lastReviewed),
      ),
    ).sort();
  });

  useEffect(() => {
    window.localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(activityDates));
  }, [activityDates]);

  return [activityDates, setActivityDates] as const;
}

function loadStoredTheme(): ThemeId {
  if (typeof window === "undefined") return "midnight";
  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  return THEMES.some((theme) => theme.id === storedTheme)
    ? (storedTheme as ThemeId)
    : "midnight";
}

function useStoredTheme() {
  const [theme, setTheme] = useState<ThemeId>(loadStoredTheme);

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  return [theme, setTheme] as const;
}

function getLocalDateKey(currentDate = new Date()): string {
  const timezoneOffset = currentDate.getTimezoneOffset() * 60_000;
  return new Date(currentDate.getTime() - timezoneOffset)
    .toISOString()
    .slice(0, 10);
}

function addDaysToDate(dateKey: string, days: number): string {
  const nextDate = new Date(`${dateKey}T12:00:00`);
  nextDate.setDate(nextDate.getDate() + days);
  return getLocalDateKey(nextDate);
}

function formatDate(dateKey: string): string {
  const parsedDate = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return "Not scheduled";
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsedDate);
}

function dateKeyFromStudyTimestamp(value: string): string {
  if (!value.includes("T")) return value.slice(0, 10);
  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? value.slice(0, 10) : getLocalDateKey(parsedDate);
}

function dateFromKey(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00`);
}

function shiftDateKey(dateKey: string, days: number): string {
  return addDaysToDate(dateKey, days);
}

function startOfWeekKey(dateKey: string): string {
  const date = dateFromKey(dateKey);
  const mondayOffset = (date.getDay() + 6) % 7;
  return shiftDateKey(dateKey, -mondayOffset);
}

function monthGridDateKeys(year: number, month: number): string[] {
  const firstDateKey = getLocalDateKey(new Date(year, month, 1, 12));
  const firstDate = dateFromKey(firstDateKey);
  const mondayOffset = (firstDate.getDay() + 6) % 7;
  const firstGridDate = shiftDateKey(firstDateKey, -mondayOffset);
  return Array.from({ length: 42 }, (_, index) => shiftDateKey(firstGridDate, index));
}

function parseStudyTimestamp(value: string): number {
  const parsedDate = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  return parsedDate.getTime();
}

function formatReviewTimestamp(value: string): string {
  const parsedDate = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return "Unknown review time";
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsedDate);
}

const RICH_TEXT_ALLOWED_TAGS = new Set([
  "B",
  "BLOCKQUOTE",
  "BR",
  "CODE",
  "DIV",
  "EM",
  "I",
  "IMG",
  "LI",
  "OL",
  "P",
  "PRE",
  "SPAN",
  "STRONG",
  "SUB",
  "SUP",
  "U",
  "UL",
]);
const SAFE_IMAGE_SOURCE = /^data:image\/(?:png|jpe?g|webp|gif);base64,/i;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function plainTextToRichHtml(value: string): string {
  const normalized = value.replace(/\r\n?/g, "\n");
  return `<p>${escapeHtml(normalized).replaceAll("\n", "<br>")}</p>`;
}

function sanitizeRichHtml(value: string): string {
  if (typeof document === "undefined") return value;
  const template = document.createElement("template");
  template.innerHTML = value;

  Array.from(template.content.querySelectorAll("script,style,iframe,object,embed,link,meta"))
    .forEach((element) => element.remove());

  Array.from(template.content.querySelectorAll("*"))
    .forEach((element) => {
      if (!RICH_TEXT_ALLOWED_TAGS.has(element.tagName)) {
        element.replaceWith(...Array.from(element.childNodes));
        return;
      }

      const equation = element.tagName === "SPAN"
        ? element.getAttribute("data-equation")
        : null;
      const equationDisplay = element.getAttribute("data-display") === "block"
        ? "block"
        : "inline";
      const imageSource = element.tagName === "IMG" ? element.getAttribute("src") : null;
      const imageAlt = element.tagName === "IMG" ? element.getAttribute("alt") ?? "Study image" : null;

      Array.from(element.attributes).forEach((attribute) => {
        element.removeAttribute(attribute.name);
      });

      if (equation) {
        element.setAttribute("data-equation", equation.slice(0, 2_000));
        element.setAttribute("data-display", equationDisplay);
        element.textContent = equation;
      }
      if (element.tagName === "IMG") {
        if (!imageSource || !SAFE_IMAGE_SOURCE.test(imageSource)) {
          element.remove();
          return;
        }
        element.setAttribute("src", imageSource);
        element.setAttribute("alt", imageAlt?.slice(0, 240) || "Study image");
      }
    });

  return template.innerHTML;
}

function richTextToPlainText(value: string): string {
  if (typeof document === "undefined") return value.replace(/<[^>]*>/g, " ");
  const template = document.createElement("template");
  template.innerHTML = sanitizeRichHtml(value);
  template.content.querySelectorAll("[data-equation]").forEach((element) => {
    element.replaceWith(` ${element.getAttribute("data-equation") ?? "equation"} `);
  });
  template.content.querySelectorAll("img").forEach((element) => {
    element.replaceWith(` ${element.getAttribute("alt") ?? "Study image"} `);
  });
  template.content.querySelectorAll("br").forEach((element) => element.replaceWith("\n"));
  template.content.querySelectorAll("p,div,li,blockquote,pre").forEach((element) => {
    element.append("\n");
  });
  return (template.content.textContent ?? "").replace(/\s+/g, " ").trim();
}

function hasMeaningfulRichContent(value: string): boolean {
  if (richTextToPlainText(value).length > 0) return true;
  if (typeof document === "undefined") return false;
  const template = document.createElement("template");
  template.innerHTML = sanitizeRichHtml(value);
  return Boolean(template.content.querySelector("img,[data-equation]"));
}

function renderRichHtml(value: string): string {
  if (typeof document === "undefined") return value;
  const template = document.createElement("template");
  template.innerHTML = sanitizeRichHtml(value);
  template.content.querySelectorAll<HTMLElement>("[data-equation]").forEach((element) => {
    const equation = element.getAttribute("data-equation") ?? "";
    const displayMode = element.getAttribute("data-display") === "block";
    element.className = displayMode ? "rich-equation rich-equation-block" : "rich-equation";
    element.innerHTML = katex.renderToString(equation, {
      displayMode,
      throwOnError: false,
      strict: "ignore",
      trust: false,
    });
  });
  return template.innerHTML;
}

async function compressStudyImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("This image could not be opened."));
      image.src = objectUrl;
    });

    const maximumDimension = 1_400;
    const initialScale = Math.min(
      1,
      maximumDimension / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    let dataUrl = "";
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const scale = initialScale * 0.82 ** attempt;
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image processing is unavailable.");
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      dataUrl = canvas.toDataURL("image/webp", Math.max(0.55, 0.8 - attempt * 0.08));
      if (dataUrl.length <= 900_000) return dataUrl;
    }
    throw new Error("The image is still too large after compression. Crop it and try again.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function RichTextView({
  value,
  variant,
  className = "",
}: {
  value: string;
  variant: "question" | "answer";
  className?: string;
}) {
  const renderedHtml = useMemo(() => renderRichHtml(value), [value]);
  return (
    <div
      className={`rich-content ${variant === "question" ? "rich-question" : "rich-answer"} ${className}`}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}

function RichTextEditor({
  value,
  onChange,
  variant,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  variant: "question" | "answer";
  placeholder: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [showEquation, setShowEquation] = useState(false);
  const [equation, setEquation] = useState("");
  const [equationDisplay, setEquationDisplay] = useState<"inline" | "block">("block");
  const [editorError, setEditorError] = useState("");

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor) return;
    const cleanValue = sanitizeRichHtml(value);
    if (editor.innerHTML !== cleanValue) editor.innerHTML = cleanValue;
  }, [value]);

  function rememberSelection() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
    }
  }

  function restoreSelection() {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    if (savedRangeRef.current) {
      selection?.addRange(savedRangeRef.current);
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection?.addRange(range);
  }

  function syncEditorValue(sanitize = false) {
    const editor = editorRef.current;
    if (!editor) return;
    const nextValue = sanitize ? sanitizeRichHtml(editor.innerHTML) : editor.innerHTML;
    if (sanitize && editor.innerHTML !== nextValue) editor.innerHTML = nextValue;
    onChange(nextValue);
  }

  function runCommand(command: string) {
    restoreSelection();
    document.execCommand(command, false);
    rememberSelection();
    syncEditorValue();
  }

  function insertHtmlAtSelection(html: string) {
    restoreSelection();
    document.execCommand("insertHTML", false, html);
    rememberSelection();
    syncEditorValue();
  }

  async function insertImages(files: File[]) {
    setEditorError("");
    for (const file of files) {
      try {
        const dataUrl = await compressStudyImage(file);
        const image = document.createElement("img");
        image.src = dataUrl;
        image.alt = file.name || "Study image";
        insertHtmlAtSelection(`<p>${image.outerHTML}</p>`);
      } catch (error) {
        setEditorError(error instanceof Error ? error.message : "The image could not be inserted.");
        break;
      }
    }
  }

  function insertEquation() {
    const cleanEquation = equation.trim();
    if (!cleanEquation) return;
    const holder = document.createElement("span");
    holder.setAttribute("data-equation", cleanEquation);
    holder.setAttribute("data-display", equationDisplay);
    holder.textContent = cleanEquation;
    insertHtmlAtSelection(equationDisplay === "block" ? `<p>${holder.outerHTML}</p>` : holder.outerHTML);
    setEquation("");
    setShowEquation(false);
  }

  const toolbarButton =
    "grid size-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-800 hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50";

  return (
    <div className="mt-2 overflow-hidden rounded-2xl border border-slate-800 bg-[#0b101a] transition focus-within:border-cyan-400/40 focus-within:ring-2 focus-within:ring-cyan-400/10">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-800 bg-slate-950/55 px-2 py-1.5" aria-label="Document formatting toolbar">
        <button type="button" title="Bold" aria-label="Bold" className={toolbarButton} onMouseDown={(event) => { event.preventDefault(); runCommand("bold"); }}><Bold className="size-4" /></button>
        <button type="button" title="Italic" aria-label="Italic" className={toolbarButton} onMouseDown={(event) => { event.preventDefault(); runCommand("italic"); }}><Italic className="size-4" /></button>
        <button type="button" title="Underline" aria-label="Underline" className={toolbarButton} onMouseDown={(event) => { event.preventDefault(); runCommand("underline"); }}><Underline className="size-4" /></button>
        <span className="mx-1 h-5 w-px bg-slate-800" />
        <button type="button" title="Bulleted list" aria-label="Bulleted list" className={toolbarButton} onMouseDown={(event) => { event.preventDefault(); runCommand("insertUnorderedList"); }}><List className="size-4" /></button>
        <button type="button" title="Numbered list" aria-label="Numbered list" className={toolbarButton} onMouseDown={(event) => { event.preventDefault(); runCommand("insertOrderedList"); }}><ListOrdered className="size-4" /></button>
        <button type="button" title="Decrease indent" aria-label="Decrease indent" className={toolbarButton} onMouseDown={(event) => { event.preventDefault(); runCommand("outdent"); }}><IndentDecrease className="size-4" /></button>
        <button type="button" title="Increase indent" aria-label="Increase indent" className={toolbarButton} onMouseDown={(event) => { event.preventDefault(); runCommand("indent"); }}><IndentIncrease className="size-4" /></button>
        <span className="mx-1 h-5 w-px bg-slate-800" />
        <button
          type="button"
          title="Insert equation"
          aria-label="Insert equation"
          className={toolbarButton}
          onMouseDown={(event) => {
            event.preventDefault();
            rememberSelection();
            setShowEquation((current) => !current);
          }}
        >
          <Sigma className="size-4" />
        </button>
        <button
          type="button"
          title="Insert picture"
          aria-label="Insert picture"
          className={toolbarButton}
          onMouseDown={(event) => {
            event.preventDefault();
            rememberSelection();
            imageInputRef.current?.click();
          }}
        >
          <ImagePlus className="size-4" />
        </button>
        <span className="ml-auto px-2 text-[10px] text-slate-700">
          {variant === "question" ? "Nirmala UI · fixed" : "Answer style · fixed"}
        </span>
      </div>

      {showEquation && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-950/35 px-3 py-2.5">
          <span className="text-xs font-medium text-slate-500">LaTeX</span>
          <input
            autoFocus
            value={equation}
            onChange={(event) => setEquation(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                insertEquation();
              }
            }}
            placeholder="e.g. E = mc^2 or \\frac{a}{b}"
            className="min-w-56 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200 outline-none focus:border-cyan-400/50"
          />
          <select
            aria-label="Equation layout"
            value={equationDisplay}
            onChange={(event) => setEquationDisplay(event.target.value as "inline" | "block")}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-300 outline-none"
          >
            <option value="block">Display</option>
            <option value="inline">Inline</option>
          </select>
          <button type="button" onClick={insertEquation} className="rounded-lg bg-cyan-300 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-200">Insert</button>
        </div>
      )}

      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        suppressContentEditableWarning
        onInput={() => syncEditorValue()}
        onBlur={() => syncEditorValue(true)}
        onMouseUp={rememberSelection}
        onKeyUp={rememberSelection}
        onFocus={rememberSelection}
        onPaste={(event) => {
          rememberSelection();
          const imageFiles = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
          if (imageFiles.length) {
            event.preventDefault();
            void insertImages(imageFiles);
            return;
          }
          event.preventDefault();
          const pastedHtml = event.clipboardData.getData("text/html");
          const pastedText = event.clipboardData.getData("text/plain");
          insertHtmlAtSelection(pastedHtml ? sanitizeRichHtml(pastedHtml) : plainTextToRichHtml(pastedText));
        }}
        className={`rich-editor rich-content min-h-44 max-h-[420px] overflow-y-auto px-4 py-3 text-sm leading-6 text-slate-200 outline-none ${variant === "question" ? "rich-question" : "rich-answer"}`}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) void insertImages(files);
        }}
      />
      {editorError && <p className="border-t border-rose-400/10 bg-rose-400/[0.04] px-3 py-2 text-xs text-rose-300/80">{editorError}</p>}
    </div>
  );
}

function calculateReviewStreak(activityDates: string[]): number {
  const reviewDates = new Set(activityDates);
  let cursor = getLocalDateKey();
  if (!reviewDates.has(cursor)) cursor = addDaysToDate(cursor, -1);

  let streak = 0;
  while (reviewDates.has(cursor)) {
    streak += 1;
    cursor = addDaysToDate(cursor, -1);
  }
  return streak;
}

interface MetricCardProps {
  label: string;
  value: string;
  detail: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  accent: "cyan" | "violet" | "amber";
}

const METRIC_ACCENTS = {
  cyan: {
    icon: "bg-cyan-400/10 text-cyan-300 ring-cyan-400/20",
    glow: "from-cyan-400/15",
  },
  violet: {
    icon: "bg-violet-400/10 text-violet-300 ring-violet-400/20",
    glow: "from-violet-400/15",
  },
  amber: {
    icon: "bg-amber-400/10 text-amber-300 ring-amber-400/20",
    glow: "from-amber-400/15",
  },
} as const;

function MetricCard({ label, value, detail, icon: Icon, accent }: MetricCardProps) {
  const styles = METRIC_ACCENTS[accent];

  return (
    <article className="group relative min-w-0 flex-1 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/65 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.22)] transition duration-300 hover:-translate-y-0.5 hover:border-slate-700">
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r ${styles.glow} via-transparent to-transparent`}
      />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            {label}
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-50">
            {value}
          </p>
          <p className="mt-1.5 text-sm text-slate-500">{detail}</p>
        </div>
        <span className={`grid size-10 place-items-center rounded-xl ring-1 ${styles.icon}`}>
          <Icon className="size-5" strokeWidth={1.8} />
        </span>
      </div>
    </article>
  );
}

interface SidebarProps {
  activeView: NavigationId;
  onNavigate: (view: NavigationId) => void;
}

function Sidebar({ activeView, onNavigate }: SidebarProps) {
  return (
    <aside className="flex h-screen w-72 shrink-0 flex-col border-r border-slate-800/90 bg-[#0b101a] px-4 py-5">
      <div className="flex items-center gap-3 px-2">
        <div className="grid size-10 place-items-center rounded-xl bg-cyan-400 text-slate-950 shadow-[0_0_28px_rgba(34,211,238,0.22)]">
          <Layers3 className="size-5" strokeWidth={2.2} />
        </div>
        <div>
          <p className="text-sm font-semibold tracking-tight text-slate-100">Recall OS</p>
          <p className="text-xs text-slate-500">Active learning workspace</p>
        </div>
      </div>

      <div className="my-6 h-px bg-slate-800/80" />

      <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
        Workspace
      </p>
      <nav className="mt-2 space-y-1" aria-label="Primary navigation">
        {NAVIGATION.map(({ id, label, icon: Icon }) => {
          const active = activeView === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 ${
                active
                  ? "bg-slate-800/80 text-slate-50 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.08)]"
                  : "text-slate-500 hover:bg-slate-900 hover:text-slate-200"
              }`}
            >
              <Icon
                className={`size-[18px] transition ${
                  active ? "text-cyan-300" : "text-slate-600 group-hover:text-slate-400"
                }`}
                strokeWidth={1.8}
              />
              <span>{label}</span>
              {active && <span className="ml-auto size-1.5 rounded-full bg-cyan-300" />}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
          <CheckCircle2 className="size-4 text-emerald-400" strokeWidth={1.8} />
          Local-first storage
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-600">
          Your study data stays on this device. Recall OS is digitally signed by its owner.
        </p>
        <p className="mt-3 border-t border-slate-800 pt-3 text-[10px] leading-4 text-slate-700">
          © 2026 {COPYRIGHT_OWNER}. All rights reserved.
        </p>
      </div>
    </aside>
  );
}

interface CourseHeaderProps {
  activeCourse: CourseCode;
  courses: CourseCode[];
  onCourseChange: (course: CourseCode) => void;
  onManageCourses: () => void;
}

function CourseHeader({
  activeCourse,
  courses,
  onCourseChange,
  onManageCourses,
}: CourseHeaderProps) {
  const formattedDate = new Intl.DateTimeFormat("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <header className="flex flex-wrap items-center justify-between gap-5 border-b border-slate-800/80 px-8 py-5 lg:px-10">
      <div>
        <p className="text-xs font-medium text-slate-500">{formattedDate}</p>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-100">
          Focus dashboard
        </h1>
      </div>

      <div className="flex flex-wrap items-center gap-2" aria-label="Select active course">
        <span className="mr-1 text-xs font-medium text-slate-600">Active course</span>
        {courses.map((course) => {
          const active = course === activeCourse;
          return (
            <button
              key={course}
              type="button"
              aria-pressed={active}
              onClick={() => onCourseChange(course)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold tracking-wide transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 ${
                active
                  ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200 shadow-[0_0_20px_rgba(34,211,238,0.08)]"
                  : "border-slate-800 bg-slate-950/50 text-slate-500 hover:border-slate-700 hover:text-slate-300"
              }`}
            >
              {course}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onManageCourses}
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-slate-700 bg-slate-950/40 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:border-cyan-400/30 hover:text-cyan-300"
        >
          <Plus className="size-3.5" /> {courses.length ? "Manage" : "Add a course"}
        </button>
      </div>
    </header>
  );
}

interface DailyPracticeProps {
  questions: Question[];
  courses: CourseCode[];
  setQuestions: Dispatch<SetStateAction<Question[]>>;
  activityDates: string[];
  setActivityDates: Dispatch<SetStateAction<string[]>>;
  activeCourse: CourseCode;
}

type PracticeMode = "scheduled" | "retake" | "challenge";

function CourseForgettingCurves({
  questions,
  courses,
}: {
  questions: Question[];
  courses: CourseCode[];
}) {
  const today = getLocalDateKey();

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-300">Course forgetting curves</h3>
          <p className="mt-0.5 text-xs text-slate-600">
            A live memory snapshot based on level and review calendar.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-medium text-slate-600">
          <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-emerald-400" />Mastered</span>
          <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-amber-400" />Learning</span>
          <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-rose-400" />Due / at risk</span>
        </div>
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        {courses.map((course) => {
          const courseQuestions = questions.filter((question) => question.course === course);
          const atRisk = courseQuestions.filter(
            (question) => question.level <= 2 || question.nextReviewDate <= today,
          ).length;
          const mastered = courseQuestions.filter(
            (question) => question.level >= 4 && question.nextReviewDate > today,
          ).length;
          const learning = Math.max(0, courseQuestions.length - atRisk - mastered);
          const percentage = (count: number) =>
            courseQuestions.length ? `${(count / courseQuestions.length) * 100}%` : "0%";
          const nextDate = courseQuestions
            .map((question) => question.nextReviewDate)
            .filter(Boolean)
            .sort()[0];

          return (
            <article key={course} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-300">{course}</p>
                  <p className="mt-1 text-[11px] text-slate-600">
                    {courseQuestions.length} memor{courseQuestions.length === 1 ? "y" : "ies"}
                  </p>
                </div>
                <Brain className="size-4 text-slate-600" strokeWidth={1.7} />
              </div>
              <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-slate-800">
                <span className="bg-emerald-400 transition-all" style={{ width: percentage(mastered) }} />
                <span className="bg-amber-400 transition-all" style={{ width: percentage(learning) }} />
                <span className="bg-rose-400 transition-all" style={{ width: percentage(atRisk) }} />
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px]">
                <span className="text-slate-600">{mastered} mastered · {atRisk} at risk</span>
                <span className="flex items-center gap-1 text-slate-500">
                  <CalendarCheck2 className="size-3.5" />
                  {nextDate ? formatDate(nextDate) : "No review date"}
                </span>
              </div>
            </article>
          );
        })}
        {!courses.length && (
          <div className="xl:col-span-3 rounded-2xl border border-dashed border-slate-800 bg-slate-950/35 px-5 py-8 text-center text-sm text-slate-600">
            Add a course to begin tracking its forgetting curve.
          </div>
        )}
      </div>
    </section>
  );
}

const RATING_STYLES = {
  rose: "border-rose-400/20 bg-rose-400/[0.06] text-rose-300 hover:border-rose-400/40 hover:bg-rose-400/10",
  orange: "border-orange-400/20 bg-orange-400/[0.06] text-orange-300 hover:border-orange-400/40 hover:bg-orange-400/10",
  amber: "border-amber-400/20 bg-amber-400/[0.06] text-amber-300 hover:border-amber-400/40 hover:bg-amber-400/10",
  emerald: "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300 hover:border-emerald-400/40 hover:bg-emerald-400/10",
  cyan: "border-cyan-400/20 bg-cyan-400/[0.06] text-cyan-300 hover:border-cyan-400/40 hover:bg-cyan-400/10",
} as const;

function ScopeProgressCard({
  label,
  name,
  questions,
  today,
  accent,
}: {
  label: string;
  name: string;
  questions: Question[];
  today: string;
  accent: "cyan" | "violet";
}) {
  const mastered = questions.filter((question) => question.level >= 4).length;
  const due = questions.filter((question) => question.nextReviewDate <= today).length;
  const masteryPercent = questions.length
    ? Math.round((mastered / questions.length) * 100)
    : 0;
  const accentStyles =
    accent === "cyan"
      ? {
          border: "border-cyan-400/15",
          label: "text-cyan-300/70",
          bar: "from-cyan-400 to-sky-400",
        }
      : {
          border: "border-violet-400/15",
          label: "text-violet-300/70",
          bar: "from-violet-400 to-fuchsia-400",
        };

  return (
    <article
      data-scope-progress={label.toLowerCase()}
      className={`rounded-2xl border ${accentStyles.border} bg-slate-950/55 p-4 text-left`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${accentStyles.label}`}>
            {label} progress
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-200">{name}</p>
        </div>
        <span className="shrink-0 text-lg font-semibold text-slate-100">{masteryPercent}%</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${accentStyles.bar} transition-all duration-500`}
          style={{ width: `${masteryPercent}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-slate-600">
        <span>{mastered} of {questions.length} mastered</span>
        <span>{due} due today</span>
      </div>
    </article>
  );
}

const RETENTION_STABILITY_DAYS: Record<RecallLevel, number> = {
  1: 0.5,
  2: 1,
  3: 3,
  4: 7,
  5: 14,
};
const MILLISECONDS_PER_DAY = 86_400_000;

function retentionAfterDays(daysElapsed: number, level: RecallLevel): number {
  const stability = RETENTION_STABILITY_DAYS[level];
  const decayConstant = stability / -Math.log(0.8);
  return Math.max(40, 100 * Math.exp(-Math.max(0, daysElapsed) / decayConstant));
}

function QuestionForgettingCurve({ question }: { question: Question }) {
  const chartWidth = 800;
  const chartHeight = 300;
  const padding = { top: 38, right: 24, bottom: 46, left: 54 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;
  const addedTime = parseStudyTimestamp(question.addedAt);
  const safeAddedTime = Number.isFinite(addedTime) ? addedTime : Date.now();
  const events = [
    {
      reviewedAt: question.addedAt,
      time: safeAddedTime,
      level: 1 as RecallLevel,
      label: "First learned",
    },
    ...question.reviewHistory
      .map((attempt, index) => ({
        reviewedAt: attempt.reviewedAt,
        time: parseStudyTimestamp(attempt.reviewedAt),
        level: attempt.level,
        label: `Review ${index + 1} · Level ${attempt.level}`,
      }))
      .filter((event) => Number.isFinite(event.time) && event.time >= safeAddedTime),
  ].sort((left, right) => left.time - right.time);
  const todayTime = parseStudyTimestamp(getLocalDateKey());
  const nextReviewTime = parseStudyTimestamp(question.nextReviewDate);
  const latestEventTime = events.at(-1)?.time ?? safeAddedTime;
  const endTime = Math.max(
    safeAddedTime + MILLISECONDS_PER_DAY,
    todayTime,
    Number.isFinite(nextReviewTime) ? nextReviewTime : safeAddedTime,
    latestEventTime + MILLISECONDS_PER_DAY,
  );
  const totalDays = Math.max(
    1,
    Math.ceil((endTime - safeAddedTime) / MILLISECONDS_PER_DAY),
  );
  const xPosition = (day: number) =>
    padding.left + (Math.min(totalDays, Math.max(0, day)) / totalDays) * plotWidth;
  const yPosition = (retention: number) =>
    padding.top + ((100 - Math.min(100, Math.max(40, retention))) / 60) * plotHeight;
  const dayForTime = (time: number) => (time - safeAddedTime) / MILLISECONDS_PER_DAY;
  const pointPairs: Array<[number, number]> = [];

  events.forEach((event, index) => {
    const startDay = Math.max(0, dayForTime(event.time));
    const endDay = Math.min(
      totalDays,
      index + 1 < events.length ? dayForTime(events[index + 1].time) : totalDays,
    );
    const step = Math.max(0.08, totalDays / 140);
    pointPairs.push([xPosition(startDay), yPosition(100)]);
    for (let day = startDay + step; day < endDay; day += step) {
      pointPairs.push([
        xPosition(day),
        yPosition(retentionAfterDays(day - startDay, event.level)),
      ]);
    }
    pointPairs.push([
      xPosition(endDay),
      yPosition(retentionAfterDays(endDay - startDay, event.level)),
    ]);
  });

  const tickStep = totalDays <= 7 ? 1 : Math.max(1, Math.ceil(totalDays / 7));
  const dayTicks: number[] = [];
  for (let day = 0; day <= totalDays; day += tickStep) dayTicks.push(day);
  if (dayTicks.at(-1) !== totalDays) dayTicks.push(totalDays);
  const latestPastEvent = [...events]
    .reverse()
    .find((event) => event.time <= todayTime) ?? events[0];
  const currentRetention = Math.round(
    retentionAfterDays(
      (todayTime - latestPastEvent.time) / MILLISECONDS_PER_DAY,
      latestPastEvent.level,
    ),
  );
  const recordedAttempts = question.reviewHistory.length;

  return (
    <div data-testid="question-forgetting-curve" className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-200">Estimated retention curve</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Reviews reset retention to 100%; stronger ratings slow the next decay.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-xl border border-violet-400/15 bg-violet-400/[0.06] px-3 py-2 text-xs text-violet-200">
            {question.reviewCount} attempt{question.reviewCount === 1 ? "" : "s"}
          </span>
          <span className="rounded-xl border border-cyan-400/15 bg-cyan-400/[0.06] px-3 py-2 text-xs text-cyan-200">
            ~{currentRetention}% today
          </span>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          role="img"
          aria-label={`Estimated forgetting curve for ${richTextToPlainText(question.question)}`}
          className="min-w-[620px] w-full"
        >
          <defs>
            <linearGradient id={`curve-${question.id.replace(/[^a-zA-Z0-9]/g, "")}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="100%" stopColor="#a78bfa" />
            </linearGradient>
          </defs>
          {[100, 80, 60, 40].map((retention) => (
            <g key={retention}>
              <line
                x1={padding.left}
                x2={chartWidth - padding.right}
                y1={yPosition(retention)}
                y2={yPosition(retention)}
                stroke={retention === 80 ? "#f59e0b" : "#1e293b"}
                strokeDasharray={retention === 80 ? "5 6" : undefined}
                strokeOpacity={retention === 80 ? 0.45 : 0.85}
              />
              <text x={padding.left - 10} y={yPosition(retention) + 4} textAnchor="end" fill="#64748b" fontSize="11">
                {retention}%
              </text>
            </g>
          ))}
          {dayTicks.map((day) => (
            <g key={day}>
              <line
                x1={xPosition(day)}
                x2={xPosition(day)}
                y1={padding.top}
                y2={chartHeight - padding.bottom}
                stroke="#1e293b"
                strokeOpacity="0.55"
              />
              <text x={xPosition(day)} y={chartHeight - 21} textAnchor="middle" fill="#64748b" fontSize="11">
                {day}
              </text>
            </g>
          ))}
          <text x={18} y={chartHeight / 2} textAnchor="middle" fill="#64748b" fontSize="11" transform={`rotate(-90 18 ${chartHeight / 2})`}>
            Estimated retention
          </text>
          <text x={padding.left + plotWidth / 2} y={chartHeight - 3} textAnchor="middle" fill="#64748b" fontSize="11">
            Days since first learned
          </text>
          <polyline
            points={pointPairs.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ")}
            fill="none"
            stroke={`url(#curve-${question.id.replace(/[^a-zA-Z0-9]/g, "")})`}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {events.map((event, index) => {
            const x = xPosition(dayForTime(event.time));
            return (
              <g key={`${event.reviewedAt}-${index}`}>
                <line x1={x} x2={x} y1={padding.top} y2={chartHeight - padding.bottom} stroke="#22d3ee" strokeWidth="1.5" strokeDasharray="4 5" strokeOpacity="0.6" />
                <circle cx={x} cy={yPosition(100)} r="5" fill={index === 0 ? "#f59e0b" : "#22d3ee"} stroke="#0f172a" strokeWidth="2">
                  <title>{event.label} · {formatReviewTimestamp(event.reviewedAt)}</title>
                </circle>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-600">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-amber-400" />First learned</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-cyan-400" />Recorded review</span>
          <span className="flex items-center gap-1.5"><span className="h-px w-4 border-t border-dashed border-amber-400/60" />80% review threshold</span>
        </div>
        <span>
          {recordedAttempts} of {question.reviewCount} attempt{question.reviewCount === 1 ? "" : "s"} timestamped
        </span>
      </div>
      <p className="mt-3 text-[10px] leading-4 text-slate-700">
        This is a study estimate derived from your review ratings and schedule, not a direct measurement of memory.
      </p>
    </div>
  );
}

function DailyPractice({
  questions,
  courses,
  setQuestions,
  activityDates,
  setActivityDates,
  activeCourse,
}: DailyPracticeProps) {
  const [practiceMode, setPracticeMode] = useState<PracticeMode>("scheduled");
  const [selectedChapter, setSelectedChapter] = useState("");
  const [selectedSubchapter, setSelectedSubchapter] = useState("");
  const [queueIds, setQueueIds] = useState<string[]>([]);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [sessionActive, setSessionActive] = useState(false);
  const [answerVisible, setAnswerVisible] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);

  const courseQuestions = useMemo(
    () => questions.filter((question) => question.course === activeCourse),
    [activeCourse, questions],
  );
  const today = getLocalDateKey();
  const chapterOptions = useMemo(
    () =>
      Array.from(
        new Set(
          courseQuestions
            .map((question) => question.chapter.trim())
            .filter(Boolean),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [courseQuestions],
  );
  const subchapterOptions = useMemo(
    () =>
      selectedChapter
        ? Array.from(
            new Set(
              courseQuestions
                .filter((question) => question.chapter === selectedChapter)
                .map((question) => question.subchapter.trim())
                .filter(Boolean),
            ),
          ).sort((left, right) => left.localeCompare(right))
        : [],
    [courseQuestions, selectedChapter],
  );
  const selectedChapterQuestions = useMemo(
    () =>
      selectedChapter
        ? courseQuestions.filter((question) => question.chapter === selectedChapter)
        : [],
    [courseQuestions, selectedChapter],
  );
  const selectedSubchapterQuestions = useMemo(
    () =>
      selectedChapter && selectedSubchapter
        ? selectedChapterQuestions.filter(
            (question) => question.subchapter === selectedSubchapter,
          )
        : [],
    [selectedChapter, selectedChapterQuestions, selectedSubchapter],
  );
  const dueToday = courseQuestions.filter(
    (question) => question.nextReviewDate <= today,
  ).length;
  const masteredCount = courseQuestions.filter((question) => question.level >= 4).length;
  const masteryRate = courseQuestions.length
    ? Math.round((masteredCount / courseQuestions.length) * 100)
    : 0;
  const reviewStreak = calculateReviewStreak(activityDates);
  const sessionQuestions = useMemo(() => {
    const candidates =
      practiceMode === "challenge"
        ? [...questions]
        : [...selectedSubchapterQuestions];
    return candidates
      .filter(
        (question) =>
          practiceMode !== "scheduled" || question.nextReviewDate <= today,
      )
      .sort(
        (left, right) =>
          left.nextReviewDate.localeCompare(right.nextReviewDate) ||
          left.addedAt.localeCompare(right.addedAt) ||
          left.course.localeCompare(right.course) ||
          left.chapter.localeCompare(right.chapter) ||
          left.subchapter.localeCompare(right.subchapter) ||
          left.id.localeCompare(right.id),
      );
  }, [practiceMode, questions, selectedSubchapterQuestions, today]);
  const currentQuestion = questions.find((question) => question.id === queueIds[0]);
  const scopeSelected =
    practiceMode === "challenge" || Boolean(selectedChapter && selectedSubchapter);
  const sessionCompletedCount = Math.max(0, sessionTotal - queueIds.length);
  const sessionScopeLabel =
    practiceMode === "challenge"
      ? "All courses challenge"
      : `${selectedChapter} · ${selectedSubchapter}`;

  useEffect(() => {
    setSelectedChapter("");
    setSelectedSubchapter("");
    setSessionActive(false);
    setSessionComplete(false);
    setQueueIds([]);
    setAnswerVisible(false);
  }, [activeCourse]);

  useEffect(() => {
    if (selectedChapter && !chapterOptions.includes(selectedChapter)) {
      setSelectedChapter("");
      setSelectedSubchapter("");
    }
  }, [chapterOptions, selectedChapter]);

  useEffect(() => {
    if (selectedSubchapter && !subchapterOptions.includes(selectedSubchapter)) {
      setSelectedSubchapter("");
    }
  }, [selectedSubchapter, subchapterOptions]);

  useEffect(() => {
    setSessionActive(false);
    setSessionComplete(false);
    setSessionTotal(0);
    setQueueIds([]);
    setAnswerVisible(false);
  }, [practiceMode, selectedChapter, selectedSubchapter]);

  function startSession() {
    if (!scopeSelected || sessionQuestions.length === 0) return;
    const nextQueue = sessionQuestions.map((question) => question.id);
    setQueueIds(nextQueue);
    setSessionTotal(nextQueue.length);
    setAnswerVisible(false);
    setSessionActive(nextQueue.length > 0);
    setSessionComplete(nextQueue.length === 0);
  }

  function rateCurrentQuestion(level: Question["level"], intervalDays: number) {
    if (!currentQuestion) return;
    const nextReviewDate = addDaysToDate(today, intervalDays);
    const reviewedAt = new Date().toISOString();
    setQuestions((currentQuestions) =>
      currentQuestions.map((question) =>
        question.id === currentQuestion.id
          ? {
              ...question,
              level,
              lastReviewed: today,
              nextReviewDate,
              reviewCount: question.reviewCount + 1,
              reviewHistory: [
                ...question.reviewHistory,
                { reviewedAt, level, nextReviewDate },
              ],
            }
          : question,
      ),
    );
    setActivityDates((currentDates) =>
      currentDates.includes(today) ? currentDates : [...currentDates, today].sort(),
    );

    const remainingQueue = queueIds.slice(1);
    if (level === 1) remainingQueue.push(currentQuestion.id);
    setQueueIds(remainingQueue);
    setAnswerVisible(false);
    if (remainingQueue.length === 0) {
      setSessionActive(false);
      setSessionComplete(true);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-9 lg:px-10 lg:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-cyan-300">
            <Sparkles className="size-4" strokeWidth={1.8} />
            Today’s focus
          </div>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-50">
            Daily practice
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Strengthen recall through focused reviews scheduled at the right moment.
          </p>
        </div>
        <div className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-500">
          {activeCourse || "No course selected"} · {courseQuestions.length} question
          {courseQuestions.length === 1 ? "" : "s"}
        </div>
      </div>

      <section className="mt-8 flex flex-wrap gap-4" aria-label="Practice metrics">
        <MetricCard
          label="Due today"
          value={String(dueToday).padStart(2, "0")}
          detail="Ready for active recall"
          icon={CalendarDays}
          accent="cyan"
        />
        <MetricCard
          label="Mastery rate"
          value={`${masteryRate}%`}
          detail={`${masteredCount} at level 4 or 5`}
          icon={BarChart3}
          accent="violet"
        />
        <MetricCard
          label="Review streak"
          value={`${reviewStreak} day${reviewStreak === 1 ? "" : "s"}`}
          detail="Consecutive calendar activity"
          icon={Flame}
          accent="amber"
        />
      </section>

      <CourseForgettingCurves questions={questions} courses={courses} />

      <section className="relative mt-6 overflow-hidden rounded-3xl border border-slate-800 bg-[#0f172a] px-8 py-10 shadow-[0_30px_90px_rgba(0,0,0,0.3)] sm:px-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-32 size-80 rounded-full bg-cyan-400/[0.07] blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-36 left-1/3 size-72 rounded-full bg-violet-500/[0.06] blur-3xl"
        />

        {!sessionActive && !sessionComplete && (
          <div className="relative mx-auto flex max-w-2xl flex-col items-center text-center">
            <div className="grid size-16 place-items-center rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.08] text-cyan-300 shadow-[0_0_40px_rgba(34,211,238,0.1)]">
              <Zap className="size-7" strokeWidth={1.7} />
            </div>
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/80">
              Recall queue ready
            </p>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
              Turn what you studied into knowledge you can retrieve.
            </h3>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">
              Scheduled practice remains the default. You can also deliberately retake a
              subchapter or start an optional challenge across your full question library.
            </p>
            <div className="mt-6 grid w-full gap-2 text-left sm:grid-cols-3" aria-label="Choose practice mode">
              {[
                {
                  id: "scheduled" as PracticeMode,
                  label: "Scheduled",
                  detail: "Only questions due now",
                  icon: CalendarDays,
                },
                {
                  id: "retake" as PracticeMode,
                  label: "Intentional retake",
                  detail: "Repeat one subchapter",
                  icon: RotateCcw,
                },
                {
                  id: "challenge" as PracticeMode,
                  label: "All-courses challenge",
                  detail: "Every question, optional",
                  icon: Trophy,
                },
              ].map(({ id, label, detail, icon: Icon }) => {
                const active = practiceMode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    data-practice-mode={id}
                    onClick={() => setPracticeMode(id)}
                    className={`rounded-2xl border p-3.5 transition ${
                      active
                        ? "border-cyan-400/30 bg-cyan-400/[0.08] text-cyan-100"
                        : "border-slate-800 bg-slate-950/45 text-slate-500 hover:border-slate-700 hover:text-slate-300"
                    }`}
                  >
                    <span className="flex items-center gap-2 text-xs font-semibold">
                      <Icon className={`size-4 ${active ? "text-cyan-300" : "text-slate-600"}`} />
                      {label}
                    </span>
                    <span className="mt-1.5 block text-[10px] leading-4 opacity-65">{detail}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 max-w-xl text-xs leading-5 text-slate-600">
              {practiceMode === "scheduled" &&
                "Choose a chapter and subchapter. The oldest due memory is always shown first."}
              {practiceMode === "retake" &&
                "Choose a chapter and subchapter to repeat every question now. Your ratings will update their next review dates."}
              {practiceMode === "challenge" &&
                "All questions from all courses will be included. Ratings still update each question’s normal review schedule."}
            </p>
            <div className="mt-6 flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/50 px-3 py-1.5 text-xs text-slate-500">
              <BookOpen className="size-3.5 text-cyan-300/70" />
              {practiceMode === "challenge" ? (
                <>Scope: <span className="font-semibold text-slate-300">All courses · {questions.length} questions</span></>
              ) : (
                <>Course: <span className="font-semibold text-slate-300">{activeCourse || "Choose a course above"}</span></>
              )}
            </div>
            {practiceMode !== "challenge" && (
              <div className="mt-5 grid w-full gap-3 text-left sm:grid-cols-2" aria-label="Practice scope selector">
                <label className="block">
                  <span className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    <span className="grid size-5 place-items-center rounded-full bg-cyan-400/10 text-[10px] text-cyan-300">1</span>
                    Chapter
                  </span>
                  <select
                    aria-label="Choose practice chapter"
                    value={selectedChapter}
                    onChange={(event) => {
                      setSelectedChapter(event.target.value);
                      setSelectedSubchapter("");
                    }}
                    disabled={!activeCourse || chapterOptions.length === 0}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-sm text-slate-200 outline-none transition focus:border-cyan-400/50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">Choose a chapter</option>
                    {chapterOptions.map((chapter) => (
                      <option key={chapter} value={chapter}>{chapter}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    <span className="grid size-5 place-items-center rounded-full bg-violet-400/10 text-[10px] text-violet-300">2</span>
                    Subchapter
                  </span>
                  <select
                    aria-label="Choose practice subchapter"
                    value={selectedSubchapter}
                    onChange={(event) => setSelectedSubchapter(event.target.value)}
                    disabled={!selectedChapter || subchapterOptions.length === 0}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-sm text-slate-200 outline-none transition focus:border-violet-400/50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">Choose a subchapter</option>
                    {subchapterOptions.map((subchapter) => (
                      <option key={subchapter} value={subchapter}>{subchapter}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {practiceMode !== "challenge" && selectedChapter && (
              <div className={`mt-4 grid w-full gap-3 ${selectedSubchapter ? "sm:grid-cols-2" : ""}`}>
                <ScopeProgressCard
                  label="Chapter"
                  name={selectedChapter}
                  questions={selectedChapterQuestions}
                  today={today}
                  accent="cyan"
                />
                {selectedSubchapter && (
                  <ScopeProgressCard
                    label="Subchapter"
                    name={selectedSubchapter}
                    questions={selectedSubchapterQuestions}
                    today={today}
                    accent="violet"
                  />
                )}
              </div>
            )}
            {practiceMode === "challenge" && (
              <div className="mt-4 w-full">
                <ScopeProgressCard
                  label="All courses"
                  name="Full question library"
                  questions={questions}
                  today={today}
                  accent="violet"
                />
              </div>
            )}
            {practiceMode !== "challenge" && !chapterOptions.length && activeCourse && (
              <p className="mt-4 text-xs text-amber-300/80">
                This course has no questions yet. Add one in Question Bank to begin.
              </p>
            )}
            {practiceMode === "scheduled" && scopeSelected && sessionQuestions.length === 0 && (
              <p className="mt-4 flex items-center gap-2 text-xs text-emerald-300/80">
                <CheckCircle2 className="size-4" /> This subchapter is all caught up for {formatDate(today)}.
              </p>
            )}
            <button
              type="button"
              data-testid="start-practice-session"
              onClick={startSession}
              disabled={!scopeSelected || sessionQuestions.length === 0}
              className="group mt-7 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_12px_35px_rgba(248,250,252,0.12)] transition hover:bg-cyan-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-600 disabled:shadow-none"
            >
              {practiceMode === "scheduled" && "Start Scheduled Session"}
              {practiceMode === "retake" && "Start Intentional Retake"}
              {practiceMode === "challenge" && "Start All-Courses Challenge"}
              <span className="rounded-md bg-slate-950/10 px-1.5 py-0.5 text-xs">{sessionQuestions.length}</span>
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        )}

        {sessionComplete && (
          <div className="relative mx-auto flex max-w-2xl flex-col items-center py-5 text-center">
            <div className="grid size-16 place-items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 shadow-[0_0_50px_rgba(52,211,153,0.12)]">
              <Trophy className="size-7" strokeWidth={1.7} />
            </div>
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/80">Session complete</p>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
              {practiceMode === "challenge"
                ? "All-Courses Challenge Complete!"
                : practiceMode === "retake"
                  ? "Intentional Retake Complete!"
                  : "Daily Recall Complete! All target memories reinforced."}
            </h3>
            <p className="mt-3 text-sm text-slate-500">
              {sessionTotal} question{sessionTotal === 1 ? "" : "s"} reviewed from {sessionScopeLabel}.
              Every rating has updated the normal review schedule.
            </p>
            {practiceMode === "challenge" ? (
              <div className="mt-5 w-full text-left">
                <ScopeProgressCard label="All courses" name="Full question library" questions={questions} today={today} accent="violet" />
              </div>
            ) : (
              <div className="mt-5 grid w-full gap-3 text-left sm:grid-cols-2">
                <ScopeProgressCard label="Chapter" name={selectedChapter} questions={selectedChapterQuestions} today={today} accent="cyan" />
                <ScopeProgressCard label="Subchapter" name={selectedSubchapter} questions={selectedSubchapterQuestions} today={today} accent="violet" />
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setSessionComplete(false);
                setSessionTotal(0);
              }}
              className="mt-7 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:border-slate-600 hover:bg-slate-800"
            >
              <RotateCcw className="size-4" /> Return to practice
            </button>
          </div>
        )}

        {sessionActive && currentQuestion && (
          <div className="relative mx-auto max-w-3xl">
            {practiceMode === "challenge" ? (
              <div className="mb-4">
                <ScopeProgressCard label="All courses" name="Full question library" questions={questions} today={today} accent="violet" />
              </div>
            ) : (
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <ScopeProgressCard label="Chapter" name={selectedChapter} questions={selectedChapterQuestions} today={today} accent="cyan" />
                <ScopeProgressCard label="Subchapter" name={selectedSubchapter} questions={selectedSubchapterQuestions} today={today} accent="violet" />
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-200">{currentQuestion.course}</span>
                <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-slate-400">{currentQuestion.chapter}</span>
                <span className="text-xs text-slate-600">{currentQuestion.subchapter}</span>
              </div>
              <span className="text-xs text-slate-600">{queueIds.length} remaining</span>
            </div>
            <div className="mt-4 h-1 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400 transition-all duration-500"
                style={{ width: `${sessionTotal ? (sessionCompletedCount / sessionTotal) * 100 : 0}%` }}
              />
            </div>

            <div className="mt-5 rounded-3xl border border-white/[0.08] bg-white/[0.025] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_80px_rgba(0,0,0,0.25)] backdrop-blur-xl sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-600">
                <span className="flex items-center gap-1.5"><CalendarPlus className="size-3.5" />Added {formatDate(currentQuestion.addedAt)}</span>
                <span className="flex items-center gap-1.5 text-violet-300/70"><RotateCcw className="size-3.5" />{currentQuestion.reviewCount} attempt{currentQuestion.reviewCount === 1 ? "" : "s"}</span>
                <span className="flex items-center gap-1.5"><CalendarCheck2 className="size-3.5" />Due {formatDate(currentQuestion.nextReviewDate)}</span>
              </div>
              <p className="mt-7 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300/70">Question</p>
              <div data-testid="practice-question">
                <RichTextView
                  value={currentQuestion.question}
                  variant="question"
                  className="mt-3 text-xl font-medium leading-8 tracking-tight text-slate-100 sm:text-2xl"
                />
              </div>

              {!answerVisible ? (
                <button
                  type="button"
                  onClick={() => setAnswerVisible(true)}
                  className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                >
                  <Eye className="size-4" /> Show Answer
                </button>
              ) : (
                <div className="mt-7 border-t border-slate-800 pt-7 transition-all duration-500">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/70">Answer</p>
                  <RichTextView
                    value={currentQuestion.answer}
                    variant="answer"
                    className="mt-3 text-sm leading-7 text-slate-300"
                  />
                  {hasMeaningfulRichContent(currentQuestion.note) && (
                    <aside
                      data-testid="practice-note"
                      className="mt-5 rounded-2xl border border-amber-400/15 bg-amber-400/[0.045] p-4"
                    >
                      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300/80">
                        <StickyNote className="size-3.5" />
                        Extra note
                        <span className="font-normal normal-case tracking-normal text-amber-200/40">
                          Supporting context, not part of the answer
                        </span>
                      </p>
                      <RichTextView
                        value={currentQuestion.note}
                        variant="answer"
                        className="mt-3 text-sm leading-7 text-slate-300"
                      />
                    </aside>
                  )}
                  <div className="mt-7 grid gap-2 sm:grid-cols-5">
                    {REVIEW_LEVELS.map(({ level, label, days, color }) => {
                      const nextDate = addDaysToDate(today, days);
                      return (
                        <button
                          key={level}
                          type="button"
                          onClick={() => rateCurrentQuestion(level, days)}
                          className={`rounded-xl border px-2 py-3 text-center transition ${RATING_STYLES[color]}`}
                        >
                          <span className="block text-xs font-semibold">L{level} · {label}</span>
                          <span className="mt-1 block text-[10px] opacity-60">{days === 0 ? "Again today" : formatDate(nextDate)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

interface AddQuestionModalProps {
  activeCourse: CourseCode;
  courses: CourseCode[];
  questions: Question[];
  editingQuestion?: Question | null;
  onClose: () => void;
  onSave: (question: Question) => void;
}

function AddQuestionModal({
  activeCourse,
  courses,
  questions,
  editingQuestion,
  onClose,
  onSave,
}: AddQuestionModalProps) {
  const [course, setCourse] = useState<CourseCode>(
    editingQuestion?.course ?? activeCourse ?? courses[0] ?? "",
  );
  const [chapter, setChapter] = useState(editingQuestion?.chapter ?? "");
  const [subchapter, setSubchapter] = useState(editingQuestion?.subchapter ?? "");
  const [questionText, setQuestionText] = useState(editingQuestion?.question ?? "");
  const [answerText, setAnswerText] = useState(editingQuestion?.answer ?? "");
  const [noteText, setNoteText] = useState(editingQuestion?.note ?? "");
  const [contentError, setContentError] = useState("");

  const existingChapters = useMemo(
    () =>
      Array.from(
        new Set(
          questions
            .filter((question) => question.course === course)
            .map((question) => question.chapter),
        ),
      ).sort(),
    [course, questions],
  );
  const existingSubchapters = useMemo(
    () =>
      Array.from(
        new Set(
          questions
            .filter(
              (question) =>
                question.course === course &&
                (!chapter.trim() || question.chapter === chapter.trim()),
            )
            .map((question) => question.subchapter),
        ),
      ).sort(),
    [chapter, course, questions],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanChapter = chapter.trim();
    const cleanSubchapter = subchapter.trim();
    const cleanQuestion = sanitizeRichHtml(questionText);
    const cleanAnswer = sanitizeRichHtml(answerText);
    const cleanNote = sanitizeRichHtml(noteText);
    if (!course || !cleanChapter || !cleanSubchapter) return;
    if (!hasMeaningfulRichContent(cleanQuestion) || !hasMeaningfulRichContent(cleanAnswer)) {
      setContentError("Add content to both the question and answer documents.");
      return;
    }
    setContentError("");

    const today = getLocalDateKey();
    if (editingQuestion) {
      onSave({
        ...editingQuestion,
        course,
        chapter: cleanChapter,
        subchapter: cleanSubchapter,
        question: cleanQuestion,
        answer: cleanAnswer,
        note: cleanNote,
      });
    } else {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `question-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      onSave({
        id,
        course,
        chapter: cleanChapter,
        subchapter: cleanSubchapter,
        question: cleanQuestion,
        answer: cleanAnswer,
        note: cleanNote,
        level: 1,
        addedAt: today,
        lastReviewed: today,
        nextReviewDate: today,
        reviewCount: 0,
        reviewHistory: [],
        contentVersion: 1,
      });
    }
    onClose();
  }

  const inputStyles =
    "mt-2 w-full rounded-xl border border-slate-800 bg-[#0b101a] px-3.5 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-700 focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/10";

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/80 px-5 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="question-editor-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-700/80 bg-[#0f172a] shadow-[0_32px_120px_rgba(0,0,0,0.6)]">
        <div className="flex items-start justify-between border-b border-slate-800 px-6 py-5 sm:px-7">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.17em] text-cyan-300">
              {editingQuestion ? <Pencil className="size-4" /> : <Plus className="size-4" />}
              {editingQuestion ? "Update recall prompt" : "New recall prompt"}
            </div>
            <h2 id="question-editor-title" className="mt-2 text-xl font-semibold text-slate-50">
              {editingQuestion ? "Edit question" : "Add a question"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {editingQuestion
                ? "Move it to the right course or refine any part of the prompt."
                : "Build a focused prompt with a clear, retrievable answer."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close question editor"
            className="grid size-9 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-800 hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
          >
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-6 sm:px-7">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-300">
              Course
              <select
                value={course}
                onChange={(event) => {
                  setCourse(event.target.value as CourseCode);
                  if (!editingQuestion) {
                    setChapter("");
                    setSubchapter("");
                  }
                }}
                className={inputStyles}
              >
                {courses.map((courseCode) => (
                  <option key={courseCode} value={courseCode}>
                    {courseCode}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-300">
              Chapter name
              <input
                required
                list="chapter-options"
                value={chapter}
                onChange={(event) => setChapter(event.target.value)}
                placeholder="e.g. Database design"
                className={inputStyles}
              />
              <datalist id="chapter-options">
                {existingChapters.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </label>
          </div>

          <label className="block text-sm font-medium text-slate-300">
            Subchapter name
            <input
              required
              list="subchapter-options"
              value={subchapter}
              onChange={(event) => setSubchapter(event.target.value)}
              placeholder="e.g. Third normal form"
              className={inputStyles}
            />
            <datalist id="subchapter-options">
              {existingSubchapters.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="text-sm font-medium text-slate-300">
              <span className="flex items-center justify-between gap-3">
                Question text
                <span className="flex items-center gap-1 text-[11px] font-normal text-slate-600">
                  <Code2 className="size-3.5" /> Nirmala UI · fixed
                </span>
              </span>
              <RichTextEditor
                value={questionText}
                onChange={setQuestionText}
                variant="question"
                placeholder="Write a precise active-recall prompt…"
              />
            </div>
            <div className="text-sm font-medium text-slate-300">
              <span className="flex items-center justify-between gap-3">
                Answer text
                <span className="flex items-center gap-1 text-[11px] font-normal text-slate-600">
                  <Code2 className="size-3.5" /> Answer style · fixed
                </span>
              </span>
              <RichTextEditor
                value={answerText}
                onChange={setAnswerText}
                variant="answer"
                placeholder="Write the ideal answer…"
              />
            </div>
          </div>

          <div className="text-sm font-medium text-slate-300">
            <span className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                Optional note
                <span className="rounded-full border border-amber-400/15 bg-amber-400/[0.05] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300/70">
                  Extra context
                </span>
              </span>
              <span className="text-[11px] font-normal text-slate-600">
                Shown separately after the answer
              </span>
            </span>
            <RichTextEditor
              value={noteText}
              onChange={setNoteText}
              variant="answer"
              placeholder="Add a helpful explanation, memory cue, related fact, equation, or picture (optional)…"
            />
          </div>

          {contentError && (
            <p className="rounded-xl border border-rose-400/15 bg-rose-400/[0.05] px-3.5 py-2.5 text-xs text-rose-300/80">
              {contentError}
            </p>
          )}

          <div className="flex items-center justify-between gap-4 border-t border-slate-800 pt-5">
            <p className="text-xs text-slate-600">
              {editingQuestion
                ? "Formatting, pictures, equations, review level, dates, and progress will be preserved."
                : "New questions begin at Level 1 and are due today. Pictures are compressed and stored with backups."}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                {editingQuestion ? <Pencil className="size-4" /> : <Plus className="size-4" />}
                {editingQuestion ? "Save changes" : "Add question"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

interface QuestionBankProps {
  activeCourse: CourseCode;
  courses: CourseCode[];
  questions: Question[];
  setQuestions: Dispatch<SetStateAction<Question[]>>;
  onManageCourses: () => void;
}

function QuestionBank({
  activeCourse,
  courses,
  questions,
  setQuestions,
  onManageCourses,
}: QuestionBankProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [courseFilter, setCourseFilter] = useState<"All courses" | CourseCode>(
    "All courses",
  );
  const [chapterFilter, setChapterFilter] = useState("All chapters");
  const [subchapterFilter, setSubchapterFilter] = useState("All subchapters");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const chapterOptions = useMemo(
    () =>
      Array.from(
        new Set(
          questions
            .filter(
              (question) =>
                courseFilter === "All courses" || question.course === courseFilter,
            )
            .map((question) => question.chapter),
        ),
      ).sort(),
    [courseFilter, questions],
  );
  const subchapterOptions = useMemo(
    () =>
      Array.from(
        new Set(
          questions
            .filter(
              (question) =>
                (courseFilter === "All courses" || question.course === courseFilter) &&
                (chapterFilter === "All chapters" ||
                  question.chapter === chapterFilter),
            )
            .map((question) => question.subchapter),
        ),
      ).sort(),
    [chapterFilter, courseFilter, questions],
  );

  const filteredQuestions = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return questions.filter((question) => {
      const matchesSearch =
        !normalizedSearch ||
        [
          richTextToPlainText(question.question),
          richTextToPlainText(question.answer),
          richTextToPlainText(question.note),
          question.chapter,
          question.subchapter,
        ].some((value) => value.toLowerCase().includes(normalizedSearch));
      return (
        matchesSearch &&
        (courseFilter === "All courses" || question.course === courseFilter) &&
        (chapterFilter === "All chapters" || question.chapter === chapterFilter) &&
        (subchapterFilter === "All subchapters" ||
          question.subchapter === subchapterFilter)
      );
    });
  }, [chapterFilter, courseFilter, questions, searchTerm, subchapterFilter]);

  function openQuestionEditor(question: Question | null = null) {
    if (!courses.length) {
      onManageCourses();
      return;
    }
    setEditingQuestion(question);
    setShowAddModal(true);
  }

  function saveQuestion(question: Question) {
    setQuestions((currentQuestions) => {
      const existingQuestion = currentQuestions.some((item) => item.id === question.id);
      return existingQuestion
        ? currentQuestions.map((item) => (item.id === question.id ? question : item))
        : [question, ...currentQuestions];
    });
  }

  function deleteQuestion(question: Question) {
    const confirmed = window.confirm(
      `Delete this question from ${question.course}? This cannot be undone.`,
    );
    if (!confirmed) return;
    setQuestions((currentQuestions) =>
      currentQuestions.filter((item) => item.id !== question.id),
    );
    setExpandedIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.delete(question.id);
      return nextIds;
    });
  }

  function toggleExpanded(questionId: string) {
    setExpandedIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (nextIds.has(questionId)) nextIds.delete(questionId);
      else nextIds.add(questionId);
      return nextIds;
    });
  }

  const filterStyles =
    "h-10 rounded-xl border border-slate-800 bg-slate-950/70 px-3 text-sm text-slate-300 outline-none transition focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/10";

  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-9 lg:px-10 lg:py-12">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-cyan-300">
            <BookOpen className="size-4" strokeWidth={1.8} />
            Knowledge library
          </div>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-50">
            Question bank
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Create, organize, and refine the prompts that drive your recall practice.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openQuestionEditor()}
          className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-[0_10px_30px_rgba(34,211,238,0.12)] transition hover:bg-cyan-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#090d16]"
        >
          <Plus className="size-4" /> {courses.length ? "Add question" : "Create a course first"}
        </button>
      </div>

      <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-950/55 p-4">
        <div className="flex flex-wrap gap-3">
          <label className="relative min-w-64 flex-[2]">
            <span className="sr-only">Search questions</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-600" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search questions, answers, or topics…"
              className={`${filterStyles} w-full pl-9`}
            />
          </label>
          <select
            aria-label="Filter by course"
            value={courseFilter}
            onChange={(event) => {
              setCourseFilter(event.target.value as "All courses" | CourseCode);
              setChapterFilter("All chapters");
              setSubchapterFilter("All subchapters");
            }}
            className={`${filterStyles} min-w-40 flex-1`}
          >
            <option>All courses</option>
            {courses.map((course) => (
              <option key={course}>{course}</option>
            ))}
          </select>
          <select
            aria-label="Filter by chapter"
            value={chapterFilter}
            onChange={(event) => {
              setChapterFilter(event.target.value);
              setSubchapterFilter("All subchapters");
            }}
            className={`${filterStyles} min-w-40 flex-1`}
          >
            <option>All chapters</option>
            {chapterOptions.map((chapter) => (
              <option key={chapter}>{chapter}</option>
            ))}
          </select>
          <select
            aria-label="Filter by subchapter"
            value={subchapterFilter}
            onChange={(event) => setSubchapterFilter(event.target.value)}
            className={`${filterStyles} min-w-44 flex-1`}
          >
            <option>All subchapters</option>
            {subchapterOptions.map((subchapter) => (
              <option key={subchapter}>{subchapter}</option>
            ))}
          </select>
        </div>
      </section>

      <div className="mt-5 flex items-center justify-between text-xs text-slate-600">
        <span>
          {filteredQuestions.length} of {questions.length} question
          {questions.length === 1 ? "" : "s"}
        </span>
        <span>Level 4–5 indicates mastery</span>
      </div>

      <section className="mt-3 space-y-3" aria-label="Questions">
        {filteredQuestions.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-800 bg-slate-950/35 px-8 py-16 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-900 text-slate-500">
              <BookOpen className="size-5" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-slate-200">
              {questions.length ? "No matching questions" : "Build your first recall prompt"}
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
              {questions.length
                ? "Try clearing or changing the filters above."
                : courses.length
                  ? "Add a question to start building your active-recall library."
                  : "Create your first course, then add questions to it."}
            </p>
            {!questions.length && (
              <button
                type="button"
                onClick={() => openQuestionEditor()}
                className="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800"
              >
                <Plus className="size-4" /> {courses.length ? "Add first question" : "Create first course"}
              </button>
            )}
          </div>
        ) : (
          filteredQuestions.map((question) => {
            const expanded = expandedIds.has(question.id);
            return (
              <article
                key={question.id}
                className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0f172a] transition hover:border-slate-700"
              >
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => toggleExpanded(question.id)}
                  className="flex w-full items-start gap-4 px-5 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-cyan-400/20 bg-cyan-400/[0.08] px-2.5 py-1 text-[11px] font-semibold text-cyan-200">
                        {question.course}
                      </span>
                      <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-slate-400">
                        {question.chapter}
                      </span>
                      <span className="text-xs text-slate-600">/ {question.subchapter}</span>
                      <span className="ml-auto flex items-center gap-1 text-[11px] text-slate-600">
                        <CalendarCheck2 className="size-3.5" />
                        {formatDate(question.nextReviewDate)}
                      </span>
                      <span className="flex items-center gap-1 rounded-lg bg-violet-400/[0.06] px-2 py-1 text-[11px] font-semibold text-violet-300/70">
                        <RotateCcw className="size-3" />
                        {question.reviewCount} attempt{question.reviewCount === 1 ? "" : "s"}
                      </span>
                      <span className="rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-semibold text-slate-500">
                        Level {question.level}
                      </span>
                    </div>
                    <h3 className="rich-question mt-3 line-clamp-2 text-sm font-medium leading-6 text-slate-200">
                      {richTextToPlainText(question.question)}
                    </h3>
                  </div>
                  <ChevronDown
                    className={`mt-1 size-5 shrink-0 text-slate-600 transition-transform ${
                      expanded ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {expanded && (
                  <div className="border-t border-slate-800 px-5 py-5">
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-600">
                          Question
                        </p>
                        <RichTextView value={question.question} variant="question" className="mt-2 text-sm leading-6 text-slate-300" />
                      </div>
                      <div className="rounded-xl border border-emerald-400/10 bg-emerald-400/[0.025] p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-400/60">
                          Answer
                        </p>
                        <RichTextView value={question.answer} variant="answer" className="mt-2 text-sm leading-6 text-slate-300" />
                      </div>
                    </div>
                    {hasMeaningfulRichContent(question.note) && (
                      <div className="mt-4 rounded-xl border border-amber-400/15 bg-amber-400/[0.035] p-4">
                        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-amber-300/70">
                          <StickyNote className="size-3.5" />
                          Optional note
                          <span className="font-normal normal-case tracking-normal text-amber-200/35">
                            Extra information
                          </span>
                        </p>
                        <RichTextView value={question.note} variant="answer" className="mt-2 text-sm leading-6 text-slate-300" />
                      </div>
                    )}
                    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5">
                        <CalendarPlus className="size-4 text-slate-600" />
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-slate-700">Added</p>
                          <p className="mt-0.5 text-xs text-slate-400">{formatDate(question.addedAt)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5">
                        <Clock3 className="size-4 text-slate-600" />
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-slate-700">Last reviewed</p>
                          <p className="mt-0.5 text-xs text-slate-400">{formatDate(question.lastReviewed)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 rounded-xl border border-cyan-400/10 bg-cyan-400/[0.025] px-3 py-2.5">
                        <CalendarCheck2 className="size-4 text-cyan-400/60" />
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-slate-700">Next review</p>
                          <p className="mt-0.5 text-xs text-cyan-200/80">{formatDate(question.nextReviewDate)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 rounded-xl border border-violet-400/10 bg-violet-400/[0.025] px-3 py-2.5">
                        <RotateCcw className="size-4 text-violet-400/60" />
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-slate-700">Attempts</p>
                          <p className="mt-0.5 text-xs text-violet-200/80">{question.reviewCount} total</p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-slate-600">
                        {question.reviewHistory.length} review timestamp{question.reviewHistory.length === 1 ? "" : "s"} available for the curve
                      </p>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openQuestionEditor(question)}
                          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-cyan-300 transition hover:bg-cyan-400/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
                        >
                          <Pencil className="size-3.5" /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteQuestion(question)}
                          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-rose-400 transition hover:bg-rose-400/10 hover:text-rose-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50"
                        >
                          <Trash2 className="size-3.5" /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })
        )}
      </section>

      {showAddModal && (
        <AddQuestionModal
          activeCourse={activeCourse}
          courses={courses}
          questions={questions}
          editingQuestion={editingQuestion}
          onClose={() => {
            setShowAddModal(false);
            setEditingQuestion(null);
          }}
          onSave={saveQuestion}
        />
      )}
    </div>
  );
}

type CalendarView = "day" | "week" | "month" | "year";

interface RecallCalendarEvent {
  id: string;
  questionId: string;
  course: CourseCode;
  chapter: string;
  subchapter: string;
  question: string;
  reviewedAt: string;
  dateKey: string;
  level: RecallLevel;
  nextReviewDate: string;
  hasExactTime: boolean;
}

function RecallCalendar({
  questions,
  activityDates,
}: {
  questions: Question[];
  activityDates: string[];
}) {
  const [view, setView] = useState<CalendarView>("month");
  const [anchorDate, setAnchorDate] = useState(getLocalDateKey);
  const events = useMemo<RecallCalendarEvent[]>(
    () =>
      questions
        .flatMap((question) =>
          question.reviewHistory.map((attempt, index) => ({
            id: `${question.id}-${attempt.reviewedAt}-${index}`,
            questionId: question.id,
            course: question.course,
            chapter: question.chapter,
            subchapter: question.subchapter,
            question: richTextToPlainText(question.question),
            reviewedAt: attempt.reviewedAt,
            dateKey: dateKeyFromStudyTimestamp(attempt.reviewedAt),
            level: attempt.level,
            nextReviewDate: attempt.nextReviewDate,
            hasExactTime: attempt.reviewedAt.includes("T"),
          })),
        )
        .sort((left, right) => parseStudyTimestamp(left.reviewedAt) - parseStudyTimestamp(right.reviewedAt)),
    [questions],
  );
  const activeDateSet = useMemo(
    () =>
      new Set([
        ...activityDates,
        ...events.map((event) => event.dateKey),
      ]),
    [activityDates, events],
  );
  const eventCountByDate = useMemo(() => {
    const counts = new Map<string, number>();
    events.forEach((event) => counts.set(event.dateKey, (counts.get(event.dateKey) ?? 0) + 1));
    return counts;
  }, [events]);
  const anchor = dateFromKey(anchorDate);
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const weekStart = startOfWeekKey(anchorDate);
  const weekDates = Array.from({ length: 7 }, (_, index) => shiftDateKey(weekStart, index));
  const monthDates = monthGridDateKeys(year, month);
  const dayEvents = events.filter((event) => event.dateKey === anchorDate);
  const exactDayEvents = dayEvents.filter((event) => event.hasExactTime);
  const legacyDayEvents = dayEvents.filter((event) => !event.hasExactTime);
  const headerTitle =
    view === "week"
      ? `${new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short" }).format(dateFromKey(weekStart))} – ${new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", year: "numeric" }).format(dateFromKey(weekDates[6]))}`
      : view === "month"
        ? new Intl.DateTimeFormat("en-ZA", { month: "long", year: "numeric" }).format(anchor)
        : view === "year"
          ? new Intl.DateTimeFormat("en-ZA", { year: "numeric" }).format(anchor)
          : new Intl.DateTimeFormat("en-ZA", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            }).format(anchor);

  function navigate(direction: -1 | 1) {
    if (view === "day") {
      setAnchorDate(shiftDateKey(anchorDate, direction));
      return;
    }
    if (view === "week") {
      setAnchorDate(shiftDateKey(anchorDate, direction * 7));
      return;
    }
    if (view === "month") {
      setAnchorDate(getLocalDateKey(new Date(year, month + direction, 1, 12)));
      return;
    }
    setAnchorDate(getLocalDateKey(new Date(year + direction, month, 1, 12)));
  }

  function openDay(dateKey: string) {
    setAnchorDate(dateKey);
    setView("day");
  }

  function openMonth(targetYear: number, targetMonth: number) {
    setAnchorDate(getLocalDateKey(new Date(targetYear, targetMonth, 1, 12)));
    setView("month");
  }

  return (
    <div
      data-calendar-view
      data-calendar-mode={view}
      className="mx-auto w-full max-w-7xl px-8 py-9 lg:px-10 lg:py-12"
    >
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-amber-300">
            <CalendarDays className="size-4" strokeWidth={1.8} />
            Recall history
          </div>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-50">
            Study calendar
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Gold dates contain active-recall work. Drill from a year into a month, then open any date to see the questions and recorded times.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-amber-400/15 bg-amber-400/[0.045] px-3 py-1.5 text-xs text-amber-200/75">
          <span className="size-2 rounded-full bg-[#d4a72c] shadow-[0_0_12px_rgba(212,167,44,0.45)]" />
          {activeDateSet.size} active day{activeDateSet.size === 1 ? "" : "s"}
        </div>
      </div>

      <section className="mt-8 overflow-hidden rounded-3xl border border-slate-800 bg-[#0f172a] shadow-[0_28px_90px_rgba(0,0,0,0.24)]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={`Previous ${view}`}
              onClick={() => navigate(-1)}
              className="grid size-9 place-items-center rounded-xl border border-slate-800 bg-slate-950/60 text-slate-500 transition hover:border-amber-400/25 hover:text-amber-300"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setAnchorDate(getLocalDateKey())}
              className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs font-semibold text-slate-400 transition hover:border-amber-400/25 hover:text-amber-300"
            >
              Today
            </button>
            <button
              type="button"
              aria-label={`Next ${view}`}
              onClick={() => navigate(1)}
              className="grid size-9 place-items-center rounded-xl border border-slate-800 bg-slate-950/60 text-slate-500 transition hover:border-amber-400/25 hover:text-amber-300"
            >
              <ChevronRight className="size-4" />
            </button>
            <h3 className="ml-2 text-sm font-semibold text-slate-200 sm:text-base">{headerTitle}</h3>
          </div>
          <div className="flex rounded-xl border border-slate-800 bg-slate-950/60 p-1" aria-label="Calendar view">
            {(["day", "week", "month", "year"] as const).map((calendarView) => (
              <button
                key={calendarView}
                type="button"
                data-calendar-mode-button={calendarView}
                aria-pressed={view === calendarView}
                onClick={() => setView(calendarView)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold capitalize transition ${
                  view === calendarView
                    ? "bg-amber-300 text-slate-950 shadow-[0_5px_18px_rgba(212,167,44,0.18)]"
                    : "text-slate-600 hover:text-slate-300"
                }`}
              >
                {calendarView}
              </button>
            ))}
          </div>
        </div>

        {view === "day" && (
          <div className="p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-400">
                {dayEvents.length
                  ? `${dayEvents.length} recorded review${dayEvents.length === 1 ? "" : "s"}`
                  : activeDateSet.has(anchorDate)
                    ? "Historical recall activity is recorded for this day."
                    : "No active recall was recorded on this day."}
              </p>
              <span className="text-xs text-slate-600">Times use your laptop’s local clock</span>
            </div>
            <div className="max-h-[650px] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/35">
              {Array.from({ length: 24 }, (_, hour) => {
                const hourEvents = exactDayEvents.filter((event) => new Date(event.reviewedAt).getHours() === hour);
                return (
                  <div
                    key={hour}
                    data-calendar-hour={hour}
                    className="grid min-h-16 grid-cols-[72px_1fr] border-b border-slate-800/70 last:border-b-0"
                  >
                    <div className="border-r border-slate-800/70 px-3 py-3 text-right text-[11px] font-medium text-slate-600">
                      {String(hour).padStart(2, "0")}:00
                    </div>
                    <div className="space-y-2 p-2.5">
                      {hourEvents.map((event) => (
                        <article
                          key={event.id}
                          data-calendar-event={event.id}
                          className="rounded-xl border border-amber-400/15 bg-amber-400/[0.045] px-3.5 py-3"
                        >
                          <div className="flex flex-wrap items-center gap-2 text-[10px]">
                            <span className="font-semibold text-amber-300">
                              {new Intl.DateTimeFormat("en-ZA", { hour: "2-digit", minute: "2-digit" }).format(new Date(event.reviewedAt))}
                            </span>
                            <span className="rounded-full border border-slate-700 px-2 py-0.5 font-semibold text-slate-400">{event.course}</span>
                            <span className="text-slate-600">{event.chapter} / {event.subchapter}</span>
                            <span className="ml-auto font-semibold text-slate-500">Level {event.level}</span>
                          </div>
                          <p className="rich-question mt-2 line-clamp-2 text-sm leading-6 text-slate-200">{event.question}</p>
                          <p className="mt-1 text-[10px] text-slate-600">Next review: {formatDate(event.nextReviewDate)}</p>
                        </article>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            {legacyDayEvents.length > 0 && (
              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Time not recorded</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  These reviews came from an older Recall OS version that stored the date but not the exact hour.
                </p>
                <div className="mt-3 space-y-2">
                  {legacyDayEvents.map((event) => (
                    <div key={event.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5 text-xs">
                      <span className="font-semibold text-slate-400">{event.course}</span>
                      <span className="text-slate-600">{event.chapter} / {event.subchapter}</span>
                      <span className="min-w-0 flex-1 truncate text-slate-300">{event.question}</span>
                      <span className="text-slate-600">Level {event.level}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {view === "week" && (
          <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-6 xl:grid-cols-7">
            {weekDates.map((dateKey) => {
              const active = activeDateSet.has(dateKey);
              const date = dateFromKey(dateKey);
              const count = eventCountByDate.get(dateKey) ?? 0;
              return (
                <button
                  key={dateKey}
                  type="button"
                  aria-label={`Open ${new Intl.DateTimeFormat("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date)}`}
                  data-calendar-date={dateKey}
                  data-recall-active-date={active ? dateKey : undefined}
                  onClick={() => openDay(dateKey)}
                  className={`min-h-40 rounded-2xl border p-4 text-left transition ${
                    active
                      ? "border-amber-400/30 bg-amber-400/[0.07] shadow-[0_12px_35px_rgba(212,167,44,0.08)]"
                      : "border-slate-800 bg-slate-950/40 hover:border-slate-700"
                  }`}
                >
                  <span className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${active ? "text-amber-300" : "text-slate-600"}`}>
                    {new Intl.DateTimeFormat("en-ZA", { weekday: "short" }).format(date)}
                  </span>
                  <span className={`mt-2 block text-2xl font-semibold ${active ? "text-amber-100" : "text-slate-300"}`}>{date.getDate()}</span>
                  {active && <span className="mt-4 block size-2 rounded-full bg-[#d4a72c] shadow-[0_0_14px_rgba(212,167,44,0.55)]" />}
                  <span className="mt-3 block text-[11px] leading-5 text-slate-600">
                    {count ? `${count} recorded review${count === 1 ? "" : "s"}` : active ? "Activity recorded" : "No activity"}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {view === "month" && (
          <div className="p-4 sm:p-6">
            <div className="grid grid-cols-7">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <div key={day} className="px-2 pb-3 text-center text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-600">{day}</div>
              ))}
              {monthDates.map((dateKey) => {
                const date = dateFromKey(dateKey);
                const inMonth = date.getMonth() === month;
                const active = activeDateSet.has(dateKey);
                const count = eventCountByDate.get(dateKey) ?? 0;
                return (
                  <button
                    key={dateKey}
                    type="button"
                    aria-label={`Open ${new Intl.DateTimeFormat("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date)}`}
                    data-calendar-date={dateKey}
                    data-recall-active-date={active ? dateKey : undefined}
                    onClick={() => openDay(dateKey)}
                    className={`group relative min-h-24 border-b border-r border-slate-800/70 p-2 text-left transition first:border-l ${
                      inMonth ? "bg-slate-950/25" : "bg-slate-950/55"
                    } ${active ? "bg-amber-400/[0.065] hover:bg-amber-400/[0.1]" : "hover:bg-slate-900/70"}`}
                  >
                    <span className={`grid size-7 place-items-center rounded-full text-xs font-semibold ${
                      active
                        ? "bg-[#d4a72c] text-[#16110f] shadow-[0_0_16px_rgba(212,167,44,0.25)]"
                        : inMonth
                          ? "text-slate-400"
                          : "text-slate-700"
                    }`}>{date.getDate()}</span>
                    {active && (
                      <span className="mt-3 block text-[10px] font-medium text-amber-300/75">
                        {count ? `${count} review${count === 1 ? "" : "s"}` : "Active"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {view === "year" && (
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6 xl:grid-cols-3">
            {Array.from({ length: 12 }, (_, targetMonth) => {
              const dates = monthGridDateKeys(year, targetMonth);
              const activeDays = dates.filter(
                (dateKey) =>
                  dateFromKey(dateKey).getMonth() === targetMonth && activeDateSet.has(dateKey),
              ).length;
              return (
                <button
                  key={targetMonth}
                  type="button"
                  data-calendar-month={targetMonth + 1}
                  onClick={() => openMonth(year, targetMonth)}
                  className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-left transition hover:border-amber-400/25 hover:bg-slate-950/65"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-300">
                      {new Intl.DateTimeFormat("en-ZA", { month: "long" }).format(new Date(year, targetMonth, 1))}
                    </span>
                    <span className={`text-[10px] font-semibold ${activeDays ? "text-amber-300" : "text-slate-700"}`}>
                      {activeDays} active
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-7 gap-1">
                    {dates.map((dateKey) => {
                      const inMonth = dateFromKey(dateKey).getMonth() === targetMonth;
                      const active = inMonth && activeDateSet.has(dateKey);
                      return (
                        <span
                          key={dateKey}
                          className={`aspect-square rounded-[3px] ${
                            active
                              ? "bg-[#d4a72c] shadow-[0_0_8px_rgba(212,167,44,0.28)]"
                              : inMonth
                                ? "bg-slate-800"
                                : "bg-transparent"
                          }`}
                        />
                      );
                    })}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <p className="mt-4 text-xs leading-5 text-slate-600">
        Recall OS started saving exact timestamps in version 1.4. Older attempts still appear on the correct gold date, with “Time not recorded” where the hour was not available.
      </p>
    </div>
  );
}

function AnalyticsDashboard({
  questions,
  courses,
}: {
  questions: Question[];
  courses: CourseCode[];
}) {
  const today = getLocalDateKey();
  const [curveQuestionId, setCurveQuestionId] = useState(
    () => questions[0]?.id ?? "",
  );
  const curveQuestions = useMemo(
    () =>
      [...questions].sort((left, right) =>
        `${left.course}${left.chapter}${left.subchapter}${left.question}`.localeCompare(
          `${right.course}${right.chapter}${right.subchapter}${right.question}`,
        ),
      ),
    [questions],
  );
  const curveQuestion =
    questions.find((question) => question.id === curveQuestionId) ??
    curveQuestions[0];

  useEffect(() => {
    if (curveQuestion && curveQuestion.id !== curveQuestionId) {
      setCurveQuestionId(curveQuestion.id);
    }
  }, [curveQuestion, curveQuestionId]);

  const atRiskQuestions = questions.filter(
    (question) => question.level <= 2 || question.nextReviewDate < today,
  );
  const masteredQuestions = questions.filter(
    (question) =>
      question.level >= 4 &&
      !atRiskQuestions.some((atRiskQuestion) => atRiskQuestion.id === question.id),
  );
  const inProgressQuestions = questions.filter(
    (question) =>
      !atRiskQuestions.some((atRiskQuestion) => atRiskQuestion.id === question.id) &&
      !masteredQuestions.some(
        (masteredQuestion) => masteredQuestion.id === question.id,
      ),
  );
  const totalForChart = questions.length || 1;
  const masteredPercent = (masteredQuestions.length / totalForChart) * 100;
  const inProgressPercent = (inProgressQuestions.length / totalForChart) * 100;
  const masteredEnd = masteredPercent;
  const inProgressEnd = masteredPercent + inProgressPercent;

  const breakdown = useMemo(() => {
    const rows = new Map<
      string,
      {
        course: CourseCode;
        chapter: string;
        subchapter: string;
        total: number;
        mastered: number;
        overdue: number;
      }
    >();

    questions.forEach((question) => {
      const key = `${question.course}\u0000${question.chapter}\u0000${question.subchapter}`;
      const row = rows.get(key) ?? {
        course: question.course,
        chapter: question.chapter,
        subchapter: question.subchapter,
        total: 0,
        mastered: 0,
        overdue: 0,
      };
      row.total += 1;
      if (question.level >= 4) row.mastered += 1;
      if (question.nextReviewDate < today) row.overdue += 1;
      rows.set(key, row);
    });

    return Array.from(rows.values()).sort((left, right) =>
      `${left.course}${left.chapter}${left.subchapter}`.localeCompare(
        `${right.course}${right.chapter}${right.subchapter}`,
      ),
    );
  }, [questions, today]);

  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-9 lg:px-10 lg:py-12">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-violet-300">
          <BarChart3 className="size-4" strokeWidth={1.8} />
          Memory intelligence
        </div>
        <h2 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-50">
          Analytics
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          See where recall is durable, where it is developing, and where time is
          beginning to erode memory.
        </p>
      </div>

      <section className="mt-8 grid gap-4 xl:grid-cols-3" aria-label="Course mastery">
        {courses.map((course) => {
          const courseQuestions = questions.filter(
            (question) => question.course === course,
          );
          const mastered = courseQuestions.filter(
            (question) => question.level >= 4,
          ).length;
          const mastery = courseQuestions.length
            ? Math.round((mastered / courseQuestions.length) * 100)
            : 0;
          return (
            <article
              key={course}
              className="rounded-2xl border border-slate-800 bg-[#0f172a] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-300">{course}</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-50">
                    {mastery}%
                  </p>
                </div>
                <span className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.06] px-2.5 py-1.5 text-xs font-medium text-emerald-300">
                  {mastered}/{courseQuestions.length}
                </span>
              </div>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-300 transition-all duration-700"
                  style={{ width: `${mastery}%` }}
                />
              </div>
              <p className="mt-3 text-xs text-slate-600">
                Level 4–5 questions mastered
              </p>
            </article>
          );
        })}
        {!courses.length && (
          <div className="xl:col-span-3 rounded-2xl border border-dashed border-slate-800 bg-slate-950/35 px-5 py-10 text-center text-sm text-slate-600">
            Course mastery will appear after you create a course.
          </div>
        )}
      </section>

      <section className="mt-6 rounded-3xl border border-slate-800 bg-[#0f172a] p-5 sm:p-6" aria-label="Question forgetting curve">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <BarChart3 className="size-4 text-cyan-300" />
              Question forgetting curve
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Select one question to inspect its attempts, review resets, and estimated retention over time.
            </p>
          </div>
          <label className="min-w-72 flex-1 sm:max-w-xl">
            <span className="sr-only">Select question for forgetting curve</span>
            <select
              aria-label="Select question for forgetting curve"
              value={curveQuestion?.id ?? ""}
              onChange={(event) => setCurveQuestionId(event.target.value)}
              disabled={!curveQuestions.length}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-sm text-slate-200 outline-none transition focus:border-cyan-400/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {!curveQuestions.length && <option value="">No questions available</option>}
              {curveQuestions.map((question) => (
                <option key={question.id} value={question.id}>
                  {question.course} · {question.chapter} · {question.subchapter} — {richTextToPlainText(question.question)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {curveQuestion ? (
          <div className="mt-5">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-cyan-400/20 bg-cyan-400/[0.08] px-2.5 py-1 font-semibold text-cyan-200">{curveQuestion.course}</span>
              <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-slate-400">{curveQuestion.chapter}</span>
              <span className="text-slate-600">{curveQuestion.subchapter}</span>
            </div>
            <RichTextView value={curveQuestion.question} variant="question" className="mb-4 text-sm font-medium leading-6 text-slate-300" />
            <QuestionForgettingCurve question={curveQuestion} />
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-800 px-5 py-12 text-center text-sm text-slate-600">
            Add a question to begin tracking its forgetting curve.
          </div>
        )}
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[0.9fr_1.4fr]">
        <article className="rounded-3xl border border-slate-800 bg-[#0f172a] p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-200">Forgetting curve</p>
              <p className="mt-1 text-xs text-slate-600">Memory decay as of {formatDate(today)}</p>
            </div>
            <Brain className="size-5 text-violet-300" strokeWidth={1.7} />
          </div>
          <div className="mt-7 flex items-center justify-center">
            <div
              className="relative grid size-48 place-items-center rounded-full"
              style={{
                background: questions.length
                  ? `conic-gradient(#34d399 0% ${masteredEnd}%, #fbbf24 ${masteredEnd}% ${inProgressEnd}%, #fb7185 ${inProgressEnd}% 100%)`
                  : "conic-gradient(#1e293b 0% 100%)",
              }}
            >
              <div className="grid size-32 place-items-center rounded-full border border-slate-800 bg-[#0f172a] text-center shadow-[inset_0_0_30px_rgba(0,0,0,0.25)]">
                <div>
                  <p className="text-3xl font-semibold text-slate-50">{questions.length}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.15em] text-slate-600">Memories</p>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-7 space-y-3">
            {[
              ["Mastered", masteredQuestions.length, "bg-emerald-400"],
              ["In Progress", inProgressQuestions.length, "bg-amber-400"],
              ["At Risk / Overdue", atRiskQuestions.length, "bg-rose-400"],
            ].map(([label, count, color]) => (
              <div key={String(label)} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-slate-500">
                  <span className={`size-2 rounded-full ${color}`} />
                  {label}
                </span>
                <span className="font-semibold text-slate-300">{count}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="overflow-hidden rounded-3xl border border-slate-800 bg-[#0f172a]">
          <div className="border-b border-slate-800 px-5 py-4">
            <p className="text-sm font-semibold text-slate-200">Chapter breakdown</p>
            <p className="mt-1 text-xs text-slate-600">Mastery by chapter and subchapter</p>
          </div>
          <div className="max-h-[430px] overflow-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-slate-950/95 text-[10px] uppercase tracking-[0.12em] text-slate-600 backdrop-blur">
                <tr>
                  <th className="px-5 py-3 font-semibold">Course / Topic</th>
                  <th className="px-3 py-3 font-semibold">Questions</th>
                  <th className="px-3 py-3 font-semibold">Overdue</th>
                  <th className="px-5 py-3 font-semibold">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {breakdown.map((row) => {
                  const progress = Math.round((row.mastered / row.total) * 100);
                  return (
                    <tr key={`${row.course}-${row.chapter}-${row.subchapter}`} className="hover:bg-slate-900/50">
                      <td className="px-5 py-4">
                        <div className="font-medium text-slate-300">{row.chapter}</div>
                        <div className="mt-1 text-[11px] text-slate-600">{row.course} · {row.subchapter}</div>
                      </td>
                      <td className="px-3 py-4 text-slate-500">{row.total}</td>
                      <td className="px-3 py-4 text-rose-300/70">{row.overdue}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-1.5 min-w-20 flex-1 overflow-hidden rounded-full bg-slate-800">
                            <div className="h-full rounded-full bg-emerald-400" style={{ width: `${progress}%` }} />
                          </div>
                          <span className="w-9 text-right font-medium text-slate-400">{progress}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!breakdown.length && (
              <div className="grid h-64 place-items-center text-sm text-slate-600">
                Add questions to populate the breakdown.
              </div>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}

interface SettingsPageProps {
  questions: Question[];
  setQuestions: Dispatch<SetStateAction<Question[]>>;
  courses: CourseCode[];
  setCourses: Dispatch<SetStateAction<CourseCode[]>>;
  activityDates: string[];
  setActivityDates: Dispatch<SetStateAction<string[]>>;
  theme: ThemeId;
  setTheme: Dispatch<SetStateAction<ThemeId>>;
}

function SettingsPage({
  questions,
  setQuestions,
  courses,
  setCourses,
  activityDates,
  setActivityDates,
  theme,
  setTheme,
}: SettingsPageProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [courseName, setCourseName] = useState("");
  const [courseError, setCourseError] = useState("");
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [importStatus, setImportStatus] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const streak = calculateReviewStreak(activityDates);

  function addCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = courseName.trim().replace(/\s+/g, " ");
    if (!cleanName) {
      setCourseError("Enter a course name.");
      return;
    }
    if (courses.some((course) => course.toLocaleLowerCase() === cleanName.toLocaleLowerCase())) {
      setCourseError("That course already exists.");
      return;
    }

    setCourses((currentCourses) => [...currentCourses, cleanName]);
    setCourseName("");
    setCourseError("");
  }

  function exportData() {
    const backup = {
      version: 5,
      exportedAt: new Date().toISOString(),
      courses,
      questions,
      activityDates,
      theme,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = "study_data.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
  }

  async function importData(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const parsedValue: unknown = JSON.parse(await file.text());
      const envelope =
        parsedValue && typeof parsedValue === "object" && !Array.isArray(parsedValue)
          ? (parsedValue as { questions?: unknown; courses?: unknown; activityDates?: unknown; theme?: unknown })
          : null;
      const rawQuestions = Array.isArray(parsedValue)
        ? parsedValue
        : Array.isArray(envelope?.questions)
          ? envelope.questions
          : null;
      if (!rawQuestions) throw new Error("No question collection was found in this file.");

      const importedQuestions = rawQuestions
        .map(normalizeQuestion)
        .filter((question): question is Question => question !== null);
      if (rawQuestions.length > 0 && importedQuestions.length === 0) {
        throw new Error("The file does not contain valid Recall OS questions.");
      }

      const importedActivityDates = Array.isArray(envelope?.activityDates)
        ? envelope.activityDates.filter(
            (value): value is string =>
              typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value),
          )
        : importedQuestions
            .filter((question) => question.reviewCount > 0)
            .map((question) => question.lastReviewed);
      const importedCourses = uniqueCourseNames([
        ...(Array.isArray(envelope?.courses) ? envelope.courses : []),
        ...importedQuestions.map((question) => question.course),
      ]);
      const importedTheme = THEMES.some((availableTheme) => availableTheme.id === envelope?.theme)
        ? (envelope?.theme as ThemeId)
        : null;

      if (importMode === "replace") {
        setQuestions(importedQuestions);
        setCourses(importedCourses);
        setActivityDates(Array.from(new Set(importedActivityDates)).sort());
      } else {
        setQuestions((currentQuestions) => {
          const merged = new Map(
            currentQuestions.map((question) => [question.id, question]),
          );
          importedQuestions.forEach((question) => merged.set(question.id, question));
          return Array.from(merged.values());
        });
        setCourses((currentCourses) =>
          uniqueCourseNames([...currentCourses, ...importedCourses]),
        );
        setActivityDates((currentDates) =>
          Array.from(new Set([...currentDates, ...importedActivityDates])).sort(),
        );
      }
      if (importedTheme) setTheme(importedTheme);

      setImportStatus({
        kind: "success",
        message: `${importedQuestions.length} question${importedQuestions.length === 1 ? "" : "s"} imported successfully.`,
      });
    } catch (error) {
      setImportStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "The backup could not be imported.",
      });
    } finally {
      event.target.value = "";
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-9 lg:px-10 lg:py-12">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-cyan-300">
          <Settings className="size-4" strokeWidth={1.8} />
          Data & continuity
        </div>
        <h2 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-50">Settings</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Protect your learning history and keep your review rhythm visible.
        </p>
      </div>

      <section className="mt-8 grid gap-4 lg:grid-cols-3">
        <article className="rounded-2xl border border-slate-800 bg-[#0f172a] p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-600">Current streak</p>
              <p className="mt-3 text-3xl font-semibold text-slate-50">{streak} day{streak === 1 ? "" : "s"}</p>
              <p className="mt-2 text-xs text-slate-600">Consecutive days with a completed review</p>
            </div>
            <span className="grid size-10 place-items-center rounded-xl bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/20">
              <Flame className="size-5" />
            </span>
          </div>
        </article>
        <article className="rounded-2xl border border-slate-800 bg-[#0f172a] p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-600">Stored questions</p>
              <p className="mt-3 text-3xl font-semibold text-slate-50">{questions.length}</p>
              <p className="mt-2 text-xs text-slate-600">Saved locally in the desktop app</p>
            </div>
            <span className="grid size-10 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300 ring-1 ring-cyan-400/20">
              <Database className="size-5" />
            </span>
          </div>
        </article>
        <article className="rounded-2xl border border-slate-800 bg-[#0f172a] p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-600">Activity days</p>
              <p className="mt-3 text-3xl font-semibold text-slate-50">{activityDates.length}</p>
              <p className="mt-2 text-xs text-slate-600">Calendar dates preserved in backups</p>
            </div>
            <span className="grid size-10 place-items-center rounded-xl bg-violet-400/10 text-violet-300 ring-1 ring-violet-400/20">
              <CalendarDays className="size-5" />
            </span>
          </div>
        </article>
      </section>

      <section className="mt-6 rounded-3xl border border-slate-800 bg-[#0f172a] p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl border border-amber-400/15 bg-amber-400/[0.06] text-amber-300">
              <Palette className="size-5" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Appearance themes</h3>
              <p className="mt-1 text-xs text-slate-600">
                Your current theme stays selected unless you deliberately choose another one.
              </p>
            </div>
          </div>
          <span className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-xs font-semibold text-slate-500">
            {THEMES.find((availableTheme) => availableTheme.id === theme)?.name}
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Choose app theme">
          {THEMES.map((availableTheme) => {
            const active = availableTheme.id === theme;
            return (
              <button
                key={availableTheme.id}
                type="button"
                data-theme-option={availableTheme.id}
                aria-pressed={active}
                onClick={() => setTheme(availableTheme.id)}
                className={`rounded-2xl border p-4 text-left transition ${
                  active
                    ? "border-cyan-400/35 bg-cyan-400/[0.07] shadow-[0_12px_32px_rgba(34,211,238,0.07)]"
                    : "border-slate-800 bg-slate-950/45 hover:border-slate-700"
                }`}
              >
                <span className="flex items-start justify-between gap-3">
                  <span>
                    <span className={`block text-sm font-semibold ${active ? "text-cyan-200" : "text-slate-300"}`}>
                      {availableTheme.name}
                    </span>
                    <span className="mt-1 block text-[11px] leading-5 text-slate-600">
                      {availableTheme.description}
                    </span>
                  </span>
                  {active && <CheckCircle2 className="size-4 shrink-0 text-cyan-300" />}
                </span>
                <span className="mt-4 flex gap-2 rounded-xl border border-white/5 bg-black/15 p-2">
                  {availableTheme.colors.map((color) => (
                    <span
                      key={color}
                      className="h-5 flex-1 rounded-md border border-white/10"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-slate-800 bg-[#0f172a] p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl border border-violet-400/15 bg-violet-400/[0.06] text-violet-300">
              <Layers3 className="size-5" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Course manager</h3>
              <p className="mt-1 text-xs text-slate-600">
                Create courses before organizing questions into them.
              </p>
            </div>
          </div>
          <span className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-500">
            {courses.length} course{courses.length === 1 ? "" : "s"}
          </span>
        </div>

        <form onSubmit={addCourse} className="mt-5 flex flex-wrap gap-3">
          <label className="min-w-64 flex-1">
            <span className="sr-only">New course name</span>
            <input
              value={courseName}
              maxLength={80}
              onChange={(event) => {
                setCourseName(event.target.value);
                if (courseError) setCourseError("");
              }}
              placeholder="e.g. MAM1000W or Discrete Mathematics"
              className="h-11 w-full rounded-xl border border-slate-800 bg-slate-950/70 px-3.5 text-sm text-slate-200 outline-none transition placeholder:text-slate-700 focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/10"
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
          >
            <Plus className="size-4" /> Add course
          </button>
        </form>
        {courseError && <p className="mt-2 text-xs text-rose-300">{courseError}</p>}

        <div className="mt-5 flex flex-wrap gap-2">
          {courses.map((course) => {
            const questionCount = questions.filter((question) => question.course === course).length;
            return (
              <span
                key={course}
                className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs font-semibold text-slate-300"
              >
                {course}
                <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-500">
                  {questionCount}
                </span>
              </span>
            );
          })}
          {!courses.length && (
            <p className="text-sm text-slate-600">
              No courses yet. Add the first one above.
            </p>
          )}
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <article className="rounded-3xl border border-slate-800 bg-[#0f172a] p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl border border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-300">
              <Download className="size-5" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Export study data</h3>
              <p className="mt-1 text-xs text-slate-600">Rich documents, pictures, equations, scheduling, and progress</p>
            </div>
          </div>
          <p className="mt-5 text-sm leading-6 text-slate-500">
            Download a portable JSON backup that includes embedded pictures and can be
            restored on this or another device. Backups containing pictures may be larger.
          </p>
          <button
            type="button"
            onClick={exportData}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
          >
            <Download className="size-4" /> Download study_data.json
          </button>
        </article>

        <article className="rounded-3xl border border-slate-800 bg-[#0f172a] p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl border border-cyan-400/15 bg-cyan-400/[0.06] text-cyan-300">
              <Upload className="size-5" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Import a backup</h3>
              <p className="mt-1 text-xs text-slate-600">Validated before anything is changed</p>
            </div>
          </div>
          <div className="mt-5 flex rounded-xl border border-slate-800 bg-slate-950/60 p-1">
            {(["merge", "replace"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setImportMode(mode)}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold capitalize transition ${importMode === mode ? "bg-slate-800 text-slate-200" : "text-slate-600 hover:text-slate-400"}`}
              >
                {mode} data
              </button>
            ))}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={importData}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-400/30 hover:bg-slate-800"
          >
            <Upload className="size-4" /> Choose JSON backup
          </button>
          {importStatus && (
            <div className={`mt-4 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs ${importStatus.kind === "success" ? "border-emerald-400/15 bg-emerald-400/[0.05] text-emerald-300" : "border-rose-400/15 bg-rose-400/[0.05] text-rose-300"}`}>
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              {importStatus.message}
            </div>
          )}
        </article>
      </section>

      <section className="mt-6 rounded-2xl border border-cyan-400/10 bg-cyan-400/[0.025] p-5">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-cyan-400/15 bg-cyan-400/[0.06] text-cyan-300">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Ownership & licence</h3>
              <p className="mt-1 text-sm text-slate-400">© 2026 {COPYRIGHT_OWNER}. All rights reserved.</p>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-600">
                Recall OS is proprietary software licensed for authorised personal use only.
                Redistribution, resale, removal of authorship notices, and claiming the work as
                your own are prohibited by its personal-use licence.
              </p>
            </div>
          </div>
          <span className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-xs font-semibold text-slate-500">
            Version {APP_VERSION}
          </span>
        </div>
      </section>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
        <span className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-emerald-400/60" />
          All data remains device-local unless you export it yourself.
        </span>
        <span>Publisher: {COPYRIGHT_OWNER}</span>
      </div>
    </div>
  );
}

export default function App() {
  const [questions, setQuestions] = useStoredQuestions();
  const [courses, setCourses] = useStoredCourses(questions);
  const [activityDates, setActivityDates] = useStoredActivityDates(questions);
  const [theme, setTheme] = useStoredTheme();
  const [activeView, setActiveView] = useState<NavigationId>("practice");
  const [activeCourse, setActiveCourse] = useState<CourseCode>(() => courses[0] ?? "");

  useEffect(() => {
    if (!activeCourse || !courses.includes(activeCourse)) {
      setActiveCourse(courses[0] ?? "");
    }
  }, [activeCourse, courses]);

  return (
    <div
      data-theme={theme}
      className="app-theme min-h-screen bg-[#090d16] font-sans text-slate-200 antialiased selection:bg-cyan-300/25 selection:text-cyan-100"
    >
      <div className="flex min-h-screen min-w-[1024px]">
        <Sidebar activeView={activeView} onNavigate={setActiveView} />

        <main className="min-w-0 flex-1 bg-[radial-gradient(circle_at_top_right,rgba(30,41,59,0.2),transparent_32%)]">
          <CourseHeader
            activeCourse={activeCourse}
            courses={courses}
            onCourseChange={setActiveCourse}
            onManageCourses={() => setActiveView("settings")}
          />
          {activeView === "practice" && (
            <DailyPractice
              questions={questions}
              courses={courses}
              setQuestions={setQuestions}
              activityDates={activityDates}
              setActivityDates={setActivityDates}
              activeCourse={activeCourse}
            />
          )}
          {activeView === "questions" && (
            <QuestionBank
              questions={questions}
              courses={courses}
              setQuestions={setQuestions}
              activeCourse={activeCourse}
              onManageCourses={() => setActiveView("settings")}
            />
          )}
          {activeView === "calendar" && (
            <RecallCalendar questions={questions} activityDates={activityDates} />
          )}
          {activeView === "analytics" && (
            <AnalyticsDashboard questions={questions} courses={courses} />
          )}
          {activeView === "settings" && (
            <SettingsPage
              questions={questions}
              setQuestions={setQuestions}
              courses={courses}
              setCourses={setCourses}
              activityDates={activityDates}
              setActivityDates={setActivityDates}
              theme={theme}
              setTheme={setTheme}
            />
          )}
        </main>
      </div>
    </div>
  );
}
