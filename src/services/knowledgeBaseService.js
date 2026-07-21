const { extractText: extractPdfText } = require('unpdf');
const mammoth = require('mammoth');
const WordExtractor = require('word-extractor');
const XLSX = require('xlsx');
const KnowledgeBase = require('../models/KnowledgeBase');

const MAX_STORED_CHARS = 150_000; // cap on what we persist per file
const PER_FILE_PROMPT_CHARS = 8_000; // cap per file when injected into the prompt
const TOTAL_PROMPT_CHARS = 24_000; // cap across all files combined in the prompt

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

async function buildKnowledgeBaseSection() {
  const files = await KnowledgeBase.find({ status: 'ready' })
    .sort({ updatedAt: -1 })
    .select('originalFilename extractedText')
    .lean();

  if (files.length === 0) return '';

  let used = 0;
  const parts = [];
  for (const file of files) {
    if (used >= TOTAL_PROMPT_CHARS) break;
    const budget = Math.min(PER_FILE_PROMPT_CHARS, TOTAL_PROMPT_CHARS - used);
    const { text, truncated } = truncate(file.extractedText || '', budget);
    used += text.length;
    parts.push(`### ${file.originalFilename}\n${text}${truncated ? '\n[...truncated]' : ''}`);
  }

  return `## Knowledge Base\nThe following reference material was uploaded by staff. Use it to answer customer questions when relevant, and ignore anything that doesn't apply to the current question.\n\n${parts.join('\n\n')}`;
}

module.exports = { extractText, truncate, MAX_STORED_CHARS, buildKnowledgeBaseSection };
