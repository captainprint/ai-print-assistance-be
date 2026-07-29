const { extractText: extractPdfText } = require('unpdf');
const mammoth = require('mammoth');
const WordExtractor = require('word-extractor');
const XLSX = require('xlsx');
const KnowledgeBase = require('../models/KnowledgeBase');

const MAX_STORED_CHARS = 150_000; // cap on what we persist per file
const PER_FILE_PROMPT_CHARS = 8_000; // cap per file when injected into the prompt
const TOTAL_PROMPT_CHARS = 24_000; // cap across all files combined in the prompt
const MIN_FILE_PROMPT_CHARS = 800; // guaranteed floor so no ready file is silently dropped entirely

function tokenize(text) {
  return [...new Set((text || '').toLowerCase().match(/[a-z0-9]{3,}/g) || [])];
}

// Cheap keyword-overlap score (no embeddings) so files relevant to what the
// customer is currently asking about get the bulk of the char budget, while
// every other ready file still gets at least MIN_FILE_PROMPT_CHARS instead of
// being cut off entirely just because it wasn't the most recently updated.
function scoreRelevance(queryTokens, text) {
  if (!queryTokens.length || !text) return 0;
  const lower = text.toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (lower.includes(token)) score += 1;
  }
  return score;
}

async function extractText(buffer, fileExtension) {
  switch (fileExtension) {
    case 'pdf': {
      const { text } = await extractPdfText(new Uint8Array(buffer), { mergePages: true });
      return text;
    }
    case 'docx': {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    case 'doc': {
      const extractor = new WordExtractor();
      const doc = await extractor.extract(buffer);
      return doc.getBody();
    }
    case 'xls':
    case 'xlsx': {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      return workbook.SheetNames
        .map((name) => `### Sheet: ${name}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[name])}`)
        .join('\n\n');
    }
    case 'csv':
    case 'txt':
      return buffer.toString('utf-8');
    default:
      throw new Error(`Unsupported file extension: ${fileExtension}`);
  }
}

function truncate(text, max) {
  if (!text) return { text: '', truncated: false };
  if (text.length <= max) return { text, truncated: false };
  return { text: text.slice(0, max), truncated: true };
}

async function buildKnowledgeBaseSection(queryText = '') {
  const files = await KnowledgeBase.find({ status: 'ready' })
    .sort({ updatedAt: -1 })
    .select('originalFilename extractedText updatedAt')
    .lean();

  if (files.length === 0) return '';

  const queryTokens = tokenize(queryText);
  const ranked = files
    .map((file) => ({ file, score: scoreRelevance(queryTokens, file.extractedText) }))
    .sort((a, b) => b.score - a.score || new Date(b.file.updatedAt) - new Date(a.file.updatedAt));

  const allocations = new Map();
  let used = 0;

  // Pass 1: give every file a guaranteed minimum slice first, most relevant
  // files first, so a file never gets fully squeezed out by earlier ones.
  for (const { file } of ranked) {
    if (used >= TOTAL_PROMPT_CHARS) break;
    const available = (file.extractedText || '').length;
    if (available === 0) continue;
    const slice = Math.min(MIN_FILE_PROMPT_CHARS, available, TOTAL_PROMPT_CHARS - used);
    allocations.set(file._id.toString(), slice);
    used += slice;
  }

  // Pass 2: spend whatever budget remains topping up the most relevant files
  // first, up to the per-file cap.
  for (const { file } of ranked) {
    if (used >= TOTAL_PROMPT_CHARS) break;
    const id = file._id.toString();
    const current = allocations.get(id) || 0;
    const cap = Math.min(PER_FILE_PROMPT_CHARS, (file.extractedText || '').length);
    const extra = Math.min(cap - current, TOTAL_PROMPT_CHARS - used);
    if (extra <= 0) continue;
    allocations.set(id, current + extra);
    used += extra;
  }

  const parts = ranked
    .filter(({ file }) => (allocations.get(file._id.toString()) || 0) > 0)
    .map(({ file }) => {
      const budget = allocations.get(file._id.toString());
      const { text, truncated } = truncate(file.extractedText || '', budget);
      return `### ${file.originalFilename}\n${text}${truncated ? '\n[...truncated]' : ''}`;
    });

  return `## Knowledge Base\nThe following reference material was uploaded by staff. Use it to answer customer questions when relevant, and ignore anything that doesn't apply to the current question. It's supplementary reference (equipment capabilities, custom processes, FAQs) — if anything here conflicts with the Paper Stocks, Finishes, or Business Rules sections elsewhere in your instructions, those sections take precedence.\n\n${parts.join('\n\n')}`;
}

module.exports = { extractText, truncate, MAX_STORED_CHARS, buildKnowledgeBaseSection };
