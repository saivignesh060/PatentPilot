/**
 * scoringService.js
 * Computes the 4-component composite score for each patent candidate.
 * composite = 0.4×structural + 0.3×semantic + 0.2×keyword + 0.1×recency
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import PatentScore from '../models/PatentScore.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ── Embeddings ────────────────────────────────────────────────────────────────
export async function getEmbedding(text) {
  const model = genAI.getGenerativeModel({ model: process.env.EMBEDDING_MODEL || 'gemini-embedding-2' });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

export function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
}

// ── Keyword overlap score (0–100) ─────────────────────────────────────────────
export function computeKeywordOverlap(queryTerms, patentTitle, patentAbstract) {
  if (!queryTerms.length) return 0;
  const text = `${patentTitle} ${patentAbstract}`.toLowerCase();
  const matches = queryTerms.filter((t) => t && text.includes(t.toLowerCase()));
  return Math.round((matches.length / queryTerms.length) * 100);
}

// ── Recency weight (0–100) ────────────────────────────────────────────────────
// Patents filed/published in last 20 years score higher (FTO enforcement window)
export function computeRecencyWeight(publicationDate, filingDate) {
  const dateStr = publicationDate || filingDate;
  if (!dateStr) return 30; // unknown date — moderate penalty
  const year = parseInt(String(dateStr).slice(0, 4), 10);
  if (isNaN(year)) return 30;
  const age = new Date().getFullYear() - year;
  if (age <= 0)  return 100;
  if (age <= 5)  return 90;
  if (age <= 10) return 75;
  if (age <= 15) return 55;
  if (age <= 20) return 35;
  return 10; // likely expired — low FTO risk from recency
}

// ── Composite score ───────────────────────────────────────────────────────────
export function computeComposite({ structural, semantic, keyword, recency }) {
  return Math.round(
    0.4 * structural +
    0.3 * semantic   +
    0.2 * keyword    +
    0.1 * recency
  );
}

// ── Determine risk recommendation (deterministic — NOT LLM) ──────────────────
export function computeRecommendation(scores) {
  // scores: array of { compositeScore, structuralSimilarity, confidence }
  if (!scores.length) return 'Low Patent Risk';

  const maxComposite  = Math.max(...scores.map((s) => s.compositeScore));
  const highStructural = scores.some((s) => s.structuralSimilarity >= 85);
  const highCompositeCount = scores.filter((s) => s.compositeScore >= 70).length;

  if (highStructural || highCompositeCount >= 2) return 'High Patent Risk';
  if (maxComposite >= 40) return 'Requires Expert Review';
  return 'Low Patent Risk';
}

// ── Manual review flag ────────────────────────────────────────────────────────
export function shouldFlagManualReview(score) {
  const { structuralSimilarity, semanticRelevance, confidence } = score;
  if (confidence === 'Low') return true;
  if (Math.abs(structuralSimilarity - semanticRelevance) > 30) return true;
  return false;
}

// ── Full scoring pipeline ─────────────────────────────────────────────────────
export async function scorePatents({ queryId, queryContext, patents }) {
  // queryContext: { target, indication, synonyms, canonicalSmiles }
  const queryTerms = [
    queryContext.target,
    queryContext.indication,
    ...queryContext.synonyms,
  ].filter(Boolean);

  // Get query embedding once
  const queryText = [
    queryContext.target || '',
    queryContext.indication || '',
    queryContext.canonicalSmiles || '',
  ].filter(Boolean).join(' — ');

  let queryEmbedding = null;
  try {
    queryEmbedding = await getEmbedding(queryText);
  } catch (err) {
    console.warn('[Scoring] Embedding failed, semantic score will be 0:', err.message);
  }

  const scored = await Promise.all(
    patents.map(async ({ patent, tanimoto }) => {
      const structural = Math.round((tanimoto || 0) * 100);

      // Semantic score
      let semantic = 0;
      if (queryEmbedding) {
        try {
          let patEmb = patent.abstractEmbedding;
          if (!patEmb?.length) {
            patEmb = await getEmbedding(`${patent.title} ${patent.abstract}`);
            // Cache embedding on the patent document
            await patent.updateOne({ abstractEmbedding: patEmb });
          }
          const cos = cosineSimilarity(queryEmbedding, patEmb);
          semantic = Math.round(((cos + 1) / 2) * 100); // shift from [-1,1] to [0,100]
        } catch {
          semantic = 0;
        }
      }

      const keyword  = computeKeywordOverlap(queryTerms, patent.title, patent.abstract);
      const recency  = computeRecencyWeight(patent.publicationDate, patent.filingDate);
      const composite = computeComposite({ structural, semantic, keyword, recency });

      // Upsert score record
      const score = await PatentScore.findOneAndUpdate(
        { queryId, patentId: patent._id },
        {
          queryId, patentId: patent._id,
          patentNumber: patent.patentNumber,
          structuralSimilarity: structural,
          semanticRelevance:    semantic,
          keywordOverlap:       keyword,
          recencyWeight:        recency,
          compositeScore:       composite,
        },
        { upsert: true, new: true }
      );

      return { patent, score };
    })
  );

  // Sort by compositeScore descending
  return scored.sort((a, b) => b.score.compositeScore - a.score.compositeScore);
}
