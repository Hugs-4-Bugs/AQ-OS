// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — File Context Ingestion Service
// Phase 8: AI Fixes — File Upload, Text Extraction, Chunking & Indexing
//
// Accepts file uploads (text, CSV, JSON, markdown), extracts text content,
// chunks and indexes it for RAG retrieval, and associates context with
// leads or conversations.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { chunkDocument, type DocumentChunk } from '@/lib/rag-service';
import { generateEmbedding } from '@/lib/vector-search-service';

// ===== TYPES =====

export type SupportedFileType = 'text' | 'csv' | 'json' | 'markdown' | 'pdf_text' | 'unknown';

export interface FileIngestionResult {
  success: boolean;
  fileContextId: string;
  fileName: string;
  fileType: SupportedFileType;
  contentLength: number;
  chunkCount: number;
  error?: string;
}

export interface FileContextData {
  id: string;
  userId: string;
  leadId: string | null;
  fileName: string;
  fileType: string;
  content: string;
  chunks: string;
  embedding: string | null;
  createdAt: Date;
}

// ===== FILE TYPE DETECTION =====

function detectFileType(fileName: string, mimeType?: string): SupportedFileType {
  const ext = fileName.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'txt':
    case 'log':
      return 'text';
    case 'csv':
    case 'tsv':
      return 'csv';
    case 'json':
    case 'jsonl':
      return 'json';
    case 'md':
    case 'markdown':
    case 'mdx':
      return 'markdown';
    case 'pdf':
      return 'pdf_text';
    default:
      // Try MIME type
      if (mimeType?.startsWith('text/')) return 'text';
      if (mimeType === 'application/json') return 'json';
      if (mimeType === 'text/csv') return 'csv';
      if (mimeType === 'text/markdown') return 'markdown';
      return 'unknown';
  }
}

// ===== TEXT EXTRACTION =====

/**
 * Extract text content from a file based on its type.
 * Handles: text, CSV, JSON, markdown files.
 */
export function extractTextContent(
  fileContent: string,
  fileType: SupportedFileType,
  fileName: string
): string {
  switch (fileType) {
    case 'text':
    case 'markdown':
      return fileContent;

    case 'csv':
      return extractFromCsv(fileContent);

    case 'json':
      return extractFromJson(fileContent);

    case 'pdf_text':
      // In a real implementation, we'd use a PDF parser
      // For now, treat as plain text (PDF text extraction would happen client-side or via a service)
      return fileContent;

    default:
      // Try to extract what we can
      return fileContent;
  }
}

/**
 * Extract meaningful text from CSV content.
 * Converts rows to readable sentences.
 */
function extractFromCsv(csvContent: string): string {
  const lines = csvContent.split('\n').filter((line) => line.trim());
  if (lines.length === 0) return '';

  // First line is typically headers
  const headers = parseCsvLine(lines[0]);
  const rows: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const rowParts: string[] = [];

    for (let j = 0; j < Math.min(headers.length, values.length); j++) {
      if (values[j].trim()) {
        rowParts.push(`${headers[j]}: ${values[j]}`);
      }
    }

    if (rowParts.length > 0) {
      rows.push(`Row ${i}: ${rowParts.join(', ')}`);
    }
  }

  return `CSV file with ${headers.length} columns (${headers.join(', ')}):\n\n${rows.join('\n')}`;
}

/**
 * Parse a single CSV line, handling quoted values.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++; // Skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Extract meaningful text from JSON content.
 * Flattens JSON into readable key-value pairs.
 */
function extractFromJson(jsonContent: string): string {
  try {
    const parsed = JSON.parse(jsonContent);

    if (typeof parsed === 'string') return parsed;
    if (Array.isArray(parsed)) {
      return parsed
        .map((item, index) => {
          if (typeof item === 'string') return `Item ${index + 1}: ${item}`;
          if (typeof item === 'object' && item !== null) {
            return `Item ${index + 1}: ${flattenObject(item)}`;
          }
          return `Item ${index + 1}: ${String(item)}`;
        })
        .join('\n');
    }
    if (typeof parsed === 'object' && parsed !== null) {
      return flattenObject(parsed);
    }

    return String(parsed);
  } catch {
    // If JSON parse fails, return as-is
    return jsonContent;
  }
}

/**
 * Flatten an object into readable key-value text.
 */
function flattenObject(obj: Record<string, unknown>, prefix = ''): string {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      parts.push(flattenObject(value as Record<string, unknown>, fullKey));
    } else if (Array.isArray(value)) {
      parts.push(`${fullKey}: ${value.join(', ')}`);
    } else {
      parts.push(`${fullKey}: ${String(value)}`);
    }
  }

  return parts.join('\n');
}

// ===== CHUNKING & INDEXING =====

/**
 * Chunk and index file content for RAG retrieval.
 * Generates embeddings for each chunk and stores them.
 */
export async function chunkAndIndex(
  content: string,
  documentId: string,
  metadata?: Record<string, unknown>
): Promise<{
  chunks: DocumentChunk[];
  documentEmbedding: number[];
}> {
  // Chunk the document
  const chunks = chunkDocument(content, documentId, { metadata });

  // Generate document-level embedding
  const documentEmbedding = await generateEmbedding(content.substring(0, 2000));

  // Generate embeddings for each chunk (in batches of 5)
  const batchSize = 5;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (chunk) => {
        chunk.embedding = await generateEmbedding(chunk.content.substring(0, 1000));
        return chunk;
      })
    );

    // Small delay between batches
    if (i + batchSize < chunks.length) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  return { chunks, documentEmbedding };
}

// ===== FILE INGESTION =====

/**
 * Ingest a file: extract text, chunk, index, and store in database.
 */
export async function ingestFile(params: {
  userId: string;
  fileName: string;
  fileContent: string;
  mimeType?: string;
  leadId?: string;
  metadata?: Record<string, unknown>;
}): Promise<FileIngestionResult> {
  const { userId, fileName, fileContent, mimeType, leadId, metadata } = params;

  try {
    // Detect file type
    const fileType = detectFileType(fileName, mimeType);

    if (fileType === 'unknown') {
      return {
        success: false,
        fileContextId: '',
        fileName,
        fileType,
        contentLength: 0,
        chunkCount: 0,
        error: `Unsupported file type: ${fileName}`,
      };
    }

    // Extract text content
    const textContent = extractTextContent(fileContent, fileType, fileName);

    if (!textContent.trim()) {
      return {
        success: false,
        fileContextId: '',
        fileName,
        fileType,
        contentLength: 0,
        chunkCount: 0,
        error: 'No text content could be extracted from the file',
      };
    }

    // Chunk and index
    const fileId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const { chunks, documentEmbedding } = await chunkAndIndex(textContent, fileId, metadata);

    // Store in database
    const fileContext = await db.fileContext.create({
      data: {
        userId,
        leadId: leadId || null,
        fileName,
        fileType,
        content: textContent.substring(0, 50000), // Cap at 50K chars
        chunks: JSON.stringify(chunks),
        embedding: JSON.stringify(documentEmbedding),
      },
    });

    return {
      success: true,
      fileContextId: fileContext.id,
      fileName,
      fileType,
      contentLength: textContent.length,
      chunkCount: chunks.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[FileContext] Failed to ingest file:', error);
    return {
      success: false,
      fileContextId: '',
      fileName,
      fileType: detectFileType(fileName, mimeType),
      contentLength: 0,
      chunkCount: 0,
      error: message,
    };
  }
}

// ===== FILE CONTEXT RETRIEVAL =====

/**
 * Get file context data for a lead.
 */
export async function getFileContext(
  leadId: string,
  userId: string
): Promise<FileContextData[]> {
  try {
    const contexts = await db.fileContext.findMany({
      where: {
        leadId,
        userId,
      },
      orderBy: { createdAt: 'desc' },
    });

    return contexts.map((fc) => ({
      id: fc.id,
      userId: fc.userId,
      leadId: fc.leadId,
      fileName: fc.fileName,
      fileType: fc.fileType,
      content: fc.content,
      chunks: fc.chunks,
      embedding: fc.embedding,
      createdAt: fc.createdAt,
    }));
  } catch (error) {
    console.error('[FileContext] Failed to get file context:', error);
    return [];
  }
}

/**
 * Associate an existing file context with a lead.
 */
export async function associateFileWithContext(
  fileContextId: string,
  leadId: string
): Promise<boolean> {
  try {
    await db.fileContext.update({
      where: { id: fileContextId },
      data: { leadId },
    });
    return true;
  } catch (error) {
    console.error('[FileContext] Failed to associate file with context:', error);
    return false;
  }
}
