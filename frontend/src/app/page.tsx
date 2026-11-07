"use client";

import React, { useState, useRef } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3,
  Database,
  Sparkles,
  FileText,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Code2,
  Download,
  Search,
  KeyRound,
  Layers,
  Activity,
  RefreshCw,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  AreaChart,
  Area,
  Cell,
} from "recharts";

const API_BASE = "";

interface SummaryMetrics {
  total_rows: number;
  total_columns: number;
  missing_values: number;
  completeness_score: number;
  duplicate_rows: number;
  primary_metric_name: string | null;
  primary_metric_sum: number | null;
  primary_metric_avg: number | null;
}

interface SchemaColumn {
  name: string;
  dtype: string;
  role: string;
  null_count: number;
  null_pct: number;
  unique_count: number;
  sum?: number | null;
  mean?: number | null;
  median?: number | null;
  std?: number | null;
  min?: number | null;
  max?: number | null;
  outliers?: number;
  top_value?: string;
  top_freq?: number;
}

interface AutoInsight {
  title: string;
  category: string;
  badge: string;
  impact: "positive" | "warning" | "neutral";
  description: string;
}

interface DatasetPayload {
  filename: string;
  summary: SummaryMetrics;
  schema: SchemaColumn[];
  charts: {
    primary_bar: Array<{ name: string; total: number; average: number; count: number }>;
    secondary_bar: Array<{ name: string; total: number; average: number; count: number }>;
    time_series: Array<{ date: string; value: number }>;
    correlations: Array<{
      pair: string;
      col_a: string;
      col_b: string;
      correlation: number;
      strength: string;
    }>;
    meta: {
      primary_metric: string;
      primary_cat: string;
      secondary_cat: string;
      primary_date: string;
    };
  };
  auto_insights: AutoInsight[];
  preview: Array<Record<string, string | number | null>>;
  columns: string[];
}

interface QueryResponse {
  question: string;
  answer: string;
  explanation: string;
  code_executed: string;
  planner_used: string;
  operation: string;
  supporting_data: Array<{ name: string; value: number }>;
}

const CHART_COLORS = ["#2563eb", "#3b82f6", "#6366f1", "#0ea5e9", "#10b981", "#8b5cf6"];

export default function InsightAIDashboard() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "explorer" | "analyst" | "reports">("dashboard");
  const [data, setData] = useState<DatasetPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);

  // Explorer state
  const [searchFilter, setSearchFilter] = useState<string>("");

  // AI Query state
  const [question, setQuestion] = useState<string>("");
  const [apiKey, setApiKey] = useState<string>("");
  const [queryLoading, setQueryLoading] = useState<boolean>(false);
  const [queryHistory, setQueryHistory] = useState<QueryResponse[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Validation Error: Please select a valid .CSV file.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await axios.post<DatasetPayload>(`${API_BASE}/api/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setData(res.data);
      setQueryHistory([]);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.detail || "Failed to upload and analyze CSV file.");
      } else {
        setError("Unexpected error communicating with backend server.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLoadSample = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post<DatasetPayload>(`${API_BASE}/api/sample`);
      setData(res.data);
      setQueryHistory([]);
    } catch {
      setError("Unable to reach FastAPI backend at http://localhost:8000. Verify your backend terminal is running.");
    } finally {
      setLoading(false);
    }
  };

  const handleAskQuestion = async (qText?: string) => {
    const activeQ = (qText ?? question).trim();
    if (!activeQ || !data) return;

    setQueryLoading(true);
    setError(null);
    try {
      const res = await axios.post<QueryResponse>(`${API_BASE}/api/query`, {
        question: activeQ,
        api_key: apiKey.trim() || null,
      });
      setQueryHistory((prev) => [res.data, ...prev]);
      if (!qText) setQuestion("");
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.detail || "Error executing analytical query.");
      } else {
        setError("Failed to execute query.");
      }
    } finally {
      setQueryLoading(false);
    }
  };

  const formatRichText = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <span key={i} className="font-semibold text-slate-900">
            {part.slice(2, -2)}
          </span>
        );
      }
      return part;
    });
  };

  const suggestedQuestions = data
    ? [
        `Which ${data.charts.meta.primary_cat} generated the highest ${data.charts.meta.primary_metric}?`,
        `What is the average ${data.charts.meta.primary_metric}?`,
        `Which ${data.charts.meta.secondary_cat} performed best?`,
        "Which columns contain missing values?",
        "What is the correlation between numeric columns?",
      ]
    : [];

  return (
    <div className="min-h-screen flex bg-[#f8fafc] text-[#0f172a] font-sans antialiased">
      {/* LEFT SIDEBAR */}
      <aside className="w-64 bg-[#0f172a] text-slate-100 flex flex-col justify-between shrink-0 border-r border-slate-800">
        <div>
          {/* Brand Header */}
          <div className="px-6 py-6 flex items-center gap-3 border-b border-slate-800/80">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center shadow-inner">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-white block leading-none">
                InsightAI
              </span>
              <span className="text-[11px] text-slate-400 font-medium">
                Autonomous Analytics
              </span>
            </div>
          </div>

          {/* Navigation Menu */}
          <div className="px-3 py-6">
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Workspace
            </p>
            <nav className="space-y-1">
              {[
                { id: "dashboard", label: "Executive Dashboard", icon: BarChart3 },
                { id: "explorer", label: "Data Profiler & Schema", icon: Database },
                { id: "analyst", label: "AI Query Analyst", icon: Sparkles },
                { id: "reports", label: "Executive Reports", icon: FileText },
              ].map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id as typeof activeTab)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-slate-300 hover:bg-slate-800/70 hover:text-white"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Dataset & Engine Status Footer */}
        <div className="p-4 m-3 rounded-xl bg-slate-900/90 border border-slate-800">
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`w-2 h-2 rounded-full ${
                data ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
              }`}
            />
            <span className="text-xs font-semibold text-slate-200">
              {data ? "Dataset Active" : "Awaiting Dataset"}
            </span>
          </div>
          {data ? (
            <div className="text-[11px] text-slate-400 space-y-1 truncate">
              <p className="text-slate-300 font-medium truncate">{data.filename}</p>
              <p>
                {data.summary.total_rows.toLocaleString()} rows • {data.summary.total_columns} cols
              </p>
              <p className="text-emerald-400 font-medium">
                {data.summary.completeness_score}% Data Health
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Upload a CSV or load the sample dataset to unlock autonomous profiling.
            </p>
          )}
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Header Bar */}
        <header className="bg-white border-b border-slate-200 px-8 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-20">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              {activeTab === "dashboard" && "Executive Analytics Overview"}
              {activeTab === "explorer" && "Autonomous Data Profiler & Schema"}
              {activeTab === "analyst" && "Natural-Language AI Query Analyst"}
              {activeTab === "reports" && "Executive Reporting & Governance"}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {data
                ? `Analyzing ${data.filename} • Deterministic Python & Pandas Engine`
                : "Upload a CSV dataset or load our verified enterprise dataset to begin"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileUpload(e.target.files[0]);
                }
              }}
            />
            <button
              onClick={handleLoadSample}
              disabled={loading}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Load Sample Dataset
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition flex items-center gap-2 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload CSV
            </button>
            {data && (
              <a
                href={`${API_BASE}/api/export-pdf`}
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-2 rounded-lg text-xs font-semibold border border-slate-200 hover:bg-slate-50 text-slate-700 transition flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                PDF Report
              </a>
            )}
          </div>
        </header>

        <div className="p-8 max-w-7xl w-full mx-auto space-y-6">
          {/* Error Banner */}
          {error && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between text-red-700 text-sm">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-xs font-semibold underline ml-4"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Upload Dropzone when no dataset is loaded */}
          {!data && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleFileUpload(e.dataTransfer.files[0]);
                }
              }}
              className={`bg-white border-2 border-dashed rounded-2xl p-12 text-center transition-all ${
                dragActive ? "border-blue-600 bg-blue-50/40" : "border-slate-300"
              }`}
            >
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4">
                <Upload className="w-7 h-7" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">
                Upload a CSV Dataset to Begin Autonomous Analysis
              </h2>
              <p className="text-sm text-slate-500 max-w-md mx-auto mt-1 mb-6">
                Drag and drop your `.csv` file here, browse from your computer, or load our 500-row enterprise dataset with one click.
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition cursor-pointer"
                >
                  {loading ? "Analyzing Dataset..." : "Browse CSV File"}
                </button>
                <button
                  onClick={handleLoadSample}
                  disabled={loading}
                  className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 transition cursor-pointer"
                >
                  Load Enterprise Sample Data
                </button>
              </div>
            </motion.div>
          )}

          {/* ACTIVE WORKSPACE CONTENT */}
          <AnimatePresence mode="wait">
            {data && activeTab === "dashboard" && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                {/* 4 Executive KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs">
                    <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
                      <span>Total Records</span>
                      <Layers className="w-4 h-4 text-blue-600" />
                    </div>
                    <p className="text-2xl font-bold text-slate-900 mt-2">
                      {data.summary.total_rows.toLocaleString()}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Across {data.summary.total_columns} dimensions
                    </p>
                  </div>

                  <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs">
                    <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
                      <span>
                        Total {data.summary.primary_metric_name || "Metric"}
                      </span>
                      <TrendingUp className="w-4 h-4 text-emerald-600" />
                    </div>
                    <p className="text-2xl font-bold text-slate-900 mt-2">
                      {data.summary.primary_metric_sum !== null
                        ? data.summary.primary_metric_sum.toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })
                        : "N/A"}
                    </p>
                    <p className="text-xs text-emerald-600 font-medium mt-1">
                      Verified Pandas aggregation
                    </p>
                  </div>

                  <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs">
                    <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
                      <span>
                        Average {data.summary.primary_metric_name || "Value"}
                      </span>
                      <Activity className="w-4 h-4 text-indigo-600" />
                    </div>
                    <p className="text-2xl font-bold text-slate-900 mt-2">
                      {data.summary.primary_metric_avg !== null
                        ? data.summary.primary_metric_avg.toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })
                        : "N/A"}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Per record mean value
                    </p>
                  </div>

                  <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs">
                    <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
                      <span>Data Completeness</span>
                      <CheckCircle2 className="w-4 h-4 text-blue-600" />
                    </div>
                    <p className="text-2xl font-bold text-slate-900 mt-2">
                      {data.summary.completeness_score}%
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {data.summary.missing_values} missing cells detected
                    </p>
                  </div>
                </div>

                {/* Quick Natural Language Bar on Dashboard */}
                <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-[260px]">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && question.trim()) {
                          setActiveTab("analyst");
                          handleAskQuestion();
                        }
                      }}
                      placeholder="Ask anything about this dataset (e.g., Which product generated the highest revenue?)..."
                      className="w-full text-sm bg-transparent focus:outline-none text-slate-800 placeholder:text-slate-400"
                    />
                  </div>
                  <button
                    onClick={() => {
                      setActiveTab("analyst");
                      if (question.trim()) handleAskQuestion();
                    }}
                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Analyze with AI</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Primary Visualizations Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Chart 1: Category Breakdown */}
                  <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-2xs">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">
                          {data.charts.meta.primary_metric} by {data.charts.meta.primary_cat}
                        </h3>
                        <p className="text-xs text-slate-500">
                          Aggregated segment distribution
                        </p>
                      </div>
                      <span className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-blue-50 text-blue-700">
                        Bar Breakdown
                      </span>
                    </div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.charts.primary_bar}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} />
                          <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#0f172a",
                              border: "none",
                              borderRadius: "8px",
                              color: "#f8fafc",
                              fontSize: "12px",
                            }}
                          />
                          <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                            {data.charts.primary_bar.map((_, idx) => (
                              <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Chart 2: Time Series or Secondary Breakdown */}
                  <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-2xs">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">
                          {data.charts.time_series.length > 0
                            ? `${data.charts.meta.primary_metric} Trend (${data.charts.meta.primary_date})`
                            : `Top ${data.charts.meta.secondary_cat} Performance`}
                        </h3>
                        <p className="text-xs text-slate-500">
                          {data.charts.time_series.length > 0
                            ? "Chronological performance trajectory"
                            : "Ranked segment comparison"}
                        </p>
                      </div>
                      <span className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700">
                        {data.charts.time_series.length > 0 ? "Time Series" : "Top Segments"}
                      </span>
                    </div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        {data.charts.time_series.length > 0 ? (
                          <AreaChart data={data.charts.time_series}>
                            <defs>
                              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                                <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} />
                            <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "#0f172a",
                                border: "none",
                                borderRadius: "8px",
                                color: "#f8fafc",
                                fontSize: "12px",
                              }}
                            />
                            <Area
                              type="monotone"
                              dataKey="value"
                              stroke="#2563eb"
                              strokeWidth={2}
                              fillOpacity={1}
                              fill="url(#colorValue)"
                            />
                          </AreaChart>
                        ) : (
                          <BarChart data={data.charts.secondary_bar}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} />
                            <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                            <Tooltip />
                            <Bar dataKey="total" fill="#10b981" radius={[6, 6, 0, 0]} />
                          </BarChart>
                        )}
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Autonomous Executive Insights Grid */}
                <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-2xs">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Autonomous Executive Insights
                      </h3>
                      <p className="text-xs text-slate-500">
                        Automatically extracted statistical findings, anomalies, and dominance patterns
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-blue-600">
                      {data.auto_insights.length} Verified Findings
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {data.auto_insights.map((ins, i) => (
                      <div
                        key={i}
                        className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 flex flex-col justify-between border-l-4 border-l-blue-600"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                              {ins.category}
                            </span>
                            <span
                              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                                ins.impact === "positive"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : ins.impact === "warning"
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-blue-50 text-blue-700"
                              }`}
                            >
                              {ins.badge}
                            </span>
                          </div>
                          <h4 className="text-sm font-bold text-slate-900 mb-1">{ins.title}</h4>
                          <p className="text-xs text-slate-600 leading-relaxed">{ins.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB 2: DATA EXPLORER & PROFILER */}
            {data && activeTab === "explorer" && (
              <motion.div
                key="explorer"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                {/* Column Schema & Statistical Profile Table */}
                <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
                  <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Column Schema & Statistical Health Profile
                      </h3>
                      <p className="text-xs text-slate-500">
                        Automated type classification, null auditing, and IQR outlier detection
                      </p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          <th className="py-3 px-4">Column Name</th>
                          <th className="py-3 px-4">Detected Role</th>
                          <th className="py-3 px-4">Type</th>
                          <th className="py-3 px-4">Missing / Nulls</th>
                          <th className="py-3 px-4">Unique</th>
                          <th className="py-3 px-4">Statistical Summary</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-xs">
                        {data.schema.map((col, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/80">
                            <td className="py-3 px-4 font-semibold text-slate-900">{col.name}</td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${
                                  col.role === "Numeric"
                                    ? "bg-blue-50 text-blue-700"
                                    : col.role === "Date"
                                    ? "bg-purple-50 text-purple-700"
                                    : "bg-slate-100 text-slate-700"
                                }`}
                              >
                                {col.role}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-500">{col.dtype}</td>
                            <td className="py-3 px-4">
                              {col.null_count > 0 ? (
                                <span className="text-amber-600 font-semibold">
                                  {col.null_count} ({col.null_pct}%)
                                </span>
                              ) : (
                                <span className="text-emerald-600 font-medium">0 (0%)</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-slate-700">{col.unique_count}</td>
                            <td className="py-3 px-4 text-slate-600">
                              {col.role === "Numeric" ? (
                                <span>
                                  Mean: <b>{col.mean}</b> | Med: <b>{col.median}</b> | Min:{" "}
                                  <b>{col.min}</b> | Max: <b>{col.max}</b> ({col.outliers} outliers)
                                </span>
                              ) : (
                                <span>
                                  Top: <b>{col.top_value ?? "N/A"}</b> ({col.top_freq ?? 0}x)
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Raw Dataset Preview Table */}
                <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
                  <div className="p-6 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Dataset Record Preview</h3>
                      <p className="text-xs text-slate-500">
                        Inspecting top 15 ingested rows (original data preserved)
                      </p>
                    </div>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        placeholder="Filter preview rows..."
                        className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          {data.columns.map((c) => (
                            <th key={c} className="py-3 px-4 whitespace-nowrap">
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-xs">
                        {data.preview
                          .filter((row) =>
                            !searchFilter
                              ? true
                              : Object.values(row)
                                  .join(" ")
                                  .toLowerCase()
                                  .includes(searchFilter.toLowerCase())
                          )
                          .map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-slate-50/80">
                              {data.columns.map((c) => (
                                <td key={c} className="py-2.5 px-4 whitespace-nowrap text-slate-700">
                                  {row[c] !== null && row[c] !== undefined ? (
                                    String(row[c])
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-semibold">
                                      NULL
                                    </span>
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB 3: AI QUERY ANALYST */}
            {data && activeTab === "analyst" && (
              <motion.div
                key="analyst"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-2xs space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        AI Natural-Language Query Planner
                      </h3>
                      <p className="text-xs text-slate-500">
                        AI interprets your question into a validated analytical plan; Python & Pandas execute the exact math.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                      <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="Optional Gemini API Key (auto-fallback active)"
                        className="text-xs bg-transparent focus:outline-none text-slate-700 w-64"
                      />
                    </div>
                  </div>

                  {/* Question Input Bar */}
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAskQuestion();
                      }}
                      placeholder="Ask an analytical question about your uploaded dataset..."
                      className="flex-1 px-4 py-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-blue-600"
                    />
                    <button
                      onClick={() => handleAskQuestion()}
                      disabled={queryLoading || !question.trim()}
                      className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold transition flex items-center gap-2 cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4" />
                      {queryLoading ? "Calculating..." : "Run Analysis"}
                    </button>
                  </div>

                  {/* Suggested Question Chips */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-xs font-medium text-slate-400">Suggested:</span>
                    {suggestedQuestions.map((sq, i) => (
                      <button
                        key={i}
                        onClick={() => handleAskQuestion(sq)}
                        className="text-xs px-3 py-1.5 rounded-full bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 transition cursor-pointer"
                      >
                        {sq}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Query Results Stream */}
                <div className="space-y-4">
                  {queryHistory.length === 0 ? (
                    <div className="bg-white p-10 rounded-xl border border-slate-200/80 text-center text-slate-400 text-sm">
                      Click any suggested question above or type your own question to generate verified Pandas insights.
                    </div>
                  ) : (
                    queryHistory.map((res, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-4"
                      >
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                          <p className="text-sm font-bold text-slate-900">Q: {res.question}</p>
                          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">
                            {res.planner_used}
                          </span>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-50 border-l-4 border-l-blue-600 text-sm text-slate-700 leading-relaxed">
                          {formatRichText(res.answer)}
                        </div>

                        {/* Supporting Chart if grouped data returned */}
                        {res.supporting_data && res.supporting_data.length > 1 && (
                          <div className="h-56 pt-2">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={res.supporting_data}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} />
                                <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                                <Tooltip />
                                <Bar dataKey="value" fill="#2563eb" radius={[6, 6, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs text-slate-500">
                          <span>
                            <b>Analytical Plan:</b> {res.explanation}
                          </span>
                          <span className="font-mono bg-slate-900 text-slate-100 px-3 py-1 rounded-md flex items-center gap-1.5">
                            <Code2 className="w-3.5 h-3.5 text-blue-400" />
                            {res.code_executed}
                          </span>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              </motion.div>
            )}

            {/* TAB 4: EXECUTIVE REPORTS */}
            {data && activeTab === "reports" && (
              <motion.div
                key="reports"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="bg-white p-8 rounded-xl border border-slate-200/90 shadow-2xs space-y-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">
                      Executive Analytics Report — {data.filename}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Compiled automatically by InsightAI ReportLab Engine • Ready for offline PDF export
                    </p>
                  </div>
                  <a
                    href={`${API_BASE}/api/export-pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download Official PDF Report
                  </a>
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Included in Your Exportable PDF
                  </h4>
                  <ul className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600">
                    <li className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                      <b className="text-slate-900 block mb-1">1. Executive KPI Summary</b>
                      Complete record counts, dimension audit, completeness score (
                      {data.summary.completeness_score}%), and primary metric aggregations.
                    </li>
                    <li className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                      <b className="text-slate-900 block mb-1">2. Autonomous Findings</b>
                      All {data.auto_insights.length} statistical and segment dominance insights formatted for stakeholder review.
                    </li>
                    <li className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                      <b className="text-slate-900 block mb-1">3. Full Governance Schema</b>
                      Column-by-column data types, null percentages, cardinality, and mean/top-value benchmarks.
                    </li>
                  </ul>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}