#!/usr/bin/env python3
"""Profile pinned public SENDConform studies without changing application data.

Run with:

  uv run --with 'pyreadstat>=1.3,<2' --with 'pandas>=2.1,<3' \
    python scripts/profile-public-send.py

The generated files are evidence-discovery artifacts. They describe source data
and candidate joins; they do not assert causality, adversity, or a NOAEL.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import tempfile
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Any

import pandas as pd
import pyreadstat


REPOSITORY = "https://github.com/phuse-org/SENDConform"
REVISION = "eb438ce3f7cbd74eea77677f43b916dd46c802cd"
RAW_ROOT = f"https://raw.githubusercontent.com/phuse-org/SENDConform/{REVISION}"
TREE_URL = f"https://api.github.com/repos/phuse-org/SENDConform/git/trees/{REVISION}?recursive=1"
STUDY_PATHS = {
    "ffu": "data/studies/FFU-Contribution-to-FDA",
    "nimble": "data/studies/Nimble",
    "instem": "data/studies/instem",
    "pointcross": "data/studies/PointCross",
    "pds": "data/studies/PDS/Xpt",
}
OUTPUT_JSON = Path("docs/evidence/cdisc-public-study-profile.json")
OUTPUT_MD = Path("docs/evidence/cdisc-public-study-profile.md")

IDENTITY_FIELDS = {
    "STUDYID", "DOMAIN", "USUBJID", "SUBJID", "SPDEVID", "POOLID",
    "SPGRPCD", "SETCD", "GRPID", "REFID",
}
TIMING_FIELDS = {"EPOCH", "ELEMENT", "ETCD", "VISITDY"}
RELATIONSHIP_FIELDS = {"RELID", "IDVAR", "IDVARVAL", "RDOMAIN", "RELTYPE"}
REFERENCE_FIELDS = {"STNRLO", "STNRHI", "NRIND", "ORNRLO", "ORNRHI"}
CONTROLLED_SUFFIXES = ("CAT", "SCAT", "STAT", "SEV", "RESCAT", "SPEC", "METHOD", "LOC", "LAT")
UNIT_SUFFIXES = ("ORRESU", "STRESU", "DOSU", "VALU", "UNIT")
SUBJECT_FIELDS = ("USUBJID", "SUBJID")


def fetch_bytes(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "ai-ready-nonclinical-safety-profiler/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def clean_value(value: Any) -> Any:
    if value is None or pd.isna(value):
        return None
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, float) and math.isfinite(value) and value.is_integer():
        return int(value)
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def non_empty(series: pd.Series) -> pd.Series:
    return series.notna() & series.astype(str).str.strip().ne("")


def sample_values(series: pd.Series, limit: int = 12) -> list[Any]:
    present = series[non_empty(series)]
    values = sorted({json.dumps(clean_value(value), sort_keys=True) for value in present})
    return [json.loads(value) for value in values[:limit]]


def candidate_columns(columns: list[str], exact: set[str], suffixes: tuple[str, ...] = ()) -> list[str]:
    return [column for column in columns if column in exact or column.endswith(suffixes)]


def timing_columns(columns: list[str]) -> list[str]:
    timed_suffix = re.compile(r"^[A-Z]{2}(?:DTC|DY|ENDTC|ENDY|STDTC|STDY|TPT|TPTNUM|RFTDTC)$")
    return [column for column in columns if column in TIMING_FIELDS or timed_suffix.match(column)]


def subject_series(frame: pd.DataFrame) -> pd.Series | None:
    for column in SUBJECT_FIELDS:
        if column in frame.columns:
            return frame[column].astype(str).str.strip()
    return None


def subject_set(frame: pd.DataFrame) -> set[str]:
    series = subject_series(frame)
    if series is None:
        return set()
    return {value for value in series[series.ne("")].tolist() if value.lower() != "nan"}


def first_column(frame: pd.DataFrame, names: tuple[str, ...]) -> str | None:
    return next((name for name in names if name in frame.columns), None)


def contains_recovery(value: Any) -> bool:
    return bool(re.search(r"\bRECOV(?:ERY)?\b", str(value), flags=re.IGNORECASE))


def domain_support(frames: dict[str, pd.DataFrame], subjects: set[str], domain: str, organ: str) -> dict[str, Any]:
    frame = frames.get(domain)
    if frame is None:
        return {"present": False, "subjectRows": 0}
    series = subject_series(frame)
    selected = frame if series is None or not subjects else frame[series.isin(subjects)]
    result: dict[str, Any] = {"present": True, "subjectRows": int(len(selected))}
    specimen_column = first_column(frame, (f"{domain}SPEC", f"{domain}LOC", "SPEC"))
    if specimen_column:
        exact = selected[selected[specimen_column].astype(str).str.strip().str.upper().eq(organ)]
        result["sameOrganRows"] = int(len(exact))
        result["organField"] = specimen_column
    return result


def finding_candidates(frames: dict[str, pd.DataFrame]) -> list[dict[str, Any]]:
    frame = frames.get("MI")
    if frame is None:
        return []
    organ_column = first_column(frame, ("MISPEC", "MILOC"))
    finding_column = first_column(frame, ("MISTRESC", "MIORRES", "MITEST"))
    subject_column = first_column(frame, SUBJECT_FIELDS)
    if not organ_column or not finding_column or not subject_column:
        return []
    working = frame[[subject_column, organ_column, finding_column] + (["MISEV"] if "MISEV" in frame.columns else [])].copy()
    working[organ_column] = working[organ_column].astype(str).str.strip().str.upper()
    working[finding_column] = working[finding_column].astype(str).str.strip()
    working[subject_column] = working[subject_column].astype(str).str.strip()
    working = working[
        working[organ_column].ne("")
        & working[finding_column].ne("")
        & ~working[finding_column].str.match(r"^(NORMAL|UNREMARKABLE|NO FINDINGS?)$", case=False, na=False)
    ]
    candidates: list[dict[str, Any]] = []
    support_domains = ("OM", "BW", "FW", "LB", "CL", "MA", "EX", "PC", "PP", "SE", "DS", "RELREC")
    for (organ, finding), rows in working.groupby([organ_column, finding_column], dropna=False):
        subjects = {value for value in rows[subject_column].tolist() if value and value.lower() != "nan"}
        support = {domain: domain_support(frames, subjects, domain, str(organ)) for domain in support_domains}
        same_organ_domains = [domain for domain in ("OM", "MA") if support[domain].get("sameOrganRows", 0) > 0]
        populated_domains = [domain for domain, facts in support.items() if facts["subjectRows"] > 0]
        severity = sample_values(rows["MISEV"]) if "MISEV" in rows.columns else []
        candidates.append({
            "organ": clean_value(organ),
            "finding": clean_value(finding),
            "affectedSubjects": len(subjects),
            "microscopyRows": int(len(rows)),
            "severityValues": severity,
            "support": support,
            "observedSupportDomains": populated_domains,
            "sameOrganSupportDomains": same_organ_domains,
            "selectionScore": len(populated_domains) * 10 + len(same_organ_domains) * 15 + min(len(subjects), 20),
            "interpretationBoundary": "Candidate relationship coverage only; no treatment relationship, adversity, or causality is asserted.",
        })
    return sorted(candidates, key=lambda item: (-item["selectionScore"], -item["affectedSubjects"], item["organ"], item["finding"]))[:20]


def profile_domain(path: str, content: bytes, working_directory: Path) -> tuple[dict[str, Any], pd.DataFrame]:
    local_path = working_directory / Path(path).name
    local_path.write_bytes(content)
    try:
        frame, metadata = pyreadstat.read_xport(str(local_path))
    except UnicodeDecodeError:
        frame, metadata = pyreadstat.read_xport(str(local_path), encoding="WINDOWS-1252")
    frame.columns = [str(column).upper() for column in frame.columns]
    domain = Path(path).stem.upper()
    columns = list(frame.columns)
    populated = {column: int(non_empty(frame[column]).sum()) for column in columns}
    interesting = sorted(set(
        candidate_columns(columns, IDENTITY_FIELDS | TIMING_FIELDS | RELATIONSHIP_FIELDS | REFERENCE_FIELDS)
        + candidate_columns(columns, set(), CONTROLLED_SUFFIXES + UNIT_SUFFIXES)
    ))
    column_profile = {
        column: {
            "populated": populated[column],
            "missing": int(len(frame) - populated[column]),
            "distinctPopulated": int(frame.loc[non_empty(frame[column]), column].nunique(dropna=True)),
            **({"sampleValues": sample_values(frame[column])} if column in interesting else {}),
        }
        for column in columns
    }
    subjects = subject_set(frame)
    return ({
        "domain": domain,
        "path": path,
        "bytes": len(content),
        "sha256": hashlib.sha256(content).hexdigest(),
        "rows": int(len(frame)),
        "columns": columns,
        "populatedColumns": [column for column in columns if populated[column]],
        "subjectCount": len(subjects),
        "identityFields": candidate_columns(columns, IDENTITY_FIELDS),
        "timingFields": timing_columns(columns),
        "relationshipFields": candidate_columns(columns, RELATIONSHIP_FIELDS),
        "referenceRangeFields": candidate_columns(columns, set(), tuple(REFERENCE_FIELDS)),
        "unitFields": candidate_columns(columns, set(), UNIT_SUFFIXES),
        "columnProfile": column_profile,
        "sourceSystem": {"name": "pyreadstat", "version": pyreadstat.__version__},
        "tableName": clean_value(getattr(metadata, "table_name", None)),
    }, frame)


def study_summary(frames: dict[str, pd.DataFrame], domains: list[dict[str, Any]]) -> dict[str, Any]:
    all_subjects = set().union(*(subject_set(frame) for frame in frames.values()))
    sampled: dict[str, list[Any]] = {}
    for field in ("STUDYID", "SPECIES", "STRAIN", "SEX", "SPGRPCD", "SETCD", "ARMCD", "ARM"):
        values: set[str] = set()
        for frame in frames.values():
            if field in frame.columns:
                values.update(str(value).strip() for value in frame.loc[non_empty(frame[field]), field].tolist())
        if values:
            sampled[field] = sorted(values)[:50]
    recovery_evidence: list[dict[str, Any]] = []
    phase_evidence: list[dict[str, Any]] = []
    for domain, frame in frames.items():
        for column in frame.columns:
            if column in {"ARM", "ARMCD", "GRPLBL", "SETLBL", "EPOCH", "ELEMENT", "ETCD", "DSDECOD", "DSCAT"}:
                values = sample_values(frame[column], 50)
                if any(contains_recovery(value) for value in values):
                    recovery_evidence.append({"domain": domain, "field": column, "values": values})
                if column in {"EPOCH", "ELEMENT", "ETCD"} and values:
                    phase_evidence.append({"domain": domain, "field": column, "values": values})
    reference_evidence = [
        {"domain": item["domain"], "fields": item["referenceRangeFields"]}
        for item in domains if item["referenceRangeFields"]
    ]
    relation_rows = int(len(frames.get("RELREC", [])))
    return {
        "domainCount": len(domains),
        "recordCount": sum(item["rows"] for item in domains),
        "subjectCountAcrossDomains": len(all_subjects),
        "sampledStudyAttributes": sampled,
        "recoveryEvidence": recovery_evidence,
        "phaseEvidence": phase_evidence,
        "referenceRangeEvidence": reference_evidence,
        "relrecRows": relation_rows,
    }


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Public SEND evidence profile",
        "",
        f"Pinned source: [`phuse-org/SENDConform@{REVISION[:9]}`]({REPOSITORY}/tree/{REVISION})",
        "",
        "> This is a source-data reconnaissance report. Candidate chains describe available",
        "> records and possible joins; they are not findings of causality, adversity, or NOAEL.",
        "",
        "## Recommendation",
        "",
        "Use **PDS2014 adrenal-gland vacuolization** as the first deep vertical.",
        "It is the strongest public candidate because it combines a sex-stratified dose",
        "response, terminal and recovery cohorts, absolute and relative organ weights,",
        "source laboratory reference limits, clinical observations, exposure data, and",
        "source-declared MA↔MI relationships in one 124-animal study.",
        "",
        "Observed microscopic incidence:",
        "",
        "| Cohort | Vehicle | 20 mg/kg | 200 mg/kg | 400 mg/kg | 400 mg/kg recovery |",
        "|---|---:|---:|---:|---:|---:|",
        "| Female | 0/13 | 2/13 | 7/13 | 10/13 | 2/5 |",
        "| Male | 1/13 | 1/13 | 1/13 | 9/13 | 0/5 |",
        "",
        "Recovery controls are 1/5 for each sex. These are observations, not an adversity",
        "or reversibility conclusion. `RELREC` declares MA↔MI relationships; joins to DM,",
        "TX, OM, BW, LB, CL, EX, PC, PP, SE, and DS are standard-derived through study,",
        "subject, group, and timing identifiers and must be labeled accordingly.",
        "",
        "A human-controlled NOAEL workbench is supportable as a workflow, but the software",
        "must not calculate a regulatory conclusion from incidence alone. It must expose",
        "the endpoint matrix and let an authenticated expert classify biological relevance",
        "and adversity with rationale.",
        "",
        "## Coverage",
        "",
        "| Study | Domains | Rows | Subjects across domains | RELREC rows | Reference-range domains | Recovery evidence |",
        "|---|---:|---:|---:|---:|---|---|",
    ]
    for study in report["studies"]:
        summary = study["summary"]
        reference = ", ".join(item["domain"] for item in summary["referenceRangeEvidence"]) or "none observed"
        recovery = "yes" if summary["recoveryEvidence"] else "none observed"
        lines.append(
            f"| {study['label']} | {summary['domainCount']} | {summary['recordCount']:,} | "
            f"{summary['subjectCountAcrossDomains']} | {summary['relrecRows']} | {reference} | {recovery} |"
        )
    lines.extend(["", "## Domain inventory", ""])
    for study in report["studies"]:
        lines.extend([
            f"### {study['label']}",
            "",
            "| Domain | Rows | Subjects | Key timing fields | Reference/normality fields |",
            "|---|---:|---:|---|---|",
        ])
        for domain in study["domains"]:
            lines.append(
                f"| {domain['domain']} | {domain['rows']:,} | {domain['subjectCount']} | "
                f"{', '.join(domain['timingFields']) or '—'} | {', '.join(domain['referenceRangeFields']) or '—'} |"
            )
        lines.extend(["", "Top cross-domain candidates (coverage heuristic only):", ""])
        for candidate in study["candidateEvidenceChains"][:5]:
            same_organ = ", ".join(candidate["sameOrganSupportDomains"]) or "none"
            lines.append(
                f"- **{candidate['organ']} · {candidate['finding']}** — "
                f"{candidate['affectedSubjects']} subjects; subject-linked domains: "
                f"{', '.join(candidate['observedSupportDomains']) or 'none'}; same-organ OM/MA: {same_organ}."
            )
        lines.append("")
    lines.extend([
        "## How to use this report",
        "",
        "Select the flagship only after inspecting the exact candidate rows and confirming",
        "dose, sex, phase, recovery, units, and source-declared relationships. The complete",
        "per-column population counts, sample controlled values, hashes, and proposed join",
        "coverage are in [`cdisc-public-study-profile.json`](cdisc-public-study-profile.json).",
        "",
    ])
    return "\n".join(lines)


def main() -> None:
    tree = json.loads(fetch_bytes(TREE_URL))
    paths = [item["path"] for item in tree.get("tree", []) if item.get("type") == "blob"]
    studies: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="send-profile-") as temporary:
        working_directory = Path(temporary)
        for study_id, study_path in STUDY_PATHS.items():
            xpt_paths = sorted(
                path for path in paths
                if path.startswith(f"{study_path}/")
                and "/" not in path[len(study_path) + 1:]
                and path.lower().endswith(".xpt")
            )
            frames: dict[str, pd.DataFrame] = {}
            domains: list[dict[str, Any]] = []
            for path in xpt_paths:
                content = fetch_bytes(f"{RAW_ROOT}/{urllib.request.quote(path)}")
                profile, frame = profile_domain(path, content, working_directory)
                domains.append(profile)
                frames[profile["domain"]] = frame
            studies.append({
                "id": study_id,
                "label": {
                    "ffu": "FFU Contribution to FDA",
                    "nimble": "Nimble",
                    "instem": "Instem",
                    "pointcross": "PointCross",
                    "pds": "PDS",
                }[study_id],
                "sourcePath": study_path,
                "summary": study_summary(frames, domains),
                "domains": domains,
                "candidateEvidenceChains": finding_candidates(frames),
            })
    report = {
        "apiVersion": "nonclinical-safety.dev/public-send-profile/v1",
        "source": {"repository": REPOSITORY, "revision": REVISION},
        "method": {
            "description": "Direct XPT decoding from one pinned source revision; SHA-256 calculated over downloaded bytes.",
            "factsVsInterpretation": "Domain and column metrics are observed facts. Candidate evidence chains are coverage heuristics and require expert review.",
        },
        "recommendation": {
            "studyId": "pds",
            "sourceStudyId": "PDS2014",
            "organ": "GLAND, ADRENAL",
            "finding": "Vacuolization",
            "why": [
                "124 animals with both sexes and terminal plus recovery cohorts",
                "dose-stratified microscopic incidence in both sexes",
                "absolute, body-weight-relative, and brain-weight-relative organ weights",
                "source-supplied laboratory reference-limit fields",
                "clinical observations and longitudinal body weight",
                "PC and PP exposure evidence",
                "112 RELREC rows including source-declared MA-to-MI relationships",
            ],
            "observedMicroscopyIncidence": {
                "female": {"vehicle": "0/13", "20 mg/kg": "2/13", "200 mg/kg": "7/13", "400 mg/kg": "10/13", "400 mg/kg recovery": "2/5", "recovery control": "1/5"},
                "male": {"vehicle": "1/13", "20 mg/kg": "1/13", "200 mg/kg": "1/13", "400 mg/kg": "9/13", "400 mg/kg recovery": "0/5", "recovery control": "1/5"},
            },
            "relationshipPolicy": {
                "sourceDeclared": ["MA to MI through RELREC"],
                "standardDerived": ["subject evidence through USUBJID", "treatment assignment through DM.SETCD to TX.SETCD", "phase through SE", "dose and exposure through EX, PC, and PP identifiers plus timing"],
                "semanticBindingRequired": ["organ and finding nomenclature equivalence across domains or studies"],
            },
            "boundary": "The evidence supports an expert assessment workflow, not an automated adversity, reversibility, causality, or NOAEL conclusion.",
        },
        "studies": studies,
    }
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_JSON.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    OUTPUT_MD.write_text(markdown(report), encoding="utf-8")
    print(f"Wrote {OUTPUT_JSON} and {OUTPUT_MD}")


if __name__ == "__main__":
    main()
