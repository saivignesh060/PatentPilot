/**
 * aiService.js
 * LangChain JS — Chain A (per-patent) + Chain B (report synthesis)
 * Uses gemini-3.1-flash-lite via @langchain/google-genai
 */
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { StructuredOutputParser } from 'langchain/output_parsers';
import { PromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import Analysis from '../models/Analysis.js';

// ── LLM instance ──────────────────────────────────────────────────────────────
function getLLM() {
  return new ChatGoogleGenerativeAI({
    model:       process.env.LLM_MODEL || 'gemini-3.1-flash-lite',
    apiKey:      process.env.GEMINI_API_KEY,
    temperature: 0.1,  // low temp for factual, grounded output
    maxOutputTokens: 1024,
  });
}

// ── Chain A ───────────────────────────────────────────────────────────────────
const chainASchema = z.object({
  whyRetrieved:        z.string().describe('Which retrieval signal(s) fired and exactly why, citing specific score values'),
  similarAspects:      z.string().describe('Specific structural or functional overlaps between the query molecule and the patent claims'),
  potentialOverlap:    z.string().describe('Plain-language description of the FTO/novelty concern, citing specific patent text'),
  confidence:          z.enum(['High', 'Medium', 'Low']),
  confidenceReasoning: z.string().describe('One sentence explaining the confidence level'),
});

const chainAParser = StructuredOutputParser.fromZodSchema(chainASchema);

const CHAIN_A_PROMPT = `You are a patent analysis assistant helping a medicinal chemist assess Freedom-to-Operate (FTO) risk.

Query Molecule:
- SMILES: {smiles}
- Target: {target}
- Indication: {indication}

Patent to Analyze:
- Number: {patentNumber}
- Title: {title}
- Abstract: {abstract}
- Structural Similarity Score: {structuralSimilarity}/100
- Semantic Relevance Score: {semanticRelevance}/100
- Keyword Overlap Score: {keywordOverlap}/100

CRITICAL RULES:
1. Do NOT output generic boilerplate like "this patent may be relevant." 
2. ALWAYS cite specific text from the abstract or specific score values as evidence.
3. If the abstract is empty or too short to draw conclusions, set confidence to "Low" and state why.
4. Base your analysis ONLY on the provided patent text — do not invent or assume claim details.

{format_instructions}`;

export async function runChainA({ queryId, patent, score, query }) {
  const llm = getLLM();
  const formatInstructions = chainAParser.getFormatInstructions();

  const prompt = PromptTemplate.fromTemplate(CHAIN_A_PROMPT);
  const chain = prompt.pipe(llm).pipe(chainAParser);

  const result = await chain.invoke({
    smiles:              query.canonicalSmiles || query.smiles,
    target:              query.target || 'Not specified',
    indication:          query.indication || 'Not specified',
    patentNumber:        patent.patentNumber,
    title:               patent.title || 'No title available',
    abstract:            patent.abstract || 'No abstract available',
    structuralSimilarity: score.structuralSimilarity,
    semanticRelevance:   score.semanticRelevance,
    keywordOverlap:      score.keywordOverlap,
    format_instructions: formatInstructions,
  });

  // Persist to MongoDB
  const analysis = await Analysis.findOneAndUpdate(
    { queryId, patentId: patent._id },
    {
      queryId,
      patentId:            patent._id,
      patentNumber:        patent.patentNumber,
      whyRetrieved:        result.whyRetrieved,
      similarAspects:      result.similarAspects,
      potentialOverlap:    result.potentialOverlap,
      confidence:          result.confidence,
      confidenceReasoning: result.confidenceReasoning,
      generatedAt:         new Date(),
    },
    { upsert: true, new: true }
  );

  return analysis;
}

// ── Chain B ───────────────────────────────────────────────────────────────────
const chainBSchema = z.object({
  executiveSummary:      z.string().describe('3-5 sentence plain-language summary for a non-lawyer audience'),
  keySimilarPatents:     z.array(z.object({
    patentNumber: z.string(),
    rationale:    z.string().describe('One sentence citing a specific composite score or aspect'),
  })),
  noveltyConcerns:       z.array(z.string()).describe('Synthesized from potentialOverlap fields — do not re-generate from scratch'),
  manualReviewPatents:   z.array(z.object({
    patentNumber: z.string(),
    reason:       z.string(),
  })),
  recommendationRationale: z.string().describe('Explain WHY the deterministic score formula produced this recommendation tier'),
});

const chainBParser = StructuredOutputParser.fromZodSchema(chainBSchema);

const CHAIN_B_PROMPT = `You are synthesizing a Freedom-to-Operate (FTO) screening report for a medicinal chemist.

Query Molecule:
- SMILES: {smiles}
- Target: {target}
- Indication: {indication}

OVERALL RECOMMENDATION (ALREADY DETERMINED BY SCORING FORMULA — DO NOT CHANGE IT):
{recommendation}

Per-Patent Analysis Results:
{analysisJson}

Top Composite Scores:
{scoresJson}

Patents Flagged for Manual Review:
{flaggedJson}

INSTRUCTIONS:
1. Synthesize the noveltyConcerns from the potentialOverlap fields in the per-patent analyses — do NOT re-summarize raw patent text.
2. The recommendation tier is fixed ({recommendation}) — your job is to EXPLAIN why the scoring formula produced it.
3. Cite specific patent numbers and score values as evidence. No generic statements.
4. The executiveSummary must be readable by a non-lawyer.

{format_instructions}`;

export async function runChainB({ query, analyses, scores, recommendation, flaggedPatents }) {
  const llm = getLLM();
  const formatInstructions = chainBParser.getFormatInstructions();

  const prompt = PromptTemplate.fromTemplate(CHAIN_B_PROMPT);
  const chain = prompt.pipe(llm).pipe(chainBParser);

  const result = await chain.invoke({
    smiles:         query.canonicalSmiles || query.smiles,
    target:         query.target || 'Not specified',
    indication:     query.indication || 'Not specified',
    recommendation,
    analysisJson:   JSON.stringify(analyses.map((a) => ({
      patentNumber:     a.patentNumber,
      whyRetrieved:     a.whyRetrieved,
      similarAspects:   a.similarAspects,
      potentialOverlap: a.potentialOverlap,
      confidence:       a.confidence,
    })), null, 2),
    scoresJson:     JSON.stringify(scores.map((s) => ({
      patentNumber:  s.patentNumber,
      composite:     s.compositeScore,
      structural:    s.structuralSimilarity,
      semantic:      s.semanticRelevance,
      keyword:       s.keywordOverlap,
    })), null, 2),
    flaggedJson:    JSON.stringify(flaggedPatents, null, 2),
    format_instructions: formatInstructions,
  });

  return result;
}
