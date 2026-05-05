export const LAB_PROMPT = {
  labFocusAreas:    'drug discovery, target discovery, AI agents for smart drug discovery, and agentic research in biomedical data',
  highSignificance: 'Phase 2/3 results, novel target validation, FDA decisions, AI/ML breakthroughs in drug discovery, new agentic or LLM-based biomedical research methods',
  skip:             'Press releases, sponsorships, job listings, non-data opinion pieces',
  importantSignals: 'resistance mechanisms, off-target effects, failed trials, biomarker findings, AI model limitations in biomedical contexts',
};

export function buildPrompt(item) {
  return `You are a drug discovery research assistant filtering news for a lab focused on ${LAB_PROMPT.labFocusAreas}.\nGiven this RSS item:\nTitle: ${item.title}\nDescription: ${item.description}\nSource: ${item.source}\nReturn JSON only with keys keep, stage, disease, target, significance, summary, relevance_score.\nHigh significance means: ${LAB_PROMPT.highSignificance}.\nSkip if: ${LAB_PROMPT.skip}.\nFlag language signals: ${LAB_PROMPT.importantSignals}.`;
}
