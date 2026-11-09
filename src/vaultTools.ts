import { App, Notice, TFile, TFolder, normalizePath } from 'obsidian';
import { defineTool } from '@github/copilot-sdk';
import type { ChatAccessMode } from './chatTypes';

// ── Vault tools exposed to the Copilot chat session ───────────────────────────
//
// Read tools are always available. Write tools are only registered when the
// thread's access mode is 'write'. Every path is validated to stay inside the
// vault, and tool errors are returned to the model as { error } rather than
// thrown, so the model can recover and try again.

const MAX_LIST_RESULTS = 500;
const MAX_SEARCH_RESULTS = 25;
const MAX_NOTE_CHARS = 60_000;
const MAX_FOLLOW_CHARS = 150_000;
const MAX_FOLLOW_DEPTH = 6;
const DEFAULT_FOLLOW_DEPTH = 2;

type ToolArgs = Record<string, unknown>;

interface ToolError {
  error: string;
}

/** Returns a vault-relative, normalized path, or null if it would escape the vault. */
function safeVaultPath(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  if (raw.startsWith('/') || raw.includes('\\') || /(^|\/)\.\.(\/|$)/.test(raw)) return null;
  const normalized = normalizePath(raw.trim());
  if (normalized === '' || normalized === '.' || normalized.startsWith('..')) return null;
  return normalized;
}

/** Looks up a markdown note by vault path, adding .md if the caller omitted it. */
function findNote(app: App, path: string): TFile | null {
  const withExt = path.endsWith('.md') ? path : `${path}.md`;
  const file = app.vault.getAbstractFileByPath(withExt);
  return file instanceof TFile ? file : null;
}

/** Outgoing links from a note, resolved to the vault paths they point at. */
function outgoingLinks(app: App, file: TFile): TFile[] {
  const cache = app.metadataCache.getFileCache(file);
  const targets = new Map<string, TFile>();
  for (const link of cache?.links ?? []) {
    const dest = app.metadataCache.getFirstLinkpathDest(link.link, file.path);
    if (dest && dest.extension === 'md') targets.set(dest.path, dest);
  }
  return Array.from(targets.values());
}

function truncate(text: string, max: number): { text: string; truncated: boolean } {
  return text.length > max
    ? { text: text.slice(0, max) + '\n[... truncated ...]', truncated: true }
    : { text, truncated: false };
}

function allMarkdownFiles(app: App): TFile[] {
  return app.vault.getMarkdownFiles();
}

/** Builds the tool list for a chat session given the thread's access mode. */
export function buildVaultTools(app: App, mode: ChatAccessMode) {
  const readTools = [
    defineTool('list_notes', {
      description:
        'List markdown notes in the vault. Optionally limit to a folder path. Returns vault-relative paths.',
      parameters: {
        type: 'object',
        properties: {
          folder: { type: 'string', description: 'Optional folder path, e.g. "Projects/2026".' },
        },
      },
      handler: async (args: ToolArgs) => {
        const folder = args.folder === undefined ? null : safeVaultPath(args.folder);
        if (args.folder !== undefined && folder === null) {
          return { error: 'Invalid folder path.' } satisfies ToolError;
        }
        const prefix = folder ? `${folder}/` : '';
        const paths = allMarkdownFiles(app)
          .map((f) => f.path)
          .filter((p) => p.startsWith(prefix))
          .sort()
          .slice(0, MAX_LIST_RESULTS);
        return { count: paths.length, paths };
      },
    }),

    defineTool('search_notes', {
      description:
        'Case-insensitive text search across all notes. Returns matching note paths with a short snippet for each.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Text to search for.' },
        },
        required: ['query'],
      },
      handler: async (args: ToolArgs) => {
        const query = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
        if (!query) return { error: 'query is required.' } satisfies ToolError;

        const results: { path: string; snippet: string }[] = [];
        for (const file of allMarkdownFiles(app)) {
          if (results.length >= MAX_SEARCH_RESULTS) break;
          const content = await app.vault.cachedRead(file);
          const idx = content.toLowerCase().indexOf(query);
          if (idx === -1) continue;
          const start = Math.max(0, idx - 80);
          const end = Math.min(content.length, idx + query.length + 80);
          results.push({ path: file.path, snippet: content.slice(start, end).replace(/\s+/g, ' ') });
        }
        return { count: results.length, results };
      },
    }),

    defineTool('read_note', {
      description:
        'Read the full content of one note, plus the vault paths of the notes it links to. Use follow_links to read linked notes.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Vault-relative path, e.g. "Projects/plan.md".' },
        },
        required: ['path'],
      },
      handler: async (args: ToolArgs) => {
        const path = safeVaultPath(args.path);
        const file = path ? findNote(app, path) : null;
        if (!file) return { error: `Note not found: ${String(args.path)}` } satisfies ToolError;

        const { text, truncated } = truncate(await app.vault.cachedRead(file), MAX_NOTE_CHARS);
        return {
          path: file.path,
          content: text,
          truncated,
          links: outgoingLinks(app, file).map((f) => f.path),
        };
      },
    }),

    defineTool('follow_links', {
      description:
        'Read a note and the notes it links to, then the notes those link to, up to a chosen depth. Breadth-first, deduplicated, with a total size budget. Use this to explore a topic through the link graph.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Starting note path.' },
          depth: {
            type: 'integer',
            minimum: 0,
            maximum: MAX_FOLLOW_DEPTH,
            description: `How many link hops to follow (0 = just the start note; default ${DEFAULT_FOLLOW_DEPTH}, max ${MAX_FOLLOW_DEPTH}).`,
          },
        },
        required: ['path'],
      },
      handler: async (args: ToolArgs) => {
        const path = safeVaultPath(args.path);
        const start = path ? findNote(app, path) : null;
        if (!start) return { error: `Note not found: ${String(args.path)}` } satisfies ToolError;

        const maxDepth = Math.min(
          Math.max(0, Number.isInteger(args.depth) ? (args.depth as number) : DEFAULT_FOLLOW_DEPTH),
          MAX_FOLLOW_DEPTH,
        );

        const visited = new Set<string>([start.path]);
        const queue: { file: TFile; depth: number }[] = [{ file: start, depth: 0 }];
        const notes: { path: string; depth: number; content: string; links: string[] }[] = [];
        let budget = MAX_FOLLOW_CHARS;
        let stoppedEarly = false;

        while (queue.length > 0) {
          const { file, depth } = queue.shift()!;
          const content = await app.vault.cachedRead(file);
          const { text } = truncate(content, Math.min(MAX_NOTE_CHARS, Math.max(0, budget)));
          budget -= text.length;
          const links = outgoingLinks(app, file);
          notes.push({ path: file.path, depth, content: text, links: links.map((l) => l.path) });

          if (budget <= 0) {
            stoppedEarly = true;
            break;
          }
          if (depth < maxDepth) {
            for (const next of links) {
              if (!visited.has(next.path)) {
                visited.add(next.path);
                queue.push({ file: next, depth: depth + 1 });
              }
            }
          }
        }

        return {
          start: start.path,
          depthLimit: maxDepth,
          noteCount: notes.length,
          notes,
          // Notes reached but not read because the size budget ran out.
          unreadPaths: queue.map((q) => q.file.path),
          stoppedEarly: stoppedEarly || queue.length > 0,
        };
      },
    }),

    defineTool('get_backlinks', {
      description: 'List the notes that link to the given note.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Vault-relative path of the target note.' },
        },
        required: ['path'],
      },
      handler: async (args: ToolArgs) => {
        const path = safeVaultPath(args.path);
        const target = path ? findNote(app, path) : null;
        if (!target) return { error: `Note not found: ${String(args.path)}` } satisfies ToolError;

        const resolved = app.metadataCache.resolvedLinks;
        const backlinks = Object.keys(resolved).filter((src) => (resolved[src]?.[target.path] ?? 0) > 0);
        return { path: target.path, count: backlinks.length, backlinks: backlinks.sort() };
      },
    }),
  ];

  if (mode !== 'write') return readTools;

  const writeTools = [
    defineTool('create_note', {
      description:
        'Create a new note with the given content. Fails if a note already exists at that path. Missing parent folders are created.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Vault-relative path ending in .md.' },
          content: { type: 'string', description: 'Full markdown content of the new note.' },
        },
        required: ['path', 'content'],
      },
      handler: async (args: ToolArgs) => {
        const path = safeVaultPath(args.path);
        if (!path || !path.endsWith('.md')) return { error: 'Path must be a vault-relative .md path.' } satisfies ToolError;
        if (typeof args.content !== 'string') return { error: 'content must be a string.' } satisfies ToolError;
        if (app.vault.getAbstractFileByPath(path)) {
          return { error: `A file already exists at ${path}. Use replace_note or append_to_note.` } satisfies ToolError;
        }

        const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
        if (parent && !(app.vault.getAbstractFileByPath(parent) instanceof TFolder)) {
          await app.vault.createFolder(parent);
        }
        await app.vault.create(path, args.content);
        new Notice(`Copilot created ${path}`);
        return { ok: true, path };
      },
    }),

    defineTool('replace_note', {
      description:
        'Replace the entire content of an existing note. Read the note first and include all content you want to keep.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Vault-relative path of an existing note.' },
          content: { type: 'string', description: 'The complete new content of the note.' },
        },
        required: ['path', 'content'],
      },
      handler: async (args: ToolArgs) => {
        const path = safeVaultPath(args.path);
        const file = path ? findNote(app, path) : null;
        if (!file) return { error: `Note not found: ${String(args.path)}` } satisfies ToolError;
        if (typeof args.content !== 'string') return { error: 'content must be a string.' } satisfies ToolError;

        await app.vault.modify(file, args.content);
        new Notice(`Copilot updated ${file.path}`);
        return { ok: true, path: file.path };
      },
    }),

    defineTool('append_to_note', {
      description: 'Append text to the end of an existing note.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Vault-relative path of an existing note.' },
          content: { type: 'string', description: 'Text to append.' },
        },
        required: ['path', 'content'],
      },
      handler: async (args: ToolArgs) => {
        const path = safeVaultPath(args.path);
        const file = path ? findNote(app, path) : null;
        if (!file) return { error: `Note not found: ${String(args.path)}` } satisfies ToolError;
        if (typeof args.content !== 'string') return { error: 'content must be a string.' } satisfies ToolError;

        await app.vault.append(file, args.content);
        new Notice(`Copilot appended to ${file.path}`);
        return { ok: true, path: file.path };
      },
    }),
  ];

  return [...readTools, ...writeTools];
}
