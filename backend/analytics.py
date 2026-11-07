import os
import re
import math
import pandas as pd
import numpy as np
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

# Optional Gemini SDK import
try:
    from google import genai
    from google.genai import types
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False


# ==========================================
# 1. PYDANTIC SCHEMAS FOR STRUCTURED PLANS
# ==========================================
class AnalyticalPlan(BaseModel):
    operation: str = Field(
        description="One of: sum, mean, median, min, max, count, missing, groupby_sum, groupby_mean, value_counts, correlation"
    )
    target_column: Optional[str] = Field(default=None, description="The numeric or target column to analyze")
    group_by_column: Optional[str] = Field(default=None, description="The categorical column to group by, if applicable")
    sort_order: str = Field(default="desc", description="'desc' for highest/top, 'asc' for lowest/bottom")
    explanation: str = Field(default="", description="Brief explanation of why this operation answers the user's question")


# ==========================================
# 2. SAFE JSON SERIALIZATION HELPERS
# ==========================================
def clean_val(val: Any) -> Any:
    """Convert NumPy/Pandas types and NaNs into native JSON-safe Python types."""
    if val is None or pd.isna(val):
        return None
    if isinstance(val, (np.integer, int)):
        return int(val)
    if isinstance(val, (np.floating, float)):
        if math.isnan(val) or math.isinf(val):
            return None
        return round(float(val), 2)
    return str(val)


def detect_column_roles(df: pd.DataFrame) -> Dict[str, Any]:
    """Automatically classify columns into numeric, categorical, datetime, and ID roles."""
    numeric_cols = []
    categorical_cols = []
    date_cols = []
    id_cols = []

    for col in df.columns:
        series = df[col]
        col_lower = col.lower()

        # Check ID-like columns
        if ("id" in col_lower or "code" in col_lower) and series.nunique() > len(df) * 0.5:
            id_cols.append(col)
            continue

        # Check numeric columns
        if pd.api.types.is_numeric_dtype(series) and not pd.api.types.is_bool_dtype(series):
            numeric_cols.append(col)
            continue

        # Check datetime columns
        if pd.api.types.is_datetime64_any_dtype(series):
            date_cols.append(col)
            continue

        if any(k in col_lower for k in ["date", "time", "day", "month", "year"]):
            try:
                parsed = pd.to_datetime(series.dropna().head(20), errors="raise")
                if len(parsed) > 0:
                    date_cols.append(col)
                    continue
            except Exception:
                pass

        # Otherwise treat as categorical if reasonable cardinality
        categorical_cols.append(col)

    # Pick primary metric (prefer revenue/sales/amount/total/price/profit)
    primary_metric = None
    priority_keywords = ["revenue", "sales", "amount", "total", "profit", "price", "value", "score", "cost"]
    for kw in priority_keywords:
        for col in numeric_cols:
            if kw in col.lower():
                primary_metric = col
                break
        if primary_metric:
            break
    if not primary_metric and numeric_cols:
        primary_metric = numeric_cols[-1]

    # Pick primary and secondary categories (prefer 2 to 25 unique values)
    good_cats = [c for c in categorical_cols if 2 <= df[c].nunique(dropna=True) <= 25]
    if not good_cats:
        good_cats = categorical_cols

    primary_cat = good_cats[0] if len(good_cats) > 0 else None
    secondary_cat = good_cats[1] if len(good_cats) > 1 else None
    primary_date = date_cols[0] if len(date_cols) > 0 else None

    return {
        "numeric_cols": numeric_cols,
        "categorical_cols": categorical_cols,
        "date_cols": date_cols,
        "id_cols": id_cols,
        "primary_metric": primary_metric,
        "primary_cat": primary_cat,
        "secondary_cat": secondary_cat,
        "primary_date": primary_date,
    }


# ==========================================
# 3. DATASET PROFILING & AUTO-EDA ENGINE
# ==========================================
def profile_and_analyze_dataset(df: pd.DataFrame) -> Dict[str, Any]:
    """Generate complete health metrics, column schemas, automated charts, and statistical insights."""
    total_rows, total_cols = df.shape
    total_cells = total_rows * total_cols if total_rows * total_cols > 0 else 1
    missing_cells = int(df.isna().sum().sum())
    completeness = round(((total_cells - missing_cells) / total_cells) * 100, 2)
    duplicate_rows = int(df.duplicated().sum())

    roles = detect_column_roles(df)
    numeric_cols = roles["numeric_cols"]
    primary_metric = roles["primary_metric"]
    primary_cat = roles["primary_cat"]
    secondary_cat = roles["secondary_cat"]
    primary_date = roles["primary_date"]

    # 1. Column-by-Column Schema & Statistical Profile
    schema_list = []
    for col in df.columns:
        s = df[col]
        null_cnt = int(s.isna().sum())
        null_pct = round((null_cnt / total_rows) * 100, 2) if total_rows > 0 else 0.0
        uniq_cnt = int(s.nunique(dropna=True))

        col_info: Dict[str, Any] = {
            "name": col,
            "dtype": str(s.dtype),
            "role": (
                "Numeric" if col in numeric_cols
                else "Date" if col in roles["date_cols"]
                else "Identifier" if col in roles["id_cols"]
                else "Categorical"
            ),
            "null_count": null_cnt,
            "null_pct": null_pct,
            "unique_count": uniq_cnt,
        }

        if col in numeric_cols:
            clean_s = s.dropna()
            if len(clean_s) > 0:
                q1 = float(clean_s.quantile(0.25))
                q3 = float(clean_s.quantile(0.75))
                iqr = q3 - q1
                outliers = int(((clean_s < (q1 - 1.5 * iqr)) | (clean_s > (q3 + 1.5 * iqr))).sum())
                col_info.update({
                    "sum": clean_val(clean_s.sum()),
                    "mean": clean_val(clean_s.mean()),
                    "median": clean_val(clean_s.median()),
                    "std": clean_val(clean_s.std()),
                    "min": clean_val(clean_s.min()),
                    "max": clean_val(clean_s.max()),
                    "outliers": outliers,
                })
        else:
            clean_s = s.dropna()
            if len(clean_s) > 0:
                top_val = str(clean_s.mode().iloc[0]) if not clean_s.mode().empty else "N/A"
                top_freq = int((clean_s == top_val).sum())
                col_info.update({
                    "top_value": top_val,
                    "top_freq": top_freq,
                })

        schema_list.append(col_info)

    # 2. Automated Visualizations (Ready for Frontend Recharts)
    charts: Dict[str, Any] = {
        "primary_bar": [],
        "secondary_bar": [],
        "time_series": [],
        "correlations": [],
        "meta": {
            "primary_metric": primary_metric or "Count",
            "primary_cat": primary_cat or "Category",
            "secondary_cat": secondary_cat or "Item",
            "primary_date": primary_date or "Timeline",
        },
    }

    # Chart A: Primary Category Breakdown
    if primary_cat and primary_metric:
        grouped = (
            df.groupby(primary_cat, dropna=True)[primary_metric]
            .agg(["sum", "mean", "count"])
            .reset_index()
            .sort_values(by="sum", ascending=False)
            .head(10)
        )
        charts["primary_bar"] = [
            {
                "name": str(row[primary_cat]),
                "total": clean_val(row["sum"]),
                "average": clean_val(row["mean"]),
                "count": int(row["count"]),
            }
            for _, row in grouped.iterrows()
        ]
    elif primary_cat:
        vc = df[primary_cat].value_counts(dropna=True).head(10)
        charts["primary_bar"] = [{"name": str(k), "total": int(v), "average": int(v), "count": int(v)} for k, v in vc.items()]

    # Chart B: Secondary Category / Top Performers
    if secondary_cat and primary_metric:
        grouped2 = (
            df.groupby(secondary_cat, dropna=True)[primary_metric]
            .agg(["sum", "mean", "count"])
            .reset_index()
            .sort_values(by="sum", ascending=False)
            .head(8)
        )
        charts["secondary_bar"] = [
            {
                "name": str(row[secondary_cat]),
                "total": clean_val(row["sum"]),
                "average": clean_val(row["mean"]),
                "count": int(row["count"]),
            }
            for _, row in grouped2.iterrows()
        ]

    # Chart C: Time Series Trend (if Date exists)
    if primary_date and primary_metric:
        temp_df = df[[primary_date, primary_metric]].dropna().copy()
        temp_df["_parsed_date"] = pd.to_datetime(temp_df[primary_date], errors="coerce")
        temp_df = temp_df.dropna(subset=["_parsed_date"])
        if not temp_df.empty:
            # Group by Year-Month if spanning > 45 days, else by exact day
            span_days = (temp_df["_parsed_date"].max() - temp_df["_parsed_date"].min()).days
            if span_days > 45:
                temp_df["period"] = temp_df["_parsed_date"].dt.to_period("M").astype(str)
            else:
                temp_df["period"] = temp_df["_parsed_date"].dt.strftime("%Y-%m-%d")

            ts = temp_df.groupby("period")[primary_metric].sum().reset_index().sort_values("period")
            charts["time_series"] = [
                {"date": str(row["period"]), "value": clean_val(row[primary_metric])}
                for _, row in ts.iterrows()
            ]

    # Chart D: Feature Correlations
    if len(numeric_cols) >= 2:
        corr_matrix = df[numeric_cols].corr()
        corr_pairs = []
        for i in range(len(numeric_cols)):
            for j in range(i + 1, len(numeric_cols)):
                c1, c2 = numeric_cols[i], numeric_cols[j]
                val = clean_val(corr_matrix.loc[c1, c2])
                if val is not None:
                    corr_pairs.append({
                        "pair": f"{c1} vs {c2}",
                        "col_a": c1,
                        "col_b": c2,
                        "correlation": val,
                        "strength": "Strong" if abs(val) >= 0.6 else "Moderate" if abs(val) >= 0.3 else "Weak",
                    })
        corr_pairs.sort(key=lambda x: abs(x["correlation"]), reverse=True)
        charts["correlations"] = corr_pairs

    # 3. Autonomous Executive Insights Generation
    auto_insights = []

    # Insight 1: Top Category Driver
    if charts["primary_bar"] and primary_metric:
        top_item = charts["primary_bar"][0]
        overall_sum = df[primary_metric].sum()
        share_pct = round((top_item["total"] / overall_sum) * 100, 1) if overall_sum else 0
        auto_insights.append({
            "title": f"Dominant {primary_cat}: {top_item['name']}",
            "category": "Performance Leader",
            "badge": f"{share_pct}% Share",
            "impact": "positive",
            "description": (
                f"'{top_item['name']}' leads all {primary_cat} segments, generating "
                f"{top_item['total']:,.2f} in {primary_metric} ({share_pct}% of total volume across {top_item['count']} records)."
            ),
        })

    # Insight 2: Secondary Dimension Leader (e.g., Top Product or Region)
    if charts["secondary_bar"] and primary_metric:
        top_sec = charts["secondary_bar"][0]
        bottom_sec = charts["secondary_bar"][-1]
        auto_insights.append({
            "title": f"Top {secondary_cat}: {top_sec['name']}",
            "category": "Segment Breakdown",
            "badge": f"Top of {len(charts['secondary_bar'])}",
            "impact": "positive",
            "description": (
                f"Within {secondary_cat}, '{top_sec['name']}' achieved the highest {primary_metric} at "
                f"{top_sec['total']:,.2f}, outperforming '{bottom_sec['name']}' ({bottom_sec['total']:,.2f})."
            ),
        })

    # Insight 3: Statistical Distribution & Outlier Analysis
    if primary_metric:
        s_clean = df[primary_metric].dropna()
        if len(s_clean) > 0:
            mean_val = float(s_clean.mean())
            med_val = float(s_clean.median())
            q1, q3 = float(s_clean.quantile(0.25)), float(s_clean.quantile(0.75))
            iqr = q3 - q1
            outliers = int(((s_clean < (q1 - 1.5 * iqr)) | (s_clean > (q3 + 1.5 * iqr))).sum())
            skew_dir = "right-skewed (high-value spikes)" if mean_val > med_val * 1.05 else "evenly distributed"
            auto_insights.append({
                "title": f"{primary_metric} Distribution & Anomalies",
                "category": "Statistical Profile",
                "badge": f"{outliers} Outliers",
                "impact": "neutral" if outliers == 0 else "warning",
                "description": (
                    f"The average {primary_metric} is {mean_val:,.2f} (median {med_val:,.2f}), indicating a {skew_dir} distribution "
                    f"with {outliers} statistical outlier records detected via IQR thresholding."
                ),
            })

    # Insight 4: Data Quality & Completeness Audit
    cols_with_nulls = [c["name"] for c in schema_list if c["null_count"] > 0]
    if missing_cells > 0:
        auto_insights.append({
            "title": "Missing Value Concentration Detected",
            "category": "Data Governance",
            "badge": f"{completeness}% Complete",
            "impact": "warning",
            "description": (
                f"Detected {missing_cells} missing cells across {len(cols_with_nulls)} column(s): {', '.join(cols_with_nulls)}. "
                f"Original dataset integrity is preserved without destructive imputation."
            ),
        })
    else:
        auto_insights.append({
            "title": "100% Data Completeness Verified",
            "category": "Data Governance",
            "badge": "Zero Nulls",
            "impact": "positive",
            "description": "Every column across all ingested records passed null-value validation with zero missing entries.",
        })

    # Insight 5: Correlation Insight
    if charts["correlations"]:
        top_corr = charts["correlations"][0]
        auto_insights.append({
            "title": f"Relationship: {top_corr['pair']}",
            "category": "Correlation Matrix",
            "badge": f"r = {top_corr['correlation']}",
            "impact": "positive" if abs(top_corr["correlation"]) >= 0.5 else "neutral",
            "description": (
                f"Observed a {top_corr['strength'].lower()} correlation (r = {top_corr['correlation']}) between "
                f"{top_corr['col_a']} and {top_corr['col_b']}. Note: statistical correlation does not imply direct causation."
            ),
        })

    # 4. Data Preview (First 15 rows safely serialized)
    preview_rows = []
    for _, row in df.head(15).iterrows():
        preview_rows.append({col: clean_val(row[col]) for col in df.columns})

    # High-level KPI summary
    primary_sum = clean_val(df[primary_metric].sum()) if primary_metric else None
    primary_avg = clean_val(df[primary_metric].mean()) if primary_metric else None

    return {
        "summary": {
            "total_rows": total_rows,
            "total_columns": total_cols,
            "missing_values": missing_cells,
            "completeness_score": completeness,
            "duplicate_rows": duplicate_rows,
            "primary_metric_name": primary_metric,
            "primary_metric_sum": primary_sum,
            "primary_metric_avg": primary_avg,
        },
        "schema": schema_list,
        "charts": charts,
        "auto_insights": auto_insights,
        "preview": preview_rows,
        "columns": list(df.columns),
    }


# ==========================================
# 4. NATURAL LANGUAGE AI & DETERMINISTIC QUERY ENGINE
# ==========================================
def build_plan_with_heuristic(question: str, df: pd.DataFrame) -> AnalyticalPlan:
    """Deterministic fallback planner that matches natural language against actual dataset columns."""
    q = question.lower().strip()
    roles = detect_column_roles(df)
    numeric_cols = roles["numeric_cols"]
    categorical_cols = roles["categorical_cols"]
    primary_metric = roles["primary_metric"]

    # Check missing values query
    if any(w in q for w in ["missing", "null", "empty", "incomplete", "nan"]):
        return AnalyticalPlan(
            operation="missing",
            explanation="Inspecting all dataset columns for missing/null values using Pandas .isna().sum().",
        )

    # Check correlation query
    if any(w in q for w in ["correlat", "relationship", "relate"]):
        return AnalyticalPlan(
            operation="correlation",
            explanation="Calculating Pearson correlation coefficients across numeric features.",
        )

    # Detect target numeric column mentioned in question
    target_col = primary_metric
    for col in numeric_cols:
        col_clean = col.lower().replace("_", " ")
        if col_clean in q or col.lower() in q:
            target_col = col
            break

    # Detect group_by categorical column mentioned in question
    group_col = None
    for col in categorical_cols:
        col_clean = col.lower().replace("_", " ")
        if col_clean in q or col.lower() in q:
            group_col = col
            break

    # If user asks "which [category]" or "by [category]" or "across [category]"
    if not group_col and any(w in q for w in ["which", "best", "highest", "top", "lowest", "worst", "by", "across", "vary", "compare"]):
        # Check if any word in question matches singular/plural of a column
        for col in categorical_cols:
            base = col.lower().rstrip("s")
            if base in q:
                group_col = col
                break

    sort_order = "asc" if any(w in q for w in ["lowest", "worst", "minimum", "least", "bottom", "smallest"]) else "desc"

    # Grouped aggregation
    if group_col and target_col:
        op = "groupby_mean" if any(w in q for w in ["average", "mean", "avg"]) else "groupby_sum"
        return AnalyticalPlan(
            operation=op,
            target_column=target_col,
            group_by_column=group_col,
            sort_order=sort_order,
            explanation=f"Grouping dataset by '{group_col}' and aggregating '{target_col}' ({op.replace('groupby_', '')}).",
        )

    # Value counts if only categorical column found
    if group_col and not target_col:
        return AnalyticalPlan(
            operation="value_counts",
            group_by_column=group_col,
            sort_order=sort_order,
            explanation=f"Counting record frequency across '{group_col}'.",
        )

    # Scalar aggregations on target numeric column
    if target_col:
        if any(w in q for w in ["average", "mean", "avg"]):
            return AnalyticalPlan(operation="mean", target_column=target_col, explanation=f"Calculating arithmetic mean of '{target_col}'.")
        if "median" in q:
            return AnalyticalPlan(operation="median", target_column=target_col, explanation=f"Calculating median (50th percentile) of '{target_col}'.")
        if any(w in q for w in ["minimum", "lowest", "smallest", "min"]):
            return AnalyticalPlan(operation="min", target_column=target_col, explanation=f"Finding minimum value in '{target_col}'.")
        if any(w in q for w in ["maximum", "highest", "largest", "max"]):
            return AnalyticalPlan(operation="max", target_column=target_col, explanation=f"Finding maximum single record value in '{target_col}'.")
        if any(w in q for w in ["total", "sum", "overall"]):
            return AnalyticalPlan(operation="sum", target_column=target_col, explanation=f"Summing all values in '{target_col}'.")

    if any(w in q for w in ["how many rows", "total records", "count", "how many orders"]):
        return AnalyticalPlan(operation="count", explanation="Counting total rows in the dataset.")

    # Default fallback: summarize primary metric by primary category
    if roles["primary_cat"] and primary_metric:
        return AnalyticalPlan(
            operation="groupby_sum",
            target_column=primary_metric,
            group_by_column=roles["primary_cat"],
            sort_order="desc",
            explanation=f"Summarizing '{primary_metric}' across '{roles['primary_cat']}' segments.",
        )

    return AnalyticalPlan(operation="count", explanation="Counting total records in dataset.")


def build_plan_with_gemini(question: str, df: pd.DataFrame, api_key: str) -> Optional[AnalyticalPlan]:
    """Use Google Gemini to translate natural language into a validated AnalyticalPlan."""
    if not GEMINI_AVAILABLE or not api_key:
        return None
    try:
        client = genai.Client(api_key=api_key)
        col_summary = ", ".join([f"{c} ({df[c].dtype})" for c in df.columns])
        prompt = (
            f"You are an AI query planner for a Pandas analytics engine.\n"
            f"Dataset columns: {col_summary}\n"
            f"User question: {question}\n"
            f"Translate this question into a structured AnalyticalPlan JSON. "
            f"Only use exact column names from the dataset."
        )
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=AnalyticalPlan,
                temperature=0.0,
            ),
        )
        if response and response.text:
            return AnalyticalPlan.model_validate_json(response.text)
    except Exception:
        return None
    return None


def execute_natural_language_query(df: pd.DataFrame, question: str, api_key: Optional[str] = None) -> Dict[str, Any]:
    """Translate a user's question into a validated plan and execute it deterministically with Pandas."""
    effective_key = api_key or os.getenv("GEMINI_API_KEY")
    planner_used = "Google Gemini LLM Planner"

    plan = build_plan_with_gemini(question, df, effective_key) if effective_key else None
    if plan is None:
        plan = build_plan_with_heuristic(question, df)
        planner_used = "Deterministic NLP Schema Planner"

    op = plan.operation
    t_col = plan.target_column if plan.target_column in df.columns else None
    g_col = plan.group_by_column if plan.group_by_column in df.columns else None
    ascending = plan.sort_order == "asc"

    supporting_data = []
    answer_text = ""
    code_executed = ""

    if op == "missing":
        null_series = df.isna().sum()
        total_missing = int(null_series.sum())
        supporting_data = [
            {"name": str(col), "value": int(cnt)}
            for col, cnt in null_series.items()
            if cnt > 0
        ]
        if total_missing == 0:
            answer_text = "There are **0 missing values** across the entire dataset. All columns are 100% complete."
        else:
            breakdown = ", ".join([f"**{d['name']}** ({d['value']})" for d in supporting_data])
            answer_text = f"The dataset contains **{total_missing} missing values** located in: {breakdown}."
        code_executed = "df.isna().sum()"

    elif op == "correlation":
        roles = detect_column_roles(df)
        num_cols = roles["numeric_cols"]
        if len(num_cols) >= 2:
            corr = df[num_cols].corr()
            for i in range(len(num_cols)):
                for j in range(i + 1, len(num_cols)):
                    c1, c2 = num_cols[i], num_cols[j]
                    supporting_data.append({"name": f"{c1} vs {c2}", "value": clean_val(corr.loc[c1, c2])})
            supporting_data.sort(key=lambda x: abs(x["value"] or 0), reverse=True)
            top = supporting_data[0]
            answer_text = f"The strongest numeric relationship is between **{top['name']}** with a correlation coefficient of **r = {top['value']}**."
            code_executed = f"df[{num_cols}].corr()"
        else:
            answer_text = "At least two numeric columns are required to compute a correlation matrix."
            code_executed = "N/A"

    elif op in ("groupby_sum", "groupby_mean") and g_col and t_col:
        agg_func = "sum" if op == "groupby_sum" else "mean"
        grouped = df.groupby(g_col, dropna=True)[t_col].agg(agg_func).sort_values(ascending=ascending)
        supporting_data = [{"name": str(k), "value": clean_val(v)} for k, v in grouped.head(10).items()]
        if supporting_data:
            lead = supporting_data[0]
            label = "lowest" if ascending else "highest"
            metric_label = "total" if agg_func == "sum" else "average"
            answer_text = (
                f"**{lead['name']}** ranks {label} in {g_col}, with a {metric_label} **{t_col}** of **{lead['value']:,.2f}**."
            )
        code_executed = f"df.groupby('{g_col}')['{t_col}'].{agg_func}().sort_values(ascending={ascending})"

    elif op == "value_counts" and g_col:
        vc = df[g_col].value_counts(dropna=True, ascending=ascending)
        supporting_data = [{"name": str(k), "value": int(v)} for k, v in vc.head(10).items()]
        if supporting_data:
            lead = supporting_data[0]
            answer_text = f"**{lead['name']}** is the top entry in **{g_col}** with **{lead['value']:,}** records."
        code_executed = f"df['{g_col}'].value_counts()"

    elif op in ("sum", "mean", "median", "min", "max") and t_col:
        s = df[t_col].dropna()
        val = clean_val(getattr(s, op)())
        label_map = {"sum": "total sum", "mean": "average (mean)", "median": "median", "min": "minimum", "max": "maximum"}
        answer_text = f"The {label_map[op]} of **{t_col}** across {len(s):,} valid records is **{val:,.2f}**."
        code_executed = f"df['{t_col}'].{op}()"

    else:
        answer_text = f"The dataset contains **{len(df):,} rows** and **{len(df.columns)} columns**."
        code_executed = "df.shape"

    return {
        "question": question,
        "answer": answer_text,
        "explanation": plan.explanation,
        "code_executed": code_executed,
        "planner_used": planner_used,
        "operation": op,
        "supporting_data": supporting_data,
    }