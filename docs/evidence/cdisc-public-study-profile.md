# Public SEND evidence profile

Pinned source: [`phuse-org/SENDConform@eb438ce3f`](https://github.com/phuse-org/SENDConform/tree/eb438ce3f7cbd74eea77677f43b916dd46c802cd)

> This is a source-data reconnaissance report. Candidate chains describe available
> records and possible joins; they are not findings of causality, adversity, or NOAEL.

## Recommendation

Use **PDS2014 adrenal-gland vacuolization** as the first deep vertical.
It is the strongest public candidate because it combines a sex-stratified dose
response, terminal and recovery cohorts, absolute and relative organ weights,
laboratory observations, clinical observations, exposure data, and
source-declared MA↔MI relationships in one 124-animal study.

The PDS Define-XML/data shape declares standard laboratory range and normality
columns, but its 11,700 canonical LB rows do not populate those values. The
runtime therefore labels reference limits unavailable. Nimort-01 is the only
current public snapshot with populated range/normality values and is used to
demonstrate source-defined abnormality resolution.

Observed microscopic incidence:

| Cohort | Vehicle | 20 mg/kg | 200 mg/kg | 400 mg/kg | 400 mg/kg recovery |
|---|---:|---:|---:|---:|---:|
| Female | 0/13 | 2/13 | 7/13 | 10/13 | 2/5 |
| Male | 1/13 | 1/13 | 1/13 | 9/13 | 0/5 |

Recovery controls are 1/5 for each sex. These are observations, not an adversity
or reversibility conclusion. `RELREC` declares MA↔MI relationships; joins to DM,
TX, OM, BW, LB, CL, EX, PC, PP, SE, and DS are standard-derived through study,
subject, group, and timing identifiers and must be labeled accordingly.

A human-controlled NOAEL workbench is supportable as a workflow, but the software
must not calculate a regulatory conclusion from incidence alone. It must expose
the endpoint matrix and let an authenticated expert classify biological relevance
and adversity with rationale.

## Coverage

| Study | Domains | Rows | Subjects across domains | RELREC rows | Declared reference-range columns | Recovery evidence |
|---|---:|---:|---:|---:|---|---|
| FFU Contribution to FDA | 25 | 10,020 | 10 | 0 | none observed | none observed |
| Nimble | 18 | 3,046 | 100 | 0 | LB | none observed |
| Instem | 25 | 35,892 | 241 | 43 | LB | yes |
| PointCross | 28 | 18,749 | 150 | 80 | none observed | yes |
| PDS | 25 | 42,041 | 124 | 112 | LB | yes |

“Declared” means the source dataset exposes one or more standard range/normality
columns. It does not mean a row contains a value; the solution measures populated
values separately before displaying a reference band or abnormality.

## Domain inventory

### FFU Contribution to FDA

| Domain | Rows | Subjects | Key timing fields | Reference/normality fields |
|---|---:|---:|---|---|
| BG | 90 | 10 | BGDTC, BGENDTC, BGDY, BGENDY | — |
| BW | 110 | 10 | VISITDY, BWDTC, BWDY | — |
| CL | 259 | 10 | VISITDY, CLDTC, CLDY, CLTPT, CLTPTNUM | — |
| CO | 309 | 10 | CODTC | — |
| DM | 10 | 10 | RFSTDTC, RFENDTC | — |
| DS | 10 | 10 | VISITDY, DSSTDTC, DSSTDY | — |
| EX | 32 | 10 | EXSTDTC, EXSTDY | — |
| LB | 2,032 | 10 | VISITDY, LBDTC, LBDY, LBTPT, LBTPTNUM | — |
| MA | 520 | 10 | MADTC, MADY | — |
| MI | 242 | 10 | MIDTC, MIDY | — |
| OM | 200 | 10 | OMDTC, OMDY | — |
| PC | 480 | 8 | VISITDY, PCDTC, PCDY, PCTPT, PCTPTNUM, PCRFTDTC | — |
| PP | 384 | 8 | VISITDY, PPRFTDTC | — |
| SE | 20 | 10 | ETCD, ELEMENT, SESTDTC, SEENDTC | — |
| SUPPBG | 360 | 10 | — | — |
| SUPPBW | 220 | 10 | — | — |
| SUPPCL | 518 | 10 | — | — |
| SUPPDS | 20 | 10 | — | — |
| SUPPLB | 4,064 | 10 | — | — |
| SUPPMA | 3 | 2 | — | — |
| SUPPMI | 56 | 10 | — | — |
| TA | 10 | 0 | ETCD, ELEMENT, EPOCH | — |
| TE | 6 | 0 | ETCD, ELEMENT | — |
| TS | 30 | 0 | — | — |
| TX | 35 | 0 | — | — |

Top cross-domain candidates (coverage heuristic only):

- **HEART · Infiltration, mononuclear cell, Infiltration, mononuclear cell** — 7 subjects; subject-linked domains: OM, BW, LB, CL, MA, EX, PC, PP, SE, DS; same-organ OM/MA: OM, MA.
- **THYMUS · Decreased number, lymphocytes, cortex, Decreased number, lymphocytes, cortex** — 7 subjects; subject-linked domains: OM, BW, LB, CL, MA, EX, PC, PP, SE, DS; same-organ OM/MA: OM, MA.
- **KIDNEY · Infiltration, mononuclear cell, interstitial, Infiltration, mononuclear cell, interstitial** — 6 subjects; subject-linked domains: OM, BW, LB, CL, MA, EX, PC, PP, SE, DS; same-organ OM/MA: OM, MA.
- **LIVER · Aggregates, mononuclear cell, Aggregates, mononuclear cell** — 2 subjects; subject-linked domains: OM, BW, LB, CL, MA, EX, PC, PP, SE, DS; same-organ OM/MA: OM, MA.
- **THYMUS · Cyst(s), Cyst(s)** — 2 subjects; subject-linked domains: OM, BW, LB, CL, MA, EX, PC, PP, SE, DS; same-organ OM/MA: OM, MA.

### Nimble

| Domain | Rows | Subjects | Key timing fields | Reference/normality fields |
|---|---:|---:|---|---|
| BG | 160 | 67 | BGDTC, BGENDTC | — |
| BW | 228 | 67 | VISITDY, BWDTC | — |
| CL | 93 | 58 | VISITDY, CLDTC | — |
| CO | 46 | 15 | CODTC | — |
| DM | 100 | 100 | RFSTDTC, RFENDTC | — |
| DS | 67 | 67 | VISITDY, DSSTDTC | — |
| EX | 351 | 67 | EXSTDTC, EXENDTC, EXSTDY, EXENDY | — |
| FW | 4 | 0 | FWDTC, FWENDTC | — |
| LB | 1,086 | 67 | VISITDY, LBDTC, LBTPT | LBORNRLO, LBORNRHI, LBSTNRLO, LBSTNRHI, LBNRIND |
| MA | 125 | 67 | MADTC | — |
| MI | 125 | 67 | MIDTC | — |
| OM | 132 | 66 | OMDTC | — |
| POOLDEF | 100 | 100 | — | — |
| SUPPEX | 351 | 67 | — | — |
| TA | 8 | 0 | ETCD, ELEMENT, EPOCH | — |
| TE | 5 | 0 | ETCD, ELEMENT | — |
| TS | 50 | 0 | — | — |
| TX | 15 | 0 | — | — |

Top cross-domain candidates (coverage heuristic only):

- **TESTIS/EPIDIDYMIS · Inflammation, acute** — 24 subjects; subject-linked domains: OM, BW, LB, CL, MA, EX, DS; same-organ OM/MA: none.
- **TESTIS/EPIDIDYMIS · Degeneration/regeneration epithelial** — 18 subjects; subject-linked domains: OM, BW, LB, CL, MA, EX, DS; same-organ OM/MA: none.
- **VAGINA · Lymphoma** — 17 subjects; subject-linked domains: OM, BW, LB, CL, MA, EX, DS; same-organ OM/MA: none.
- **MUSCLE, SKELETAL · Inflammation** — 12 subjects; subject-linked domains: OM, BW, LB, CL, MA, EX, DS; same-organ OM/MA: none.
- **TESTIS/EPIDIDYMIS · Amyloidosis** — 7 subjects; subject-linked domains: OM, BW, LB, CL, MA, EX, DS; same-organ OM/MA: none.

### Instem

| Domain | Rows | Subjects | Key timing fields | Reference/normality fields |
|---|---:|---:|---|---|
| BG | 899 | 150 | BGDTC, BGENDTC, BGDY, BGENDY, BGRFTDTC | — |
| BW | 1,733 | 241 | VISITDY, BWDTC, BWDY | — |
| CL | 6,824 | 241 | VISITDY, CLDTC, CLDY, CLTPT, CLTPTNUM, CLRFTDTC | — |
| CO | 1,121 | 151 | CODTC, CODY | — |
| DD | 1 | 1 | DDDTC, DDDY | — |
| DM | 241 | 241 | RFSTDTC, RFENDTC | — |
| DS | 241 | 241 | VISITDY, DSSTDTC, DSSTDY | — |
| EX | 241 | 241 | EXSTDTC, EXENDTC, EXSTDY, EXENDY, EXTPT, EXTPTNUM, EXRFTDTC | — |
| FW | 888 | 149 | FWDTC, FWENDTC, FWDY, FWENDY | — |
| LB | 13,473 | 148 | VISITDY, LBDTC, LBENDTC, LBDY, LBENDY, LBTPT, LBTPTNUM, LBRFTDTC | LBORNRLO, LBORNRHI, LBSTNRLO, LBSTNRHI, LBNRIND |
| MA | 153 | 150 | MADTC, MADY | — |
| MI | 7,065 | 150 | MIDTC, MIDY | — |
| OM | 1,650 | 150 | OMDTC, OMDY | — |
| PC | 287 | 90 | VISITDY, PCDTC, PCENDTC, PCDY, PCENDY, PCTPT, PCTPTNUM, PCRFTDTC | — |
| POOLDEF | 179 | 90 | — | — |
| PP | 24 | 0 | VISITDY, PPRFTDTC | — |
| RELREC | 43 | 11 | — | — |
| SE | 532 | 241 | ETCD, ELEMENT, SESTDTC, SEENDTC | — |
| SUPPMA | 13 | 12 | — | — |
| SUPPMI | 168 | 66 | — | — |
| TA | 25 | 0 | ETCD, ELEMENT, EPOCH | — |
| TE | 7 | 0 | ETCD, ELEMENT | — |
| TF | 1 | 1 | TFDTC, TFDY | — |
| TS | 29 | 0 | — | — |
| TX | 54 | 0 | — | — |

Top cross-domain candidates (coverage heuristic only):

- **LIVER · Infiltration** — 41 subjects; subject-linked domains: OM, BW, FW, LB, CL, MA, EX, SE, DS, RELREC; same-organ OM/MA: OM.
- **GLAND, THYROID · Hypoplasia** — 1 subjects; subject-linked domains: OM, BW, FW, LB, CL, MA, EX, SE, DS, RELREC; same-organ OM/MA: OM, MA.
- **KIDNEY · Dilatation** — 1 subjects; subject-linked domains: OM, BW, FW, LB, CL, MA, EX, SE, DS, RELREC; same-organ OM/MA: OM, MA.
- **LIVER · Angiectasis** — 1 subjects; subject-linked domains: OM, BW, FW, LB, CL, MA, EX, SE, DS, RELREC; same-organ OM/MA: OM, MA.
- **THYMUS · Hemorrhage** — 1 subjects; subject-linked domains: OM, BW, FW, LB, CL, MA, EX, SE, DS, RELREC; same-organ OM/MA: OM, MA.

### PointCross

| Domain | Rows | Subjects | Key timing fields | Reference/normality fields |
|---|---:|---:|---|---|
| BG | 676 | 120 | BGDTC, BGENDTC, BGDY, BGENDY | — |
| BW | 1,751 | 120 | VISITDY, BWDTC, BWDY | — |
| CL | 2,001 | 120 | VISITDY, CLDTC, CLDY | — |
| CO | 136 | 63 | CODTC | — |
| DD | 3 | 3 | DDDY | — |
| DM | 150 | 150 | RFSTDTC, RFENDTC | — |
| DS | 150 | 150 | VISITDY, DSSTDTC, DSSTDY | — |
| EG | 354 | 118 | VISITDY, EGDTC, EGDY | — |
| EX | 150 | 150 | EXSTDTC, EXENDTC, EXSTDY, EXENDY | — |
| FW | 279 | 120 | FWDTC, FWENDTC, FWDY, FWENDY | — |
| LB | 5,748 | 120 | VISITDY, LBDTC, LBDY | — |
| MA | 190 | 120 | MADY | — |
| MI | 4,226 | 120 | MIDY | — |
| OM | 1,200 | 120 | OMDTC, OMDY | — |
| PC | 150 | 30 | VISITDY, PCDTC, PCDY, PCTPT, PCTPTNUM, PCRFTDTC | — |
| PM | 3 | 3 | VISITDY, PMDTC, PMDY | — |
| PP | 150 | 30 | VISITDY, PPRFTDTC | — |
| RELREC | 80 | 35 | — | — |
| SC | 120 | 120 | SCDY | — |
| SE | 340 | 150 | ETCD, ELEMENT, SESTDTC, SEENDTC | — |
| SUPPMA | 67 | 49 | — | — |
| SUPPMI | 514 | 103 | — | — |
| TA | 20 | 0 | ETCD, ELEMENT, EPOCH | — |
| TE | 6 | 0 | ETCD, ELEMENT | — |
| TF | 5 | 5 | TFDY | — |
| TS | 50 | 0 | — | — |
| TX | 112 | 0 | — | — |
| VS | 118 | 118 | VISITDY, VSDTC, VSDY | — |

Top cross-domain candidates (coverage heuristic only):

- **GLAND, ADRENAL · VACUOLIZATION** — 48 subjects; subject-linked domains: OM, BW, FW, LB, CL, MA, EX, SE, DS, RELREC; same-organ OM/MA: OM, MA.
- **SPLEEN · CONGESTION** — 44 subjects; subject-linked domains: OM, BW, FW, LB, CL, MA, EX, SE, DS, RELREC; same-organ OM/MA: OM, MA.
- **SPLEEN · PIGMENTATION** — 36 subjects; subject-linked domains: OM, BW, FW, LB, CL, MA, EX, SE, DS, RELREC; same-organ OM/MA: OM, MA.
- **KIDNEY · BASOPHILIC TUBULES** — 30 subjects; subject-linked domains: OM, BW, FW, LB, CL, MA, EX, SE, DS, RELREC; same-organ OM/MA: OM, MA.
- **LIVER · HYPERTROPHY** — 22 subjects; subject-linked domains: OM, BW, FW, LB, CL, MA, EX, SE, DS, RELREC; same-organ OM/MA: OM, MA.

### PDS

| Domain | Rows | Subjects | Key timing fields | Reference/normality fields |
|---|---:|---:|---|---|
| BG | 4,099 | 124 | BGDTC, BGENDTC, BGDY, BGENDY, BGRFTDTC | — |
| BW | 4,075 | 124 | VISITDY, BWDTC, BWDY | — |
| CL | 7,340 | 100 | VISITDY, CLDTC, CLDY, CLTPT, CLTPTNUM, CLRFTDTC | — |
| CO | 110 | 26 | CODTC, CODY | — |
| DM | 124 | 124 | RFSTDTC, RFENDTC | — |
| DS | 124 | 124 | VISITDY, DSSTDTC, DSSTDY | — |
| EX | 3,668 | 124 | EXSTDTC, EXENDTC, EXSTDY, EXENDY, EXTPT, EXTPTNUM, EXRFTDTC | — |
| FW | 212 | 0 | FWDTC, FWENDTC, FWDY, FWENDY | — |
| LB | 11,700 | 100 | VISITDY, LBDTC, LBENDTC, LBDY, LBENDY, LBTPT, LBTPTNUM, LBRFTDTC | LBORNRLO, LBORNRHI, LBSTNRLO, LBSTNRHI, LBNRIND |
| MA | 3,690 | 124 | MADTC, MADY | — |
| MI | 2,447 | 100 | MIDTC, MIDY | — |
| OM | 2,746 | 100 | OMDTC, OMDY | — |
| PC | 246 | 18 | VISITDY, PCDTC, PCENDTC, PCDY, PCENDY, PCTPT, PCTPTNUM, PCRFTDTC | — |
| POOLDEF | 100 | 100 | — | — |
| PP | 180 | 18 | VISITDY, PPRFTDTC | — |
| RELREC | 112 | 29 | — | — |
| SC | 124 | 124 | SCDTC, SCDY | — |
| SE | 268 | 124 | ETCD, ELEMENT, SESTDTC, SEENDTC | — |
| SUPPMA | 67 | 36 | — | — |
| SUPPMI | 263 | 69 | — | — |
| SUPPPP | 12 | 11 | — | — |
| TA | 28 | 0 | ETCD, ELEMENT, EPOCH | — |
| TE | 10 | 0 | ETCD, ELEMENT | — |
| TS | 30 | 0 | — | — |
| TX | 266 | 0 | — | — |

Top cross-domain candidates (coverage heuristic only):

- **LIVER · MPS-aggregates multifocal** — 51 subjects; subject-linked domains: OM, BW, LB, CL, MA, EX, SE, DS, RELREC; same-organ OM/MA: OM, MA.
- **GLAND, ADRENAL · Vacuolization** — 35 subjects; subject-linked domains: OM, BW, LB, CL, MA, EX, SE, DS, RELREC; same-organ OM/MA: OM, MA.
- **SPLEEN · Congestion** — 22 subjects; subject-linked domains: OM, BW, LB, CL, MA, EX, SE, DS, RELREC; same-organ OM/MA: OM, MA.
- **SPLEEN · Pigmentation** — 18 subjects; subject-linked domains: OM, BW, LB, CL, MA, EX, SE, DS, RELREC; same-organ OM/MA: OM, MA.
- **KIDNEY · Basophilia tubule(s)** — 16 subjects; subject-linked domains: OM, BW, LB, CL, MA, EX, SE, DS, RELREC; same-organ OM/MA: OM, MA.

## How to use this report

Select the flagship only after inspecting the exact candidate rows and confirming
dose, sex, phase, recovery, units, and source-declared relationships. The complete
per-column population counts, sample controlled values, hashes, and proposed join
coverage are in [`cdisc-public-study-profile.json`](cdisc-public-study-profile.json).
