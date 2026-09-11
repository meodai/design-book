// Test-only harness for importing editor/editor.ts under vitest's default
// (Node, no DOM) environment.
//
// editor.ts is a browser entry point: at module scope it looks up real DOM
// elements from editor/index.html and boots a live CodeMirror-backed UI
// (`bootDesignSystem(); renderInputColumn();` run unconditionally on import).
// None of that is needed to exercise the pure serializer helpers
// (`getTokenDisplayValue`, `scopeToText`) this test suite cares about, so
// this harness fakes just enough of the DOM — and swaps CodeMirror's
// `EditorView` for an inert stand-in — for the module to finish evaluating
// without a real browser or jsdom. No editor.ts *logic* is touched; this
// only satisfies module-scope side effects so the exports become reachable.
import { vi } from 'vitest';

function createFakeElement(tag = 'div'): any {
  const el: any = {
    tagName: tag.toUpperCase(),
    children: [] as any[],
    className: '',
    dataset: {},
    style: {},
    title: '',
    value: '',
    scrollTop: 0,
    scrollHeight: 0,
    _html: '',
    _text: '',
    _attrs: {} as Record<string, string>,
    classList: {
      _set: new Set<string>(),
      add(...cls: string[]) { cls.forEach((c) => this._set.add(c)); },
      remove(...cls: string[]) { cls.forEach((c) => this._set.delete(c)); },
      contains(c: string) { return this._set.has(c); },
      toggle(c: string) {
        if (this._set.has(c)) this._set.delete(c); else this._set.add(c);
      },
    },
    setAttribute(k: string, v: string) { el._attrs[k] = v; },
    getAttribute(k: string) { return el._attrs[k] ?? null; },
    appendChild(child: any) { el.children.push(child); return child; },
    removeChild(child: any) { el.children = el.children.filter((c: any) => c !== child); return child; },
    remove() {},
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    cloneNode() { return createFakeElement(tag); },
    contains() { return false; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    content: { cloneNode() { return createFakeElement('div'); } },
    get firstElementChild() { return el.children[0] ?? null; },
    get childElementCount() { return el.children.length; },
    get innerHTML() { return el._html; },
    set innerHTML(v: string) { el._html = v; },
    get textContent() { return el._text; },
    set textContent(v: string) { el._text = v; },
  };
  return el;
}

let fakeDocument: any;

function getFakeDocument() {
  if (fakeDocument) return fakeDocument;
  const elementsById = new Map<string, any>();
  fakeDocument = {
    getElementById(id: string) {
      if (!elementsById.has(id)) elementsById.set(id, createFakeElement());
      return elementsById.get(id);
    },
    createElement(tag: string) { return createFakeElement(tag); },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    addEventListener() {},
    removeEventListener() {},
    body: createFakeElement('body'),
    documentElement: createFakeElement('html'),
  };
  return fakeDocument;
}

vi.mock('hdr-color-input', () => ({}));

vi.mock('@codemirror/view', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@codemirror/view')>();
  class FakeEditorView {
    state: any;
    dom: any;
    constructor(config: any) {
      this.state = config.state;
      this.dom = createFakeElement('div');
    }
    dispatch() {}
    destroy() {}
    get hasFocus() { return false; }
  }
  (FakeEditorView as any).updateListener = actual.EditorView.updateListener;
  (FakeEditorView as any).theme = actual.EditorView.theme;
  (FakeEditorView as any).baseTheme = actual.EditorView.baseTheme;
  return { ...actual, EditorView: FakeEditorView };
});

/** Import editor.ts with just enough DOM faked out to survive its
 *  module-scope boot, and return its exports. */
export async function loadEditorModule() {
  vi.stubGlobal('document', getFakeDocument());
  return import('../../editor/editor.ts');
}
