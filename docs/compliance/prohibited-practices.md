# Prohibited AI Practices Screening — Article 5

**Document ID:** NEUR-COMP-005
**Date:** 2026-05-11
**Status:** DRAFT — Pending regulatory review
**Author:** Auto-generated from codebase analysis
**Reviewer:** [REVIEW: Assign qualified reviewer]

## 1. Purpose

This document screens the NEURIDION AI system against the prohibited practices defined in EU AI Act Article 5. It systematically evaluates each prohibited category to confirm that the system does not engage in any practice that would render its deployment unlawful.

## 2. System Under Assessment

- **System name:** NEURIDION ("PMS in Seconds")
- **AI function:** Classification of publicly available Field Safety Notices for relevance to medical device profiles
- **Models:** Claude Haiku 4.5 (pre-filter), Claude Sonnet 4.6 (full classification)
- **Data processed:** Public regulatory documents (FSNs), user-provided device profile metadata
- **Users:** Qualified PRRCs at medical device manufacturers (B2B only)

## 3. Article 5 Screening

### 3.1 Article 5(1)(a) — Subliminal Manipulation

**Prohibited practice:** AI systems that deploy subliminal techniques beyond a person's consciousness to materially distort behaviour, causing or likely to cause physical or psychological harm.

**Assessment:** Not applicable. NEURIDION classifies regulatory documents and presents results in a standard dashboard interface. The system does not employ any subliminal, manipulative, or deceptive techniques. All AI outputs (classifications, confidence scores, rationales) are transparently displayed to the user.

### 3.2 Article 5(1)(b) — Exploitation of Vulnerabilities

**Prohibited practice:** AI systems that exploit vulnerabilities of specific groups of persons due to their age, disability, or social or economic situation to materially distort behaviour.

**Assessment:** Not applicable. NEURIDION is a B2B professional tool used by qualified regulatory professionals (PRRCs). It does not target or interact with vulnerable populations. The system has no consumer-facing component and does not adapt its behaviour based on user characteristics.

### 3.3 Article 5(1)(c) — Social Scoring

**Prohibited practice:** AI systems that evaluate or classify individuals based on social behaviour or personal characteristics, leading to detrimental treatment unrelated to the original data collection context.

**Assessment:** Not applicable. NEURIDION classifies regulatory documents, not individuals. It does not evaluate, score, or rank any natural person based on their behaviour, characteristics, or social interactions.

### 3.4 Article 5(1)(d) — Criminal Risk Assessment

**Prohibited practice:** AI systems that assess the risk of natural persons committing criminal offences based solely on profiling or personality traits.

**Assessment:** Not applicable. NEURIDION has no function related to criminal justice, law enforcement, or individual risk assessment. It processes publicly available regulatory safety notices about medical devices.

### 3.5 Article 5(1)(e) — Facial Recognition Scraping

**Prohibited practice:** AI systems that create or expand facial recognition databases through untargeted scraping of facial images from the internet or CCTV footage.

**Assessment:** Not applicable. NEURIDION does not process images of any kind. It processes text-based regulatory documents from government databases. The system has no image capture, storage, or processing capability.

### 3.6 Article 5(1)(f) — Emotion Inference

**Prohibited practice:** AI systems that infer emotions of natural persons in the areas of workplace and education, except for medical or safety reasons.

**Assessment:** Not applicable. NEURIDION does not detect, infer, or process human emotions in any context. The AI component analyses the textual content of regulatory documents, not human emotional states.

### 3.7 Article 5(1)(g) — Biometric Categorisation

**Prohibited practice:** AI systems that categorise natural persons based on biometric data to deduce or infer race, political opinions, trade union membership, religious beliefs, sex life, or sexual orientation.

**Assessment:** Not applicable. NEURIDION does not process biometric data of any kind. It has no access to biometric identifiers, images, voice recordings, or any physiological or behavioural characteristics of natural persons.

### 3.8 Article 5(1)(h) — Real-Time Remote Biometric Identification

**Prohibited practice:** Use of real-time remote biometric identification systems in publicly accessible spaces for law enforcement purposes.

**Assessment:** Not applicable. NEURIDION is a document classification SaaS platform. It has no biometric identification capability, no access to public spaces, and no law enforcement function.

## 4. Determination

**None of the prohibited practices defined in Article 5 apply to the NEURIDION AI system.**

The system's function is narrowly scoped to classifying publicly available regulatory documents against user-defined device profiles. It does not process personal data, biometric data, or behavioural data of natural persons. It does not interact with consumers, vulnerable groups, or the general public.

[REVIEW: Attest that this screening is complete and accurate. Confirm no additional prohibited practices have been introduced by amendments or delegated acts since the date of this assessment.]

## 5. Review & Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Prepared by | Auto-generated from codebase | 2026-05-11 | — |
| Reviewed by | [REVIEW: Assign] | [REVIEW: Date] | [REVIEW: Sign] |
| Approved by | [REVIEW: Assign] | [REVIEW: Date] | [REVIEW: Sign] |
