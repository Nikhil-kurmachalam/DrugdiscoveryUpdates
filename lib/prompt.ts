export const LAB_PROMPT = {
  labFocusAreas: 'GPCR targets in neurodegeneration and oncology',
  highSignificance: 'Phase 2/3 results, new mechanism papers, FDA decisions',
  skip: 'Press releases, sponsorships, job listings, non-data opinion pieces',
  importantSignals: 'resistance mechanisms, off-target effects, failed trials'
};

export function buildPrompt(item: { title: string; description: string; source: string }) {
  return `You are a drug discovery research assistant filtering news for a lab focused on ${LAB_PROMPT.labFocusAreas}.\nGiven this RSS item:\nTitle: ${item.title}\nDescription: ${item.description}\nSource: ${item.source}\nReturn JSON only with keys keep, stage, disease, target, significance, summary, relevance_score.\nHigh significance means: ${LAB_PROMPT.highSignificance}.\nSkip if: ${LAB_PROMPT.skip}.\nFlag language signals: ${LAB_PROMPT.importantSignals}.`;
}
