export const LAB_PROMPT = {
  labFocusAreas:    'drug discovery, target discovery, AI agents for smart drug discovery, and agentic research in biomedical data',
  highSignificance: 'Phase 2/3 results, novel target validation, FDA decisions, AI/ML breakthroughs in drug discovery, new agentic or LLM-based biomedical research methods',
  skip:             'Press releases, sponsorships, job listings, non-data opinion pieces',
  importantSignals: 'resistance mechanisms, off-target effects, failed trials, biomarker findings, AI model limitations in biomedical contexts',
};

export function buildPrompt(item: { title: string; description: string; source: string }) {
  const isPubMed = item.source === 'PubMed';
  return `You are a drug discovery research assistant filtering ${isPubMed ? 'scientific literature' : 'news'} for a lab focused on ${LAB_PROMPT.labFocusAreas}.
Given this ${isPubMed ? 'PubMed article' : 'RSS item'}:
Title: ${item.title}
Description: ${item.description}
Source: ${item.source}
Return JSON only (no markdown) with these keys:
  keep (boolean), stage (one of: Target ID, Preclinical, Clinical, Approval, Method, Industry),
  disease (string), target (string), significance (High|Medium|Low), summary (≤30 words), relevance_score (0-10).
High significance: ${LAB_PROMPT.highSignificance}.
Skip if: ${LAB_PROMPT.skip}.
Flag signals: ${LAB_PROMPT.importantSignals}.`;
}
