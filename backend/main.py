import io
from datetime import datetime, timedelta
from typing import Optional
import pandas as pd
import numpy as np
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

from analytics import profile_and_analyze_dataset, execute_natural_language_query

load_dotenv()

app = FastAPI(
    title="InsightAI Autonomous Analytics API",
    description="Backend analytical and AI query engine for InsightAI",
    version="2.0.0",
)

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory store for active session dataset
SESSION_STORE = {
    "df": None,
    "filename": None,
    "profile": None,
}


class QueryRequest(BaseModel):
    question: str
    api_key: Optional[str] = None


def generate_sample_ecommerce_df() -> pd.DataFrame:
    """Generate a deterministic 500-row enterprise e-commerce dataset for instant testing."""
    np.random.seed(42)
    num_records = 500
    categories = ["Electronics", "Enterprise Software", "Cloud Hardware", "Office Ergonomics"]
    products = {
        "Electronics": ["ProBook Workstation", "UltraWide 4K Monitor", "Noise-Canceling Headset", "Thunderbolt Dock"],
        "Enterprise Software": ["Analytics Suite License", "Cloud Security Seat", "AI Copilot Add-on", "Database Cluster"],
        "Cloud Hardware": ["Rack Server Blade", "NVMe Storage Array", "Managed Switch 48P", "Edge Gateway"],
        "Office Ergonomics": ["ErgoMesh Chair Pro", "Motorized Standing Desk", "Dual Monitor Arm", "Acoustic Desk Panel"],
    }
    regions = ["North America", "Europe", "Asia-Pacific", "India & ME"]
    segments = ["Enterprise", "Mid-Market", "SMB"]

    dates = [datetime(2025, 1, 1) + timedelta(days=int(np.random.randint(0, 365))) for _ in range(num_records)]
    cat_choices = np.random.choice(categories, num_records, p=[0.35, 0.30, 0.20, 0.15])
    prod_choices = [np.random.choice(products[c]) for c in cat_choices]
    quantities = np.random.randint(1, 15, num_records)

    base_prices = {
        "Electronics": (250, 1800),
        "Enterprise Software": (500, 3200),
        "Cloud Hardware": (1200, 4800),
        "Office Ergonomics": (150, 950),
    }
    unit_prices = [round(float(np.random.uniform(*base_prices[c])), 2) for c in cat_choices]
    region_choices = np.random.choice(regions, num_records, p=[0.35, 0.28, 0.22, 0.15])
    segment_choices = np.random.choice(segments, num_records, p=[0.45, 0.35, 0.20])

    df = pd.DataFrame({
        "Order_ID": [f"ORD-{10000 + i}" for i in range(num_records)],
        "Order_Date": [d.strftime("%Y-%m-%d") for d in dates],
        "Category": cat_choices,
        "Product": prod_choices,
        "Customer_Segment": segment_choices,
        "Region": region_choices,
        "Quantity": quantities,
        "Unit_Price": unit_prices,
    })

    df["Total_Revenue"] = (df["Quantity"] * df["Unit_Price"]).round(2)
    df["Profit_Margin_Pct"] = np.random.uniform(18.0, 48.0, num_records).round(2)

    # Introduce 12 missing values in Region for realistic governance auditing
    missing_idx = np.random.choice(num_records, size=12, replace=False)
    df.loc[missing_idx, "Region"] = np.nan

    return df


@app.get("/api/health")
def health_check():
    return {
        "status": "online",
        "service": "InsightAI Analytical Engine",
        "dataset_loaded": SESSION_STORE["df"] is not None,
        "filename": SESSION_STORE["filename"],
    }


@app.post("/api/upload")
async def upload_dataset(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .CSV files are supported.")

    try:
        contents = await file.read()
        try:
            df = pd.read_csv(io.BytesIO(contents))
        except UnicodeDecodeError:
            df = pd.read_csv(io.BytesIO(contents), encoding="latin1")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV file: {str(e)}")

    if df.empty or len(df.columns) == 0:
        raise HTTPException(status_code=400, detail="The uploaded CSV file is empty.")

    profile = profile_and_analyze_dataset(df)
    SESSION_STORE["df"] = df
    SESSION_STORE["filename"] = file.filename
    SESSION_STORE["profile"] = profile

    return {
        "filename": file.filename,
        **profile,
    }


@app.post("/api/sample")
def load_sample_dataset():
    df = generate_sample_ecommerce_df()
    filename = "enterprise_sales_2025.csv"
    profile = profile_and_analyze_dataset(df)

    SESSION_STORE["df"] = df
    SESSION_STORE["filename"] = filename
    SESSION_STORE["profile"] = profile

    return {
        "filename": filename,
        **profile,
    }


@app.post("/api/query")
def query_dataset(req: QueryRequest):
    df = SESSION_STORE["df"]
    if df is None:
        raise HTTPException(status_code=400, detail="No dataset loaded. Please upload a CSV file first.")

    if not req.question or not req.question.strip():
        raise HTTPException(status_code=400, detail="Please provide a valid analytical question.")

    result = execute_natural_language_query(df, req.question, req.api_key)
    return result


@app.get("/api/export-pdf")
def export_pdf_report():
    profile = SESSION_STORE["profile"]
    filename = SESSION_STORE["filename"] or "dataset.csv"
    if not profile:
        raise HTTPException(status_code=400, detail="No dataset analyzed yet. Upload a dataset first.")

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=40,
        leftMargin=40,
        topMargin=40,
        bottomMargin=40,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Heading1"],
        fontSize=20,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=6,
    )
    subtitle_style = ParagraphStyle(
        "DocSubtitle",
        parent=styles["Normal"],
        fontSize=10,
        textColor=colors.HexColor("#64748b"),
        spaceAfter=18,
    )
    section_style = ParagraphStyle(
        "SectionHeading",
        parent=styles["Heading2"],
        fontSize=13,
        textColor=colors.HexColor("#1e293b"),
        spaceBefore=14,
        spaceAfter=8,
    )
    body_style = ParagraphStyle(
        "BodyTextCustom",
        parent=styles["Normal"],
        fontSize=10,
        textColor=colors.HexColor("#334155"),
        leading=14,
        spaceAfter=6,
    )

    elements = []

    # Header
    elements.append(Paragraph("InsightAI — Executive Analytics Report", title_style))
    elements.append(
        Paragraph(
            f"Source Dataset: <b>{filename}</b> | Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}",
            subtitle_style,
        )
    )

    # 1. Dataset Overview Table
    elements.append(Paragraph("1. Executive Summary & Data Health", section_style))
    s = profile["summary"]
    metric_label = s["primary_metric_name"] or "Primary Metric"
    metric_sum_str = f"{s['primary_metric_sum']:,.2f}" if s["primary_metric_sum"] is not None else "N/A"
    metric_avg_str = f"{s['primary_metric_avg']:,.2f}" if s["primary_metric_avg"] is not None else "N/A"

    summary_data = [
        ["Metric", "Value", "Metric", "Value"],
        ["Total Records", f"{s['total_rows']:,}", "Total Dimensions", f"{s['total_columns']}"],
        ["Completeness Score", f"{s['completeness_score']}%", "Missing Cells", f"{s['missing_values']}"],
        [f"Total {metric_label}", metric_sum_str, f"Average {metric_label}", metric_avg_str],
    ]
    summary_table = Table(summary_data, colWidths=[130, 130, 130, 130])
    summary_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#f8fafc")),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("PADDING", (0, 0), (-1, -1), 7),
        ])
    )
    elements.append(summary_table)
    elements.append(Spacer(1, 12))

    # 2. Automated Executive Insights
    elements.append(Paragraph("2. Autonomous Analytical Insights", section_style))
    for idx, ins in enumerate(profile["auto_insights"], 1):
        clean_desc = ins["description"].replace("**", "")
        elements.append(
            Paragraph(
                f"<b>{idx}. {ins['title']} ({ins['badge']}):</b> {clean_desc}",
                body_style,
            )
        )
    elements.append(Spacer(1, 10))

    # 3. Column Schema Profile
    elements.append(Paragraph("3. Schema & Statistical Profile", section_style))
    schema_rows = [["Column Name", "Role", "Data Type", "Nulls (%)", "Unique", "Mean / Top Value"]]
    for col in profile["schema"]:
        stat_str = (
            f"Mean: {col.get('mean', 'N/A')}"
            if col["role"] == "Numeric"
            else f"Top: {col.get('top_value', 'N/A')}"
        )
        schema_rows.append([
            str(col["name"])[:24],
            col["role"],
            col["dtype"],
            f"{col['null_count']} ({col['null_pct']}%)",
            str(col["unique_count"]),
            str(stat_str)[:22],
        ])

    schema_table = Table(schema_rows, colWidths=[115, 75, 70, 75, 60, 125])
    schema_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2563eb")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f5f9")]),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("PADDING", (0, 0), (-1, -1), 6),
        ])
    )
    elements.append(schema_table)

    doc.build(elements)
    buffer.seek(0)

    safe_name = filename.replace(".csv", "")
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=InsightAI_Report_{safe_name}.pdf"},
    )