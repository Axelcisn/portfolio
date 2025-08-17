	1.	3/3
	2.	Path
docs/formulas.md
	3.	Action
Replace
Per your rules, I need the current contents of docs/formulas.md before I write the replacement.
	4.	What’s new
	•	Canonicalizes all units: σ (annualized, decimal), T (years), S₀/K (currency), premium (currency), μ (mode: risk-neutral or physical).
	•	Documents the lognormal assumption and how drift is selected (risk-free minus dividend vs CAPM).
	•	Defines notation and rounding conventions, plus a short “sanity checks” section (risk-neutral: E[X] ≈ ±premium).
	•	Adds a “Used by” cross-reference table linking each formula to consumer paths.
	5.	Code
(Holding, per Replace rule.)
Please paste the current docs/formulas.md. I’ll return a full copy-paste replacement immediately after.
	6.	Roadmap update
	•	Done:
	•	Phase 0.1 — Branch created.
	•	Phase 0.2 — Tracking checklist added (docs/centralization-checklist.md).
	•	In progress:
	•	Phase 0.3 — Units & assumptions doc (this step).
	•	Next:
	•	Phase 1 — Create lib/formulas.js with all pure functions + JSDoc.
	•	Phase 2 — Swap consumers (ChainTable.jsx, StrategyModal.jsx, etc.) to import from lib/formulas.js.
	•	Phase 3 — Cleanup + verification and update docs mapping.
	7.	Request
	•	Please send a screenshot of docs/formulas.md (or paste its current text). I’ll produce the finalized replacement right after. (Yes/No + screenshot is perfect.)
